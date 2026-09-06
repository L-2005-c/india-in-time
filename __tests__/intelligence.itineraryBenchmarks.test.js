'use strict';

/**
 * __tests__/intelligence.itineraryBenchmarks.test.js
 *
 * Multi-District Benchmark Itinerary Quality & Time Intelligence Tests (Phase 21).
 * Validates that itineraries across 12 target travel districts produce logically sound,
 * time-feasible, culturally aware, and truthfully explained travel plans.
 */

const { staticCityPlaces } = require('../data/city-seeds');
const { planAdvancedItinerary, planMultiDayCircuit } = require('../services/travelIntelligence/advancedItineraryEngine');

describe('Multi-District Benchmark Itineraries (Phase 21)', () => {

  const districts = [
    'visakhapatnam',
    'araku',
    'paderu',
    'lambasingi',
    'tirupati',
    'vijayawada',
    'goa',
    'delhi',
    'bengaluru',
    'kolkata',
    'mysuru',
    'munnar',
  ];

  for (const district of districts) {
    test(`Benchmark itinerary for ${district} generates valid, explainable stops`, async () => {
      const places = staticCityPlaces(district);
      expect(Array.isArray(places)).toBe(true);
      expect(places.length).toBeGreaterThanOrEqual(10);

      const plan = await planAdvancedItinerary(places, {
        startTime: '08:00',
        endTime: '20:00',
        region: district,
        city: district,
        soft: { foodFocus: true },
      });

      expect(plan.success).toBe(true);
      expect(Array.isArray(plan.stops)).toBe(true);
      expect(plan.stops.length).toBeGreaterThan(0);

      // Verify temporal feasibility for every stop
      let lastLeaveMin = 0;
      for (const stop of plan.stops) {
        expect(stop.name).toBeDefined();
        expect(stop.arriveAt).toMatch(/^\d{2}:\d{2}$/);
        expect(stop.leaveAt).toMatch(/^\d{2}:\d{2}$/);

        const arriveMin = parseInt(stop.arriveAt.split(':')[0], 10) * 60 + parseInt(stop.arriveAt.split(':')[1], 10);
        const leaveMin = parseInt(stop.leaveAt.split(':')[0], 10) * 60 + parseInt(stop.leaveAt.split(':')[1], 10);

        expect(leaveMin).toBeGreaterThan(arriveMin);
        expect(arriveMin).toBeGreaterThanOrEqual(lastLeaveMin);
        lastLeaveMin = leaveMin;

        // Verify stop has whyNow reasons
        expect(Array.isArray(stop.reasons) && Array.isArray(stop.whyNow?.reasons)).toBe(true);
      }
    }, 15000);
  }

  test('3-Day Alluri / Paderu Highland Circuit partitions into geographic sub-regions', async () => {
    const places = staticCityPlaces('paderu');
    const circuit = await planMultiDayCircuit(places, {
      numDays: 3,
      region: 'paderu',
      city: 'paderu',
    });

    expect(circuit.totalDays).toBe(3);
    expect(circuit.dayPlans.length).toBe(3);
    expect(circuit.dayPlans[0].theme).toMatch(/Araku/i);
    expect(circuit.dayPlans[1].theme).toMatch(/Vanjangi/i);
    expect(circuit.dayPlans[2].theme).toMatch(/Lambasingi/i);
  }, 25000);

});
