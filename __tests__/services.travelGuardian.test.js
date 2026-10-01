'use strict';

/**
 * __tests__/services.travelGuardian.test.js
 *
 * Unit tests for Travel Guardian and Trigger Framework:
 * - On-track verification under normal conditions
 * - Severe weather & Ghat road risk detection
 * - Opening hours conflict detection
 * - Anti-churn hysteresis (minor warnings do not trigger replanning)
 * - Indian microclimate triggers (Heat Stroke Index, AQI Hazard, Monsoon Flood)
 * - Numerical safety score & predictive forward-horizon timeline
 * - Smart recovery window estimation
 */

const {
  evaluateTripGuardian,
  computeSafetyScore,
  calculateRecoveryWindow,
  buildPredictiveTimeline,
  TRIP_HEALTH_STATES,
} = require('../services/travelIntelligence/guardian/travelGuardian');
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
    expect(guardian.safetyScore).toBeGreaterThanOrEqual(95);
    expect(guardian.actionableGuidance).toBeDefined();
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
    expect(guardian.safetyScore).toBeLessThan(70);
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

  test('detects extreme Heat Stroke Index during Indian summer conditions', () => {
    const state = createJourneyState({ tripId: 'trip_heat', plan });
    const context = {
      weather: {
        temperatureC: 41,
        apparentTempC: 45,
        relativeHumidity: 65,
        condition: 'Extreme Heat',
      },
      traffic: {},
    };

    const guardian = evaluateTripGuardian(state, context);
    expect(guardian.activeTriggers.some(t => t.type === 'HEAT_STROKE_INDEX')).toBe(true);
    expect(guardian.reasons.some(r => /heat|thermal/i.test(r))).toBe(true);
  });

  test('detects AQI Hazard when particulate levels are hazardous in northern/urban circuits', () => {
    const state = createJourneyState({ tripId: 'trip_aqi', plan });
    const context = {
      weather: {
        temperatureC: 22,
        aqi: 310,
        pm25: 160,
        condition: 'Dense Winter Smog',
      },
      traffic: {},
    };

    const guardian = evaluateTripGuardian(state, context);
    expect(guardian.activeTriggers.some(t => t.type === 'AQI_HAZARD')).toBe(true);
    expect(guardian.reasons.some(r => /air pollution|aqi/i.test(r))).toBe(true);
  });

  test('detects Monsoon Flood Risk when rainfall intensity exceeds 25mm/hr', () => {
    const state = createJourneyState({ tripId: 'trip_flood', plan });
    const context = {
      weather: {
        temperatureC: 24,
        precipitationMm: 35,
        precipitationProb: 95,
        condition: 'Severe Torrential Cloudburst',
      },
      traffic: {},
    };

    const guardian = evaluateTripGuardian(state, context);
    expect(guardian.activeTriggers.some(t => t.type === 'MONSOON_FLOOD_RISK')).toBe(true);
    expect(guardian.tripHealth).toBe(TRIP_HEALTH_STATES.CRITICAL);
  });

  test('computes smart recovery window when disruption is transitory and recovering', () => {
    const triggers = [{ severity: 'SUBOPTIMAL', message: 'Traffic delay' }];
    const recovery = calculateRecoveryWindow(triggers, { precipitationProb: 40 }, { isRecovering: true });
    expect(recovery.isRecoveryViable).toBe(true);
    expect(recovery.suggestedPauseMinutes).toBe(20);
    expect(recovery.clearingOutlook).toContain('normal corridor baseline');
  });

  test('builds forward-looking predictive timeline across stops', () => {
    const stops = [
      { id: 's1', name: 'Stop 1', category: 'nature', plannedArrivalMinute: 600 },
      { id: 's2', name: 'Stop 2', category: 'museum', plannedArrivalMinute: 720 },
    ];
    const triggers = [
      { stopId: 's1', severity: 'CRITICAL', message: 'Downpour' },
    ];
    const timeline = buildPredictiveTimeline(stops, triggers, 15);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].status).toBe('CRITICAL');
    expect(timeline[1].status).toBe('HEALTHY');
    expect(timeline[0].projectedArrivalMinute).toBe(615);
  });

  test('computeSafetyScore penalizes risks by severity and clamps between 0 and 100', () => {
    expect(computeSafetyScore([])).toBe(100);
    expect(computeSafetyScore([{ severity: 'WATCH' }])).toBe(95);
    expect(computeSafetyScore([{ severity: 'SUBOPTIMAL' }])).toBe(90);
    expect(computeSafetyScore([{ severity: 'WARNING' }])).toBe(80);
    expect(computeSafetyScore([{ severity: 'CRITICAL' }])).toBe(65);
    expect(computeSafetyScore([
      { severity: 'CRITICAL' },
      { severity: 'CRITICAL' },
      { severity: 'CRITICAL' },
    ])).toBe(0);
  });
});
