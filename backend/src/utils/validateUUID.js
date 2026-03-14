// src/utils/validateUUID.js
// UUID format validation for route parameters — prevents injection via param tampering

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THREAD_RE = /^aura_[0-9a-f-]+$/;

/**
 * Validate that a string is a valid UUID v4 format.
 */
function isValidUUID(str) {
  return typeof str === 'string' && UUID_RE.test(str);
}

/**
 * Validate that a string is a valid Aura thread ID (aura_<uuid> format).
 */
function isValidThreadId(str) {
  return typeof str === 'string' && THREAD_RE.test(str);
}

module.exports = { isValidUUID, isValidThreadId };
