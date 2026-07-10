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
