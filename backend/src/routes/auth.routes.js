// src/routes/auth.routes.js
// Uses Supabase SDK (.from()) directly for all DB operations — 
// avoids exec_sql for the most critical path in the app.

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { supabase } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth.middleware');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// ── POST /auth/register ────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ success: false, error: 'All fields required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be 8+ characters' });
  }

  try {
    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);

    const { data: user, error } = await supabase
      .from('users')
      .insert({ name: name.trim(), email: email.toLowerCase().trim(), password_hash: hash })
      .select('id, name, email, plan')
      .single();

    if (error) {
      console.error('Register insert error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const token = signToken(user.id);
    res.cookie('aura_token', token, COOKIE_OPTIONS);
    return res.status(201).json({ success: true, data: { user } });

  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
});

// ── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = signToken(user.id);
    res.cookie('aura_token', token, COOKIE_OPTIONS);

    const { password_hash: _, ...safeUser } = user;
    return res.json({ success: true, data: { user: safeUser } });

  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
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
