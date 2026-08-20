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
  res.statusCode = 200;
  res.body = null;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

function run(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

describe('middleware/validator', () => {
  describe('validateAiRequest', () => {
    test('sanitizes message/city and calls next', () => {
      const req = {
        body: {
          message: '  hello world  ',
          city: 'Visakhapatnam',
          limit: 50,
          plan: ['Beach', 'Temple'],
        },
      };
      const { res, nextCalled } = run(validateAiRequest, req);
      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(typeof req.body.message).toBe('string');
      expect(req.body.city).toBeTruthy();
      expect(Array.isArray(req.body.plan)).toBe(true);
    });

    test('rejects invalid image payload', () => {
      const req = { body: { imageBase64: 'not-valid-base64!!!' } };
      const { res, nextCalled } = run(validateAiRequest, req);
      expect(nextCalled).toBe(false);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.code).toBe('INVALID_IMAGE');
    });

    test('clamps numeric fields', () => {
      const req = { body: { minutesLate: 9999, distanceKm: -5, spent: 10 } };
      const { nextCalled } = run(validateAiRequest, req);
      expect(nextCalled).toBe(true);
      expect(req.body.minutesLate).toBeLessThanOrEqual(600);
      expect(req.body.distanceKm).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validatePlacesRequest', () => {
    test('accepts valid India coords', () => {
      const req = { body: { lat: 17.6868, lon: 83.2185, cityName: 'Vizag', totalMinutes: 480 } };
      const { nextCalled } = run(validatePlacesRequest, req);
      expect(nextCalled).toBe(true);
      expect(req.body.lat).toBeCloseTo(17.6868);
    });

    test('rejects invalid coordinates', () => {
      const req = { body: { lat: 'x', lon: 'y' } };
      const { res, nextCalled } = run(validatePlacesRequest, req);
      expect(nextCalled).toBe(false);
      expect(res.body.code).toBe('INVALID_COORDS');
    });

    test('rejects coords outside India', () => {
      const req = { body: { lat: 40.7128, lon: -74.006 } }; // NYC
      const { res, nextCalled } = run(validatePlacesRequest, req);
      expect(nextCalled).toBe(false);
      expect(res.body.code).toBe('OUT_OF_BOUNDS');
    });

    test('filters invalid preference tags', () => {
      const req = {
        body: { lat: 17.68, lon: 83.21, prefs: ['beach', 'hack', 'food'] },
      };
      const { nextCalled } = run(validatePlacesRequest, req);
      expect(nextCalled).toBe(true);
      expect(req.body.prefs).toEqual(['beach', 'food']);
    });
  });

  describe('validateWeatherRequest', () => {
    test('accepts query lat/lon', () => {
      const req = { query: { lat: '17.68', lon: '83.21' }, body: {} };
      const { nextCalled } = run(validateWeatherRequest, req);
      expect(nextCalled).toBe(true);
      expect(req.query.lat).toBeCloseTo(17.68);
    });

    test('rejects missing lat/lon', () => {
      const req = { query: {}, body: {} };
      const { res, nextCalled } = run(validateWeatherRequest, req);
      expect(nextCalled).toBe(false);
      expect(res.body.code).toBe('INVALID_COORDS');
    });
  });

  describe('validateGeocodeRequest', () => {
    test('rejects short query', () => {
      const req = { query: { q: 'a' } };
      const { res, nextCalled } = run(validateGeocodeRequest, req);
      expect(nextCalled).toBe(false);
      expect(res.body.code).toBe('INVALID_QUERY');
    });

    test('truncates long query and continues', () => {
      const req = { query: { q: 'x'.repeat(150) } };
      const { nextCalled } = run(validateGeocodeRequest, req);
      expect(nextCalled).toBe(true);
      expect(req.query.q.length).toBeLessThanOrEqual(100);
    });
  });

  describe('validateTimeIntelRequest', () => {
    test('accepts valid places + fromCoords', () => {
      const req = {
        body: {
          places: [
            { name: 'Beach', coords: [17.68, 83.21] },
            { name: 'Temple', coords: [17.70, 83.25] },
          ],
          fromCoords: [17.69, 83.22],
          weather: { tempC: 30 },
          personas: ['photographer'],
        },
      };
      const { nextCalled } = run(validateTimeIntelRequest, req);
      expect(nextCalled).toBe(true);
    });

    test('rejects non-array places', () => {
      const req = { body: { places: 'nope' } };
      const { res, nextCalled } = run(validateTimeIntelRequest, req);
      expect(nextCalled).toBe(false);
      expect(res.body.error).toMatch(/array/i);
    });

    test('caps places at 50', () => {
      const places = Array.from({ length: 60 }, (_, i) => ({
        name: `P${i}`,
        coords: [17.6 + i * 0.001, 83.2],
      }));
      const req = { body: { places } };
      const { nextCalled } = run(validateTimeIntelRequest, req);
      expect(nextCalled).toBe(true);
      expect(req.body.places.length).toBe(50);
    });

    test('rejects bad coords shape', () => {
      const req = { body: { places: [{ name: 'X', coords: ['a', 'b'] }] } };
      const { res, nextCalled } = run(validateTimeIntelRequest, req);
      expect(nextCalled).toBe(false);
      expect(res.body.error).toMatch(/coords/i);
    });

    test('rejects invalid fromCoords', () => {
      const req = { body: { fromCoords: [1] } };
      const { res, nextCalled } = run(validateTimeIntelRequest, req);
      expect(nextCalled).toBe(false);
      expect(res.body.error).toMatch(/fromCoords/i);
    });

    test('rejects non-object weather / non-array personas', () => {
      let r = run(validateTimeIntelRequest, { body: { weather: 'hot' } });
      expect(r.nextCalled).toBe(false);
      r = run(validateTimeIntelRequest, { body: { personas: 'solo' } });
      expect(r.nextCalled).toBe(false);
    });
  });
});
