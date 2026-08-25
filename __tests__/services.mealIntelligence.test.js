'use strict';

const {
  getActiveMealSlot,
  findRouteAwareDining,
  detourDistanceKm,
} = require('../services/travelIntelligence/mealIntelligence');

describe('Route-Aware Meal Intelligence (mealIntelligence.js)', () => {
  test('identifies active meal slots based on time of day', () => {
    expect(getActiveMealSlot(8 * 60).key).toBe('breakfast');
    expect(getActiveMealSlot(13 * 60).key).toBe('lunch');
    expect(getActiveMealSlot(17 * 60).key).toBe('snack');
    expect(getActiveMealSlot(20 * 60).key).toBe('dinner');
  });

  test('calculates corridor detour distance correctly', () => {
    const a = [17.7126, 83.3235]; // RK Beach
    const b = [17.7478, 83.3364]; // Kailasagiri
    const pOnRoute = [17.7250, 83.3300]; // Midpoint
    const pFar = [17.7000, 83.2000]; // Opposite side

    const detourClose = detourDistanceKm(pOnRoute, a, b);
    const detourFar = detourDistanceKm(pFar, a, b);
    expect(detourClose).toBeLessThan(detourFar);
  });

  test('ranks on-route dining places with high scores', () => {
    const candidates = [
      { id: '1', name: 'Sea View Restaurant', cat: 'food', coords: [17.7250, 83.3300], rating: 4.6, veg: true },
      { id: '2', name: 'Distant Highway Dhaba', cat: 'food', coords: [17.6000, 83.1000], rating: 4.0 },
    ];

    const results = findRouteAwareDining([17.7126, 83.3235], [17.7478, 83.3364], candidates, {
      timeMin: 13 * 60,
      dietaryRestrictions: ['vegetarian'],
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Sea View Restaurant');
    expect(results[0].whyRecommended).toContain('route');
  });
});
