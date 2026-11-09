const { supabase } = require('../db/pool');
const { verifyAccess } = require('../services/tokens');

function readToken(req) {
  // An explicit Authorization header wins over the cookie.
  const header = req.headers?.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return req.cookies?.aura_token || null;
}

async function authMiddleware(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

  let decoded;
  try {
    decoded = verifyAccess(token);
  } catch {
    return res.status(401).json({ success: false, error: 'Session expired. Please sign in again.', code: 'token_expired' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, plan')
      .eq('id', decoded.userId)
      .maybeSingle();

    if (error) {
      // Database trouble is a 503, not "you're logged out" — otherwise a
      // Supabase hiccup bounces every user to the login page.
      console.error('Auth lookup error:', error.message);
      return res.status(503).json({ success: false, error: 'Service temporarily unavailable' });
    }
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable' });
  }
}

module.exports = { authMiddleware };
