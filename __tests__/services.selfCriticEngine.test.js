'use strict';

const { critiqueItinerary } = require('../services/travelIntelligence/selfCriticEngine');

describe('Itinerary Self-Criticism & Quality Engine (selfCriticEngine.js)', () => {
  test('evaluates a high-quality feasible itinerary with a high score (> 85/100)', () => {
    const validPlan = {
      stops: [
        {
          id: 'kailasagiri',
          name: 'Kailasagiri',
          category: 'scenic',
          coords: [17.7478, 83.3364],
          arriveMin: 9 * 60,
          leaveMin: 10 * 60,
          stayMinutes: 60,
          travelMinutes: 15,
          distanceKm: 4.2,
          open: true,
          crowdLevel: 'Low',
          is_sunset_spot: false,
        },
        {
          id: 'sub',
          name: 'Submarine Museum',
          category: 'museum',
          coords: [17.7165, 83.3323],
          arriveMin: 10 * 60 + 20,
          leaveMin: 11 * 60 + 20,
          stayMinutes: 60,
          travelMinutes: 20,
          distanceKm: 5.1,
          open: true,
          crowdLevel: 'Low',
        },
        {
          id: 'rkbeach',
          name: 'RK Beach',
          category: 'beach',
          coords: [17.7126, 83.3235],
          arriveMin: 17 * 60 + 15,
          leaveMin: 18 * 60 + 30,
          stayMinutes: 75,
          travelMinutes: 10,
          distanceKm: 1.8,
          open: true,
          crowdLevel: 'Moderate',
          is_sunset_spot: true,
        },
      ],
    };

    const requirements = {
      hard: { startMin: 9 * 60, endMin: 19 * 60 },
      soft: { preferredCategories: ['scenic', 'museum', 'beach'] },
      weather: { tempC: 28, condition: 'Clear' },
    };

    const critique = critiqueItinerary(validPlan, requirements);
    expect(critique.passed).toBe(true);
    expect(critique.overallQualityScore).toBeGreaterThanOrEqual(85);
    expect(critique.breakdown.timeOptimization).toBeGreaterThanOrEqual(90);
    expect(critique.breakdown.routeEfficiency).toBeGreaterThanOrEqual(80);
    expect(critique.breakdown.scenicTiming).toBeGreaterThanOrEqual(85);
  });

  test('flags timing ordering violations and closed destinations', () => {
    const invalidPlan = {
      stops: [
        {
          name: 'Place A',
          arriveMin: 10 * 60,
          leaveMin: 11 * 60,
          open: true,
        },
        {
          name: 'Place B (Closed)',
          arriveMin: 10 * 60 + 30, // Arrives before Place A leaves!
          leaveMin: 11 * 60 + 30,
          open: false, // Closed!
        },
      ],
    };

    const requirements = { hard: { startMin: 9 * 60, endMin: 18 * 60 } };
    const critique = critiqueItinerary(invalidPlan, requirements);

    expect(critique.passed).toBe(false);
    expect(critique.issues.some(i => i.includes('Chronological ordering violation'))).toBe(true);
    expect(critique.issues.some(i => i.includes('closed at projected arrival time'))).toBe(true);
  });

  test('penalizes outdoor stops during extreme midday heat', () => {
    const hotPlan = {
      stops: [
        {
          name: 'Exposed Beach Viewpoint',
          category: 'beach',
          arriveMin: 13 * 60, // 1:00 PM (Midday scorching sun)
          leaveMin: 14 * 60,
          open: true,
        },
      ],
    };

    const requirements = {
      hard: { startMin: 9 * 60, endMin: 18 * 60 },
      weather: { tempC: 38, condition: 'Sunny' },
    };

    const critique = critiqueItinerary(hotPlan, requirements);
    expect(critique.breakdown.climateComfort).toBeLessThan(80);
    expect(critique.issues.some(i => i.includes('midday scorch'))).toBe(true);
  });
});
