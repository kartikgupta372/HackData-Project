// src/utils/safeParseJSON.js
// Shared safe JSON parser for LLM outputs — strips markdown code fences

/**
 * Safely parse JSON from LLM output.
 * Handles: ```json ... ```, trailing text, malformed responses.
 * @param {string} text - Raw LLM output
 * @param {*} fallback - Default value if parsing fails
 * @returns Parsed object or fallback
 */
function safeParseJSON(text, fallback = {}) {
  if (!text) return fallback;
  try {
    const clean = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(clean);
  } catch {
    return fallback;
  }
}

/**
 * Safe JSON parser that also handles array responses with leading text.
 * Used when expecting a JSON array from LLM.
 * @param {string} text - Raw LLM output
 * @param {*} fallback - Default value if parsing fails (typically [])
 * @returns Parsed array or fallback
 */
function safeParseJSONArray(text, fallback = []) {
  if (!text) return fallback;
  let clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const arrStart = clean.indexOf('[');
  const arrEnd = clean.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    clean = clean.substring(arrStart, arrEnd + 1);
  }
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error('safeParseJSONArray failed:', e.message, '\nRaw (200):', text.substring(0, 200));
    return fallback;
  }
}

module.exports = { safeParseJSON, safeParseJSONArray };
