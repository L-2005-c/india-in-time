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

// Active journey state registry (survives requests; syncs with DB if connected)
const activeTripsState = new Map();

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

module.exports = router;
