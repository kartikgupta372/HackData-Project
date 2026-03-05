// src/routes/auth.routes.js

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth.middleware');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// POST /auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'All fields required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be 8+ characters' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, plan',
      [name, email, hash]
    );
    const token = jwt.sign({ userId: rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('aura_token', token, COOKIE_OPTIONS);
    res.status(201).json({ success: true, data: { user: rows[0] } });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows[0]) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('aura_token', token, COOKIE_OPTIONS);

    const { password_hash: _, ...user } = rows[0];
    res.json({ success: true, data: { user } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('aura_token');
  res.json({ success: true });
});

module.exports = router;
