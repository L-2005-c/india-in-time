'use strict';

/**
 * __tests__/services.travelGuardian.test.js
 *
 * Unit tests for Travel Guardian and Trigger Framework:
 * - On-track verification under normal conditions
 * - Severe weather & Ghat road risk detection
 * - Opening hours conflict detection
 * - Anti-churn hysteresis (minor warnings do not trigger replanning)
 */

const { evaluateTripGuardian, TRIP_HEALTH_STATES } = require('../services/travelIntelligence/guardian/travelGuardian');
const { createJourneyState } = require('../services/travelIntelligence/journey/journeyStateEngine');

describe('Travel Guardian (v3.0)', () => {
  const plan = {
    stops: [
      { id: 'stop_1', name: 'Borra Caves', cat: 'cave', lat: 18.28, lon: 83.04, openingHours: { open: '10:00', close: '17:00' } },
      { id: 'stop_2', name: 'Araku Coffee Museum', cat: 'museum', lat: 18.33, lon: 82.87, openingHours: { open: '09:00', close: '18:00' } },
      { id: 'stop_3', name: 'Galikonda View Point', cat: 'viewpoint', lat: 18.25, lon: 82.95, elevationM: 1000 },
    ],
  };

  test('reports ON_TRACK when conditions are clear and on schedule', () => {
    const state = createJourneyState({ tripId: 'trip_1', plan });
    const context = {
      weather: { temperatureC: 26, precipitationProb: 10, condition: 'Clear' },
      traffic: { trafficDelayMinutes: 5 },
    };

    const guardian = evaluateTripGuardian(state, context);
    expect(guardian.tripHealth).toBe(TRIP_HEALTH_STATES.ON_TRACK);
    expect(guardian.shouldReplan).toBe(false);
  });

  test('triggers CRITICAL and recommends replanning when heavy rain hits a ghat road corridor', () => {
    const state = createJourneyState({ tripId: 'trip_1', plan });
    const context = {
      weather: { temperatureC: 22, precipitationProb: 85, condition: 'Heavy Rain / Downpour' },
      traffic: { isGhatCorridor: true, trafficDelayMinutes: 20 },
    };

    const guardian = evaluateTripGuardian(state, context);
    expect(guardian.tripHealth).toBe(TRIP_HEALTH_STATES.CRITICAL);
    expect(guardian.shouldReplan).toBe(true);
    expect(guardian.reasons.some(r => r.includes('Ghat Road'))).toBe(true);
  });

  test('detects opening hours breach when projected arrival is past closing time', () => {
    const state = createJourneyState({ tripId: 'trip_1', plan });
    // Araku Coffee Museum closes at 18:00 (1080 mins). Delay pushes arrival to 1100 mins
    state.pacingLagMinutes = 120;
    state.upcomingStops[0].projectedArrivalMinute = 1100;

    const guardian = evaluateTripGuardian(state, { weather: { precipitationProb: 10 } });
    expect(guardian.shouldReplan).toBe(true);
    expect(guardian.reasons.some(r => r.includes('closed'))).toBe(true);
  });

  test('anti-churn: minor 10-minute traffic delay does NOT trigger replanning', () => {
    const state = createJourneyState({ tripId: 'trip_1', plan });
    const context = {
      weather: { precipitationProb: 15 },
      traffic: { trafficDelayMinutes: 10 },
    };

    const guardian = evaluateTripGuardian(state, context);
    expect(guardian.shouldReplan).toBe(false);
    expect(guardian.tripHealth).toBe(TRIP_HEALTH_STATES.ON_TRACK);
  });
});
