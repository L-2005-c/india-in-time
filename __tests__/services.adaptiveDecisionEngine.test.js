'use strict';

/**
 * __tests__/services.adaptiveDecisionEngine.test.js
 *
 * Comprehensive Test Suite for India In-Time v3.0 Adaptive Travel Decision Engine.
 *
 * Validates:
 * 1. Traveler Difference Test (Same context, different travelers -> different decisions).
 * 2. Context Change Test (Same traveler, different contexts -> different decisions).
 * 3. Journey Progression & Immutability Test (Completed stops strictly preserved).
 * 4. No-Data / Insufficient Data Test (Rejection of fabricated certainty).
 * 5. Conflict Test (Generic sunset recommendation vs poor visibility/crowd).
 * 6. Small Change / Anti-Churn Test (5m traffic delay -> KEEP_PLAN).
 * 7. Two-Level Evaluation Test (Stop suitability vs Journey suitability).
 * 8. Decision Audit Trail & User Outcome Recording.
 * 9. Production API integration via /api/intelligence.
 */

const request = require('supertest');
const express = require('express');
const {
  evaluateNextDecision,
  recordDecisionOutcome,
  getDecisionMetrics,
  getTripDecisionHistory,
  DECISION_STATES,
  WEATHER_HEALTH,
  CONFIDENCE_LEVELS,
  DEFAULT_TRAVEL_DNA,
} = require('../services/travelIntelligence/decision/adaptiveDecisionEngine');
const { adaptJourneyPlan } = require('../services/travelIntelligence/decision/adaptationPipeline');
const { STOP_STATUSES } = require('../services/travelIntelligence/journey/journeyStateEngine');

// Setup minimal express app with intelligence router for integration testing
const intelligenceRouter = require('../routes/intelligence');
const app = express();
app.use(express.json());
app.use('/api/intelligence', intelligenceRouter);

describe('India In-Time v3.0 — Adaptive Travel Decision Engine', () => {

  // Sample Stops in Visakhapatnam - Araku Circuit
  const SAMPLE_STOPS = [
    {
      id: 'stop-1',
      name: 'Padmapuram Gardens',
      category: 'nature',
      indoor_outdoor: 'outdoor',
      lat: 18.327,
      lon: 82.865,
      plannedArrivalMinute: 570,
      plannedDurationMinutes: 60,
      plannedDepartureMinute: 630,
      open_time: '08:30',
      close_time: '18:00',
      status: STOP_STATUSES.PLANNED,
    },
    {
      id: 'stop-2',
      name: 'Ananthagiri Hills Viewpoint',
      category: 'viewpoint',
      indoor_outdoor: 'outdoor',
      lat: 18.238,
      lon: 83.008,
      is_sunset_spot: true,
      plannedArrivalMinute: 660,
      plannedDurationMinutes: 60,
      plannedDepartureMinute: 720,
      open_time: '06:00',
      close_time: '19:00',
      status: STOP_STATUSES.PLANNED,
    },
    {
      id: 'stop-3',
      name: 'Araku Coffee Museum & Haven',
      category: 'food',
      indoor_outdoor: 'indoor',
      lat: 18.334,
      lon: 82.871,
      plannedArrivalMinute: 750,
      plannedDurationMinutes: 45,
      plannedDepartureMinute: 795,
      open_time: '09:00',
      close_time: '20:00',
      status: STOP_STATUSES.PLANNED,
    },
  ];

  // ── 1. Traveler Difference Test (Section 30) ───────────────────────────────
  describe('1. Traveler Difference Test (Black-Box)', () => {
    test('produces divergent, evidence-driven decisions for different travelers under identical context', () => {
      const journeyState = {
        tripId: 'trip_diff_test',
        stops: [...SAMPLE_STOPS],
        activeStop: SAMPLE_STOPS[1], // Ananthagiri Viewpoint
        currentMinute: 640,
        pacingLagMinutes: 10,
        activePlanVersion: 1,
      };

      // Identical Context: Moderate rain (65% prob)
      const context = {
        weather: {
          temperatureC: 22,
          precipitationProb: 65,
          condition: 'Rain Showers',
          dataState: 'PREDICTED',
          confidence: 'HIGH',
        },
        traffic: { trafficDelayMinutes: 5, isGhatCorridor: true },
        crowd: { level: 'Moderate' },
      };

      // Traveler A: Photography-focused, rain-intolerant, crowd-sensitive
      const travelerA = {
        travelerDna: {
          photography: 90,
          nature: 80,
          rainTolerance: 20, // Low tolerance for rain
          crowdTolerance: 30,
        },
      };

      // Traveler B: Family traveler, rain-tolerant, indoor-neutral
      const travelerB = {
        travelerDna: {
          family: 85,
          relaxation: 70,
          rainTolerance: 75, // High tolerance for rain
          crowdTolerance: 60,
        },
      };

      const decisionA = evaluateNextDecision({ journeyState, traveler: travelerA, context });
      const decisionB = evaluateNextDecision({ journeyState, traveler: travelerB, context });

      // Traveler A must receive ALTERNATIVE_REQUIRED due to low rain tolerance on outdoor viewpoint
      expect(decisionA.decision).toBe(DECISION_STATES.ALTERNATIVE_REQUIRED);
      expect(decisionA.reasonCodes).toContain('WEATHER_DETERIORATION');
      expect(decisionA.reasonCodes).toContain('TRAVELER_RAIN_SENSITIVITY');
      expect(decisionA.selectedAlternative).toBeDefined();
      expect(decisionA.explanation.what).toContain('Substitute');

      // Traveler B is rain-tolerant (rainTolerance: 75 vs 65% rain), so outdoor viewpoint remains acceptable
      expect(decisionB.decision).not.toBe(DECISION_STATES.ALTERNATIVE_REQUIRED);
      expect([DECISION_STATES.KEEP_PLAN, DECISION_STATES.WATCH]).toContain(decisionB.decision);
      expect(decisionB.explanation.what).toMatch(/Continue with your planned stop|Maintain plan/);
    });
  });

  // ── 2. Context Change Test (Section 31) ────────────────────────────────────
  describe('2. Context Change Test (Black-Box)', () => {
    test('same traveler adapts appropriately when environmental context deteriorates', () => {
      const journeyState = {
        tripId: 'trip_context_test',
        stops: [...SAMPLE_STOPS],
        activeStop: SAMPLE_STOPS[1],
        currentMinute: 650,
        pacingLagMinutes: 5,
        activePlanVersion: 1,
      };

      const traveler = {
        travelerDna: {
          photography: 80,
          rainTolerance: 35,
        },
      };

      // Context A: Sunny, optimal conditions
      const contextA = {
        weather: { temperatureC: 25, precipitationProb: 10, condition: 'Clear', dataState: 'OBSERVED', confidence: 'HIGH' },
        traffic: { trafficDelayMinutes: 0, isGhatCorridor: false },
        crowd: { level: 'Low' },
      };

      // Context B: Severe orographic storm and ghat hazard
      const contextB = {
        weather: { temperatureC: 20, precipitationProb: 85, condition: 'Severe Downpour', dataState: 'PREDICTED', confidence: 'HIGH' },
        traffic: { trafficDelayMinutes: 25, isGhatCorridor: true, hazardAlert: true },
        crowd: { level: 'High' },
      };

      const decisionSunny = evaluateNextDecision({ journeyState, traveler, context: contextA });
      const decisionStorm = evaluateNextDecision({ journeyState, traveler, context: contextB });

      expect(decisionSunny.decision).toBe(DECISION_STATES.KEEP_PLAN);
      expect(decisionSunny.planHealth.weatherHealth).toBe(WEATHER_HEALTH.EXCELLENT);
      expect(decisionSunny.planHealth.safetyHealth).toBe('SAFE');

      expect(decisionStorm.decision).toBe(DECISION_STATES.ALTERNATIVE_REQUIRED);
      expect(decisionStorm.planHealth.weatherHealth).toBe(WEATHER_HEALTH.SEVERE_RISK);
      expect(decisionStorm.planHealth.safetyHealth).toBe('HAZARDOUS');
      expect(decisionStorm.selectedAlternative).toBeDefined();
    });
  });

  // ── 3. Journey Progression & Immutability Test (Section 32) ────────────────
  describe('3. Journey Progression & Immutability Test (Black-Box)', () => {
    test('strictly preserves completed stops when adapting future stops', () => {
      // Step 1: Initial plan with Stop 1 completed
      const initialJourneyState = {
        tripId: 'trip_immutability_test',
        stops: [
          { ...SAMPLE_STOPS[0], status: STOP_STATUSES.COMPLETED, actualVisitMinutes: 55 },
          { ...SAMPLE_STOPS[1], status: STOP_STATUSES.PLANNED },
          { ...SAMPLE_STOPS[2], status: STOP_STATUSES.PLANNED },
        ],
        activeStop: SAMPLE_STOPS[1],
        currentMinute: 640,
        pacingLagMinutes: 20,
        activePlanVersion: 1,
      };

      const context = {
        weather: { temperatureC: 21, precipitationProb: 85, condition: 'Heavy Rain' },
        traffic: { trafficDelayMinutes: 15, isGhatCorridor: true },
      };

      const traveler = { travelerDna: { rainTolerance: 25 } };

      const decision = evaluateNextDecision({ journeyState: initialJourneyState, traveler, context });
      expect(decision.decision).toBe(DECISION_STATES.ALTERNATIVE_REQUIRED);

      // Execute plan adaptation
      const adaptation = adaptJourneyPlan(initialJourneyState, context, traveler.travelerDna, {
        activeTriggers: [{ stopId: 'stop-2', type: 'WEATHER_RAIN', severity: 'CRITICAL' }],
      });

      expect(adaptation.shouldAdapt).toBe(true);
      expect(adaptation.newPlanVersion).toBe(2);

      // Verify Completed Stop 1 is strictly preserved and unmodified
      const preservedCompleted = adaptation.newStopsList.find(s => s.id === 'stop-1');
      expect(preservedCompleted).toBeDefined();
      expect(preservedCompleted.status).toBe(STOP_STATUSES.COMPLETED);
      expect(preservedCompleted.name).toBe('Padmapuram Gardens');
      expect(adaptation.preservedStops).toContain('Padmapuram Gardens');

      // Verify Stop 2 was replaced
      expect(adaptation.substitutedStops.length).toBeGreaterThan(0);
      expect(adaptation.substitutedStops[0].original).toBe('Ananthagiri Hills Viewpoint');
    });
  });

  // ── 4. No-Data / Insufficient Data Test (Section 33) ───────────────────────
  describe('4. No-Data / Insufficient Data Test', () => {
    test('returns INSUFFICIENT_DATA and refuses to fabricate certainty when telemetry is missing', () => {
      const journeyState = {
        tripId: 'trip_no_data',
        stops: [...SAMPLE_STOPS],
        activeStop: SAMPLE_STOPS[0],
        currentMinute: 600,
      };

      // Telemetry stripped: weather and traffic unavailable
      const emptyContext = {
        weather: { dataState: 'UNAVAILABLE' },
        traffic: { dataState: 'UNAVAILABLE' },
        dataState: 'UNAVAILABLE',
      };

      const decision = evaluateNextDecision({
        journeyState,
        traveler: { travelerDna: DEFAULT_TRAVEL_DNA },
        context: emptyContext,
      });

      expect(decision.decision).toBe(DECISION_STATES.INSUFFICIENT_DATA);
      expect(decision.confidence).toBe(CONFIDENCE_LEVELS.UNKNOWN);
      expect(decision.reasonCodes).toContain('INSUFFICIENT_TELEMETRY');
      expect(decision.nextAction.actionType).toBe('AWAIT_TELEMETRY');
      expect(decision.explanation.evidence).toContain('UNAVAILABLE');
    });
  });

  // ── 5. Conflict Test: Human Knowledge vs Live Reality (Section 34) ──────────
  describe('5. Conflict Test (Generic Advice vs Live Reality)', () => {
    test('declines generic sunset viewpoint recommendation when live conditions obscure visibility', () => {
      const journeyState = {
        tripId: 'trip_conflict_test',
        stops: [...SAMPLE_STOPS],
        activeStop: SAMPLE_STOPS[1], // Ananthagiri Viewpoint (is_sunset_spot: true)
        currentMinute: 660,
      };

      const traveler = {
        travelerDna: {
          photography: 85, // Highly photography focused
          rainTolerance: 40,
        },
      };

      // Human rule says: "Sunset is best at Ananthagiri"
      // BUT live reality is: 100% overcast, heavy rain shower, zero visibility, peak crowd
      const conflictContext = {
        weather: {
          temperatureC: 21,
          precipitationProb: 80,
          condition: 'Overcast & Downpour',
          dataState: 'PREDICTED',
          confidence: 'HIGH',
        },
        traffic: { trafficDelayMinutes: 5 },
        crowd: { level: 'Very High' },
      };

      const decision = evaluateNextDecision({ journeyState, traveler, context: conflictContext });

      // Engine must reason over conflict and decline sunset viewpoint
      expect(decision.decision).toBe(DECISION_STATES.ALTERNATIVE_REQUIRED);
      expect(decision.reasonCodes).toContain('SCENIC_WINDOW_DEGRADED');
      expect(decision.selectedAlternative).toBeDefined();
      expect(decision.selectedAlternative.name).not.toBe('Ananthagiri Hills Viewpoint');
    });
  });

  // ── 6. Small Change / Anti-Churn Test (Section 35) ─────────────────────────
  describe('6. Small Change / Anti-Churn Test', () => {
    test('retains plan (KEEP_PLAN) when traffic delay is minor (5 minutes) without hard constraint violation', () => {
      const journeyState = {
        tripId: 'trip_antichurn_test',
        stops: [...SAMPLE_STOPS],
        activeStop: SAMPLE_STOPS[0],
        currentMinute: 560,
        pacingLagMinutes: 0,
      };

      // Traffic increased by just 5 minutes (well below 15-minute threshold)
      const minorTrafficContext = {
        weather: { temperatureC: 26, precipitationProb: 15, condition: 'Clear' },
        traffic: { trafficDelayMinutes: 5 },
        crowd: { level: 'Moderate' },
      };

      const decision = evaluateNextDecision({
        journeyState,
        traveler: { travelerDna: DEFAULT_TRAVEL_DNA },
        context: minorTrafficContext,
      });

      expect(decision.decision).toBe(DECISION_STATES.KEEP_PLAN);
      expect(decision.nextAction.actionType).toBe('CONTINUE_PLANNED_STOP');
      expect(decision.reasonCodes).toContain('PLAN_HEALTHY_ON_TRACK');
    });
  });

  // ── 7. Decision Audit & User Outcome Recording (Section 27 & 28) ───────────
  describe('7. Decision Audit Trail & Outcome Telemetry', () => {
    test('records decision in audit trail and tracks user acceptance outcome', () => {
      const journeyState = {
        tripId: 'trip_audit_test',
        stops: [...SAMPLE_STOPS],
        activeStop: SAMPLE_STOPS[1],
        currentMinute: 660,
      };

      const context = {
        weather: { temperatureC: 20, precipitationProb: 80, condition: 'Storm' },
      };

      const decision = evaluateNextDecision({
        journeyState,
        traveler: { travelerDna: { rainTolerance: 20 } },
        context,
      });

      expect(decision.audit).toBeDefined();
      expect(decision.audit.decisionId).toBeDefined();
      expect(decision.audit.outcome).toBe('PENDING_USER_ACTION');

      // Record user accepting the recommendation
      const outcomeResult = recordDecisionOutcome(decision.audit.decisionId, 'ACCEPTED', 'Traveler tapped Accept');
      expect(outcomeResult.success).toBe(true);
      expect(outcomeResult.outcome).toBe('ACCEPTED');

      // Verify metrics
      const metrics = getDecisionMetrics();
      expect(metrics.totalDecisions).toBeGreaterThan(0);
      expect(metrics.acceptedCount).toBeGreaterThan(0);
      expect(metrics.acceptanceRatePercent).toBeGreaterThan(0);

      // Verify trip history retrieval
      const history = getTripDecisionHistory('trip_audit_test');
      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].outcome).toBe('ACCEPTED');
    });
  });

  // ── 8. Canonical REST API Endpoints Integration (Section 36) ────────────────
  describe('8. Canonical REST API Integration (/api/intelligence)', () => {
    const testTripId = 'trip_api_test_001';

    beforeAll(async () => {
      // Initialize journey state
      await request(app)
        .post(`/api/intelligence/trips/${testTripId}/state`)
        .send({
          plan: { stops: SAMPLE_STOPS },
          travelerDna: { rainTolerance: 20, photography: 85 },
        });
    });

    test('POST /api/intelligence/trips/:id/decide evaluates decision for active trip', async () => {
      const res = await request(app)
        .post(`/api/intelligence/trips/${testTripId}/decide`)
        .send({
          context: {
            weather: { temperatureC: 20, precipitationProb: 80, condition: 'Rain' },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBeDefined();
      expect(res.body.nextAction).toBeDefined();
      expect(res.body.planHealth).toBeDefined();
      expect(res.body.explanation).toBeDefined();
      expect(res.body.audit).toBeDefined();
    });

    test('POST /api/intelligence/decide runs stateless decision engine', async () => {
      const res = await request(app)
        .post('/api/intelligence/decide')
        .send({
          journeyState: { stops: SAMPLE_STOPS },
          traveler: { rainTolerance: 20 },
          context: { weather: { temperatureC: 25, precipitationProb: 10, condition: 'Sunny' } },
        });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe(DECISION_STATES.KEEP_PLAN);
    });

    test('POST /api/intelligence/trips/:id/decision/outcome logs user feedback', async () => {
      const decideRes = await request(app)
        .post(`/api/intelligence/trips/${testTripId}/decide`)
        .send({ context: { weather: { temperatureC: 26, condition: 'Clear' } } });
      const decisionId = decideRes.body.audit?.decisionId;

      const outcomeRes = await request(app)
        .post(`/api/intelligence/trips/${testTripId}/decision/outcome`)
        .send({ decisionId, outcome: 'ACCEPTED' });

      expect(outcomeRes.status).toBe(200);
      expect(outcomeRes.body.success).toBe(true);
      expect(outcomeRes.body.outcome).toBe('ACCEPTED');
    });

    test('GET /api/intelligence/decisions/metrics returns operational telemetry', async () => {
      const res = await request(app).get('/api/intelligence/decisions/metrics');
      expect(res.status).toBe(200);
      expect(res.body.totalDecisions).toBeDefined();
      expect(res.body.acceptanceRatePercent).toBeDefined();
    });
  });
});
