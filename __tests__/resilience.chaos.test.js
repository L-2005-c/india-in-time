const { planAdvancedItinerary } = require('../services/travelIntelligence/advancedItineraryEngine');
const { resolveLiveTravel } = require('../services/travelIntelligence/routingEngine');

describe('Chaos & Resilience Graceful Degradation Testing', () => {
  const testPlaces = [
    { id: '1', name: 'RK Beach', cat: 'beach', coords: [17.7126, 83.3235], rating: 4.5, is_sunset_spot: true, vt: 60, ot: '06:00', ct: '20:00' },
    { id: '2', name: 'Submarine Museum', cat: 'museum', coords: [17.7165, 83.3323], rating: 4.6, vt: 45, ot: '09:00', ct: '18:00' },
  ];

  test('gracefully plans itinerary when weather data is completely unavailable', () => {
    const plan = planAdvancedItinerary(testPlaces, {
      originCoords: [17.71, 83.32],
      startMin: 9 * 60,
      endMin: 18 * 60,
      weather: null,
      hourlyWeather: null,
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.length).toBeGreaterThan(0);
    expect(plan.stops[0].dataSources.weather).toBe('unavailable');
  });

  test('gracefully plans itinerary when routing coordinates are missing', () => {
    const brokenPlaces = testPlaces.map(p => ({ ...p, coords: null }));
    const plan = planAdvancedItinerary(brokenPlaces, {
      originCoords: [17.71, 83.32],
      startMin: 9 * 60,
      endMin: 18 * 60,
    });

    expect(['FEASIBLE', 'INFEASIBLE']).toContain(plan.status);
    expect(plan.stops.every(s => s.travelSource === 'estimated')).toBe(true);
  });

  test('routing service resolves safely with fallback when network unavailable', async () => {
    const res = await resolveLiveTravel({
      fromCoords: [17.7126, 83.3235],
      toCoords: [17.7165, 83.3323],
      enableLiveRouting: false,
    });
    expect(res === null || typeof res === 'object').toBe(true);
  });
});
