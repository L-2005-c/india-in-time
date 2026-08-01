// utils/sanitize.js — Input sanitization helpers

/**
 * Strip control characters and non-printable chars (except newlines/tabs).
 */
function stripControlChars(str) {
  if (typeof str !== 'string') return '';
  // Keep printable ASCII + common unicode + newline/tab
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Limit string to maxLen characters.
 */
function limitLength(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLen);
}

/**
 * Sanitize a text message (for AI prompts): strip control chars, limit length.
 */
function sanitizeMessage(str, maxLen = 1000) {
  return limitLength(stripControlChars(str), maxLen).trim();
}

/**
 * Sanitize a city name: alphanumeric, spaces, hyphens, dots only. Max 60 chars.
 */
function sanitizeCityName(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[^a-zA-Z0-9\s\-.']/g, '')
    .trim()
    .slice(0, 60);
}

/**
 * Sanitize a place name: similar to city name but slightly more permissive.
 */
function sanitizePlaceName(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[^a-zA-Z0-9\s\-.'(),&]/g, '')
    .trim()
    .slice(0, 120);
}

/**
 * Validate base64 image data.
 * Returns { valid, sizeBytes } or { valid: false, reason }.
 */
function validateBase64Image(base64Str, maxSizeMB = 4) {
  if (typeof base64Str !== 'string' || !base64Str.length) {
    return { valid: false, reason: 'Missing image data' };
  }
  // Estimate decoded size: base64 is ~4/3 of original
  const sizeBytes = Math.ceil(base64Str.length * 3 / 4);
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    return { valid: false, reason: `Image too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB > ${maxSizeMB}MB limit)` };
  }
  return { valid: true, sizeBytes };
}

/**
 * Sanitize an array of strings (e.g. stops, locations).
 */
function sanitizeStringArray(arr, maxItems = 50, maxItemLen = 200) {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(0, maxItems)
    .map(s => sanitizeMessage(String(s || ''), maxItemLen))
    .filter(s => s.length > 0);
}

/**
 * Sanitize an array of small objects (e.g. expenses: [{n, c}], remainingStops:
 * [{name, vt}]) that get interpolated into AI prompts. Without this, these
 * fields had no length cap at all — a big payload here goes straight into a
 * Gemini prompt at whatever size the client sends (up to the 5mb body
 * limit), which is both a prompt-injection surface and an unbounded per-
 * request cost. `stringFields` are truncated/stripped like any other prompt
 * text; `numberFields` are clamped to a sane range.
 */
function sanitizeObjectArray(arr, maxItems, stringFields = [], numberFields = []) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxItems).map(item => {
    if (!item || typeof item !== 'object') return {};
    const out = {};
    for (const f of stringFields) out[f] = sanitizeMessage(String(item[f] ?? ''), 80);
    for (const f of numberFields) out[f] = sanitizeNumber(item[f], 0, 1000000, 0);
    return out;
  });
}

/**
 * Sanitize a number within a range.
 */
function sanitizeNumber(val, min, max, defaultVal) {
  const n = parseFloat(val);
  if (Number.isNaN(n)) return defaultVal;
  return Math.min(Math.max(n, min), max);
}

module.exports = {
  stripControlChars,
  limitLength,
  sanitizeMessage,
  sanitizeCityName,
  sanitizePlaceName,
  validateBase64Image,
  sanitizeStringArray,
  sanitizeObjectArray,
  sanitizeNumber,
};
