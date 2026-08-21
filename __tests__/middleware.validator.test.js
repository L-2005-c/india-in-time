// __tests__/middleware.validator.test.js
// Coverage for middleware/validator.js. This is a security-relevant
// boundary: it is the last line of defense before user-supplied strings and
// numbers reach either the database, the Gemini prompt, or downstream
// engines, so its sanitization/validation branches matter more than most.

'use strict';

const {
  validateAiRequest,
  validatePlacesRequest,
  validateWeatherRequest,
  validateGeocodeRequest,
  validateTimeIntelRequest,
} = require('../middleware/validator');

function mockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
}

describe('validateAiRequest', () => {
  test('sanitizes a full battery of text fields', () => {
    const req = { body: {
      message: 'Hello\x00World  ',
      city: 'Vizag<script>',
      vibe: 'chill',
      stopName: 'RK Beach & Café (main)',
      currentStop: 'Temple #1',
      fromPlace: 'A',
      toPlace: 'B',
      userName: 'Traveler123',
    } };
    const res = mockRes();
    const next = jest.fn();
    validateAiRequest(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body.message).toBe('HelloWorld');
    expect(req.body.city).toBe('Vizagscript');
  });

  test('caps previously-unbounded scalar fields to their documented length', () => {
    const longStr = 'x'.repeat(5000);
    const req = { body: {
      currentTime: longStr,
      context: longStr,
      duration: 123456,
      date: '2026-08-16',
      month: 'August',
      dayOfWeek: 'Sunday',
      cat: 'beach',
      timeOfDay: 'morning',
      vehicleType: 'car',
      travelStyle: 'relaxed',
      dates: '16-20 Aug',
    } };
    const res = mockRes();
    const next = jest.fn();
    validateAiRequest(req, res, next);
    expect(req.body.currentTime.length).toBeLessThanOrEqual(60);
    expect(req.body.context.length).toBeLessThanOrEqual(200);
    expect(req.body.duration.length).toBeLessThanOrEqual(40);
    expect(next).toHaveBeenCalled();
  });

  test('clamps currentHour into the valid 0-23 range and falls back to now on garbage input', () => {
    const req1 = { body: { currentHour: 99 } };
    validateAiRequest(req1, mockRes(), jest.fn());
    expect(req1.body.currentHour).toBe(23);

    const req2 = { body: { currentHour: 'not-a-number' } };
    validateAiRequest(req2, mockRes(), jest.fn());
    expect(req2.body.currentHour).toBe(new Date().getHours());
  });

  test('caps array fields to their max item count and per-item length', () => {
    const req = { body: {
      plan: Array.from({ length: 100 }, (_, i) => `stop-${i}`),
      stops: Array.from({ length: 100 }, (_, i) => `stop-${i}`),
      locations: Array.from({ length: 100 }, (_, i) => `loc-${i}`),
      interests: Array.from({ length: 50 }, (_, i) => `interest-${i}`),
      prefs: Array.from({ length: 50 }, (_, i) => `pref-${i}`),
      completedStops: Array.from({ length: 100 }, (_, i) => `done-${i}`),
    } };
    validateAiRequest(req, mockRes(), jest.fn());
    expect(req.body.plan.length).toBeLessThanOrEqual(30);
    expect(req.body.stops.length).toBeLessThanOrEqual(30);
    expect(req.body.locations.length).toBeLessThanOrEqual(50);
    expect(req.body.interests.length).toBeLessThanOrEqual(10);
    expect(req.body.prefs.length).toBeLessThanOrEqual(10);
    expect(req.body.completedStops.length).toBeLessThanOrEqual(30);
  });

  test('caps the stamps array at 200 entries without transforming its contents', () => {
    const req = { body: { stamps: Array.from({ length: 300 }, (_, i) => ({ id: i })) } };
    validateAiRequest(req, mockRes(), jest.fn());
    expect(req.body.stamps.length).toBe(200);
  });

  test('leaves stamps untouched (does not crash) when it is not an array', () => {
    const req = { body: { stamps: 'not-an-array' } };
    const next = jest.fn();
    validateAiRequest(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.body.stamps).toBe('not-an-array');
  });

  test('sanitizes object-array fields (expenses, remainingStops) field-by-field', () => {
    const req = { body: {
      expenses: [{ n: 'Lunch<script>', c: 500, extra: 'dropped' }],
      remainingStops: [{ name: 'Beach', vt: 45, other: 'dropped' }],
    } };
    validateAiRequest(req, mockRes(), jest.fn());
    expect(req.body.expenses[0]).toEqual({ n: expect.any(String), c: 500 });
    expect(req.body.expenses[0]).not.toHaveProperty('extra');
    expect(req.body.remainingStops[0]).toEqual({ name: 'Beach', vt: 45 });
  });

  test('accepts a valid, small base64 image', () => {
    const smallImage = Buffer.from('tiny-fake-image-data').toString('base64');
    const req = { body: { imageBase64: smallImage } };
    const res = mockRes();
    const next = jest.fn();
    validateAiRequest(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects an oversized base64 image with a 400 and does not call next', () => {
    // ~6MB of base64 characters, comfortably over the 4MB default cap.
    const hugeImage = 'A'.repeat(6 * 1024 * 1024 * 4 / 3);
    const req = { body: { imageBase64: hugeImage } };
    const res = mockRes();
    const next = jest.fn();
    validateAiRequest(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_IMAGE');
  });

  test('clamps numeric fields (limit, spent, minutesLate, distanceKm) into their ranges', () => {
    const req = { body: { limit: -5, spent: 99999999, minutesLate: 9999, distanceKm: 9999 } };
    validateAiRequest(req, mockRes(), jest.fn());
    expect(req.body.limit).toBe(0);
    expect(req.body.spent).toBe(1000000);
    expect(req.body.minutesLate).toBe(600);
    expect(req.body.distanceKm).toBe(200);
  });

  test('handles a completely empty body without throwing', () => {
    const req = {};
    const next = jest.fn();
    expect(() => validateAiRequest(req, mockRes(), next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});

describe('validatePlacesRequest', () => {
  test('rejects non-numeric or out-of-range coordinates', () => {
    const req = { body: { lat: 'nope', lon: 77 } };
    const res = mockRes();
    const next = jest.fn();
    validatePlacesRequest(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_COORDS');
  });

  test('rejects coordinates outside India\u2019s bounding box', () => {
    const req = { body: { lat: 40.7128, lon: -74.0060 } }; // New York
    const res = mockRes();
    const next = jest.fn();
    validatePlacesRequest(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('OUT_OF_BOUNDS');
  });

  test('accepts valid India coordinates and normalizes other fields', () => {
    const req = { body: { lat: '17.6868', lon: '83.2185', cityName: 'Visakhapatnam!!', totalMinutes: 30, prefs: ['beach', 'nonsense', 'temple'] } };
    const res = mockRes();
    const next = jest.fn();
    validatePlacesRequest(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body.lat).toBeCloseTo(17.6868);
    expect(req.body.lon).toBeCloseTo(83.2185);
    expect(req.body.cityName).toBe('Visakhapatnam');
    // 30 minutes is below the 60-minute floor, so it's clamped up.
    expect(req.body.totalMinutes).toBe(60);
    expect(req.body.prefs).toEqual(['beach', 'temple']);
  });

  test('coerces refresh to a strict boolean', () => {
    const req = { body: { lat: 17.7, lon: 83.3, refresh: 'yes' } };
    validatePlacesRequest(req, mockRes(), jest.fn());
    expect(req.body.refresh).toBe(true);
  });

  test('defaults prefs to an empty array when not an array', () => {
    const req = { body: { lat: 17.7, lon: 83.3, prefs: 'beach' } };
    validatePlacesRequest(req, mockRes(), jest.fn());
    expect(req.body.prefs).toEqual([]);
  });
});

describe('validateWeatherRequest', () => {
  test('rejects invalid lat/lon from query params', () => {
    const req = { query: { lat: 'abc', lon: '10' }, body: {} };
    const res = mockRes();
    const next = jest.fn();
    validateWeatherRequest(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  test('accepts and normalizes valid query-param coordinates', () => {
    const req = { query: { lat: '17.7', lon: '83.3' }, body: {} };
    const next = jest.fn();
    validateWeatherRequest(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.query.lat).toBeCloseTo(17.7);
    expect(req.query.lon).toBeCloseTo(83.3);
  });

  test('falls back to body coordinates when query params are absent', () => {
    const req = { query: {}, body: { lat: '17.7', lon: '83.3' } };
    const next = jest.fn();
    validateWeatherRequest(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.body.lat).toBeCloseTo(17.7);
    expect(req.body.lon).toBeCloseTo(83.3);
  });

  test('handles a missing body object without throwing', () => {
    const req = { query: { lat: '17.7', lon: '83.3' } };
    expect(() => validateWeatherRequest(req, mockRes(), jest.fn())).not.toThrow();
  });
});

describe('validateGeocodeRequest', () => {
  test('rejects a missing or empty query', () => {
    const req = { query: {} };
    const res = mockRes();
    const next = jest.fn();
    validateGeocodeRequest(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_QUERY');
  });

  test('rejects a query shorter than 2 characters', () => {
    const req = { query: { q: 'a' } };
    const res = mockRes();
    validateGeocodeRequest(req, res, jest.fn());
    expect(res.statusCode).toBe(400);
  });

  test('accepts a valid query and passes it through unchanged', () => {
    const req = { query: { q: 'Visakhapatnam' } };
    const next = jest.fn();
    validateGeocodeRequest(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.query.q).toBe('Visakhapatnam');
  });

  test('truncates an overly long query to 100 characters', () => {
    const req = { query: { q: 'x'.repeat(500) } };
    validateGeocodeRequest(req, mockRes(), jest.fn());
    expect(req.query.q.length).toBe(100);
  });
});

describe('validateTimeIntelRequest', () => {
  test('rejects a non-array places field', () => {
    const req = { body: { places: 'not-an-array' } };
    const res = mockRes();
    const next = jest.fn();
    validateTimeIntelRequest(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  test('caps places to 50 entries', () => {
    const places = Array.from({ length: 80 }, (_, i) => ({ name: `Place ${i}`, coords: [17, 83] }));
    const req = { body: { places } };
    validateTimeIntelRequest(req, mockRes(), jest.fn());
    expect(req.body.places.length).toBe(50);
  });

  test('rejects a non-object entry in places', () => {
    const req = { body: { places: ['not-an-object'] } };
    const res = mockRes();
    validateTimeIntelRequest(req, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/places\[0\] must be an object/);
  });

  test('rejects a non-string name field', () => {
    const req = { body: { places: [{ name: 12345 }] } };
    const res = mockRes();
    validateTimeIntelRequest(req, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/name must be a string/);
  });

  test('truncates an overly long place name to 200 characters', () => {
    const req = { body: { places: [{ name: 'x'.repeat(500) }] } };
    validateTimeIntelRequest(req, mockRes(), jest.fn());
    expect(req.body.places[0].name.length).toBe(200);
  });

  test('rejects malformed coords (not an array of two finite numbers)', () => {
    const req1 = { body: { places: [{ coords: 'nope' }] } };
    validateTimeIntelRequest(req1, mockRes(), jest.fn());
    // handled via response, verify by re-running with response capture:
    const res = mockRes();
    validateTimeIntelRequest({ body: { places: [{ coords: [17] }] } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/coords must be \[lat, lon\]/);
  });

  test('rejects out-of-range coords', () => {
    const res = mockRes();
    validateTimeIntelRequest({ body: { places: [{ coords: [999, 999] }] } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/out of range/);
  });

  test('normalizes valid coords to numbers', () => {
    const req = { body: { places: [{ coords: ['17.7', '83.3'] }] } };
    const next = jest.fn();
    validateTimeIntelRequest(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.body.places[0].coords).toEqual([17.7, 83.3]);
  });

  test('rejects a malformed fromCoords field', () => {
    const res = mockRes();
    validateTimeIntelRequest({ body: { fromCoords: 'nope' } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/fromCoords/);
  });

  test('accepts a valid fromCoords field', () => {
    const next = jest.fn();
    validateTimeIntelRequest({ body: { fromCoords: [17.7, 83.3] } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects a non-object weather field', () => {
    const res = mockRes();
    validateTimeIntelRequest({ body: { weather: 'sunny' } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/weather must be an object/);
  });

  test('rejects a non-array personas field', () => {
    const res = mockRes();
    validateTimeIntelRequest({ body: { personas: 'foodie' } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/personas must be an array/);
  });

  test('passes through a fully valid, minimal payload', () => {
    const next = jest.fn();
    const req = { body: { places: [{ name: 'Beach', coords: [17.7, 83.3] }], personas: ['foodie'], weather: { hourly: [] } } };
    validateTimeIntelRequest(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('handles a completely empty body without throwing', () => {
    const next = jest.fn();
    expect(() => validateTimeIntelRequest({}, mockRes(), next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});
