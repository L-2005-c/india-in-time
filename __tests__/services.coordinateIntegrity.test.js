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

  test('rejects offshore water coordinates into the sea for coastal cities', () => {
    // Coordinate 550m into the Bay of Bengal east of VUDA Park
    const waterPt = validatePoiCoordinates(17.7241, 83.3395, { cityHint: 'Visakhapatnam' });
    expect(waterPt.valid).toBe(false);
    expect(waterPt.reason).toBe('OFFSHORE_WATER_COORDINATES');

    // Valid land coordinate for VUDA Park
    const landPt = validatePoiCoordinates(17.7265, 83.3340, { cityHint: 'Visakhapatnam' });
    expect(landPt.valid).toBe(true);

    // Offshore into Arabian Sea off Mumbai coast
    const mumbaiWater = validatePoiCoordinates(18.95, 72.70, { cityHint: 'Mumbai' });
    expect(mumbaiWater.valid).toBe(false);
    expect(mumbaiWater.reason).toBe('OFFSHORE_WATER_COORDINATES');
  });

  test('validates audited and corrected place coordinates (Pavurallakonda, Yendada, Rama Naidu, Banganga)', () => {
    // Pavurallakonda Buddhist Complex (on hill, not offshore in Bay of Bengal)
    const pavu = validatePoiCoordinates(17.8828, 83.4358, { cityHint: 'Visakhapatnam' });
    expect(pavu.valid).toBe(true);

    // Yendada Beach (on land beach road, not 700m offshore in sea)
    const yendada = validatePoiCoordinates(17.7702, 83.3645, { cityHint: 'Visakhapatnam' });
    expect(yendada.valid).toBe(true);

    // Rama Naidu Studios (on hill, not in Bay of Bengal)
    const ramaNaidu = validatePoiCoordinates(17.8066, 83.3850, { cityHint: 'Visakhapatnam' });
    expect(ramaNaidu.valid).toBe(true);

    // Banganga Tank Malabar Hill (historic tank, not sea rocks)
    const banganga = validatePoiCoordinates(18.9458, 72.7930, { cityHint: 'Mumbai' });
    expect(banganga.valid).toBe(true);
  });

  test('asserts all places across staticCityPlaces and cities.js are valid and land-bound', () => {
    const fs = require('fs');
    const path = require('path');
    const { staticCityPlaces } = require('../data/city-seeds');

    // Safely load frontend cities data module in CJS Jest environment
    const citiesPath = path.resolve(__dirname, '../frontend/app-src/src/data/cities.js');
    const code = fs.readFileSync(citiesPath, 'utf8');
    const cjsCode = code.replace(/export\s*\{[^}]*\};?/, 'module.exports = { CITIES, LOCAL_PLACE_SEEDS, HIDDEN_GEM_SEEDS };');
    const mod = { exports: {} };
    const fn = new Function('module', 'exports', cjsCode);
    fn(mod, mod.exports);
    const { CITIES, LOCAL_PLACE_SEEDS, HIDDEN_GEM_SEEDS } = mod.exports;

    // Verify all backend city seeds
    for (const cKey of Object.keys(CITIES)) {
      const places = staticCityPlaces(cKey) || [];
      for (const p of places) {
        expect(typeof p.coords[0]).toBe('number');
        expect(typeof p.coords[1]).toBe('number');
        expect(isNaN(p.coords[0])).toBe(false);
        expect(isNaN(p.coords[1])).toBe(false);
        const res = validatePoiCoordinates(p.coords[0], p.coords[1], { cityHint: cKey });
        expect(res.valid).toBe(true);
      }
    }

    // Verify all frontend local place seeds
    for (const [cKey, list] of Object.entries(LOCAL_PLACE_SEEDS)) {
      for (const item of list) {
        const lat = item[2];
        const lon = item[3];
        const res = validatePoiCoordinates(lat, lon, { cityHint: cKey });
        expect(res.valid).toBe(true);
      }
    }

    // Verify all frontend hidden gem seeds
    for (const [cKey, gems] of Object.entries(HIDDEN_GEM_SEEDS)) {
      for (const gem of gems) {
        const [lat, lon] = gem.coords;
        const res = validatePoiCoordinates(lat, lon, { cityHint: cKey });
        expect(res.valid).toBe(true);
      }
    }
  });
});

