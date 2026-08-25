'use strict';

const { evaluateTravelLoad } = require('../services/travelIntelligence/fatigueModel');

describe('Fatigue-Aware Travel Load Model (fatigueModel.js)', () => {
  test('calculates balanced travel load for mixed indoor/outdoor itinerary', () => {
    const stops = [
      { name: 'Kailasagiri', category: 'scenic', stayMinutes: 60, travelMinutes: 15 },
      { name: 'Submarine Museum', category: 'museum', stayMinutes: 60, travelMinutes: 15 },
      { name: 'Sea Breeze Cafe', category: 'cafe', stayMinutes: 45, travelMinutes: 10 },
      { name: 'RK Beach', category: 'beach', stayMinutes: 60, travelMinutes: 10 },
    ];

    const load = evaluateTravelLoad(stops, { tripMode: 'balanced' });
    expect(load.loadScore).toBeGreaterThanOrEqual(20);
    expect(load.loadScore).toBeLessThanOrEqual(80);
    expect(load.loadBand).toBeDefined();
    expect(load.metrics).toHaveProperty('totalWalkingKm');
    expect(load.metrics).toHaveProperty('outdoorExposureMinutes');
  });

  test('suggests recovery buffer when multiple high-intensity outdoor stops are scheduled back-to-back', () => {
    const heavyStops = [
      { name: 'Hill Top Trek', category: 'trekking', stayMinutes: 90, travelMinutes: 20 },
      { name: 'Ancient Fort Climb', category: 'fort', stayMinutes: 90, travelMinutes: 25 },
      { name: 'Mountain Peak', category: 'hill', stayMinutes: 90, travelMinutes: 20 },
    ];

    const load = evaluateTravelLoad(heavyStops, { tripMode: 'active' });
    expect(load.recoveryWindows.length).toBeGreaterThan(0);
    expect(load.recoveryWindows[0].reason).toContain('buffer');
  });
});
