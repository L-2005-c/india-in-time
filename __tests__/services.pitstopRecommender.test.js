'use strict';

/**
 * __tests__/services.pitstopRecommender.test.js
 *
 * Unit tests for Wayside Pitstop & Corridor Recharge Engine:
 * - Corridor interpolation & low-detour ranking
 * - Temporal meal-slot & climate synergy
 * - Dynamic pitstop insertion into active journey state
 * - Completed stop immutability guarantee & subsequent stop retiming
 */

const {
  findMidwayPitstops,
  insertPitstopIntoJourney,
  CURATED_CORRIDOR_PITSTOPS,
} = require('../services/travelIntelligence/journey/pitstopRecommender');
const { createJourneyState } = require('../services/travelIntelligence/journey/journeyStateEngine');

describe('Wayside Pitstop Recommender (v3.0)', () => {
  const samplePlan = {
    stops: [
      { id: 's1', name: 'RK Beach', lat: 17.7142, lon: 83.3237, coords: [17.7142, 83.3237], visitMinutes: 60 },
      { id: 's2', name: 'Borra Caves', lat: 18.281, lon: 83.041, coords: [18.281, 83.041], visitMinutes: 90 },
      { id: 's3', name: 'Araku Valley', lat: 18.331, lon: 82.868, coords: [18.331, 82.868], visitMinutes: 60 },
    ],
  };

  test('curated corridor pitstops pool contains major highway corridors across India', () => {
    expect(CURATED_CORRIDOR_PITSTOPS.length).toBeGreaterThanOrEqual(10);
    expect(CURATED_CORRIDOR_PITSTOPS.some(p => p.id.includes('tyda'))).toBe(true);
    expect(CURATED_CORRIDOR_PITSTOPS.some(p => p.id.includes('murthal'))).toBe(true);
    expect(CURATED_CORRIDOR_PITSTOPS.some(p => p.id.includes('datta_snacks'))).toBe(true);
    expect(CURATED_CORRIDOR_PITSTOPS.some(p => p.id.includes('maddur_tiffanys'))).toBe(true);
  });

  test('discovers low-detour pitstops along the Vizag-Araku corridor', () => {
    const activeStop = { name: 'RK Beach', coords: [17.7142, 83.3237] };
    const nextStop = { name: 'Borra Caves', coords: [18.281, 83.041] };

    const pitstops = findMidwayPitstops({
      activeStop,
      nextStop,
      currentMinute: 990, // 16:30 (Tea time)
      weather: { temperatureC: 30, precipitationProb: 10 },
      limit: 3,
    });

    expect(pitstops.length).toBeGreaterThan(0);
    const top = pitstops[0];
    expect(top.name).toBeDefined();
    expect(top.rechargeScore).toBeGreaterThan(60);
    expect(top.whyRecommended).toContain('tea');
    expect(top.hasCleanWashrooms).toBe(true);
  });

  test('synthesizes a contextual recharge stop if no pitstops exist in remote area', () => {
    const remoteActive = { name: 'Remote Pass', coords: [34.15, 77.57] }; // Ladakh remote pass
    const remoteNext = { name: 'High Lake', coords: [33.90, 78.46] };

    const pitstops = findMidwayPitstops({
      activeStop: remoteActive,
      nextStop: remoteNext,
      currentMinute: 720,
    });

    expect(pitstops).toHaveLength(1);
    expect(pitstops[0].id).toContain('synthetic_pitstop');
    expect(pitstops[0].name).toContain('Tea Stall & Rest Haven');
    expect(pitstops[0].rechargeScore).toBeGreaterThanOrEqual(70);
  });

  test('inserts chosen pitstop non-destructively into journey state and retimes downstream stops', () => {
    const initial = createJourneyState({
      tripId: 'trip_pitstop_test',
      plan: samplePlan,
      startTimeMinutes: 540,
    });

    const chosenPitstop = {
      id: 'pitstop_tyda_jungle_bells',
      name: 'Tyda Jungle Bells Highway Cafe',
      category: 'cafe',
      coords: [18.216, 83.052],
      visitMinutes: 30,
      whyRecommended: 'Perfect midday recharge',
    };

    const initialStopsCount = initial.stops.length;
    const secondStopOriginalArrival = initial.stops[1].plannedArrivalMinute;

    const updated = insertPitstopIntoJourney(initial, chosenPitstop);

    // Initial state remains untouched (deep clone immutability)
    expect(initial.stops).toHaveLength(initialStopsCount);

    // Updated state has new stop inserted
    expect(updated.stops).toHaveLength(initialStopsCount + 1);
    expect(updated.stops[1].name).toBe('Tyda Jungle Bells Highway Cafe');
    expect(updated.stops[1].isPitstop).toBe(true);
    expect(updated.activePlanVersion).toBe(2);

    // Downstream stop was pushed back by pitstop duration + travel buffer
    expect(updated.stops[2].plannedArrivalMinute).toBeGreaterThan(secondStopOriginalArrival);
  });
});
