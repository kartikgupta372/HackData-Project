const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { issueSession, rotateSession, endSession } = require('../services/tokens');
const rateLimit  = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const crypto     = require('crypto');
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

// A real bcrypt hash of a random string. Comparing against it when the email
// doesn't exist keeps login timing the same for known and unknown accounts.
// (The previous placeholder wasn't a valid hash, so bcrypt threw and unknown
// emails got a 500 instead of a 401.)
const DUMMY_HASH = bcrypt.hashSync(`aura-timing-${Math.random()}`, 10);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const session = await issueSession(req, res, user.id);
    return res.status(201).json({ success: true, data: { user, ...session } });
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

    const session = await issueSession(req, res, user.id);
    return res.json({ success: true, data: { user: publicUser(user), ...session } });
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

    const session = await issueSession(req, res, user.id);
    return res.json({ success: true, data: { user: publicUser(user), ...session } });
  } catch (err) {
    console.error('Google auth error:', err.message);
    return res.status(401).json({ success: false, error: 'Google authentication failed' });
  }
});

// ── Which sign-in methods are available (the login page reads this) ──────────
router.get('/providers', (_req, res) => {
  res.json({
    success: true,
    data: {
      password: true,
      google: Boolean(config.googleClientId),
      github: Boolean(config.githubClientId && config.githubClientSecret),
      guest: config.allowGuestLogin,
    },
  });
});

// ── Guest access: instant account, no email or password ──────────────────────
const guestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many guest sessions from this network. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/guest', guestLimiter, async (req, res) => {
  if (!config.allowGuestLogin)
    return res.status(403).json({ success: false, error: 'Guest access is turned off' });
  try {
    const id = crypto.randomBytes(5).toString('hex');
    const unusable = await bcrypt.hash(`guest:${crypto.randomBytes(16).toString('hex')}`, 10);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ name: `Guest ${id.slice(0, 4).toUpperCase()}`, email: `guest-${id}@guest.aura.local`, password_hash: unusable })
      .select('id, name, email, plan').single();
    if (error) throw new Error(error.message);
    const session = await issueSession(req, res, user.id);
    return res.status(201).json({ success: true, data: { user, ...session } });
  } catch (err) {
    console.error('Guest login error:', err.message);
    return res.status(500).json({ success: false, error: 'Could not start a guest session. Please try again.' });
  }
});

// ── GitHub sign-in (OAuth web flow) ──────────────────────────────────────────
const STATE_COOKIE = 'aura_oauth_state';

function githubCallbackUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0];
  const host  = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0];
  return `${proto}://${host}/auth/github/callback`;
}

function backToLogin(res, code) {
  res.redirect(`/login?auth_error=${encodeURIComponent(code)}`);
}

router.get('/github', authLimiter, (req, res) => {
  if (!config.githubClientId || !config.githubClientSecret) return backToLogin(res, 'github_not_configured');
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, jwt.sign({ state }, config.jwtSecret, { expiresIn: '10m' }), {
    httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/auth', maxAge: 10 * 60 * 1000,
  });
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    redirect_uri: githubCallbackUrl(req),
    scope: 'read:user user:email',
    state,
    allow_signup: 'true',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get('/github/callback', authLimiter, async (req, res) => {
  const { code, state, error: ghError } = req.query;
  res.clearCookie(STATE_COOKIE, { path: '/auth' });
  if (ghError) return backToLogin(res, 'github_denied');
  if (!config.githubClientId || !config.githubClientSecret) return backToLogin(res, 'github_not_configured');
  if (typeof code !== 'string' || typeof state !== 'string') return backToLogin(res, 'github_failed');

  try {
    // The state cookie proves this browser started the flow (blocks login-CSRF).
    let saved;
    try { saved = jwt.verify(req.cookies?.[STATE_COOKIE] || '', config.jwtSecret).state; } catch { saved = null; }
    if (!saved || saved !== state) return backToLogin(res, 'github_state');

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
        redirect_uri: githubCallbackUrl(req),
      }),
    });
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) return backToLogin(res, 'github_failed');

    const gh = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'aura-design-ai' };
    const [profileRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers: gh }),
      fetch('https://api.github.com/user/emails', { headers: gh }),
    ]);
    const profile = await profileRes.json();
    const emails = emailsRes.ok ? await emailsRes.json() : [];
    const primary = Array.isArray(emails)
      ? (emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified))
      : null;
    const email = (primary?.email || '').toLowerCase().trim();
    if (!email) return backToLogin(res, 'github_no_email');

    let { data: user, error: lookupErr } = await supabase
      .from('users').select('*').eq('email', email).maybeSingle();
    if (lookupErr) throw new Error(lookupErr.message);

    if (!user) {
      const unusable = await bcrypt.hash(`github:${profile.id}:${crypto.randomBytes(16).toString('hex')}`, 10);
      const { data: created, error } = await supabase
        .from('users')
        .insert({ name: String(profile.name || profile.login || email.split('@')[0]).substring(0, 100), email, password_hash: unusable })
        .select('id, name, email, plan').single();
      if (error) throw new Error(error.message);
      user = created;
    }

    await issueSession(req, res, user.id);
    return res.redirect('/app');
  } catch (err) {
    console.error('GitHub auth error:', err.message);
    return backToLogin(res, 'github_failed');
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

router.post('/logout', async (req, res) => {
  try { await endSession(req, res); } catch (err) { console.error('Logout error:', err.message); }
  res.json({ success: true });
});

// Exchange the refresh cookie for a new access + refresh pair.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { success: false, error: 'Too many refresh attempts. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const session = await rotateSession(req, res);
    const { data: user, error } = await supabase
      .from('users').select('id, name, email, plan').eq('id', session.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!user) {
      await endSession(req, res);
      return res.status(401).json({ success: false, error: 'Account no longer exists' });
    }
    return res.json({ success: true, data: { user, accessToken: session.accessToken, expiresIn: session.expiresIn } });
  } catch (err) {
    if (err.status === 401) {
      await endSession(req, res).catch(() => {});
      return res.status(401).json({ success: false, error: err.message, code: 'refresh_failed' });
    }
    console.error('Refresh error:', err.message);
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable' });
  }
});

module.exports = router;
