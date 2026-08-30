'use strict';

/**
 * __tests__/services.canonicalPlaceResolver.test.js
 * Unit and integration tests for canonical tourist place resolution, alias matching,
 * locality rejection, and data quality scoring.
 */

const {
  resolveCanonicalPlace,
  normalizePlaceName,
  dedupeCanonicalPlaces,
} = require('../services/travelIntelligence/tourismPoi/canonicalPlaceResolver');
const { createCanonicalPlace } = require('../services/travelIntelligence/tourismPoi/canonicalPlaceModel');

describe('Canonical Place Resolver (canonicalPlaceResolver.js)', () => {
  test('normalizes raw query strings cleanly', () => {
    expect(normalizePlaceName('  "Kailasagiri Hill"  ')).toBe('Kailasagiri Hill');
    expect(normalizePlaceName('Ramakrishna   Beach')).toBe('Ramakrishna Beach');
  });

  test('resolves known golden destination from exact name and returns verified survey coordinates', () => {
    const res = resolveCanonicalPlace('Ramakrishna Beach', { cityHint: 'Visakhapatnam' });
    expect(res).not.toBeNull();
    expect(res.canonicalName).toBe('Ramakrishna Beach');
    expect(res.city).toBe('Visakhapatnam');
    expect(res.latitude).toBeCloseTo(17.7142, 3);
    expect(res.longitude).toBeCloseTo(83.3237, 3);
    expect(res.coordinateSource).toBe('AUTHORITATIVE_SURVEY');
    expect(res.verificationStatus).toBe('VERIFIED');
    expect(res.qualityScore.overall).toBeGreaterThanOrEqual(90);
  });

  test('resolves golden aliases to canonical destination', () => {
    // IGZP -> Indira Gandhi Zoological Park
    const igzp = resolveCanonicalPlace('IGZP', { cityHint: 'Visakhapatnam' });
    expect(igzp).not.toBeNull();
    expect(igzp.canonicalName).toBe('Indira Gandhi Zoological Park');
    expect(igzp.category).toBe('zoo');

    // Kursura -> INS Kursura Submarine Museum
    const kursura = resolveCanonicalPlace('Kursura', { cityHint: 'Visakhapatnam' });
    expect(kursura).not.toBeNull();
    expect(kursura.canonicalName).toBe('INS Kursura Submarine Museum');
    expect(kursura.category).toBe('museum');

    // Tank Bund -> Hussain Sagar
    const tankBund = resolveCanonicalPlace('Tank Bund', { cityHint: 'Hyderabad' });
    expect(tankBund).not.toBeNull();
    expect(tankBund.canonicalName).toBe('Hussain Sagar');
  });

  test('strictly rejects residential and commercial localities from becoming attractions', () => {
    expect(resolveCanonicalPlace('Marripalem', { cityHint: 'Visakhapatnam' })).toBeNull();
    expect(resolveCanonicalPlace('Seethammadhara', { cityHint: 'Visakhapatnam' })).toBeNull();
    expect(resolveCanonicalPlace('MVP Colony', { cityHint: 'Visakhapatnam' })).toBeNull();
    expect(resolveCanonicalPlace('Dwaraka Nagar', { cityHint: 'Visakhapatnam' })).toBeNull();
    expect(resolveCanonicalPlace('Gajuwaka', { cityHint: 'Visakhapatnam' })).toBeNull();
    expect(resolveCanonicalPlace('Kailasagiri Colony', { cityHint: 'Visakhapatnam' })).toBeNull();
  });

  test('rejects candidate with invalid, outside-India, or Null Island coordinates', () => {
    // Null Island
    expect(resolveCanonicalPlace({ name: 'Random Place', lat: 0, lon: 0 })).toBeNull();
    // Outside India (e.g. London)
    expect(resolveCanonicalPlace({ name: 'London Eye', lat: 51.5033, lon: -0.1195 })).toBeNull();
    // Non-numeric
    expect(resolveCanonicalPlace({ name: 'Bad Coords', lat: 'invalid', lon: 'invalid' })).toBeNull();
  });

  test('deduplicates canonical places by ID and spatial proximity', () => {
    const p1 = createCanonicalPlace({ id: 'vizag_rk_beach', canonicalName: 'Ramakrishna Beach', latitude: 17.7142, longitude: 83.3237, city: 'Visakhapatnam' });
    const p2 = createCanonicalPlace({ id: 'vizag_rk_beach', canonicalName: 'Ramakrishna Beach', latitude: 17.7142, longitude: 83.3237, city: 'Visakhapatnam' });
    const p3 = createCanonicalPlace({ id: 'vizag_kursura', canonicalName: 'INS Kursura Submarine Museum', latitude: 17.7172, longitude: 83.3301, city: 'Visakhapatnam' });

    const deduped = dedupeCanonicalPlaces([p1, p2, p3]);
    expect(deduped.length).toBe(2);
    expect(deduped.map(p => p.id)).toEqual(['vizag_rk_beach', 'vizag_kursura']);
  });
});
