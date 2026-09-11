'use strict';

/**
 * __tests__/services.trafficDisruptionIntelligence.test.js
 *
 * India In-Time v3.0 — Phase 2: Traffic, Event & Disruption Decision Intelligence
 * Comprehensive Production Black-Box Test Suite (16 Core Tests + REST API Integration)
 */

const request = require('supertest');
const express = require('express');
const {
  detectTrafficAnomaly,
  TRAFFIC_ANOMALY_STATES,
  resetCorridorHistories,
} = require('../services/travelIntelligence/disruption/trafficAnomalyDetector');
const {
  classifyDisruption,
  DISRUPTION_CAUSES,
  DISRUPTION_SEVERITIES,
} = require('../services/travelIntelligence/disruption/disruptionClassifier');
const {
  queryPlannedEvents,
  correlateEventWithTraffic,
} = require('../services/travelIntelligence/disruption/eventIntelligence');
const {
  JOURNEY_IMPACT_STATES,
} = require('../services/travelIntelligence/disruption/journeyImpactEngine');
const {
  dispatchDisruptionNotification,
  resetNotificationEngine,
} = require('../services/travelIntelligence/disruption/disruptionNotificationEngine');
const {
  evaluateNextDecision,
  DECISION_STATES,
} = require('../services/travelIntelligence/decision/adaptiveDecisionEngine');
const { createJourneyState } = require('../services/travelIntelligence/journey/journeyStateEngine');

// Setup mock Express app for REST route testing
const intelligenceRouter = require('../routes/intelligence');
const app = express();
app.use(express.json());
app.use('/api/intelligence', intelligenceRouter);

describe('India In-Time v3.0 — Phase 2: Traffic, Event & Disruption Intelligence', () => {
  beforeEach(() => {
    resetCorridorHistories();
    resetNotificationEngine();
  });

  const basePlan = {
    stops: [
      { id: 'stop_1', name: 'Submarine Museum', category: 'museum', plannedDurationMinutes: 60, lat: 17.7167, lon: 83.3333, status: 'COMPLETED' },
      { id: 'stop_2', name: 'Kailasagiri Viewpoint', category: 'viewpoint', plannedDurationMinutes: 60, is_sunset_spot: true, lat: 17.7483, lon: 83.3422, status: 'PLANNED', close_time: '20:00' },
      { id: 'stop_3', name: 'Rushikonda Beach', category: 'beach', plannedDurationMinutes: 75, lat: 17.7817, lon: 83.3853, status: 'PLANNED', close_time: '19:30' },
    ],
  };

  // ── TEST 1: Normal Congestion ──────────────────────────────────────────────
  test('TEST 1 — Normal Congestion: minor expected traffic retains plan (KEEP_PLAN)', () => {
    const journeyState = createJourneyState({ tripId: 'trip_test_1', plan: basePlan });
    const anomaly = detectTrafficAnomaly({
      corridorKey: 'Beach Road',
      currentTravelMinutes: 24,
      freeFlowMinutes: 20,
      expectedTravelMinutes: 22,
    });

    expect(anomaly.anomalyState).toBe(TRAFFIC_ANOMALY_STATES.NORMAL_CONGESTION);
    expect(anomaly.isDisruption).toBe(false);

    const decision = evaluateNextDecision({
      journeyState,
      context: { traffic: { trafficDelayMinutes: 4, anomalyState: anomaly.anomalyState } },
    });

    expect(decision.decision).toBe(DECISION_STATES.KEEP_PLAN);
  });

  // ── TEST 2: Rapid Traffic Deterioration ─────────────────────────────────────
  test('TEST 2 — Rapid Traffic Deterioration (25 -> 45 -> 70 min) triggers TRAFFIC_ANOMALY', () => {
    const corridorKey = 'NH16_Muralinagar';
    const now = Date.now();

    // Feed 3 readings: 25m, then 45m, then 70m
    detectTrafficAnomaly({ corridorKey, currentTravelMinutes: 25, freeFlowMinutes: 20, timestamp: now - 120000 });
    detectTrafficAnomaly({ corridorKey, currentTravelMinutes: 45, freeFlowMinutes: 20, timestamp: now - 60000 });
    const finalAnomaly = detectTrafficAnomaly({ corridorKey, currentTravelMinutes: 70, freeFlowMinutes: 20, timestamp: now });

    expect(finalAnomaly.rateInfo.isRapidlyWorsening).toBe(true);
    expect(finalAnomaly.isDisruption).toBe(true);
    expect([TRAFFIC_ANOMALY_STATES.TRAFFIC_ANOMALY, TRAFFIC_ANOMALY_STATES.MAJOR_DISRUPTION]).toContain(finalAnomaly.anomalyState);
  });

  // ── TEST 3: Major Event ────────────────────────────────────────────────────
  test('TEST 3 — Major Event (match near stadium + route overlap + congestion) links disruption with high cause confidence', () => {
    const trafficAnomaly = {
      isDisruption: true,
      anomalyState: TRAFFIC_ANOMALY_STATES.MAJOR_DISRUPTION,
      delayMinutes: 55,
      delayRatio: 2.5,
    };

    const classified = classifyDisruption({
      tripId: 'trip_cricket_test',
      trafficAnomaly,
      coords: [17.7972, 83.3533], // ACA-VDCA Cricket Stadium
      corridorName: 'NH16 PM Palem Stretch',
      targetMinute: 17 * 60 + 30, // 17:30 during event
    });

    expect(classified.eventType).toBe(DISRUPTION_CAUSES.CRICKET_MATCH);
    expect(classified.disruptionConfidence).toBe('HIGH');
    expect(classified.causeConfidence).toBe('HIGH');
    expect(classified.isCauseVerified).toBe(true);
  });

  // ── TEST 4: Religious Procession ───────────────────────────────────────────
  test('TEST 4 — Religious Procession + traffic impact produces warning and event-linked adaptation', () => {
    const trafficAnomaly = {
      isDisruption: true,
      anomalyState: TRAFFIC_ANOMALY_STATES.TRAFFIC_ANOMALY,
      delayMinutes: 40,
      delayRatio: 1.8,
    };

    const classified = classifyDisruption({
      tripId: 'trip_procession_test',
      trafficAnomaly,
      coords: [17.7667, 83.2500], // Simhachalam Foothills
      corridorName: 'Simhachalam Hill Road',
      targetMinute: 16 * 60,
    });

    expect(classified.eventType).toBe(DISRUPTION_CAUSES.RELIGIOUS_PROCESSION);
    expect(classified.severity).toBe(DISRUPTION_SEVERITIES.WARNING);
    expect(classified.causeConfidence).toBe('HIGH');
  });

  // ── TEST 5: Unknown Cause ──────────────────────────────────────────────────
  test('TEST 5 — Unknown Cause: severe traffic collapse without verified event returns UNKNOWN_DISRUPTION', () => {
    const trafficAnomaly = {
      isDisruption: true,
      anomalyState: TRAFFIC_ANOMALY_STATES.MAJOR_DISRUPTION,
      delayMinutes: 70,
      delayRatio: 3.2,
    };

    // Remote coordinates where no scheduled event is known
    const classified = classifyDisruption({
      tripId: 'trip_unknown_cause_test',
      trafficAnomaly,
      coords: [17.9200, 83.4500],
      corridorName: 'Bhimili Coastal Bypass',
      targetMinute: 14 * 60,
    });

    // RULE: Must NEVER fabricate a cause (like "protest") without evidence
    expect(classified.eventType).toBe(DISRUPTION_CAUSES.UNKNOWN_DISRUPTION);
    expect(classified.disruptionConfidence).toBe('HIGH');
    expect(classified.causeConfidence).toBe('LOW');
    expect(classified.isCauseVerified).toBe(false);
  });

  // ── TEST 6: Accident ───────────────────────────────────────────────────────
  test('TEST 6 — Accident: verified police incident report + traffic collapse classifies as ACCIDENT with high confidence', () => {
    const trafficAnomaly = {
      isDisruption: true,
      anomalyState: TRAFFIC_ANOMALY_STATES.MAJOR_DISRUPTION,
      delayMinutes: 60,
    };

    const incidentReport = {
      verified: true,
      source: 'VISAKHAPATNAM_TRAFFIC_POLICE',
      type: 'MULTI_VEHICLE_ACCIDENT',
      description: 'Overturned commercial truck blocking two lanes',
    };

    const classified = classifyDisruption({
      tripId: 'trip_accident_test',
      trafficAnomaly,
      incidentReport,
      corridorName: 'Maddilapalem Junction',
    });

    expect(classified.eventType).toBe(DISRUPTION_CAUSES.ACCIDENT);
    expect(classified.causeConfidence).toBe('HIGH');
    expect(classified.disruptionConfidence).toBe('HIGH');
    expect(classified.isCauseVerified).toBe(true);
  });

  // ── TEST 7: Minor Change ───────────────────────────────────────────────────
  test('TEST 7 — Minor Change (+5 min delay) retains plan (KEEP_PLAN) via anti-churn guard', () => {
    const journeyState = createJourneyState({ tripId: 'trip_minor_change', plan: basePlan });
    const decision = evaluateNextDecision({
      journeyState,
      context: { traffic: { trafficDelayMinutes: 5 } },
    });

    expect(decision.decision).toBe(DECISION_STATES.KEEP_PLAN);
  });

  // ── TEST 8: Road Closure ───────────────────────────────────────────────────
  test('TEST 8 — Road Closure: verified closure triggers CRITICAL and ALTERNATIVE_REQUIRED', () => {
    const journeyState = createJourneyState({ tripId: 'trip_closure_test', plan: basePlan });
    const incidentReport = {
      verified: true,
      type: 'ROAD_CLOSURE',
      description: 'Culvert collapse, road impassable',
    };

    const disruption = classifyDisruption({
      tripId: 'trip_closure_test',
      trafficAnomaly: { isDisruption: true, anomalyState: TRAFFIC_ANOMALY_STATES.ROAD_BLOCKED, delayMinutes: 120 },
      incidentReport,
    });

    expect(disruption.eventType).toBe(DISRUPTION_CAUSES.ROAD_CLOSURE);
    expect(disruption.severity).toBe(DISRUPTION_SEVERITIES.CRITICAL);

    const decision = evaluateNextDecision({
      journeyState,
      context: { traffic: { isRoadBlocked: true, disruption } },
    });

    expect(decision.decision).toBe(DECISION_STATES.ALTERNATIVE_REQUIRED);
    expect(decision.selectedAlternative).toBeTruthy();
  });

  // ── TEST 9: Traveler Difference ────────────────────────────────────────────
  test('TEST 9 — Traveler Difference: strict deadline vs flexible schedule produce divergent decisions under identical traffic', () => {
    const journeyState = createJourneyState({ tripId: 'trip_diff_test', plan: basePlan });
    const context = {
      traffic: {
        trafficDelayMinutes: 40,
        disruption: {
          isDisruption: true,
          estimatedDelay: 40,
          eventType: 'MAJOR_CONGESTION',
        },
      },
    };

    // Traveler A: Strict train departure deadline
    const travelerStrict = {
      hardDeadlineMinute: 19 * 60, // 19:00 train departure
      isDeadlineStrict: true,
    };
    const decisionStrict = evaluateNextDecision({
      journeyState,
      traveler: travelerStrict,
      context,
    });

    // Traveler B: Flexible relaxed schedule
    const travelerFlexible = {
      isFlexible: true,
      pacingPreference: 'slow',
    };
    const decisionFlexible = evaluateNextDecision({
      journeyState,
      traveler: travelerFlexible,
      context,
    });

    // Strict traveler requires alternative/drop to protect deadline; flexible traveler can wait or re-time
    expect(decisionStrict.decision).toBe(DECISION_STATES.ALTERNATIVE_REQUIRED);
    expect(decisionFlexible.decision).toBe(DECISION_STATES.WAIT);
  });

  // ── TEST 10: Completed Stop Protection ─────────────────────────────────────
  test('TEST 10 — Completed Stop Protection: completed stops remain strictly immutable during disruption adaptation', () => {
    const journeyState = createJourneyState({ tripId: 'trip_immutability_test', plan: basePlan });
    expect(journeyState.completedStops.length).toBe(1);
    expect(journeyState.completedStops[0].name).toBe('Submarine Museum');

    const decision = evaluateNextDecision({
      journeyState,
      context: {
        traffic: {
          trafficDelayMinutes: 50,
          isRoadBlocked: true,
        },
      },
    });

    expect(decision.explanation.whatRemains).toContain('Submarine Museum');
    expect(decision.explanation.whatRemains).toContain('strictly preserved and immutable');
  });

  // ── TEST 11: Wait vs Reroute (Wait Preferred) ──────────────────────────────
  test('TEST 11 — Wait vs Reroute: alternate route only slightly faster or rough favors WAIT', () => {
    const journeyState = createJourneyState({ tripId: 'trip_wait_test', plan: basePlan });

    // Current delay 35 min, alternate saves only 6 min (alt delay 29m)
    const context = {
      traffic: {
        trafficDelayMinutes: 35,
        alternateRoute: {
          isViable: true,
          trafficDelayMinutes: 29, // Only 6 min faster
          isRoughTerrain: false,
        },
      },
    };

    const decision = evaluateNextDecision({
      journeyState,
      context,
    });

    expect(decision.decision).toBe(DECISION_STATES.WAIT);
    expect(decision.explanation.what).toContain('Wait');
  });

  // ── TEST 12: Reroute (Materially Better Alternate) ─────────────────────────
  test('TEST 12 — Reroute: valid alternate route saving significant time (>= 20m) triggers REROUTE', () => {
    const journeyState = createJourneyState({ tripId: 'trip_reroute_test', plan: basePlan });

    // Current delay 55 min, highway bypass delay only 10 min (saves 45 min!)
    const context = {
      traffic: {
        trafficDelayMinutes: 55,
        alternateRoute: {
          isViable: true,
          trafficDelayMinutes: 10,
          isGhat: false,
          isSafe: true,
        },
      },
    };

    const decision = evaluateNextDecision({
      journeyState,
      context,
    });

    expect(decision.decision).toBe(DECISION_STATES.REROUTE);
    expect(decision.nextAction.actionType).toBe('REROUTE_CORRIDOR');
  });

  // ── TEST 13: Early Warning ─────────────────────────────────────────────────
  test('TEST 13 — Early Warning: detects upcoming scheduled event and provides proactive advisory before traveler arrives', () => {
    // Traveler traverses stadium corridor at 16:00 (event starts at 16:30, impact starts 15:30)
    const events = queryPlannedEvents({
      corridorName: 'NH16 PM Palem Stretch',
      targetMinute: 16 * 60,
    });

    expect(events.length).toBeGreaterThan(0);
    const stadiumEvent = events[0];
    expect(stadiumEvent.eventType).toBe('CRICKET_MATCH');
    expect(stadiumEvent.isUpcoming || stadiumEvent.isCurrentlyActive).toBe(true);

    const correlation = correlateEventWithTraffic({
      trafficAnomaly: { isDisruption: false }, // Live traffic not yet collapsed
      corridorName: 'NH16 PM Palem Stretch',
      targetMinute: 16 * 60,
    });

    expect(correlation.correlationType).toBe('UPCOMING_EVENT_RISK');
    expect(correlation.disruptionConfidence).toBe('MEDIUM');
    expect(correlation.causeConfidence).toBe('HIGH');
  });

  // ── TEST 14: Notification Deduplication ────────────────────────────────────
  test('TEST 14 — Notification Deduplication: unchanged disruption does NOT emit duplicate notifications', () => {
    const tripId = 'trip_dedup_test';
    const disruption = {
      disruptionId: 'dsr_100',
      severity: 'WARNING',
      estimatedDelay: 30,
      corridor: 'Beach Road',
    };
    const journeyImpact = { impactState: JOURNEY_IMPACT_STATES.MODERATE_IMPACT };

    const t0 = Date.now();
    // Dispatch 1st notification
    const res1 = dispatchDisruptionNotification({ tripId, disruption, journeyImpact, now: t0 });
    expect(res1.dispatched).toBe(true);

    // Attempt 2nd notification 5 minutes later under identical conditions
    const res2 = dispatchDisruptionNotification({ tripId, disruption, journeyImpact, now: t0 + 5 * 60000 });
    expect(res2.dispatched).toBe(false);
    expect(res2.reason).toContain('COOLDOWN');
  });

  // ── TEST 15: Notification Escalation ───────────────────────────────────────
  test('TEST 15 — Notification Escalation: severity escalation (WATCH -> WARNING -> SEVERE) permits new notification', () => {
    const tripId = 'trip_escalation_test';
    const disruptionId = 'dsr_200';
    const journeyImpact = { impactState: JOURNEY_IMPACT_STATES.HIGH_IMPACT };

    const t0 = Date.now();
    // 1st: WATCH
    dispatchDisruptionNotification({
      tripId,
      disruption: { disruptionId, severity: 'WATCH', estimatedDelay: 15, corridor: 'NH16' },
      journeyImpact,
      now: t0,
    });

    // 2nd: SEVERE escalation 3 minutes later (material change)
    const escalatedRes = dispatchDisruptionNotification({
      tripId,
      disruption: { disruptionId, severity: 'SEVERE', estimatedDelay: 55, corridor: 'NH16' },
      journeyImpact,
      now: t0 + 3 * 60000,
    });

    expect(escalatedRes.dispatched).toBe(true);
    expect(escalatedRes.reason).toContain('ESCALATED');
  });

  // ── TEST 16: Unknown Cause Notification ────────────────────────────────────
  test('TEST 16 — Unknown Cause Notification: severe disruption with no verified event displays "cause currently unverified"', () => {
    const tripId = 'trip_notif_unknown';
    const disruption = {
      disruptionId: 'dsr_300',
      severity: 'SEVERE',
      estimatedDelay: 65,
      corridor: 'Gajuwaka Highway',
      isCauseVerified: false,
      disruptionConfidence: 'HIGH',
      causeConfidence: 'LOW',
      eventType: 'UNKNOWN_DISRUPTION',
    };
    const journeyImpact = { impactState: JOURNEY_IMPACT_STATES.HIGH_IMPACT };

    const res = dispatchDisruptionNotification({
      tripId,
      disruption,
      journeyImpact,
      now: Date.now(),
    });

    expect(res.dispatched).toBe(true);
    expect(res.notification.qa.why.toLowerCase()).toContain('unverified');
    expect(res.notification.disruptionConfidence).toBe('HIGH');
    expect(res.notification.causeConfidence).toBe('LOW');
  });

  // ── REST API Integration Tests ─────────────────────────────────────────────
  describe('Canonical REST API Integration (/api/intelligence)', () => {
    test('POST /api/intelligence/trips/:id/disruptions/evaluate executes full pipeline', async () => {
      // First initialize journey state
      await request(app)
        .post('/api/intelligence/trips/trip_api_test/state')
        .send({ plan: basePlan });

      const res = await request(app)
        .post('/api/intelligence/trips/trip_api_test/disruptions/evaluate')
        .send({
          currentTravelMinutes: 65,
          corridorName: 'NH16',
        });

      expect(res.status).toBe(200);
      expect(res.body.disruption).toBeTruthy();
      expect(res.body.journeyImpact).toBeTruthy();
      expect(res.body.notificationOutcome).toBeTruthy();
    });

    test('POST /api/intelligence/trips/:id/disruptions/simulate returns SIMULATED demonstration payload', async () => {
      const res = await request(app)
        .post('/api/intelligence/trips/trip_api_test/disruptions/simulate')
        .send({ simulationScenario: 'CRICKET_MATCH_CONGESTION' });

      expect(res.status).toBe(200);
      expect(res.body.dataState).toBe('SIMULATED');
      expect(res.body.simulationNotice).toContain('Simulated');
      expect(res.body.disruptionEvaluation.disruption.eventType).toBe(DISRUPTION_CAUSES.CRICKET_MATCH);
    });

    test('GET /api/intelligence/trips/:id/notifications fetches notifications and POST /action logs user response', async () => {
      const notifsRes = await request(app).get('/api/intelligence/trips/trip_api_test/notifications');
      expect(notifsRes.status).toBe(200);
      expect(Array.isArray(notifsRes.body.notifications)).toBe(true);

      if (notifsRes.body.notifications.length > 0) {
        const notifId = notifsRes.body.notifications[0].notificationId;
        const actionRes = await request(app)
          .post('/api/intelligence/trips/trip_api_test/notifications/action')
          .send({ notificationId: notifId, action: 'REROUTE', notes: 'Accepted bypass' });

        expect(actionRes.status).toBe(200);
        expect(actionRes.body.action).toBe('REROUTE');
      }
    });

    test('GET /api/intelligence/disruptions/events returns planned events', async () => {
      const res = await request(app).get('/api/intelligence/disruptions/events?corridorName=NH16');
      expect(res.status).toBe(200);
      expect(res.body.eventsCount).toBeGreaterThan(0);
    });

    test('GET /api/intelligence/disruptions/metrics returns disruption telemetry metrics', async () => {
      const res = await request(app).get('/api/intelligence/disruptions/metrics');
      expect(res.status).toBe(200);
      expect(res.body.totalPlannedEvents).toBeGreaterThan(0);
    });
  });
});
