const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const router     = express.Router();
const { supabase } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth.middleware');
const { config } = require('../config/env');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, error: 'Too many attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   config.cookieSecure,
  sameSite: config.cookieSameSite,
  path:     '/',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

// A real bcrypt hash of a random string. Comparing against it when the email
// doesn't exist keeps login timing the same for known and unknown accounts.
// (The previous placeholder wasn't a valid hash, so bcrypt threw and unknown
// emails got a 500 instead of a 401.)
const DUMMY_HASH = bcrypt.hashSync(`aura-timing-${Math.random()}`, 10);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '7d' });
}

function publicUser(user) {
  if (!user) return null;
  const { password_hash: _ignored, ...rest } = user;
  return rest;
}

router.post('/register', authLimiter, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!name || !email || !password)
    return res.status(400).json({ success: false, error: 'All fields required' });
  if (name.length > 100)
    return res.status(400).json({ success: false, error: 'Name is too long' });
  if (!EMAIL_RE.test(email) || email.length > 255)
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  if (password.length < 8)
    return res.status(400).json({ success: false, error: 'Password must be 8+ characters' });
  if (password.length > 72)
    return res.status(400).json({ success: false, error: 'Password must be 72 characters or fewer' });

  try {
    const { data: existing, error: lookupErr } = await supabase
      .from('users').select('id').eq('email', email).maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);
    if (existing)
      return res.status(409).json({ success: false, error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ name, email, password_hash: hash })
      .select('id, name, email, plan').single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ success: false, error: 'Email already registered' });
      throw new Error(error.message);
    }

    res.cookie('aura_token', signToken(user.id), COOKIE_OPTS);
    return res.status(201).json({ success: true, data: { user } });
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password)
    return res.status(400).json({ success: false, error: 'Email and password required' });

  try {
    const { data: user, error } = await supabase
      .from('users').select('*').eq('email', email).maybeSingle();
    if (error) throw new Error(error.message);

    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !valid)
      return res.status(401).json({ success: false, error: 'Invalid email or password' });

    res.cookie('aura_token', signToken(user.id), COOKIE_OPTS);
    return res.json({ success: true, data: { user: publicUser(user) } });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

router.post('/google', authLimiter, async (req, res) => {
  const { credential } = req.body ?? {};
  if (!credential || typeof credential !== 'string')
    return res.status(400).json({ success: false, error: 'Google credential required' });
  if (!config.googleClientId)
    return res.status(503).json({ success: false, error: 'Google sign-in is not configured on the server' });

  try {
    const client = new OAuth2Client(config.googleClientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: config.googleClientId });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase().trim();
    if (!email || payload.email_verified === false)
      return res.status(400).json({ success: false, error: 'Your Google account email is not verified' });

    let { data: user, error: lookupErr } = await supabase
      .from('users').select('*').eq('email', email).maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);

    if (!user) {
      // Random unusable password — Google users sign in with Google only.
      const unusable = await bcrypt.hash(`google:${payload.sub}:${Math.random()}:${Date.now()}`, 10);
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({ name: (payload.name || email.split('@')[0]).substring(0, 100), email, password_hash: unusable })
        .select('id, name, email, plan')
        .single();
      if (error) throw new Error(error.message);
      user = newUser;
    }

    res.cookie('aura_token', signToken(user.id), COOKIE_OPTS);
    return res.json({ success: true, data: { user: publicUser(user) } });
  } catch (err) {
    console.error('Google auth error:', err.message);
    return res.status(401).json({ success: false, error: 'Google authentication failed' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

router.post('/logout', (req, res) => {
  const { maxAge: _ignored, ...clearOpts } = COOKIE_OPTS;
  res.clearCookie('aura_token', clearOpts);
  res.json({ success: true });
});

module.exports = router;
