const { distKm, isInIndia, isValidCoords, findClosest, INDIA_BOUNDS } = require('../utils/geo');

describe('distKm', () => {
  test('returns 0 for identical points', () => {
    expect(distKm(28.6139, 77.2090, 28.6139, 77.2090)).toBeCloseTo(0, 5);
  });

  test('computes a known real-world distance (Delhi to Mumbai, ~1150km)', () => {
    const d = distKm(28.6139, 77.2090, 19.0760, 72.8777);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1200);
  });

  test('is symmetric', () => {
    const a = distKm(13.0827, 80.2707, 22.5726, 88.3639);
    const b = distKm(22.5726, 88.3639, 13.0827, 80.2707);
    expect(a).toBeCloseTo(b, 8);
  });
});

describe('isInIndia', () => {
  test('accepts a coordinate within the India bounding box', () => {
    expect(isInIndia(28.6139, 77.2090)).toBe(true); // Delhi
  });

  test('rejects a coordinate outside the bounding box', () => {
    expect(isInIndia(40.7128, -74.0060)).toBe(false); // New York
  });

  test('accepts the exact boundary edges', () => {
    expect(isInIndia(INDIA_BOUNDS.minLat, INDIA_BOUNDS.minLon)).toBe(true);
    expect(isInIndia(INDIA_BOUNDS.maxLat, INDIA_BOUNDS.maxLon)).toBe(true);
  });

  test('rejects just outside the boundary edges', () => {
    expect(isInIndia(INDIA_BOUNDS.minLat - 0.01, 80)).toBe(false);
    expect(isInIndia(INDIA_BOUNDS.maxLat + 0.01, 80)).toBe(false);
  });
});

describe('isValidCoords', () => {
  test('accepts valid numeric lat/lon', () => {
    expect(isValidCoords(12.34, 56.78)).toBe(true);
  });

  test('rejects NaN', () => {
    expect(isValidCoords(NaN, 10)).toBe(false);
  });

  test('rejects out-of-range latitude/longitude', () => {
    expect(isValidCoords(91, 10)).toBe(false);
    expect(isValidCoords(10, 181)).toBe(false);
  });

  test('rejects non-numeric types (e.g. strings from query params)', () => {
    expect(isValidCoords('12.34', '56.78')).toBe(false);
  });
});

describe('findClosest', () => {
  test('returns the nearest place from a list', () => {
    const places = [
      { name: 'Far', coords: [30, 80] },
      { name: 'Near', coords: [28.62, 77.21] },
    ];
    const result = findClosest(28.6139, 77.2090, places);
    expect(result.place.name).toBe('Near');
  });

  test('skips places with missing/invalid coords', () => {
    const places = [
      { name: 'NoCoords' },
      { name: 'EmptyCoords', coords: [] },
      { name: 'Valid', coords: [28.62, 77.21] },
    ];
    const result = findClosest(28.6139, 77.2090, places);
    expect(result.place.name).toBe('Valid');
  });

  test('returns null place for an empty list', () => {
    const result = findClosest(0, 0, []);
    expect(result.place).toBeNull();
    expect(result.distKm).toBe(Infinity);
  });
});
