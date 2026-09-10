'use strict';

/**
 * __tests__/services.journeyStateEngine.test.js
 *
 * Unit tests for India In-Time v3.0 Authoritative Journey State Engine:
 * - State creation & initial partitioning
 * - Stop advancement & completed stop immutability guarantees
 * - Delay and pacing lag propagation to future stops
 * - Stop skipping and alternative tracking
 */

const {
  createJourneyState,
  advanceJourneyProgress,
  STOP_STATUSES,
  TRIP_HEALTH_STATES,
} = require('../services/travelIntelligence/journey/journeyStateEngine');

describe('Journey State Engine (v3.0)', () => {
  const samplePlan = {
    stops: [
      { id: 'borra_caves', name: 'Borra Caves', cat: 'cave', lat: 18.28, lon: 83.04, visitMinutes: 90 },
      { id: 'coffee_museum', name: 'Araku Coffee Museum', cat: 'museum', lat: 18.33, lon: 82.87, visitMinutes: 45 },
      { id: 'padmapuram', name: 'Padmapuram Gardens', cat: 'nature', lat: 18.32, lon: 82.86, visitMinutes: 60 },
      { id: 'sunset_point', name: 'Galikonda View Point', cat: 'viewpoint', lat: 18.25, lon: 82.95, visitMinutes: 60 },
    ],
  };

  test('initializes journey state with active and upcoming partitions', () => {
    const state = createJourneyState({
      tripId: 'trip_araku_101',
      travelerId: 'user_42',
      plan: samplePlan,
      startTimeMinutes: 540, // 09:00
    });

    expect(state.tripId).toBe('trip_araku_101');
    expect(state.activePlanVersion).toBe(1);
    expect(state.tripHealth).toBe(TRIP_HEALTH_STATES.ON_TRACK);
    expect(state.activeStop.name).toBe('Borra Caves');
    expect(state.completedStops).toHaveLength(0);
    expect(state.upcomingStops).toHaveLength(3);
    expect(state.stops[0].status).toBe(STOP_STATUSES.ACTIVE);
  });

  test('completes first stop and advances active pointer to next planned stop', () => {
    const initial = createJourneyState({
      tripId: 'trip_araku_101',
      plan: samplePlan,
      startTimeMinutes: 540,
    });

    const step1 = advanceJourneyProgress(initial, {
      stopId: 'borra_caves',
      action: 'COMPLETE',
      currentMinute: 650, // 10:50 (took 110 mins)
    });

    expect(step1.completedStops).toHaveLength(1);
    expect(step1.completedStops[0].name).toBe('Borra Caves');
    expect(step1.completedStops[0].status).toBe(STOP_STATUSES.COMPLETED);
    expect(step1.activeStop.name).toBe('Araku Coffee Museum');
    expect(step1.upcomingStops).toHaveLength(2);
  });

  test('STRICT IMMUTABILITY: throws error when attempting to modify a completed stop', () => {
    const initial = createJourneyState({
      tripId: 'trip_araku_101',
      plan: samplePlan,
    });

    const completedState = advanceJourneyProgress(initial, {
      stopId: 'borra_caves',
      action: 'COMPLETE',
      currentMinute: 640,
    });

    expect(() => {
      advanceJourneyProgress(completedState, {
        stopId: 'borra_caves',
        action: 'START',
      });
    }).toThrow(/already COMPLETED and cannot be modified/);
  });

  test('propagates pacing lag to upcoming stops while keeping completed stops unchanged', () => {
    const initial = createJourneyState({
      tripId: 'trip_araku_101',
      plan: samplePlan,
      startTimeMinutes: 540,
    });

    // Planned departure was 540 + 60 = 600. Actual departure is 660 (60-minute delay)
    const delayedState = advanceJourneyProgress(initial, {
      stopId: 'borra_caves',
      action: 'COMPLETE',
      currentMinute: 660,
    });

    expect(delayedState.pacingLagMinutes).toBe(60);
    // Completed stop remains at its actual departure
    expect(delayedState.completedStops[0].actualDepartureMinute).toBe(660);

    // Upcoming stops have projectedArrival shifted by 60 minutes
    const futureStop = delayedState.upcomingStops.find(s => s.id === 'sunset_point');
    expect(futureStop.projectedArrivalMinute).toBe(futureStop.plannedArrivalMinute + 60);
  });

  test('skips a stop and notes the reason without breaking the remaining journey', () => {
    const initial = createJourneyState({
      tripId: 'trip_araku_101',
      plan: samplePlan,
    });

    const skippedState = advanceJourneyProgress(initial, {
      stopId: 'borra_caves',
      action: 'SKIP',
      reason: 'Heavy tourist queue at entry ticket counter',
    });

    expect(skippedState.skippedStops).toHaveLength(1);
    expect(skippedState.skippedStops[0].name).toBe('Borra Caves');
    expect(skippedState.skippedStops[0].status).toBe(STOP_STATUSES.SKIPPED);
    expect(skippedState.skippedStops[0].notes[0]).toContain('ticket counter');
    expect(skippedState.activeStop.name).toBe('Araku Coffee Museum');
  });
});
