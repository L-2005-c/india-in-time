// middleware/validator.js — Input validation middleware
// Validates and sanitizes request bodies for specific route groups.

const { sanitizeMessage, sanitizeCityName, sanitizePlaceName, validateBase64Image, sanitizeStringArray, sanitizeObjectArray, sanitizeNumber } = require('../utils/sanitize');
const { isValidCoords, isInIndia } = require('../utils/geo');

/**
 * Validate AI endpoint requests.
 * Covers: /api/ai/chat, /api/ai/vibe, /api/ai/lens, etc.
 */
function validateAiRequest(req, res, next) {
  const body = req.body || {};

  // Sanitize common fields
  if (body.message !== undefined)  body.message  = sanitizeMessage(body.message, 1000);
  if (body.city !== undefined)     body.city     = sanitizeCityName(body.city);
  if (body.vibe !== undefined)     body.vibe     = sanitizeMessage(body.vibe, 300);
  if (body.stopName !== undefined) body.stopName = sanitizePlaceName(body.stopName);
  if (body.currentStop !== undefined) body.currentStop = sanitizePlaceName(body.currentStop);
  if (body.fromPlace !== undefined)   body.fromPlace   = sanitizePlaceName(body.fromPlace);
  if (body.toPlace !== undefined)     body.toPlace     = sanitizePlaceName(body.toPlace);
  if (body.userName !== undefined)    body.userName    = sanitizeMessage(body.userName, 50);

  // These used to reach the Gemini prompt completely unsanitized — no
  // length cap, no type check. A large/crafted value here was both a
  // prompt-injection vector and an unbounded-cost risk (nothing stopped a
  // multi-MB string from becoming a multi-MB Gemini request).
  if (body.currentTime !== undefined)  body.currentTime  = sanitizeMessage(body.currentTime, 60);
  if (body.context !== undefined)      body.context      = sanitizeMessage(body.context, 200);
  if (body.duration !== undefined)     body.duration     = sanitizeMessage(String(body.duration), 40);
  if (body.date !== undefined)         body.date         = sanitizeMessage(String(body.date), 40);
  if (body.month !== undefined)        body.month        = sanitizeMessage(String(body.month), 30);
  if (body.dayOfWeek !== undefined)    body.dayOfWeek    = sanitizeMessage(String(body.dayOfWeek), 20);
  if (body.cat !== undefined)          body.cat          = sanitizeMessage(String(body.cat), 40);
  if (body.timeOfDay !== undefined)    body.timeOfDay    = sanitizeMessage(String(body.timeOfDay), 20);
  if (body.vehicleType !== undefined)  body.vehicleType  = sanitizeMessage(String(body.vehicleType), 30);
  if (body.travelStyle !== undefined)  body.travelStyle  = sanitizeMessage(String(body.travelStyle), 60);
  if (body.dates !== undefined)        body.dates        = sanitizeMessage(String(body.dates), 60);
  if (body.currentHour !== undefined)  body.currentHour  = sanitizeNumber(body.currentHour, 0, 23, new Date().getHours());

  // Sanitize arrays
  if (body.plan)      body.plan      = sanitizeStringArray(body.plan, 30, 100);
  if (body.stops)     body.stops     = sanitizeStringArray(body.stops, 30, 100);
  if (body.locations) body.locations = sanitizeStringArray(body.locations, 50, 100);
  if (body.interests) body.interests = sanitizeStringArray(body.interests, 10, 50);
  if (body.prefs)     body.prefs     = sanitizeStringArray(body.prefs, 10, 30);
  if (body.completedStops) body.completedStops = sanitizeStringArray(body.completedStops, 30, 100);
  if (body.stamps && Array.isArray(body.stamps)) body.stamps = body.stamps.slice(0, 200); // only .length is ever used

  // Arrays of small objects — these also had zero sanitization before.
  if (body.expenses)       body.expenses       = sanitizeObjectArray(body.expenses, 100, ['n'], ['c']);
  if (body.remainingStops) body.remainingStops = sanitizeObjectArray(body.remainingStops, 30, ['name'], ['vt']);

  // Validate image data if present
  if (body.imageBase64) {
    const imgCheck = validateBase64Image(body.imageBase64, 4);
    if (!imgCheck.valid) {
      return res.status(400).json({ error: imgCheck.reason, code: 'INVALID_IMAGE' });
    }
  }

  // Sanitize numeric fields
  if (body.limit !== undefined) body.limit = sanitizeNumber(body.limit, 0, 1000000, 5000);
  if (body.spent !== undefined) body.spent = sanitizeNumber(body.spent, 0, 1000000, 0);
  if (body.minutesLate !== undefined) body.minutesLate = sanitizeNumber(body.minutesLate, 0, 600, 30);
  if (body.distanceKm !== undefined)  body.distanceKm  = sanitizeNumber(body.distanceKm, 0, 200, 5);

  next();
}

/**
 * Validate places endpoint requests.
 */
function validatePlacesRequest(req, res, next) {
  const body = req.body || {};

  // Required: lat, lon
  const lat = parseFloat(body.lat);
  const lon = parseFloat(body.lon);

  if (!isValidCoords(lat, lon)) {
    return res.status(400).json({ error: 'Invalid coordinates', code: 'INVALID_COORDS' });
  }

  if (!isInIndia(lat, lon)) {
    return res.status(400).json({ error: 'Coordinates must be within India', code: 'OUT_OF_BOUNDS' });
  }

  body.lat = lat;
  body.lon = lon;
  body.cityName     = sanitizeCityName(body.cityName || '');
  body.totalMinutes = sanitizeNumber(body.totalMinutes, 60, 14400, 600); // 1h to 10 days
  body.refresh      = !!body.refresh;

  if (body.prefs) {
    const validPrefs = new Set(['scenic', 'temple', 'beach', 'food']);
    body.prefs = (Array.isArray(body.prefs) ? body.prefs : []).filter(p => validPrefs.has(p));
  }

  next();
}

/**
 * Validate weather endpoint requests.
 */
function validateWeatherRequest(req, res, next) {
  const lat = parseFloat(req.query.lat || req.body?.lat);
  const lon = parseFloat(req.query.lon || req.body?.lon);

  if (!isValidCoords(lat, lon)) {
    return res.status(400).json({ error: 'Invalid lat/lon', code: 'INVALID_COORDS' });
  }

  // Inject parsed values
  if (req.query.lat) {
    req.query.lat = lat;
    req.query.lon = lon;
  }
  if (req.body?.lat) {
    req.body.lat = lat;
    req.body.lon = lon;
  }

  next();
}

/**
 * Validate geocode requests.
 */
function validateGeocodeRequest(req, res, next) {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query too short (min 2 chars)', code: 'INVALID_QUERY' });
  }
  if (q.length > 100) {
    req.query.q = q.slice(0, 100);
  }
  next();
}

module.exports = {
  validateAiRequest,
  validatePlacesRequest,
  validateWeatherRequest,
  validateGeocodeRequest,
};
