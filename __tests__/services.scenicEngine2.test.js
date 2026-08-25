'use strict';

const { computeScenic } = require('../services/travelIntelligence/scenicEngine');

describe('Scenic Intelligence 2.0 (scenicEngine.js)', () => {
  test('calculates sunset peak moment and sub-component breakdown for sunset viewpoints', () => {
    const sunsetSpot = {
      name: 'Kailasagiri Sunset Point',
      cat: 'viewpoint',
      is_sunset_spot: true,
      coords: [17.7478, 83.3364],
      view_orientation_deg: 260,
    };

    const ctx = {
      nowMin: 17 * 60 + 45, // 17:45
      sun: { sunsetMin: 18 * 60, sunriseMin: 6 * 60 },
      golden: {
        eveningGolden: { start: '17:15', end: '18:15', startMin: 1035, endMin: 1095 },
      },
      weatherIntel: { score: 85, visibilityKm: 12, cloudCover: 40 },
    };

    const result = computeScenic(sunsetSpot, ctx);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.suitability).toBe('Excellent');
    expect(result.bestWindow).toHaveProperty('start');
    expect(result.bestWindow).toHaveProperty('end');
    expect(result.peakMoment).toBeDefined();
    expect(result.componentScores).toHaveProperty('light');
    expect(result.componentScores).toHaveProperty('visibility');
    expect(result.componentScores).toHaveProperty('cloud');
    expect(result.componentScores).toHaveProperty('orientation');
  });

  test('penalizes scenic viewpoints during severe weather and bad visibility', () => {
    const viewpoint = {
      name: 'Hilltop Tower',
      cat: 'hill',
      coords: [17.7478, 83.3364],
    };

    const badWeatherCtx = {
      nowMin: 14 * 60,
      weatherIntel: { score: 30, visibilityKm: 2, cloudCover: 95 },
    };

    const result = computeScenic(viewpoint, badWeatherCtx);
    expect(result.score).toBeLessThanOrEqual(55);
    expect(result.reasons.some(r => r.includes('Weather') || r.includes('visibility') || r.includes('clarity'))).toBe(true);
  });
});
