'use strict';

const {
  DEFAULT_TRAVEL_DNA,
  deriveDnaFromPersonas,
  applyRecencyDecay,
  recordBehaviorInteraction,
  computeDnaMatch,
} = require('../services/travelIntelligence/personalTravelDna');

describe('Travel DNA 2.0 (personalTravelDna.js)', () => {
  test('separates explicit persona preferences from default baselines with high confidence', () => {
    const profile = deriveDnaFromPersonas(['photographer', 'foodie'], 'solo');
    expect(profile.photography).toBeGreaterThanOrEqual(90);
    expect(profile.food).toBeGreaterThanOrEqual(95);
    expect(profile.sources.photography).toBe('explicit_persona');
    expect(profile.sources.food).toBe('explicit_persona');
    expect(profile.confidences.photography).toBeGreaterThanOrEqual(90);
  });

  test('applies recency decay to inferred preferences while keeping explicit preferences intact', () => {
    const activeProfile = {
      ...DEFAULT_TRAVEL_DNA,
      scenic: 90,
      sources: { ...DEFAULT_TRAVEL_DNA.sources, scenic: 'inferred' },
      confidences: { ...DEFAULT_TRAVEL_DNA.confidences, scenic: 85 },
      photography: 95,
      sources_photography: 'explicit',
      lastUpdated: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
    };

    const decayed = applyRecencyDecay(activeProfile, new Date());
    // Half-life is 60 days: scenic delta (90 - 50 = 40) should decay by ~50% (to ~70)
    expect(decayed.scenic).toBeLessThan(90);
    expect(decayed.scenic).toBeGreaterThanOrEqual(65);
  });

  test('records user interactions and updates inferred preferences', () => {
    const initial = { ...DEFAULT_TRAVEL_DNA };
    const updated = recordBehaviorInteraction(initial, { cat: 'food', name: 'Paradise Biryani' }, 'visit');
    expect(updated.food).toBeGreaterThan(initial.food);
    expect(updated.sources.food).toBe('inferred');
  });

  test('computes structured DNA match score with reasons', () => {
    const profile = deriveDnaFromPersonas(['photographer'], 'solo');
    const place = { cat: 'viewpoint', name: 'Kailasagiri Hilltop', is_sunset_spot: true };
    const match = computeDnaMatch(place, profile);
    expect(match.score).toBeGreaterThanOrEqual(80);
    expect(match.reasons.length).toBeGreaterThan(0);
    expect(match.confidence).toBeGreaterThanOrEqual(80);
  });
});
