'use strict';

const {
  DEFAULT_TRAVEL_DNA,
  sanitizeDnaProfile,
  deriveDnaFromPersonas,
  computeDnaMatch,
} = require('../services/travelIntelligence/personalTravelDna');

describe('Personal Travel DNA Engine', () => {
  test('returns default balanced DNA profile when no input is provided', () => {
    const dna = sanitizeDnaProfile();
    expect(dna.scenic).toBe(DEFAULT_TRAVEL_DNA.scenic);
    expect(dna.food).toBe(DEFAULT_TRAVEL_DNA.food);
    expect(dna.pacePreference).toBe('balanced');
    expect(dna.enabled).toBe(true);
  });

  test('clamps out-of-bound values strictly between 0 and 100', () => {
    const dna = sanitizeDnaProfile({
      scenic: 150,
      photography: -20,
      food: 'invalid',
      pacePreference: 'unknown_pace',
    });
    expect(dna.scenic).toBe(100);
    expect(dna.photography).toBe(0);
    expect(dna.food).toBe(DEFAULT_TRAVEL_DNA.food);
    expect(dna.pacePreference).toBe('balanced');
  });

  test('derives personalized DNA vectors from user personas', () => {
    const photoDna = deriveDnaFromPersonas(['photographer', 'nature'], 'relaxed');
    expect(photoDna.photography).toBeGreaterThanOrEqual(90);
    expect(photoDna.scenic).toBeGreaterThanOrEqual(90);
    expect(photoDna.crowdTolerance).toBeLessThanOrEqual(40);
    expect(photoDna.pacePreference).toBe('relaxed');

    const foodieDna = deriveDnaFromPersonas(['food_lover']);
    expect(foodieDna.food).toBe(95);

    const adventureDna = deriveDnaFromPersonas(['adventure']);
    expect(adventureDna.adventure).toBeGreaterThanOrEqual(85);
    expect(adventureDna.walkingTolerance).toBeGreaterThanOrEqual(85);
  });

  test('computes explainable DNA match score for scenic destination', () => {
    const place = {
      name: 'Kailasagiri Hilltop Vista',
      cat: 'viewpoint',
      is_sunset_spot: true,
      scenic: { score: 92 },
    };

    const dnaProfile = {
      scenic: 95,
      photography: 90,
      food: 50,
      crowdTolerance: 30,
      enabled: true,
    };

    const match = computeDnaMatch(place, dnaProfile);
    expect(match.score).toBeGreaterThan(65);
    expect(match.reasons.length).toBeGreaterThan(0);
    expect(match.reasons.some(r => /scenic|photography/i.test(r))).toBe(true);
    expect(match.confidence).toBeGreaterThan(80);
  });

  test('respects privacy toggle and returns neutral scoring when disabled', () => {
    const place = { name: 'Local Restaurant', cat: 'food' };
    const disabledDna = { enabled: false };

    const match = computeDnaMatch(place, disabledDna);
    expect(match.reasons).toContain('Personalization disabled');
    expect(match.score).toBe(70);
  });
});
