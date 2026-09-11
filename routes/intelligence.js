'use strict';

/**
 * routes/intelligence.js
 *
 * India In-Time v3.0 Travel Operating System & Decision Intelligence Router.
 *
 * Endpoints:
 * - GET  /weather/truth            (Multi-provider consensus & disagreement preservation)
 * - GET  /weather/accuracy         (Empirical MAE & precipitation calibration)
 * - GET  /health                   (Intelligence layer health & telemetry)
 * - POST /trips/:id/state          (Initialize authoritative journey state)
 * - GET  /trips/:id/state          (Retrieve active journey state)
 * - POST /trips/:id/state/progress (Advance journey progress with immutability guarantee)
 * - GET  /trips/:id/guardian       (Evaluate Travel Guardian triggers & trip health)
 * - POST /trips/:id/replan         (Execute contextual plan adaptation with diffs)
 * - GET  /trips/:id/plan-versions  (Audit trail of itinerary adaptations)
 * - POST /trips/:id/simulate-event (Demo simulation hook for controlled events)
 */

const express = require('express');
const router = express.Router();
const appLogger = require('../lib/logger');

const { getConsensusWeather } = require('../services/travelIntelligence/weather/weatherProviderRegistry');
const { getAggregateWeatherAccuracyMetrics } = require('../services/travelIntelligence/weather/weatherAccuracyTracker');
const {
  createJourneyState,
  advanceJourneyProgress,
  TRIP_HEALTH_STATES,
} = require('../services/travelIntelligence/journey/journeyStateEngine');
const { evaluateTripGuardian } = require('../services/travelIntelligence/guardian/travelGuardian');
const { adaptJourneyPlan } = require('../services/travelIntelligence/decision/adaptationPipeline');
const {
  evaluateNextDecision,
  recordDecisionOutcome,
  getDecisionMetrics,
  getTripDecisionHistory,
  DECISION_STATES,
} = require('../services/travelIntelligence/decision/adaptiveDecisionEngine');
const { commitPlanVersion, getPlanVersionHistory } = require('../services/travelIntelligence/journey/planVersioning');
const { sanitizeDnaProfile } = require('../services/travelIntelligence/personalTravelDna');
const {
  evaluateTripDisruptions,
  getTripNotifications,
  queryPlannedEvents,
  CANONICAL_PLANNED_EVENTS,
} = require('../services/travelIntelligence/disruption');
const {
  getSafetyProviders,
  evaluateJourneySafety,
  simulateSafetyEvent,
  resolveSafetyCondition,
} = require('../services/travelIntelligence/safety');

// Active journey state registry (survives requests; syncs with DB if connected)
const activeTripsState = new Map();
// Active trip disruptions registry
const activeTripDisruptions = new Map();
// Active trip safety evaluations registry
const activeTripSafety = new Map();
const tripSafetyHistory = new Map();

function getDbPool() {
  try {
    const { getDb } = require('../db/init');
    return getDb();
  } catch (_err) {
    return null;
  }
}

// ── 1. Weather Truth & Consensus ─────────────────────────────────────────────
router.get('/weather/truth', async (req, res) => {
  const { lat, lon, elevationM } = req.query;
  const numLat = Number(lat);
  const numLon = Number(lon);

  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
    return res.status(400).json({ error: 'Valid lat and lon query parameters are required' });
  }

  try {
    const consensus = await getConsensusWeather(numLat, numLon, {
      elevationM: elevationM ? Number(elevationM) : null,
    });
    res.json(consensus);
  } catch (err) {
    appLogger.error(`[intelligence/weather/truth] Error: ${err.message}`);
    res.status(500).json({ error: 'Failed to evaluate weather consensus' });
  }
});

// ── 2. Weather Accuracy Telemetry ────────────────────────────────────────────
router.get('/weather/accuracy', (_req, res) => {
  const metrics = getAggregateWeatherAccuracyMetrics();
  res.json(metrics);
});

// ── 3. Intelligence Layer Health ─────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    operatingSystem: 'India In-Time v3.0',
    capabilities: [
      'Multi-Source Weather Truth Engine',
      'Authoritative Journey State Engine',
      'Real-Time Travel Guardian (12 Triggers)',
      'Contextual Decision Engine & Alternative Generator',
      'Plan Versioning & Audit Trail',
    ],
    activeTripsCount: activeTripsState.size,
    timestamp: new Date().toISOString(),
  });
});

// ── 4. Journey State: Initialize or Update ───────────────────────────────────
router.post('/trips/:id/state', async (req, res) => {
  const tripId = req.params.id;
  const { plan, travelerId, initialLocation, startTimeMinutes, dna, travelerDna } = req.body || {};

  if (!plan || (!Array.isArray(plan.stops) && !Array.isArray(plan))) {
    return res.status(400).json({ error: 'Plan with stops is required to initialize journey state' });
  }

  try {
    const state = createJourneyState({
      tripId,
      travelerId,
      plan,
      initialLocation,
      startTimeMinutes,
    });

    activeTripsState.set(tripId, {
      state,
      travelerDna: sanitizeDnaProfile(travelerDna || dna),
    });

    // Commit Plan v1 to version audit trail
    await commitPlanVersion({
      tripId,
      versionNumber: 1,
      triggerType: 'INITIAL_PLAN',
      triggerReason: 'Initial itinerary generated and loaded into Journey State',
      plan: state.stops,
      changedStops: [],
      preservedStops: [],
      confidence: 'HIGH',
      dbPool: getDbPool(),
    });

    res.json({
      message: 'Journey State initialized',
      tripId,
      activePlanVersion: state.activePlanVersion,
      tripHealth: state.tripHealth,
      activeStop: state.activeStop,
      upcomingStops: state.upcomingStops,
    });
  } catch (err) {
    appLogger.error(`[intelligence/state] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 5. Journey State: Fetch Active State ─────────────────────────────────────
router.get('/trips/:id/state', (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  if (!record) {
    return res.status(404).json({ error: `No active journey state found for trip '${tripId}'` });
  }

  res.json({
    tripId,
    state: record.state,
    travelerDna: record.travelerDna,
  });
});

// ── 6. Journey State: Advance Progress (START, COMPLETE, SKIP) ───────────────
router.post('/trips/:id/state/progress', (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  if (!record) {
    return res.status(404).json({ error: `No active journey state found for trip '${tripId}'` });
  }

  const { stopId, action, currentMinute, actualVisitMinutes, reason } = req.body || {};
  if (!stopId) {
    return res.status(400).json({ error: 'stopId is required' });
  }

  try {
    const updatedState = advanceJourneyProgress(record.state, {
      stopId,
      action: action || 'COMPLETE',
      currentMinute,
      actualVisitMinutes,
      reason,
    });

    record.state = updatedState;
    activeTripsState.set(tripId, record);

    res.json({
      message: `Stop '${stopId}' updated (${action || 'COMPLETE'})`,
      tripId,
      currentMinute: updatedState.currentMinute,
      pacingLagMinutes: updatedState.pacingLagMinutes,
      activeStop: updatedState.activeStop,
      completedStopsCount: updatedState.completedStops.length,
      upcomingStopsCount: updatedState.upcomingStops.length,
    });
  } catch (err) {
    appLogger.warn(`[intelligence/progress] Warning: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// ── 7. Travel Guardian: Evaluate Active Trip Health ──────────────────────────
router.get('/trips/:id/guardian', async (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  if (!record) {
    return res.status(404).json({ error: `No active journey state found for trip '${tripId}'` });
  }

  try {
    // Fetch consensus weather for current stop or next upcoming stop
    const targetStop = record.state.activeStop || record.state.upcomingStops[0];
    let weatherConsensus = {};

    if (targetStop && Number.isFinite(targetStop.lat) && Number.isFinite(targetStop.lon)) {
      weatherConsensus = await getConsensusWeather(targetStop.lat, targetStop.lon, {
        elevationM: targetStop.elevationM,
      });
    }

    const context = {
      weather: weatherConsensus.isAvailable ? {
        temperatureC: weatherConsensus.temperatureC,
        apparentTempC: weatherConsensus.apparentTempC,
        precipitationProb: weatherConsensus.precipitationProb,
        condition: weatherConsensus.condition,
      } : { precipitationProb: 15 },
      traffic: {
        trafficDelayMinutes: Math.max(0, record.state.pacingLagMinutes),
        isGhatCorridor: targetStop?.elevationM > 600 || /araku|ghat|valley/i.test(targetStop?.name || ''),
      },
      provenance: { confidence: weatherConsensus.confidence || 'MEDIUM' },
    };

    const guardian = evaluateTripGuardian(record.state, context, record.travelerDna);
    record.state.tripHealth = guardian.tripHealth;

    res.json(guardian);
  } catch (err) {
    appLogger.error(`[intelligence/guardian] Error: ${err.message}`);
    res.status(500).json({ error: 'Failed to run Travel Guardian evaluation' });
  }
});

// ── 8. Adaptive Travel Decision Engine (v3.0) ────────────────────────────────
// Evaluates: "Given everything known right now, what is the best next decision for THIS traveler?"
router.post('/trips/:id/decide', async (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  try {
    const journeyState = record ? record.state : req.body.journeyState;
    const traveler = record ? record.travelerDna : (req.body.traveler || req.body.travelerDna);

    if (!journeyState || !Array.isArray(journeyState.stops)) {
      return res.status(400).json({ error: 'Valid journeyState or active tripId is required' });
    }

    const targetStop = journeyState.activeStop || (journeyState.stops.find(s => s.status === 'PLANNED') || journeyState.stops[0]);
    let liveWeather = req.body.context?.weather || null;

    if (!liveWeather && targetStop && Number.isFinite(targetStop.lat) && Number.isFinite(targetStop.lon)) {
      liveWeather = await getConsensusWeather(targetStop.lat, targetStop.lon, {
        elevationM: targetStop.elevationM,
      });
    }

    const context = {
      weather: liveWeather,
      traffic: req.body.context?.traffic || {
        trafficDelayMinutes: Math.max(0, journeyState.pacingLagMinutes || 0),
        isGhatCorridor: targetStop?.elevationM > 600 || /araku|ghat/i.test(targetStop?.name || ''),
      },
      crowd: req.body.context?.crowd || { level: 'Moderate' },
      ...req.body.context,
    };

    const decisionResult = evaluateNextDecision({
      journeyState,
      traveler,
      context,
      options: req.body.options || {},
    });

    res.json(decisionResult);
  } catch (err) {
    appLogger.error(`[intelligence/decide] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Stateless Decision Engine endpoint
router.post('/decide', async (req, res) => {
  try {
    const { journeyState, traveler, context, options } = req.body || {};
    if (!journeyState || !Array.isArray(journeyState.stops)) {
      return res.status(400).json({ error: 'journeyState with stops array is required' });
    }

    const decisionResult = evaluateNextDecision({
      journeyState,
      traveler: traveler || {},
      context: context || {},
      options: options || {},
    });

    res.json(decisionResult);
  } catch (err) {
    appLogger.error(`[intelligence/decide/stateless] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Record user decision outcome (ACCEPTED, REJECTED, IGNORED, COMPLETED)
router.post('/trips/:id/decision/outcome', (req, res) => {
  const { decisionId, outcome, notes } = req.body || {};
  if (!decisionId) {
    return res.status(400).json({ error: 'decisionId is required' });
  }

  const result = recordDecisionOutcome(decisionId, outcome || 'ACCEPTED', notes);
  res.json(result);
});

// Decision audit trail history for a trip
router.get('/trips/:id/decision/history', (req, res) => {
  const tripId = req.params.id;
  const history = getTripDecisionHistory(tripId);
  res.json({ tripId, decisionsCount: history.length, history });
});

// Operational metrics of the decision engine
router.get('/decisions/metrics', (_req, res) => {
  const metrics = getDecisionMetrics();
  res.json(metrics);
});

// ── 9. Contextual Plan Adaptation (Replan) ───────────────────────────────────
router.post('/trips/:id/replan', async (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  if (!record) {
    return res.status(404).json({ error: `No active journey state found for trip '${tripId}'` });
  }

  try {
    const targetStop = record.state.activeStop || record.state.upcomingStops[0];
    let weatherConsensus = {};
    if (targetStop && Number.isFinite(targetStop.lat) && Number.isFinite(targetStop.lon)) {
      weatherConsensus = await getConsensusWeather(targetStop.lat, targetStop.lon, {
        elevationM: targetStop.elevationM,
      });
    }

    const context = {
      weather: weatherConsensus,
      traffic: { isGhatCorridor: targetStop?.elevationM > 600 || /araku|ghat/i.test(targetStop?.name || '') },
      provenance: { confidence: weatherConsensus.confidence || 'MEDIUM' },
    };

    // First consult the Decision Engine (Anti-churn check)
    const decisionResult = evaluateNextDecision({
      journeyState: record.state,
      traveler: record.travelerDna,
      context,
      options: req.body.options || {},
    });

    // If decision is KEEP_PLAN and caller did not explicitly force replan, protect stability
    if (decisionResult.decision === DECISION_STATES.KEEP_PLAN && !req.body.force) {
      return res.json({
        shouldAdapt: false,
        decision: DECISION_STATES.KEEP_PLAN,
        message: 'Current plan is healthy and stable; no adaptation required.',
        activePlanVersion: record.state.activePlanVersion,
        explanation: decisionResult.explanation,
        decisionResult,
      });
    }

    const guardianEval = evaluateTripGuardian(record.state, context, record.travelerDna);
    const adaptation = adaptJourneyPlan(record.state, context, record.travelerDna, guardianEval);

    // Commit Plan v(N+1)
    await commitPlanVersion({
      tripId,
      versionNumber: adaptation.newPlanVersion,
      triggerType: guardianEval.tripHealth,
      triggerReason: guardianEval.reasons.join('; '),
      plan: adaptation.newStopsList,
      changedStops: adaptation.substitutedStops,
      preservedStops: adaptation.preservedStops,
      confidence: adaptation.confidence,
      dbPool: getDbPool(),
    });

    // Update active journey state
    record.state.activePlanVersion = adaptation.newPlanVersion;
    record.state.stops = adaptation.newStopsList;
    record.state.completedStops = adaptation.newStopsList.filter(s => s.status === 'COMPLETED');
    record.state.upcomingStops = adaptation.newStopsList.filter(s => s.status === 'PLANNED');
    record.state.activeStop = adaptation.newStopsList.find(s => s.status === 'PLANNED') || null;
    record.state.tripHealth = TRIP_HEALTH_STATES.ON_TRACK;
    record.state.lastAdaptation = adaptation;

    res.json({
      ...adaptation,
      decision: decisionResult.decision,
      decisionExplanation: decisionResult.explanation,
    });
  } catch (err) {
    appLogger.error(`[intelligence/replan] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 9. Plan Version Audit Trail ──────────────────────────────────────────────
router.get('/trips/:id/plan-versions', async (req, res) => {
  const tripId = req.params.id;
  const history = await getPlanVersionHistory(tripId, getDbPool());
  res.json({
    tripId,
    versionsCount: history.length,
    history,
  });
});

// ── 10. Killer Demo Simulation Hook ──────────────────────────────────────────
router.post('/trips/:id/simulate-event', (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  if (!record) {
    return res.status(404).json({ error: `No active journey state found for trip '${tripId}'` });
  }

  const { eventType = 'HEAVY_RAIN_GHAT' } = req.body || {};

  // Controlled simulation: NEVER falsely claimed as live observation
  const simulatedContext = {
    isSimulation: true,
    dataState: 'SIMULATED_DEMO_DATA',
    weather: {
      temperatureC: 22,
      apparentTempC: 22,
      precipitationProb: 85,
      precipitationMm: 24,
      condition: 'Heavy Orographic Downpour (Simulated)',
    },
    traffic: {
      isGhatCorridor: true,
      trafficDelayMinutes: 30,
      corridorName: 'Ananthagiri Ghat Road',
    },
    provenance: { confidence: 'HIGH' },
  };

  const guardian = evaluateTripGuardian(record.state, simulatedContext, record.travelerDna);
  record.state.tripHealth = guardian.tripHealth;

  res.json({
    simulationNotice: 'Controlled Demonstration: Live Reality Mutation Simulated',
    dataState: 'SIMULATED',
    eventType,
    guardianEvaluation: guardian,
  });
});

// ── 11. Phase 2: Disruption Intelligence & Journey Impact ────────────────────
router.post('/trips/:id/disruptions/evaluate', async (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  const journeyState = record ? record.state : req.body.journeyState;
  const travelerDna = record ? record.travelerDna : (req.body.travelerDna || {});

  if (!journeyState || !Array.isArray(journeyState.stops)) {
    return res.status(400).json({ error: 'Valid journeyState or active trip is required' });
  }

  const {
    currentTravelMinutes = 45,
    freeFlowMinutes = null,
    corridorName = 'Transit Corridor',
    coords = null,
    incidentReport = null,
    customEvents = null,
    minuteOfDay = null,
    isSimulation = false,
  } = req.body || {};

  try {
    const result = evaluateTripDisruptions({
      tripId,
      journeyState,
      travelerDna,
      currentTravelMinutes,
      freeFlowMinutes,
      corridorName,
      coords,
      incidentReport,
      customEvents,
      minuteOfDay,
      isSimulation,
    });

    // Store active disruption for this trip
    if (result.disruption) {
      let tripDisruptions = activeTripDisruptions.get(tripId) || [];
      tripDisruptions = [result.disruption, ...tripDisruptions.filter(d => d.disruptionId !== result.disruption.disruptionId)].slice(0, 10);
      activeTripDisruptions.set(tripId, tripDisruptions);
    }

    res.json(result);
  } catch (err) {
    appLogger.error(`[intelligence/disruptions/evaluate] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Fetch active disruptions for trip
router.get('/trips/:id/disruptions', (req, res) => {
  const tripId = req.params.id;
  const disruptions = activeTripDisruptions.get(tripId) || [];
  res.json({
    tripId,
    disruptionsCount: disruptions.length,
    disruptions,
  });
});

// ── 12. Phase 2: Controlled Disruption Simulation Hook ───────────────────────
router.post('/trips/:id/disruptions/simulate', (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  const {
    simulationScenario = 'CRICKET_MATCH_CONGESTION',
    corridorName = 'NH16 Stadium Corridor',
    currentTravelMinutes = 75,
    freeFlowMinutes = 25,
  } = req.body || {};

  const journeyState = record ? record.state : req.body.journeyState;
  const travelerDna = record ? record.travelerDna : (req.body.travelerDna || {});

  if (!journeyState || !Array.isArray(journeyState.stops)) {
    return res.status(400).json({ error: 'Valid journeyState or active trip is required' });
  }

  // Simulated disruption payload strictly marked SIMULATED
  const result = evaluateTripDisruptions({
    tripId,
    journeyState,
    travelerDna,
    currentTravelMinutes,
    freeFlowMinutes,
    corridorName,
    coords: [17.7972, 83.3533], // ACA-VDCA Stadium
    minuteOfDay: req.body.minuteOfDay || (17 * 60 + 30),
    isSimulation: true,
  });

  if (result.disruption) {
    let tripDisruptions = activeTripDisruptions.get(tripId) || [];
    tripDisruptions = [result.disruption, ...tripDisruptions.filter(d => d.disruptionId !== result.disruption.disruptionId)].slice(0, 10);
    activeTripDisruptions.set(tripId, tripDisruptions);
  }

  res.json({
    simulationNotice: 'Controlled Demonstration: Live Reality Mutation Simulated',
    dataState: 'SIMULATED',
    scenario: simulationScenario,
    disruptionEvaluation: result,
  });
});

// ── 13. Phase 2: Proactive Travel Guardian Notifications ─────────────────────
router.get('/trips/:id/notifications', (req, res) => {
  const tripId = req.params.id;
  const notifications = getTripNotifications(tripId);
  res.json({
    tripId,
    notificationsCount: notifications.length,
    notifications,
  });
});

// Record traveler action on notification
router.post('/trips/:id/notifications/action', (req, res) => {
  const tripId = req.params.id;
  const { notificationId, action, notes } = req.body || {};
  if (!notificationId || !action) {
    return res.status(400).json({ error: 'notificationId and action are required' });
  }

  const notifications = getTripNotifications(tripId);
  const target = notifications.find(n => n.notificationId === notificationId);
  if (target) {
    target.userAction = action;
    target.actionRecordedAt = new Date().toISOString();
    target.actionNotes = notes || null;
    target.status = 'ACTIONED';
  }

  res.json({
    message: `Notification action '${action}' recorded.`,
    notificationId,
    action,
  });
});

// ── 14. Phase 2: Planned Events Query & Operational Metrics ──────────────────
router.get('/disruptions/events', (req, res) => {
  const { lat, lon, corridorName, minuteOfDay } = req.query;
  const coords = (lat && lon) ? [Number(lat), Number(lon)] : null;
  const events = queryPlannedEvents({
    coords,
    corridorName,
    targetMinute: minuteOfDay ? Number(minuteOfDay) : null,
  });

  res.json({
    eventsCount: events.length,
    canonicalCatalogCount: CANONICAL_PLANNED_EVENTS.length,
    events,
  });
});

router.get('/disruptions/metrics', (_req, res) => {
  res.json({
    activeDisruptedTrips: activeTripDisruptions.size,
    totalPlannedEvents: CANONICAL_PLANNED_EVENTS.length,
    timestamp: new Date().toISOString(),
  });
});

// ── 15. Phase 3: Safety & Risk Decision Intelligence ─────────────────────────
router.post('/trips/:id/safety/evaluate', (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  const journeyState = record ? record.state : req.body.journeyState;
  const travelerDna = record ? record.travelerDna : (req.body.travelerDna || {});

  if (!journeyState || !Array.isArray(journeyState.stops)) {
    return res.status(400).json({ error: 'Valid journeyState or active trip is required' });
  }

  const { signals = [], customSignal = null, minuteOfDay = null } = req.body || {};

  try {
    const evaluation = evaluateJourneySafety({
      tripId,
      journeyState,
      travelerDna,
      signals,
      customSignal,
      now: minuteOfDay ? Date.now() : Date.now(),
    });

    activeTripSafety.set(tripId, evaluation);

    // Append to audit history
    let history = tripSafetyHistory.get(tripId) || [];
    history = [evaluation, ...history].slice(0, 20);
    tripSafetyHistory.set(tripId, history);

    res.json(evaluation);
  } catch (err) {
    appLogger.error(`[intelligence/safety/evaluate] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/trips/:id/safety', (req, res) => {
  const tripId = req.params.id;
  const evaluation = activeTripSafety.get(tripId);
  if (!evaluation) {
    return res.json({
      tripId,
      safetyStatus: 'SAFE_TO_CONTINUE',
      activeSignalsCount: 0,
      signals: [],
      message: 'No safety alerts or evaluated risks for this trip.',
    });
  }
  res.json({ tripId, ...evaluation });
});

router.get('/trips/:id/safety/signals', (req, res) => {
  const tripId = req.params.id;
  const evaluation = activeTripSafety.get(tripId);
  const signals = evaluation?.primarySignal ? [evaluation.primarySignal] : [];
  res.json({
    tripId,
    signalsCount: signals.length,
    signals,
  });
});

router.get('/trips/:id/safety/history', (req, res) => {
  const tripId = req.params.id;
  const history = tripSafetyHistory.get(tripId) || [];
  res.json({
    tripId,
    historyCount: history.length,
    history,
  });
});

// ── 16. Phase 3: Controlled Safety Event Simulation ──────────────────────────
router.post('/trips/:id/safety/simulate', (req, res) => {
  const tripId = req.params.id;
  const record = activeTripsState.get(tripId);

  const journeyState = record ? record.state : req.body.journeyState;
  const travelerDna = record ? record.travelerDna : (req.body.travelerDna || {});

  if (!journeyState || !Array.isArray(journeyState.stops)) {
    return res.status(400).json({ error: 'Valid journeyState or active trip is required' });
  }

  const { scenario = 'HEAVY_RAIN_GHAT_LANDSLIDE' } = req.body || {};

  const evaluation = simulateSafetyEvent({
    tripId,
    journeyState,
    travelerDna,
    scenario,
  });

  activeTripSafety.set(tripId, evaluation);

  let history = tripSafetyHistory.get(tripId) || [];
  history = [evaluation, ...history].slice(0, 20);
  tripSafetyHistory.set(tripId, history);

  res.json({
    simulationNotice: 'Controlled Demonstration: Safety Reality Mutation Simulated',
    dataState: 'SIMULATED',
    scenario,
    safetyEvaluation: evaluation,
  });
});

// ── 17. Phase 3: Traveler Action on Safety Notification ───────────────────────
router.post('/trips/:id/safety/action', async (req, res) => {
  const tripId = req.params.id;
  const { notificationId, action, notes, adaptIfAccepted = true } = req.body || {};

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  const record = activeTripsState.get(tripId);
  const notifications = getTripNotifications(tripId);
  const target = notifications.find(n => n.notificationId === notificationId);

  if (target) {
    target.userAction = action;
    target.actionRecordedAt = new Date().toISOString();
    target.actionNotes = notes || null;
    target.status = 'ACTIONED';
  }

  let adaptationResult = null;
  // If user accepts safety recommendation and active trip state exists, execute adaptation
  if (action === 'ACCEPT' && adaptIfAccepted && record?.state) {
    try {
      const evaluation = activeTripSafety.get(tripId);
      const triggerReason = evaluation?.explanation?.primaryDriver || 'Accepted safer alternative route';
      adaptationResult = await adaptJourneyPlan({
        journeyState: record.state,
        travelerDna: record.travelerDna || {},
        context: { safety: evaluation || {} },
        triggerType: 'SAFETY_HAZARD',
        triggerReason,
        dbPool: getDbPool(),
      });

      if (adaptationResult?.newJourneyState) {
        record.state = adaptationResult.newJourneyState;
        activeTripsState.set(tripId, record);
      }
    } catch (err) {
      appLogger.warn(`[intelligence/safety/action] Auto-adaptation warning: ${err.message}`);
    }
  }

  // Check if resolution requested
  if (action === 'RESOLVE' || req.body.resolveCondition) {
    const resolution = resolveSafetyCondition({
      tripId,
      hazardId: target?.hazardId || req.body.hazardId || 'hazard_001',
      hazardType: target?.hazardType || req.body.hazardType || 'Safety condition',
    });
    return res.json({
      message: "Safety condition resolved.",
      notificationId: resolution.notification?.notificationId,
      action: 'RESOLVE',
      resolution,
    });
  }

  res.json({
    message: `Safety action '${action}' recorded.`,
    notificationId,
    action,
    adaptedPlan: adaptationResult ? {
      versionNumber: adaptationResult.versionNumber,
      changedStopsCount: adaptationResult.changedStops?.length || 0,
      preservedStopsCount: adaptationResult.preservedStops?.length || 0,
    } : null,
  });
});

// ── 18. Phase 3: Safety Sources, Providers & Metrics ─────────────────────────
router.get('/safety/sources', (_req, res) => {
  res.json({
    sourcesCount: 4,
    sources: [
      { id: 'NDMA_SACHET', name: 'NDMA SACHET Alert Service', tier: 'OFFICIAL_ACTIVE_WARNING', status: 'LIVE' },
      { id: 'IMD', name: 'IMD Warning & Nowcast Network', tier: 'OFFICIAL_ACTIVE_WARNING', status: 'LIVE' },
      { id: 'CWC', name: 'CWC Hydrological Advisory', tier: 'OFFICIAL_FORECAST', status: 'PARTIALLY_AVAILABLE' },
      { id: 'FSI', name: 'FSI & NASA FIRMS Thermal Hotspots', tier: 'HIGH_CONFIDENCE_LIVE_OBSERVATION', status: 'PARTIALLY_AVAILABLE' },
    ],
  });
});

router.get('/safety/providers', (_req, res) => {
  const providers = getSafetyProviders();
  res.json({
    providersCount: providers.length,
    providers,
    timestamp: new Date().toISOString(),
  });
});

router.get('/safety/metrics', (_req, res) => {
  const providers = getSafetyProviders();
  const liveCount = providers.filter(p => p.connectionStatus === 'LIVE' || p.status === 'LIVE' || p.status === 'CONNECTED').length;
  const partialCount = providers.filter(p => p.connectionStatus === 'PARTIALLY_AVAILABLE' || p.status === 'PARTIALLY_AVAILABLE' || p.status === 'PARTIALLY_CONNECTED').length;

  res.json({
    activeEvaluatedTrips: activeTripSafety.size,
    totalProvidersRegistered: providers.length,
    connectedProvidersCount: liveCount,
    liveProvidersCount: liveCount,
    partiallyConnectedCount: partialCount,
    partiallyAvailableCount: partialCount,
    timestamp: new Date().toISOString(),
  });
});

router.get('/trips/:id/safety/notifications', (req, res) => {
  const tripId = req.params.id;
  const allNotifications = getTripNotifications(tripId);
  const safetyNotifications = allNotifications.filter(n => n.category === 'SAFETY');
  res.json({
    tripId,
    notificationsCount: safetyNotifications.length,
    notifications: safetyNotifications,
  });
});

module.exports = router;
