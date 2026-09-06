'use strict';

/**
 * __tests__/intelligence.adversarialPoi.test.js
 *
 * Adversarial POI & Zero-Trust Verification Tests (Phase 1 & 20).
 * Validates that localities, roads, colonies, and conflicting candidates
 * NEVER masquerade as verified tourist attractions.
 */

const { resolveCanonicalPlace, dedupeCanonicalPlaces } = require('../services/travelIntelligence/tourismPoi/canonicalPlaceResolver');
const { verifyAttractionCoordinates } = require('../services/travelIntelligence/tourismPoi/coordinateVerificationEngine');
const { createCanonicalPlace, VERIFICATION_STATUSES } = require('../services/travelIntelligence/tourismPoi/canonicalPlaceModel');

describe('Adversarial POI & Zero-Trust Entity Verification', () => {

  describe('Strict Locality and Non-Attraction Quarantine/Rejection', () => {
    test('Marripalem locality must NEVER become a tourist attraction', () => {
      const result = resolveCanonicalPlace({ name: 'Marripalem', city: 'Visakhapatnam' });
      expect(result).toBeNull();
    });

    test('Seethammadhara locality must NEVER become a tourist attraction', () => {
      const result = resolveCanonicalPlace({ name: 'Seethammadhara', city: 'Visakhapatnam' });
      expect(result).toBeNull();
    });

    test('Dwaraka Nagar locality must NEVER become a tourist attraction', () => {
      const result = resolveCanonicalPlace({ name: 'Dwaraka Nagar', city: 'Visakhapatnam' });
      expect(result).toBeNull();
    });

    test('Generic road and junction names must be rejected', () => {
      const rd1 = resolveCanonicalPlace({ name: 'MG Road Junction', city: 'Bengaluru' });
      const rd2 = resolveCanonicalPlace({ name: 'Main Road Extension Colony', city: 'Delhi' });
      expect(rd1).toBeNull();
      expect(rd2).toBeNull();
    });

    test('Commercial and civic services are rejected as tourist attractions', () => {
      const res = resolveCanonicalPlace({
        name: 'Town Police Station',
        type: 'police',
        city: 'Visakhapatnam',
      });
      expect(res).toBeNull();
    });
  });

  describe('Zero-Trust Reference Candidate Validation', () => {
    test('Golden POI candidate must pass coordinate integrity and return verified entity with evidence', () => {
      const result = resolveCanonicalPlace('RK Beach', { cityHint: 'Visakhapatnam' });
      expect(result).not.toBeNull();
      expect(result.canonicalName).toMatch(/RK Beach|Ramakrishna Beach/i);
      expect(['AUTO_VALIDATED', 'VERIFIED']).toContain(result.verificationStatus);
      expect(['CURATED_REFERENCE', 'AUTHORITATIVE_SURVEY']).toContain(result.coordinateSource);
      expect(result.confidence).toBe('HIGH');
      expect(Array.isArray(result.evidence)).toBe(true);
      expect(result.evidence.length).toBeGreaterThan(0);
    });

    test('Divergent coordinates trigger quarantine rather than silent acceptance', () => {
      // Coords for RK Beach are ~17.7142, 83.3236. Candidate coords at [17.7400, 83.3100] is ~3.5km away in city (>1500m beach tolerance)
      const verification = verifyAttractionCoordinates({
        placeName: 'RK Beach',
        city: 'Visakhapatnam',
        candidateCoords: [17.7400, 83.3100],
        referenceCoords: [17.7142, 83.3236],
        category: 'beach',
      });

      expect(verification.verified).toBe(false);
      expect(verification.verificationStatus).toBe('QUARANTINED');
      expect(verification.quarantineReason).toMatch(/Diverges from reference survey/i);
    });

    test('Coordinates outside destination city boundary are rejected', () => {
      const verification = verifyAttractionCoordinates({
        placeName: 'RK Beach',
        city: 'Visakhapatnam',
        candidateCoords: [16.5062, 80.6480], // in Vijayawada (>300km away)
        category: 'beach',
      });

      expect(verification.verified).toBe(false);
      expect(verification.verificationStatus).toBe('REJECTED');
      expect(verification.rejectionReason).toMatch(/CITY_RADIUS/i);
    });

    test('Invalid coordinates reject the place completely', () => {
      const place = createCanonicalPlace({
        canonicalName: 'Test Phantom Attraction',
        latitude: 'invalid_lat',
        longitude: null,
      });

      expect(place.verificationStatus).toBe(VERIFICATION_STATUSES.REJECTED);
      expect(place.latitude).toBeNull();
      expect(place.longitude).toBeNull();
      expect(place.coords).toBeNull();
      expect(place.confidence).toBeNull();
    });
  });

  describe('Deduplication and Ambiguity Handling', () => {
    test('Near-duplicate spatial points are deduplicated cleanly', () => {
      const p1 = createCanonicalPlace({
        id: 'vizag_rk_beach_1',
        canonicalName: 'Ramakrishna Beach Front',
        latitude: 17.7142,
        longitude: 83.3236,
        category: 'beach',
      });
      const p2 = createCanonicalPlace({
        id: 'vizag_rk_beach_2',
        canonicalName: 'Ramakrishna Beach Pier',
        latitude: 17.7145,
        longitude: 83.3239, // ~40m away
        category: 'beach',
      });

      const deduped = dedupeCanonicalPlaces([p1, p2]);
      expect(deduped.length).toBe(1);
      expect(deduped[0].id).toBe('vizag_rk_beach_1');
    });
  });

});
