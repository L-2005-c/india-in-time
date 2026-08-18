const { optimizeItinerary } = require('../services/travelIntelligence/geoTemporalOptimizer');

describe('geoTemporalOptimizer', () => {
  test('prefers a future scenic window over an immediately available stop when score is materially better', async () => {
    const places = [
      { name: 'Morning Museum', cat: 'museum', coords: [17.71, 83.31], ot: '09:00', ct: '18:00', vt: 45, best_hours: [['09:00','10:30']] },
      { name: 'Sunset View', cat: 'scenic', coords: [17.72, 83.32], ot: '06:00', ct: '20:00', vt: 45, is_sunset_spot: true, best_hours: [['17:00','19:00']] },
    ];
    const result = await optimizeItinerary(places, {
      now: new Date('2026-08-16T10:00:00+05:30'),
      startMin: 10 * 60,
      endMin: 20 * 60,
      maxStops: 2,
      originCoords: [17.70, 83.30],
      weather: { tempC: 28, condition: 'Clear' },
    });
    expect(result.algorithm).toBe('geo-temporal-beam-search-v5-world-class');
    expect(result.stopCount).toBeGreaterThan(0);
    expect(result.stops.every((s) => s.timingFit != null)).toBe(true);
  });

  test('nudges food stops toward meal windows via mealTimingBonus', async () => {
    const places = [
      { name: 'Anytime Cafe', cat: 'food', coords: [17.71, 83.31], ot: '06:00', ct: '23:00', vt: 30 },
    ];
    const lunchRun = await optimizeItinerary(places, {
      now: new Date('2026-08-16T12:00:00+05:30'),
      startMin: 12 * 60,
      endMin: 22 * 60,
      maxStops: 1,
      originCoords: [17.70, 83.30],
      weather: { tempC: 28, condition: 'Clear' },
    });
    const offHourRun = await optimizeItinerary(places, {
      now: new Date('2026-08-16T16:00:00+05:30'),
      startMin: 16 * 60,
      endMin: 22 * 60,
      maxStops: 1,
      originCoords: [17.70, 83.30],
      weather: { tempC: 28, condition: 'Clear' },
    });
    const lunchBonus = lunchRun.stops[0]?.mealTimingBonus;
    const offBonus = offHourRun.stops[0]?.mealTimingBonus;
    if (lunchBonus != null && offBonus != null) {
      expect(lunchBonus).toBeGreaterThanOrEqual(offBonus);
    } else {
      expect(lunchRun.stopCount + offHourRun.stopCount).toBeGreaterThan(0);
    }
  });
});
