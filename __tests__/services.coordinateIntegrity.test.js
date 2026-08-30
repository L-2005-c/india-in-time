'use strict';

/**
 * __tests__/services.coordinateIntegrity.test.js
 * Unit and integration tests for coordinate integrity validation,
 * bounds checking, swapped coordinate correction, and tolerance verification.
 */

const {
  validatePoiCoordinates,
  checkCoordinateTolerance,
} = require('../services/travelIntelligence/tourismPoi/coordinateIntegrity');

describe('Coordinate Integrity Engine (coordinateIntegrity.js)', () => {
  test('validates standard valid coordinates within India', () => {
    const res = validatePoiCoordinates(17.7142, 83.3237, { cityHint: 'Visakhapatnam' });
    expect(res.valid).toBe(true);
    expect(res.lat).toBe(17.7142);
    expect(res.lon).toBe(83.3237);
    expect(res.wasSwapped).toBe(false);
    expect(res.confidence).toBeGreaterThanOrEqual(85);
  });

  test('detects and auto-corrects swapped (inverted) coordinates in India', () => {
    // Inverted: lat is 83.3237, lon is 17.7142
    const res = validatePoiCoordinates(83.3237, 17.7142, { cityHint: 'Visakhapatnam' });
    expect(res.valid).toBe(true);
    expect(res.lat).toBe(17.7142);
    expect(res.lon).toBe(83.3237);
    expect(res.wasSwapped).toBe(true);
  });

  test('rejects Null Island (0, 0)', () => {
    const res = validatePoiCoordinates(0, 0);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('INVALID_NUMERIC_COORDINATES');
  });

  test('rejects coordinates outside India bounding box', () => {
    // New York: 40.7128, -74.0060
    const res = validatePoiCoordinates(40.7128, -74.0060);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('OUTSIDE_INDIA_BOUNDS');
  });

  test('rejects coordinates exceeding expected city centroid radius', () => {
    // Bangalore coordinate passed with Visakhapatnam city hint
    const res = validatePoiCoordinates(12.9716, 77.5946, { cityHint: 'Visakhapatnam' });
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/EXCEEDS_CITY_RADIUS/);
  });

  test('verifies coordinate tolerance accurately against golden survey coordinates', () => {
    const golden = [17.7142, 83.3237]; // RK Beach
    const nearby = [17.7145, 83.3240]; // ~40m away
    const far = [17.7825, 83.3851];    // Rushikonda, ~9km away

    const closeCheck = checkCoordinateTolerance(nearby, golden, 500);
    expect(closeCheck.withinTolerance).toBe(true);
    expect(closeCheck.distanceMeters).toBeLessThan(100);

    const farCheck = checkCoordinateTolerance(far, golden, 500);
    expect(farCheck.withinTolerance).toBe(false);
    expect(farCheck.distanceMeters).toBeGreaterThan(5000);
  });
});
