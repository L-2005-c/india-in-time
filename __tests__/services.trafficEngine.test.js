'use strict';

const {
  estimateTravel,
  getTrafficMultiplier,
  recommendTransitMode,
  trafficLevelFromMult,
} = require('../services/travelIntelligence/trafficEngine');

describe('Traffic Engine & Multi-Modal Transit Calibration (BEAST Mode)', () => {
  test('recommends pedestrian walking for short distances <= 0.8 km', () => {
    const rec = recommendTransitMode(0.5);
    expect(rec.mode).toBe('walk');
    expect(rec.icon).toBe('🚶');
    expect(rec.estimatedFare).toBe(0);
  });

  test('recommends auto-rickshaw for dense bazaar corridors', () => {
    const rec = recommendTransitMode(2.0, { corridorType: 'WALLED_BAZAAR' });
    expect(rec.mode).toBe('auto');
    expect(rec.icon).toBe('🛺');
    expect(rec.estimatedFare).toBeGreaterThanOrEqual(30);
  });

  test('recommends cab for longer distances > 3.5 km', () => {
    const rec = recommendTransitMode(8.5);
    expect(rec.mode).toBe('cab');
    expect(rec.icon).toBe('🚗');
    expect(rec.estimatedFare).toBeGreaterThan(100);
  });

  test('detects and flags morning rush hour', () => {
    const travel = estimateTravel({
      fromCoords: [17.7126, 83.3235],
      toCoords: [17.7478, 83.3364],
      departMin: 9 * 60, // 09:00 AM (Morning Rush)
    });
    expect(travel.rushHourActive).toBe(true);
    expect(travel.rushLabel).toContain('Morning Peak Rush');
    expect(travel.transitRecommendation).toBeDefined();
  });

  test('detects evening rush hour', () => {
    const travel = estimateTravel({
      fromCoords: [17.7126, 83.3235],
      toCoords: [17.7478, 83.3364],
      departMin: 18 * 60 + 30, // 06:30 PM (Evening Rush)
    });
    expect(travel.rushHourActive).toBe(true);
    expect(travel.rushLabel).toContain('Evening Peak Rush');
  });
});
