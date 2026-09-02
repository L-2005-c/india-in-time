'use strict';

/**
 * __tests__/services.coordinateVerificationEngine.test.js
 * Unit and integration tests for Attraction-Level Coordinate Verification
 * and Multi-Signal Candidate Scoring.
 */

const {
  CATEGORY_TOLERANCES_METERS,
  computeStringSimilarity,
  scoreCandidateMatch,
  verifyAttractionCoordinates,
  isQuarantinedPoi,
} = require('../services/travelIntelligence/tourismPoi/coordinateVerificationEngine');

describe('Coordinate Verification Engine (coordinateVerificationEngine.js)', () => {
  describe('String Similarity & Token Overlap', () => {
    test('computes exact match as 1.0', () => {
      expect(computeStringSimilarity('Kailasagiri', 'Kailasagiri')).toBe(1.0);
    });

    test('computes high score for partial matching attraction tokens', () => {
      const sim = computeStringSimilarity('Kailasagiri Hill', 'Kailasagiri');
      expect(sim).toBeGreaterThanOrEqual(0.6);
    });

    test('returns 0 for completely unrelated strings', () => {
      const sim = computeStringSimilarity('Marine Drive', 'Charminar');
      expect(sim).toBe(0);
    });
  });

  describe('Candidate Scoring (100-point transparent scale)', () => {
    test('rewards exact attraction match with high score', () => {
      const candidate = {
        name: 'Kailasagiri Hill Park',
        type: 'tourism',
        city: 'Visakhapatnam',
        category: 'scenic',
        coords: [17.7492, 83.3418],
        osm_id: 12345,
        address: { city: 'Visakhapatnam' },
      };
      const score = scoreCandidateMatch(candidate, { name: 'Kailasagiri', city: 'Visakhapatnam', category: 'scenic' });
      expect(score.totalScore).toBeGreaterThanOrEqual(75);
      expect(score.isLocalityConflict).toBe(false);
      expect(score.breakdown.entityTypeMatch).toBe(25);
      expect(score.breakdown.cityMatch).toBe(15);
    });

    test('severely penalizes candidate with locality / colony / road naming', () => {
      const roadCandidate = {
        name: 'Kailasagiri Colony',
        type: 'residential',
        city: 'Visakhapatnam',
        category: 'scenic',
        coords: [17.7492, 83.3418],
      };
      const score = scoreCandidateMatch(roadCandidate, { name: 'Kailasagiri', city: 'Visakhapatnam', category: 'scenic' });
      expect(score.isLocalityConflict).toBe(true);
      expect(score.breakdown.entityTypeMatch).toBe(0);
    });
  });

  describe('Category-Specific Tolerances & Conflict Detection', () => {
    test('allows beach candidate within 1500m tolerance', () => {
      const reference = [17.7142, 83.3237]; // RK Beach
      const nearbyCandidate = [17.7160, 83.3250]; // ~250m away

      const res = verifyAttractionCoordinates({
        placeName: 'Ramakrishna Beach',
        city: 'Visakhapatnam',
        category: 'beach',
        candidateCoords: nearbyCandidate,
        referenceCoords: reference,
      });

      expect(res.verified).toBe(true);
      expect(res.verificationStatus).toBe('AUTO_VALIDATED');
      expect(res.conflict).toBe(false);
    });

    test('flags museum candidate as conflict if exceeding 500m tolerance', () => {
      const reference = [17.7172, 83.3301]; // INS Kursura Submarine Museum
      const displacedCandidate = [17.7280, 83.3420]; // ~1.7km away

      const res = verifyAttractionCoordinates({
        placeName: 'INS Kursura Submarine Museum',
        city: 'Visakhapatnam',
        category: 'museum',
        candidateCoords: displacedCandidate,
        referenceCoords: reference,
      });

      expect(res.verified).toBe(false);
      expect(res.verificationStatus).toBe('QUARANTINED');
      expect(res.conflict).toBe(true);
      expect(res.quarantineReason).toMatch(/Diverges from reference survey/);
    });

    test('defines specific tolerances for beaches, temples, museums, and restaurants', () => {
      expect(CATEGORY_TOLERANCES_METERS.beach).toBe(1500);
      expect(CATEGORY_TOLERANCES_METERS.temple).toBe(600);
      expect(CATEGORY_TOLERANCES_METERS.museum).toBe(500);
      expect(CATEGORY_TOLERANCES_METERS.food).toBe(400);
    });
  });

  describe('Quarantine Check Utility', () => {
    test('identifies quarantined and rejected POIs correctly', () => {
      expect(isQuarantinedPoi({ verificationStatus: 'QUARANTINED' })).toBe(true);
      expect(isQuarantinedPoi({ verificationStatus: 'REJECTED' })).toBe(true);
      expect(isQuarantinedPoi({ verificationStatus: 'INVALID_COORDINATES' })).toBe(true);
      expect(isQuarantinedPoi({ verificationStatus: 'VERIFIED' })).toBe(false);
      expect(isQuarantinedPoi({ verificationStatus: 'AUTO_VALIDATED' })).toBe(false);
      expect(isQuarantinedPoi(null)).toBe(true);
    });
  });
});
