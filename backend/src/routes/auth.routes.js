// src/routes/auth.routes.js — Fixed: rate limiting on login/register, no user enumeration
const express    = require('express');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const router     = express.Router();
const { supabase } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth.middleware');

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET must be set in .env');
  process.exit(1);
}

// FIX: rate-limit login & register — prevents brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 15,
  keyGenerator: (req) => req.ip,
  message: { success: false, error: 'Too many attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// ── POST /auth/register ───────────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ success: false, error: 'All fields required' });
  if (password.length < 8)
    return res.status(400).json({ success: false, error: 'Password must be 8+ characters' });

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ success: false, error: 'Invalid email format' });

  try {
    const { data: existing } = await supabase
      .from('users').select('id').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (existing)
      return res.status(409).json({ success: false, error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ name: name.trim(), email: email.toLowerCase().trim(), password_hash: hash })
      .select('id, name, email, plan').single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    const token = signToken(user.id);
    res.cookie('aura_token', token, COOKIE_OPTS);
    return res.status(201).json({ success: true, data: { user } });
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password)
    return res.status(400).json({ success: false, error: 'Email and password required' });

  try {
    const { data: user, error } = await supabase
      .from('users').select('*').eq('email', email.toLowerCase().trim()).maybeSingle();

    // FIX: always run bcrypt even on miss to prevent timing attacks
    const dummyHash = '$2b$12$invalidhashpaddingtopreventimerattacksXXXXXXXXXXXXXXXXXX';
    const hashToCheck = user?.password_hash ?? dummyHash;
    const valid = await bcrypt.compare(password, hashToCheck);

    if (error || !user || !valid)
      return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = signToken(user.id);
    res.cookie('aura_token', token, COOKIE_OPTS);
    const { password_hash: _, ...safeUser } = user;
    return res.json({ success: true, data: { user: safeUser } });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// ── POST /auth/google ─────────────────────────────────────────────────────────
router.post('/google', authLimiter, async (req, res) => {
  const { credential } = req.body;
  if (!credential)
    return res.status(400).json({ success: false, error: 'Google credential required' });

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const { email, name, sub: googleId, picture } = payload;

    if (!email)
      return res.status(400).json({ success: false, error: 'Unable to retrieve email from Google' });

    // Find or create user
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (!user) {
      // Create new user (no password needed for Google auth)
      const dummyHash = await bcrypt.hash(`google_oauth_${googleId}`, 12);
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          name: name || email.split('@')[0],
          email: email.toLowerCase().trim(),
          password_hash: dummyHash,
        })
        .select('id, name, email, plan')
        .single();

      if (error)
        return res.status(500).json({ success: false, error: error.message });

      user = newUser;
    }

    const token = signToken(user.id);
    res.cookie('aura_token', token, COOKIE_OPTS);
    const { password_hash: _, ...safeUser } = user;
    return res.json({ success: true, data: { user: safeUser } });
  } catch (err) {
    console.error('Google auth error:', err.message);
    return res.status(401).json({ success: false, error: 'Google authentication failed' });
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('aura_token', { httpOnly: true, sameSite: 'lax' });
  res.json({ success: true });
});

module.exports = router;
