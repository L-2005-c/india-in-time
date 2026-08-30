'use strict';

const crowd = require('../services/crowd');

describe('Unified Crowd Intelligence Facade (services/crowd)', () => {
  test('exports all core crowd prediction interfaces', () => {
    expect(typeof crowd.computeCrowd).toBe('function');
    expect(typeof crowd.generatePredictiveCrowdCurve).toBe('function');
    expect(typeof crowd.predictCrowd).toBe('function');
    expect(typeof crowd.getLearnedCrowdPrior).toBe('function');
    expect(typeof crowd.lookupHistoricalCrowd).toBe('function');
    expect(crowd.MODEL_VERSION).toBe(3);
  });

  test('computeCrowd produces expected schema', () => {
    const res = crowd.computeCrowd({ daypart: 'morning', isWeekend: false, isPeakHourNow: false, cat: 'scenic' });
    expect(res).toHaveProperty('level');
    expect(res).toHaveProperty('crowdScore');
    expect(res).toHaveProperty('source');
  });

  test('generatePredictiveCrowdCurve produces hourly progression and peak windows', () => {
    const res = crowd.generatePredictiveCrowdCurve({ cat: 'beach', is_sunset_spot: true });
    expect(Array.isArray(res.hourlyCurve)).toBe(true);
    expect(res.hourlyCurve.length).toBeGreaterThan(0);
    expect(res).toHaveProperty('peakWindow');
    expect(res).toHaveProperty('offPeakWindow');
  });
});
