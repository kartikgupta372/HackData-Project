// src/middleware/auth.middleware.js
// Reads aura_token from HttpOnly cookie OR Authorization: Bearer header

const jwt     = require('jsonwebtoken');
const { supabase } = require('../db/pool');

async function authMiddleware(req, res, next) {
  try {
    const token =
      req.cookies?.aura_token ??
      req.headers?.authorization?.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, plan')
      .eq('id', decoded.userId)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

module.exports = { authMiddleware };
