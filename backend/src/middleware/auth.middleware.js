// src/middleware/auth.middleware.js

const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

async function authMiddleware(req, res, next) {
  try {
    const token =
      req.cookies?.aura_token ??
      req.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await pool.query(
      'SELECT id, name, email, plan FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!rows[0]) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

module.exports = { authMiddleware };
