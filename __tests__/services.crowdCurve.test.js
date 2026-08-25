'use strict';

const { generatePredictiveCrowdCurve } = require('../services/travelIntelligence/crowdCurve');

describe('Predictive Crowd Curve Engine (crowdCurve.js)', () => {
  test('generates hourly crowd curve and identifies peak/off-peak windows', () => {
    const temple = {
      name: 'Simhachalam Temple',
      cat: 'temple',
    };

    const curve = generatePredictiveCrowdCurve(temple, {
      arrivalMin: 18 * 60, // 18:00 (Evening Aarti peak)
      isWeekend: true,
      weather: { tempC: 30, condition: 'Clear' },
    });

    expect(curve.hourlyCurve.length).toBeGreaterThanOrEqual(10);
    expect(curve.arrivalCrowd.level).toBe('High');
    expect(curve.peakWindow).toBeDefined();
    expect(curve.offPeakWindow).toBeDefined();
    expect(curve.avoidanceRecommendation).toContain('avoid');
    expect(curve.confidence).toBeGreaterThanOrEqual(75);
  });

  test('adjusts crowd curve downwards during heavy rainfall for outdoor spots', () => {
    const beach = {
      name: 'RK Beach',
      cat: 'beach',
    };

    const rainCurve = generatePredictiveCrowdCurve(beach, {
      arrivalMin: 17 * 60,
      weather: { tempC: 25, condition: 'Heavy Rain' },
    });

    const clearCurve = generatePredictiveCrowdCurve(beach, {
      arrivalMin: 17 * 60,
      weather: { tempC: 28, condition: 'Clear' },
    });

    expect(rainCurve.arrivalCrowd.percentage).toBeLessThan(clearCurve.arrivalCrowd.percentage);
  });
});
