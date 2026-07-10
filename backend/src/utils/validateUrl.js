function validatePublicUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    let trimmed = raw.trim();
    if (trimmed.length > 2048) return null;
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = 'https://' + trimmed;
    }
    const p = new URL(trimmed);
    if (!['http:', 'https:'].includes(p.protocol)) return null;
    const h = p.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(h)) return null;
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/.test(h)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const parts = h.split('.').map(Number);
      if (parts[0] === 10) return null;
      if (parts[0] === 127) return null;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return null;
      if (parts[0] === 192 && parts[1] === 168) return null;
      if (parts[0] === 169 && parts[1] === 254) return null;
    }
    return p.href;
  } catch {
    return null;
  }
}

module.exports = { validatePublicUrl };
