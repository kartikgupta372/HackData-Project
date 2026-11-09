// Access + refresh JWT system.
//
//   access token   short-lived (15 min) JWT used on every API call, sent as
//                  "Authorization: Bearer <token>" or the aura_token cookie.
//   refresh token  long-lived (30 days) JWT kept in an httpOnly cookie scoped to
//                  /auth. Exchanging it returns a new pair and retires the old
//                  one (rotation). If a retired token is ever presented again
//                  the whole sign-in is revoked, because that means it leaked.
//
// Refresh tokens are recorded in the refresh_tokens table (migration 005). If
// the table does not exist yet, refresh still works but tokens cannot be
// revoked until the migration is applied.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { supabase } = require('../db/pool');
const { config } = require('../config/env');

const ISSUER = 'aura-design-ai';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const ACCESS_COOKIE = 'aura_token';
const REFRESH_COOKIE = 'aura_refresh';

const baseCookie = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: config.cookieSameSite,
};
const ACCESS_COOKIE_OPTS = { ...baseCookie, path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 };
const REFRESH_COOKIE_OPTS = { ...baseCookie, path: '/auth', maxAge: REFRESH_TTL_SECONDS * 1000 };

function signAccess(userId) {
  return jwt.sign({ userId, typ: 'access' }, config.jwtSecret, {
    algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS, issuer: ISSUER,
  });
}

function signRefresh(userId, jti, family) {
  return jwt.sign({ userId, typ: 'refresh', jti, fam: family }, config.jwtSecret, {
    algorithm: 'HS256', expiresIn: REFRESH_TTL_SECONDS, issuer: ISSUER,
  });
}

/** Verify an access token. Tokens issued before this system existed have no `typ` and stay valid until they expire. */
function verifyAccess(token) {
  const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  if (decoded.typ && decoded.typ !== 'access') throw new Error('Not an access token');
  return decoded;
}

function verifyRefresh(token) {
  const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER });
  if (decoded.typ !== 'refresh' || !decoded.jti || !decoded.fam) throw new Error('Not a refresh token');
  return decoded;
}

// ── Refresh-token store ──────────────────────────────────────────────────────
let storeAvailable = null; // null = unknown, true/false after the first query

function isMissingTable(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  return /42P01|PGRST205|does not exist|schema cache/i.test(text);
}

function noteStoreError(error) {
  if (isMissingTable(error)) {
    if (storeAvailable !== false) console.warn('⚠️  refresh_tokens table not found — refresh tokens cannot be revoked. Apply migration 005_refresh_tokens.sql.');
    storeAvailable = false;
    return;
  }
  throw new Error(error.message || 'refresh token store error');
}

async function recordToken({ jti, family, userId, req }) {
  if (storeAvailable === false) return;
  const { error } = await supabase.from('refresh_tokens').insert({
    jti,
    family_id: family,
    user_id: userId,
    expires_at: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString(),
    user_agent: String(req?.headers?.['user-agent'] || '').slice(0, 255) || null,
    ip: String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim().slice(0, 64) || null,
  });
  if (error) return noteStoreError(error);
  storeAvailable = true;
}

async function findToken(jti) {
  if (storeAvailable === false) return null;
  const { data, error } = await supabase.from('refresh_tokens').select('id, user_id, family_id, revoked_at, expires_at').eq('jti', jti).maybeSingle();
  if (error) { noteStoreError(error); return null; }
  storeAvailable = true;
  return data;
}

async function revokeToken(jti) {
  if (storeAvailable === false) return;
  const { error } = await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('jti', jti).is('revoked_at', null);
  if (error) noteStoreError(error);
}

async function revokeFamily(family) {
  if (storeAvailable === false) return;
  const { error } = await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('family_id', family).is('revoked_at', null);
  if (error) noteStoreError(error);
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Sign a user in: sets both cookies and returns what the client needs for Bearer auth. */
async function issueSession(req, res, userId, family = crypto.randomUUID()) {
  const jti = crypto.randomUUID();
  const accessToken = signAccess(userId);
  const refreshToken = signRefresh(userId, jti, family);
  await recordToken({ jti, family, userId, req });
  res.cookie(ACCESS_COOKIE, accessToken, ACCESS_COOKIE_OPTS);
  res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
  return { accessToken, expiresIn: ACCESS_TTL_SECONDS };
}

/**
 * Exchange the refresh cookie (or a refreshToken in the body, for API clients)
 * for a new pair. Returns { userId, accessToken, expiresIn } or throws with
 * .status = 401.
 */
async function rotateSession(req, res) {
  const presented = req.cookies?.[REFRESH_COOKIE] || (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '');
  const fail = (msg) => { const e = new Error(msg); e.status = 401; return e; };
  if (!presented) throw fail('No refresh token');

  let decoded;
  try { decoded = verifyRefresh(presented); } catch { throw fail('Session expired. Please sign in again.'); }

  const row = await findToken(decoded.jti);
  if (row) {
    if (row.revoked_at) {
      // A retired token came back: treat the whole sign-in as compromised.
      await revokeFamily(decoded.fam);
      throw fail('Session is no longer valid. Please sign in again.');
    }
    if (new Date(row.expires_at) < new Date()) throw fail('Session expired. Please sign in again.');
    await revokeToken(decoded.jti);
  } else if (storeAvailable === true) {
    // Store is working but has no record of this token (deleted or forged).
    throw fail('Session is no longer valid. Please sign in again.');
  }

  const session = await issueSession(req, res, decoded.userId, decoded.fam);
  return { userId: decoded.userId, ...session };
}

/** Sign out: retire the refresh token's whole family and clear both cookies. */
async function endSession(req, res) {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (presented) {
    try { await revokeFamily(verifyRefresh(presented).fam); } catch { /* already invalid */ }
  }
  const { maxAge: _a, ...accessClear } = ACCESS_COOKIE_OPTS;
  const { maxAge: _r, ...refreshClear } = REFRESH_COOKIE_OPTS;
  res.clearCookie(ACCESS_COOKIE, accessClear);
  res.clearCookie(REFRESH_COOKIE, refreshClear);
}

module.exports = {
  ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS,
  signAccess, verifyAccess, verifyRefresh,
  issueSession, rotateSession, endSession,
  _internals: { isMissingTable },
};
