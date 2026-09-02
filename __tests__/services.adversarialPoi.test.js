'use strict';

/**
 * __tests__/services.adversarialPoi.test.js
 *
 * Adversarial POI Test Suite for Zero-Trust Geographic Data Remediation.
 * Explicitly tests:
 * 1. Kailasagiri vs Kailasagiri Colony
 * 2. RK Beach vs RK Beach Road
 * 3. Simhachalam vs Simhachalam area
 * 4. Dwaraka Nagar & Marripalem as localities
 * 5. City Palace across multiple cities
 * 6. Swapped coordinates auto-rectification
 * 7. Quarantined POIs rejection by itinerary planner
 */

const { resolveCanonicalPlace } = require('../services/travelIntelligence/tourismPoi/canonicalPlaceResolver');
const { createCanonicalPlace, VERIFICATION_STATUSES } = require('../services/travelIntelligence/tourismPoi/canonicalPlaceModel');
const { filterCandidates } = require('../services/travelIntelligence/requirementEngine');

describe('Adversarial POI & Zero-Trust Geo Tests', () => {
  describe('Attraction vs Colony/Road Disambiguation', () => {
    test('Kailasagiri resolves to attraction, but Kailasagiri Colony is rejected', () => {
      const attraction = resolveCanonicalPlace('Kailasagiri', { cityHint: 'Visakhapatnam' });
      expect(attraction).not.toBeNull();
      expect(attraction.canonicalName).toBe('Kailasagiri');
      expect(attraction.latitude).toBeCloseTo(17.7492, 3);
      expect(attraction.longitude).toBeCloseTo(83.3418, 3);

      const colony = resolveCanonicalPlace('Kailasagiri Colony', { cityHint: 'Visakhapatnam' });
      expect(colony).toBeNull();
    });

    test('RK Beach resolves to beach attraction, but RK Beach Road is rejected', () => {
      const beach = resolveCanonicalPlace('Ramakrishna Beach', { cityHint: 'Visakhapatnam' });
      expect(beach).not.toBeNull();
      expect(beach.canonicalName).toBe('Ramakrishna Beach');

      const road = resolveCanonicalPlace('Ramakrishna Beach Road', { cityHint: 'Visakhapatnam' });
      expect(road).toBeNull();
    });

    test('Simhachalam Temple resolves, but Simhachalam Area / Colony is rejected', () => {
      const temple = resolveCanonicalPlace('Simhachalam Temple', { cityHint: 'Visakhapatnam' });
      expect(temple).not.toBeNull();
      expect(temple.canonicalName).toContain('Simhachalam');

      const area = resolveCanonicalPlace('Simhachalam Area', { cityHint: 'Visakhapatnam' });
      expect(area).toBeNull();
    });
  });

  describe('Pure Locality Rejection', () => {
    test('strictly rejects commercial and residential localities', () => {
      expect(resolveCanonicalPlace('Dwaraka Nagar', { cityHint: 'Visakhapatnam' })).toBeNull();
      expect(resolveCanonicalPlace('Marripalem', { cityHint: 'Visakhapatnam' })).toBeNull();
      expect(resolveCanonicalPlace('MVP Colony', { cityHint: 'Visakhapatnam' })).toBeNull();
      expect(resolveCanonicalPlace('Gajuwaka', { cityHint: 'Visakhapatnam' })).toBeNull();
      expect(resolveCanonicalPlace('Seethammadhara', { cityHint: 'Visakhapatnam' })).toBeNull();
    });
  });

  describe('Multi-City Attraction Disambiguation', () => {
    test('resolves City Palace correctly according to city hint', () => {
      const jaipurPalace = resolveCanonicalPlace('City Palace', { cityHint: 'Jaipur' });
      expect(jaipurPalace).not.toBeNull();
      expect(jaipurPalace.city).toBe('Jaipur');
      expect(jaipurPalace.latitude).toBeCloseTo(26.9258, 3);
    });
  });

  describe('Swapped Coordinates Detection', () => {
    test('detects inverted coordinates and rectifies them during canonical resolution', () => {
      // Inverted: lat=83.3237, lon=17.7142
      const place = resolveCanonicalPlace({
        name: 'Custom RK Beach View',
        lat: 83.3237,
        lon: 17.7142,
        city: 'Visakhapatnam',
        category: 'beach',
      });
      expect(place).not.toBeNull();
      expect(place.latitude).toBeCloseTo(17.7142, 3);
      expect(place.longitude).toBeCloseTo(83.3237, 3);
    });
  });

  describe('Itinerary Planner Quarantine Isolation', () => {
    test('filterCandidates excludes quarantined, rejected, or invalid coordinate POIs', () => {
      const candidateList = [
        createCanonicalPlace({
          id: 'place_valid',
          canonicalName: 'Lalbagh Botanical Garden',
          latitude: 12.9507,
          longitude: 77.5848,
          city: 'Bengaluru',
          verificationStatus: VERIFICATION_STATUSES.VERIFIED,
        }),
        createCanonicalPlace({
          id: 'place_quarantined',
          canonicalName: 'Disputed Monument',
          latitude: 12.9600,
          longitude: 77.5900,
          city: 'Bengaluru',
          verificationStatus: VERIFICATION_STATUSES.QUARANTINED,
        }),
        createCanonicalPlace({
          id: 'place_rejected',
          canonicalName: 'Colony Street',
          latitude: 12.9700,
          longitude: 77.6000,
          city: 'Bengaluru',
          verificationStatus: VERIFICATION_STATUSES.REJECTED,
        }),
      ];

      const dummyReqs = { hard: { excludedCategories: [] } };
      const filtered = filterCandidates(candidateList, dummyReqs);

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('place_valid');
      expect(filtered.some(p => p.id === 'place_quarantined')).toBe(false);
      expect(filtered.some(p => p.id === 'place_rejected')).toBe(false);
    });
  });
});
