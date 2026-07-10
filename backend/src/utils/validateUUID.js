const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THREAD_RE = /^aura_[0-9a-f-]+$/;

function isValidUUID(str) {
  return typeof str === 'string' && UUID_RE.test(str);
}

function isValidThreadId(str) {
  return typeof str === 'string' && THREAD_RE.test(str);
}

module.exports = { isValidUUID, isValidThreadId };
