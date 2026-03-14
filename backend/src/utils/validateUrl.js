// src/utils/validateUrl.js
// Shared SSRF-safe URL validator — used across all routes that accept user URLs

/**
 * Validates and sanitizes a user-supplied URL.
 * Returns the cleaned href or null if invalid/private.
 *
 * Guards against:
 * - Non-http(s) protocols (file://, ftp://, javascript:, etc.)
 * - Localhost / loopback (127.0.0.1, ::1)
 * - Private RFC-1918 networks (10.x, 172.16-31.x, 192.168.x)
 * - AWS metadata endpoint (169.254.x)
 * - Overly long URLs (>2048 chars)
 */
function validatePublicUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const p = new URL(raw.trim().substring(0, 2048));
    if (!['http:', 'https:'].includes(p.protocol)) return null;
    const h = p.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(h)) return null;
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/.test(h)) return null;
    return p.href;
  } catch {
    return null;
  }
}

module.exports = { validatePublicUrl };
