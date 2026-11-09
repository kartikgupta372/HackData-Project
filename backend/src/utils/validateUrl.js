// SSRF guard for user-supplied URLs (and for every request the headless
// browser makes while rendering a page).

const net = require('net');

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => Number.isNaN(n))) return false;
  return p[0] === 0 || p[0] === 10 || p[0] === 127
    || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)       // carrier-grade NAT
    || (p[0] === 169 && p[1] === 254)                     // link-local / cloud metadata
    || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    || (p[0] === 192 && p[1] === 168)
    || (p[0] === 192 && p[1] === 0 && p[2] === 0)
    || p[0] >= 224;                                        // multicast / reserved
}

function isPrivateIPv6(ip) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (s === '::' || s === '::1') return true;
  if (s.startsWith('fc') || s.startsWith('fd')) return true;   // unique local
  if (s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true; // link-local
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateHost(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal' || h === 'metadata') return true;
  if (net.isIPv4(h)) return isPrivateIPv4(h);
  if (net.isIPv6(h)) return isPrivateIPv6(h);
  // Decimal / hex encoded IPs like http://2130706433 or http://0x7f000001
  if (/^(0x[0-9a-f]+|\d+)$/i.test(h)) return true;
  return false;
}

function validatePublicUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    let trimmed = raw.trim();
    if (trimmed.length > 2048) return null;
    if (!/^https?:\/\//i.test(trimmed)) trimmed = 'https://' + trimmed;
    const p = new URL(trimmed);
    if (!['http:', 'https:'].includes(p.protocol)) return null;
    if (p.username || p.password) return null;
    if (isPrivateHost(p.hostname)) return null;
    if (!p.hostname.includes('.')) return null;
    return p.href;
  } catch {
    return null;
  }
}

module.exports = { validatePublicUrl, isPrivateHost };
