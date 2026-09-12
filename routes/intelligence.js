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
  productionLearningEngine,
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
const {
  evaluatePlaceExperienceWindow,
  evaluateOpportunityCost,
  evaluateExperienceValue,
  generateExperienceExplanation,
  recordExperienceOutcome,
  getTripExperienceOutcomes,
  computeExperienceAccuracyMetrics,
} = require('../services/travelIntelligence/experience');
const { dispatchExperienceNotification, dispatchTrustNotification } = require('../services/travelIntelligence/disruption');
const {
  touristTrustEngine,
  trustOutcomeTracker,
  trustObservability,
  TRUST_STATES,
} = require('../services/travelIntelligence/trust');
const {
  transitionLegStatus,
  getOrCreateJourneyChain,
  appendNextLeg,
  getJourneyLegHistory,
  getCurrentLeg,
  resolveDestinationIntent,
  DESTINATION_INTENTS,
  evaluateNextLegDecision,
  recordNextJourneyMetric,
  getNextJourneyMetrics,
} = require('../services/travelIntelligence/nextJourney');

// Active journey state registry (survives requests; syncs with DB if connected)
const activeTripsState = new Map();
// Active trip disruptions registry
const activeTripDisruptions = new Map();
// Active trip safety evaluations registry
const activeTripSafety = new Map();
const tripSafetyHistory = new Map();
// Active trip experience evaluations registry
const activeTripExperience = new Map();

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

// ── Trip Authorization Guard (Tenant & User Isolation) ──────────────────────
async function verifyTripAccess(req, res, next) {
  const tripId = req.params.id;
  if (!tripId) return next();

  // Check in-memory active trips registry
  const record = activeTripsState.get(tripId);
  const recordOwner = record?.ownerUid;

  if (recordOwner) {
    if (req.uid && req.uid !== recordOwner) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to access or mutate this journey.' });
    }
    if (!req.uid) {
      return res.status(401).json({ error: 'Authentication required to access this saved journey.' });
    }
  }

  // Check persistent DB trip if connected
  try {
    const { getTripById } = require('../db/queries');
    const dbTrip = await getTripById(tripId);
    if (dbTrip && dbTrip.user_id && dbTrip.user_id !== 'anonymous_guest') {
      if (req.uid && req.uid !== dbTrip.user_id) {
        return res.status(403).json({ error: 'Access denied: You do not have permission to access or mutate this trip.' });
      }
      if (!req.uid) {
        return res.status(401).json({ error: 'Authentication required to access this trip.' });
      }
    }
  } catch (_e) {
    // DB check skipped if offline
  }

  next();
}

router.use('/trips/:id', verifyTripAccess);

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
      travelerId: travelerId || req.uid,
      plan,
      initialLocation,
      startTimeMinutes,
    });

    const ownerUid = req.uid || null;
    activeTripsState.set(tripId, {
      state,
      travelerDna: sanitizeDnaProfile(travelerDna || dna),
      ownerUid,
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

    const isTripFinished = updatedState.upcomingStops.length === 0 && !updatedState.activeStop;
    if (isTripFinished) {
      updatedState.isCompleted = true;
      updatedState.nextIntentRequired = true;
      try {
        const chain = getOrCreateJourneyChain(tripId, {
          city: record.state.city || 'Active Trip',
          stops: updatedState.stops,
          status: 'COMPLETED',
        });
        if (chain.legs[0] && chain.legs[0].status !== 'COMPLETED') {
          chain.legs[0] = transitionLegStatus(chain.legs[0], 'COMPLETED');
        }
      } catch (_chainErr) {
        // chain initialization fallback
      }
    }

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
      isCompleted: Boolean(isTripFinished),
      nextIntentRequired: Boolean(isTripFinished),
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
  const {
    decisionId,
    outcome,
    notes,
    legId,
    cohortId,
    decisionType,
    recommendation,
    travelerAction,
    feedback,
    dataState,
    providerContext,
    latencyMs,
    isReversal,
    isOverride,
    isFalsePositive,
    falsePositiveCause,
    isFalseNegative,
    falseNegativeCause,
    isSafetyEscalation,
  } = req.body || {};
  if (!decisionId) {
    return res.status(400).json({ error: 'decisionId is required' });
  }

  const result = recordDecisionOutcome(decisionId, outcome || 'ACCEPTED', notes, {
    tripId: req.params.id,
    legId,
    cohortId,
    decisionType,
    recommendation,
    travelerAction,
    feedback,
    dataState,
    providerContext,
    latencyMs,
    isReversal,
    isOverride,
    isFalsePositive,
    falsePositiveCause,
    isFalseNegative,
    falseNegativeCause,
    isSafetyEscalation,
  });
  res.json(result);
});

// Decision audit trail history for a trip
router.get('/trips/:id/decision/history', (req, res) => {
  const tripId = req.params.id;
  const history = getTripDecisionHistory(tripId);
  res.json({ tripId, decisionsCount: history.length, history });
});

// Operational metrics of the decision engine (including Phase 9A Section 8 metrics)
router.get('/decisions/metrics', (_req, res) => {
  const metrics = getDecisionMetrics();
  res.json(metrics);
});

// Phase 9A Pilot Learning: Detailed Decision Quality Metrics (10 metrics)
router.get('/pilot/metrics', (_req, res) => {
  const metrics = productionLearningEngine.getDecisionQualityMetrics();
  res.json(metrics);
});

// Phase 9A Pilot Learning: Record Alert Timeliness Latencies (Section 12)
router.post('/pilot/timeliness', (req, res) => {
  try {
    const latencies = productionLearningEngine.recordAlertTimeliness(req.body || {});
    res.json({ success: true, latencies });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Phase 9A Pilot Learning: Record Source Disagreement (Section 14)
router.post('/pilot/disagreement', (req, res) => {
  try {
    const record = productionLearningEngine.recordSourceDisagreement(req.body || {});
    res.json({ success: true, record });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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

// ── 19. Phase 4: Experience Value Intelligence Endpoints ─────────────────────

/**
 * Evaluates candidate experiences and computes optimized recommendations.
 */
router.post(['/experience/evaluate', '/trips/:id/experience/evaluate'], async (req, res) => {
  try {
    const tripId = req.params.id || req.body.tripId || 'default_trip';
    let journeyState = req.body.journeyState || activeTripsState.get(tripId);
    if (!journeyState && req.body.stops) {
      journeyState = createJourneyState({ tripId, plan: { stops: req.body.stops } });
    }
    if (!journeyState) {
      journeyState = createJourneyState({ tripId, plan: [] });
    }

    const travelerDna = req.body.travelerDna || {};
    const cityName = req.body.cityName || req.body.city || 'visakhapatnam';
    const currentMinute = req.body.currentMinute != null ? Number(req.body.currentMinute) : journeyState.currentMinute;
    const candidatePool = req.body.candidatePool || req.body.candidates || [];
    const weather = req.body.weather || null;
    const traffic = req.body.traffic || null;
    const activeHazards = req.body.activeHazards || journeyState.activeHazards || [];

    const previousResult = activeTripExperience.get(tripId);
    const previousRecs = previousResult ? previousResult.recommendations : null;

    const evalResult = evaluateExperienceValue({
      journeyState,
      travelerDna,
      weather,
      traffic,
      activeHazards,
      candidatePool,
      cityName,
      currentMinute,
      previousRecommendations: previousRecs,
    });

    // Enrich recommendations with explanation
    evalResult.recommendations = evalResult.recommendations.map(rec => {
      const explanation = generateExperienceExplanation(rec, {
        timeBudget: evalResult.timeBudget,
        weather,
        dna: travelerDna,
      });
      return {
        ...rec,
        explanation,
      };
    });

    if (evalResult.primaryRecommendation) {
      evalResult.primaryRecommendation.explanation = generateExperienceExplanation(
        evalResult.primaryRecommendation,
        { timeBudget: evalResult.timeBudget, weather, dna: travelerDna }
      );

      // Dispatch proactive notification if high value
      if (evalResult.primaryRecommendation.compositeScore >= 70) {
        dispatchExperienceNotification({
          tripId,
          recommendation: evalResult.primaryRecommendation,
          explanation: evalResult.primaryRecommendation.explanation,
          timeBudget: evalResult.timeBudget,
        });
      }
    }

    activeTripExperience.set(tripId, evalResult);

    const pool = getDbPool();
    if (pool) {
      pool.query(
        `INSERT INTO experience_evaluations (id, trip_id, current_minute, usable_time_minutes, budget_state, top_recommendation, payload_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET payload_json = $7`,
        [
          `eval_${tripId}_${Date.now()}`,
          tripId,
          currentMinute || 540,
          evalResult.timeBudget.usableExperienceMinutes,
          evalResult.timeBudget.budgetClassification,
          evalResult.primaryRecommendation?.candidate?.name || null,
          JSON.stringify(evalResult),
        ]
      ).catch(err => appLogger.warn('Failed to persist experience evaluation to DB', { error: err.message }));
    }

    res.json({
      success: true,
      evaluation: evalResult,
    });
  } catch (err) {
    appLogger.error('Error evaluating experience value', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * Retrieves active experience recommendations for a trip.
 */
router.get(['/experience/recommendations', '/trips/:id/experience/recommendations'], (req, res) => {
  const tripId = req.params.id || req.query.tripId || 'default_trip';
  const cached = activeTripExperience.get(tripId);
  if (cached) {
    return res.json({
      tripId,
      timeBudget: cached.timeBudget,
      primaryRecommendation: cached.primaryRecommendation,
      recommendations: cached.recommendations,
      sequencePlan: cached.sequencePlan,
      divergenceAnalysis: cached.divergenceAnalysis,
      evaluatedAt: cached.evaluatedAt,
    });
  }

  const state = activeTripsState.get(tripId);
  if (!state) {
    return res.json({
      tripId,
      recommendations: [],
      message: 'No active experience evaluation for trip',
    });
  }

  const evalResult = evaluateExperienceValue({ journeyState: state });
  activeTripExperience.set(tripId, evalResult);
  res.json({
    tripId,
    timeBudget: evalResult.timeBudget,
    primaryRecommendation: evalResult.primaryRecommendation,
    recommendations: evalResult.recommendations,
    sequencePlan: evalResult.sequencePlan,
    divergenceAnalysis: evalResult.divergenceAnalysis,
    evaluatedAt: evalResult.evaluatedAt,
  });
});

/**
 * Traveler records an experience decision (ACCEPT, REJECT, DEFER, MODIFY).
 */
router.post(['/experience/decide', '/trips/:id/experience/decide'], async (req, res) => {
  try {
    const tripId = req.params.id || req.body.tripId || 'default_trip';
    const { recommendationId, placeId, placeCategory, actionTaken, actualDwellMinutes, travelerRating, feedbackText, travelerDna } = req.body;

    if (!placeId) {
      return res.status(400).json({ error: 'placeId is required' });
    }

    const outcome = recordExperienceOutcome({
      tripId,
      recommendationId,
      placeId,
      placeCategory,
      actionTaken: actionTaken || 'ACCEPTED',
      actualDwellMinutes,
      travelerRating,
      feedbackText,
      travelerDna: travelerDna || {},
    });

    const pool = getDbPool();
    if (pool) {
      pool.query(
        `INSERT INTO experience_outcomes (id, trip_id, recommendation_id, place_id, action_taken, actual_dwell_minutes, traveler_rating, feedback_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          outcome.outcome.id,
          tripId,
          recommendationId || null,
          placeId,
          actionTaken || 'ACCEPTED',
          actualDwellMinutes || null,
          travelerRating || null,
          feedbackText || null,
        ]
      ).catch(err => appLogger.warn('Failed to insert experience outcome to DB', { error: err.message }));
    }

    let planUpdate = null;
    if ((actionTaken || 'ACCEPTED') === 'ACCEPTED' && activeTripsState.has(tripId)) {
      const record = activeTripsState.get(tripId);
      const state = record?.state || record;
      if (state && Array.isArray(state.stops)) {
        // Completed and skipped stops remain strictly immutable
        const completedStops = state.stops.filter(s => s.status === 'COMPLETED' || s.status === 'SKIPPED');
        const uncompletedStops = state.stops.filter(s => s.status !== 'COMPLETED' && s.status !== 'SKIPPED');

        // Resequence upcoming stops: prioritize accepted place
        let reorderedUpcoming = [];
        const existingIdx = uncompletedStops.findIndex(s => s.id === placeId);
        if (existingIdx >= 0) {
          const target = { ...uncompletedStops[existingIdx], status: 'PLANNED' };
          const others = uncompletedStops.filter((_, idx) => idx !== existingIdx);
          reorderedUpcoming = [target, ...others];
        } else {
          // New candidate stop added to plan
          const newStop = {
            id: placeId,
            name: req.body.placeName || (placeId.charAt(0).toUpperCase() + placeId.slice(1).replace(/_/g, ' ')),
            cat: placeCategory || 'attraction',
            status: 'PLANNED',
            visitMinutes: Number(actualDwellMinutes || 60),
            lat: Number(req.body.lat || 17.6868),
            lon: Number(req.body.lon || 83.2185),
          };
          reorderedUpcoming = [newStop, ...uncompletedStops];
        }

        const newStopsList = [...completedStops, ...reorderedUpcoming];
        const newPlanVersion = (state.activePlanVersion || 1) + 1;

        await commitPlanVersion({
          tripId,
          versionNumber: newPlanVersion,
          triggerType: 'EXPERIENCE_PRIORITIZATION',
          triggerReason: `Traveler prioritized recommended experience '${placeId}'`,
          plan: newStopsList,
          changedStops: [{ stopId: placeId, action: 'PRIORITIZE' }],
          preservedStops: completedStops.map(s => s.id),
          confidence: 'HIGH',
          dbPool: pool,
        });

        state.activePlanVersion = newPlanVersion;
        state.stops = newStopsList;
        state.completedStops = completedStops;
        state.upcomingStops = reorderedUpcoming.filter(s => s.status === 'PLANNED');
        state.activeStop = reorderedUpcoming.find(s => s.status === 'PLANNED') || null;

        planUpdate = {
          newPlanVersion,
          activePlanVersion: newPlanVersion,
          resequencedStops: newStopsList,
          preservedStops: completedStops.map(s => s.id),
          activeStop: state.activeStop,
        };
      }
    }

    res.json({
      ...outcome,
      ...(planUpdate || {}),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Computes downstream opportunity cost for a specific candidate place.
 */
router.get(['/experience/opportunity-cost', '/trips/:id/experience/opportunity-cost'], (req, res) => {
  const tripId = req.params.id || req.query.tripId || 'default_trip';
  const journeyState = activeTripsState.get(tripId) || null;

  const candidate = {
    id: req.query.placeId || 'candidate_poi',
    name: req.query.name || 'Candidate Stop',
    lat: Number(req.query.lat) || 17.6868,
    lon: Number(req.query.lon) || 83.2185,
    visitMinutes: Number(req.query.visitMinutes) || 45,
    cat: req.query.cat || 'scenic',
  };

  const oppCost = evaluateOpportunityCost({
    candidate,
    journeyState: journeyState || { currentMinute: Number(req.query.currentMinute) || 540, stops: [] },
  });

  res.json({
    tripId,
    candidateId: candidate.id,
    opportunityCost: oppCost,
  });
});

/**
 * Temporal experience windows evaluation for a place across time.
 */
router.get(['/experience/windows', '/trips/:id/experience/windows'], (req, res) => {
  const place = {
    id: req.query.placeId || 'poi',
    name: req.query.name || 'Attraction',
    lat: Number(req.query.lat) || 17.6868,
    lon: Number(req.query.lon) || 83.2185,
    cat: req.query.cat || 'scenic',
    ot: req.query.ot || null,
    ct: req.query.ct || null,
    visitMinutes: Number(req.query.visitMinutes) || 60,
    is_sunset_spot: req.query.is_sunset_spot === 'true',
    is_sunrise_spot: req.query.is_sunrise_spot === 'true',
  };

  const currentMinute = req.query.currentMinute != null ? Number(req.query.currentMinute) : 600;
  const windowEval = evaluatePlaceExperienceWindow(place, {
    currentMinute,
  });

  res.json(windowEval);
});

/**
 * Post-visit feedback and rating.
 */
router.post(['/experience/feedback', '/trips/:id/experience/feedback'], async (req, res) => {
  try {
    const tripId = req.params.id || req.body.tripId || 'default_trip';
    const { placeId, placeCategory, travelerRating, actualDwellMinutes, feedbackText, travelerDna } = req.body;

    if (!placeId) {
      return res.status(400).json({ error: 'placeId is required' });
    }

    const outcome = recordExperienceOutcome({
      tripId,
      placeId,
      placeCategory,
      actionTaken: 'ACCEPTED',
      travelerRating,
      actualDwellMinutes,
      feedbackText,
      travelerDna: travelerDna || {},
    });

    res.json(outcome);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Trip experience outcomes and accuracy metrics.
 */
router.get(['/experience/outcomes', '/trips/:id/experience/outcomes'], (req, res) => {
  const tripId = req.params.id || req.query.tripId || 'default_trip';
  const outcomes = getTripExperienceOutcomes(tripId);
  const metrics = computeExperienceAccuracyMetrics(tripId);

  res.json({
    tripId,
    outcomesCount: outcomes.length,
    outcomes,
    metrics,
  });
});

// ============================================================================
// PHASE 5: TOURIST TRUST INTELLIGENCE API ENDPOINTS
// ============================================================================

/**
 * 1. POST /trust/evaluate
 * Master multi-dimensional trust evaluation for any travel object.
 */
router.post(['/trust/evaluate', '/trips/:id/trust/evaluate'], async (req, res) => {
  const startTime = Date.now();
  try {
    const tripId = req.params.id || req.body.tripId || 'active_trip';
    const { target, context = {}, isSimulated = false } = req.body;

    if (!target) {
      return res.status(400).json({ error: 'target object is required for trust evaluation' });
    }

    const evaluation = await touristTrustEngine.evaluateTrust(target, context);
    const latencyMs = Date.now() - startTime;

    // Record telemetry
    trustObservability.recordEvaluation({
      isSimulated: Boolean(isSimulated),
      objectType: evaluation.objectType,
      trustState: evaluation.overallTrustState,
      hasRouteConflict: evaluation.overallTrustState === 'CONFLICTED' && evaluation.subEvaluations?.route?.trustState === 'ROUTE_CONFLICT',
      safetyOverride: Boolean(evaluation.safetyOverrideActive),
      registryVerifications: evaluation.subEvaluations?.provider?.verifications || [],
      latencyMs,
    });

    // Proactive Trust Notification if high discrepancy or conflicted
    if (evaluation.overallTrustState === TRUST_STATES.CONFLICTED || evaluation.overallTrustState === TRUST_STATES.HIGH_RISK) {
      dispatchTrustNotification({
        tripId,
        entityId: target.id || 'target_entity',
        entityName: target.name || 'Travel Target',
        trustEvaluation: evaluation,
        severity: evaluation.overallTrustState === TRUST_STATES.CONFLICTED ? 'WARNING' : 'WATCH',
      });
    }

    res.json(evaluation);
  } catch (err) {
    appLogger.error(`[Trust API] Error evaluating trust: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. GET /trust/entity/:id
 * Detailed trust profile for an entity (Place or Provider).
 */
router.get('/trust/entity/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, city, type = 'PLACE' } = req.query;

    const evaluation = await touristTrustEngine.evaluateTrust({
      id,
      name: name || id,
      type,
      city,
    });

    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. GET /trust/evidence/:id
 * Claim-level evidence graph with sources, freshness, and provenance.
 */
router.get('/trust/evidence/:id', (req, res) => {
  try {
    const { id } = req.params;
    const claims = touristTrustEngine.evidenceGraph.getClaimsForEntity(id);
    const graphSummary = touristTrustEngine.evidenceGraph.getGraphSummary();

    res.json({
      entityId: id,
      claimsCount: claims.length,
      claims,
      graphSummary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. GET & POST /trust/price/:id /trust/price/evaluate
 * Decomposes price into 11 components, transparency tier, surge vs anomaly.
 */
router.all(['/trust/price/:id', '/trust/price/evaluate'], (req, res) => {
  try {
    const quote = req.method === 'POST' ? req.body.quote || req.body : req.query;
    const benchmark = req.method === 'POST' ? req.body.benchmark || {} : {};

    const priceEval = touristTrustEngine.priceEngine.evaluatePrice(quote, benchmark);
    res.json(priceEval);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. GET & POST /trust/provider/:id /trust/provider/evaluate
 * Evaluates provider legitimacy across official registries, associations, and operational signals.
 */
router.all(['/trust/provider/:id', '/trust/provider/evaluate'], async (req, res) => {
  try {
    const provider = req.method === 'POST'
      ? req.body.provider || req.body
      : { id: req.params.id, ...req.query };

    const providerEval = await touristTrustEngine.providerEngine.evaluateProvider(provider);
    res.json(providerEval);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. GET & POST /trust/route/:id /trust/route/evaluate
 * Evaluates route feasibility and detects map vs official closure contradictions.
 */
router.all(['/trust/route/:id', '/trust/route/evaluate'], (req, res) => {
  try {
    const routeData = req.method === 'POST'
      ? req.body.routeData || req.body
      : { routeId: req.params.id, ...req.query };

    const routeEval = touristTrustEngine.routeEngine.evaluateRoute(routeData);
    res.json(routeEval);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. POST /trust/report
 * Traveler problem report (pricing mismatch, closed facility, misleading listing).
 */
router.post('/trust/report', (req, res) => {
  try {
    const { evaluationId, entityId, travelerId, outcomeType, notes, evidenceDetails } = req.body;

    if (!entityId || !outcomeType) {
      return res.status(400).json({ error: 'entityId and outcomeType are required' });
    }

    const outcome = trustOutcomeTracker.recordOutcome({
      evaluationId,
      entityId,
      travelerId,
      outcomeType,
      notes,
      evidenceDetails,
    });

    res.json(outcome);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 8. POST /trust/action
 * Records traveler action taken on trust advisories.
 */
router.post('/trust/action', (req, res) => {
  try {
    const { tripId = 'active_trip', entityId, action, notes } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    res.json({
      recorded: true,
      tripId,
      entityId,
      action,
      timestamp: new Date().toISOString(),
      notes: notes || '',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 9. GET /trust/history
 * Dispute, outcome, and evaluation history for an entity or trip.
 */
router.get('/trust/history', (req, res) => {
  try {
    const { entityId, limit = 50 } = req.query;

    if (entityId) {
      const stats = trustOutcomeTracker.getEntityStats(entityId);
      return res.json({ entityId, stats });
    }

    const recent = trustOutcomeTracker.getRecentOutcomes(Number(limit));
    res.json({ count: recent.length, outcomes: recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 10. GET /trust/metrics
 * Observability telemetry separating LIVE from SIMULATED metrics.
 */
router.get('/trust/metrics', (_req, res) => {
  try {
    const metrics = trustObservability.getMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 6: NEXT JOURNEY INTELLIGENCE (Return, Stay & Next-Destination)
// ═════════════════════════════════════════════════════════════════════════════

const activeNextIntents = new Map();
const activeNextEvaluations = new Map();

/**
 * 1. POST /trips/:id/next-leg/intent
 * Captures traveler next destination intent.
 */
router.post('/trips/:id/next-leg/intent', async (req, res) => {
  try {
    const tripId = req.params.id;
    const { intentType, rawInput, userProfile, isSimulated } = req.body || {};

    if (!intentType) {
      return res.status(400).json({ error: 'intentType is required' });
    }

    recordNextJourneyMetric('next_leg_intent_count', isSimulated);
    const intentKey = String(intentType).toLowerCase();
    if (intentKey.includes('home')) recordNextJourneyMetric('home_selection', isSimulated);
    else if (intentKey.includes('hotel') || intentKey.includes('stay')) recordNextJourneyMetric('hotel_selection', isSimulated);
    else if (intentKey.includes('restaurant') || intentKey.includes('food')) recordNextJourneyMetric('restaurant_selection', isSimulated);
    else if (intentKey.includes('airport')) recordNextJourneyMetric('airport_selection', isSimulated);
    else if (intentKey.includes('rail') || intentKey.includes('train')) recordNextJourneyMetric('rail_selection', isSimulated);
    else if (intentKey.includes('bus')) recordNextJourneyMetric('bus_selection', isSimulated);
    else recordNextJourneyMetric('custom_destination_selection', isSimulated);

    const record = activeTripsState.get(tripId);
    const currentLocation = record?.state?.currentLocation || null;

    const resolution = await resolveDestinationIntent({
      intentType,
      rawInput,
      currentLocation,
      userProfile,
      tripContext: { city: record?.state?.city, activeHotel: record?.state?.activeHotel },
    });

    const storedIntent = {
      tripId,
      intentType,
      rawInput,
      resolution,
      capturedAt: new Date().toISOString(),
      isSimulated: Boolean(isSimulated),
    };

    activeNextIntents.set(tripId, storedIntent);

    res.json(storedIntent);
  } catch (err) {
    appLogger.error(`[intelligence/next-leg/intent] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. GET /trips/:id/next-leg/intents
 * Lists supported next destination intents.
 */
router.get('/trips/:id/next-leg/intents', (_req, res) => {
  res.json({
    intents: Object.keys(DESTINATION_INTENTS),
    categories: [
      { id: DESTINATION_INTENTS.RETURN_HOME, icon: '🏠', label: 'Home' },
      { id: DESTINATION_INTENTS.GO_TO_HOTEL, icon: '🏨', label: 'Hotel / Stay' },
      { id: DESTINATION_INTENTS.GO_TO_RESTAURANT, icon: '🍽️', label: 'Food & Dining' },
      { id: DESTINATION_INTENTS.GO_TO_AIRPORT, icon: '✈️', label: 'Airport' },
      { id: DESTINATION_INTENTS.GO_TO_RAILWAY_STATION, icon: '🚆', label: 'Railway Station' },
      { id: DESTINATION_INTENTS.GO_TO_BUS_STATION, icon: '🚌', label: 'Bus Station' },
      { id: DESTINATION_INTENTS.CONTINUE_TO_DESTINATION, icon: '📍', label: 'Another Destination' },
      { id: DESTINATION_INTENTS.CUSTOM_DESTINATION, icon: '✏️', label: 'Custom Location' },
      { id: DESTINATION_INTENTS.END_JOURNEY, icon: '🛑', label: 'End Journey' },
    ],
  });
});

/**
 * 3. POST /trips/:id/next-leg/evaluate
 * Master next-leg evaluation returning ranked candidates and explainability contract.
 */
router.post('/trips/:id/next-leg/evaluate', async (req, res) => {
  try {
    const tripId = req.params.id;
    const {
      intentType = DESTINATION_INTENTS.GO_TO_HOTEL,
      rawInput = '',
      currentMinute = 1140,
      nextDayPlans = null,
      userProfile = {},
      activeSafetyAlerts = [],
      isSimulated = false,
    } = req.body || {};

    recordNextJourneyMetric('next_leg_evaluation_count', isSimulated);

    const record = activeTripsState.get(tripId);
    const currentLocation = req.body.currentLocation || record?.state?.currentLocation || null;

    const evaluation = await evaluateNextLegDecision({
      tripId,
      currentLocation,
      intentType,
      rawInput,
      currentMinute,
      nextDayPlans,
      userProfile,
      tripContext: {
        city: record?.state?.city,
        activeHotel: record?.state?.activeHotel,
        weather: record?.state?.weather || {},
      },
      activeSafetyAlerts,
      isSimulated,
    });

    activeNextEvaluations.set(tripId, evaluation);

    res.json(evaluation);
  } catch (err) {
    appLogger.error(`[intelligence/next-leg/evaluate] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. GET /trips/:id/next-leg/options
 * Returns evaluated options for active trip next-leg.
 */
router.get('/trips/:id/next-leg/options', (req, res) => {
  const tripId = req.params.id;
  const evaluation = activeNextEvaluations.get(tripId);

  if (!evaluation) {
    return res.status(404).json({ error: `No active next-leg evaluation found for trip '${tripId}'` });
  }

  res.json({
    tripId,
    decision: evaluation.decision,
    recommendedDestination: evaluation.recommendedDestination,
    candidates: evaluation.candidates,
    overnightAssessment: evaluation.overnightAssessment,
    explanation: evaluation.explanation,
  });
});

/**
 * 5. POST /trips/:id/next-leg/decide
 * Traveler decides on next leg: ACCEPT, DECLINE, or END_JOURNEY.
 * Immutability invariant: Completed Leg 1 remains permanently untouched!
 */
router.post('/trips/:id/next-leg/decide', async (req, res) => {
  try {
    const tripId = req.params.id;
    const { action = 'ACCEPT', candidateId, destination, intentType, isSimulated } = req.body || {};

    recordNextJourneyMetric('next_leg_decision_count', isSimulated);

    if (action === 'END_JOURNEY') {
      return res.json({
        tripId,
        action: 'END_JOURNEY',
        message: 'Traveler concluded journey.',
        concludedAt: new Date().toISOString(),
      });
    }

    if (action !== 'ACCEPT') {
      return res.json({
        tripId,
        action,
        message: `Action '${action}' recorded.`,
      });
    }

    // Get or initialize journey chain
    const chain = getOrCreateJourneyChain(tripId);

    // If Leg 1 exists and is not completed, transition it to COMPLETED
    if (chain.legs.length > 0 && chain.legs[0].status !== 'COMPLETED') {
      chain.legs[0] = transitionLegStatus(chain.legs[0], 'COMPLETED');
    }

    // Target destination
    const evalData = activeNextEvaluations.get(tripId);
    const chosenCandidate = (evalData?.candidates || []).find(c => c.id === candidateId) ||
      evalData?.recommendedDestination ||
      (destination ? { name: destination.name, ...destination } : { name: 'Next Destination' });

    // Append new Leg (Leg 2, Leg 3, etc.)
    const nextLeg = appendNextLeg(tripId, {
      destination: {
        id: chosenCandidate.id || `dest_${Date.now()}`,
        name: chosenCandidate.name,
        lat: chosenCandidate.lat,
        lon: chosenCandidate.lon,
        city: chosenCandidate.city,
      },
      destinationIntent: intentType || evalData?.intentType || 'CONTINUE_TO_DESTINATION',
      status: 'ACTIVE',
      plan: {
        stops: [
          {
            id: chosenCandidate.id || `stop_${Date.now()}`,
            name: chosenCandidate.name,
            lat: chosenCandidate.lat,
            lon: chosenCandidate.lon,
            plannedDurationMinutes: 60,
            status: 'PLANNED',
          },
        ],
      },
      stops: [
        {
          id: chosenCandidate.id || `stop_${Date.now()}`,
          name: chosenCandidate.name,
          lat: chosenCandidate.lat,
          lon: chosenCandidate.lon,
          plannedDurationMinutes: 60,
          status: 'ACTIVE',
        },
      ],
    });

    recordNextJourneyMetric('next_leg_creation_count', isSimulated);

    // Update active trip state with new leg plan
    const record = activeTripsState.get(tripId) || { state: {} };
    record.state.activeLegId = nextLeg.legId;
    record.state.activePlanVersion = 1;
    record.state.activeStop = nextLeg.stops[0];
    record.state.upcomingStops = [];
    record.state.isCompleted = false;
    record.state.nextIntentRequired = false;
    activeTripsState.set(tripId, record);

    // Commit Plan v1 for new leg
    await commitPlanVersion({
      tripId,
      versionNumber: 1,
      triggerType: 'NEXT_LEG_STARTED',
      triggerReason: `Started Leg ${nextLeg.legNumber} to ${nextLeg.destination.name}`,
      plan: nextLeg.plan,
      confidence: 'HIGH',
      dbPool: getDbPool(),
    });

    res.json({
      message: `Next journey leg started (${nextLeg.destination.name})`,
      tripId,
      leg: nextLeg,
      planVersion: 1,
      priorLegsCount: chain.legs.length - 1,
      immutabilityAudit: 'Prior completed legs remain strictly immutable.',
    });
  } catch (err) {
    appLogger.error(`[intelligence/next-leg/decide] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. GET /journeys/:id/legs
 * Retrieves all ordered legs in a journey chain with immutable history.
 */
router.get('/journeys/:id/legs', (req, res) => {
  try {
    const journeyId = req.params.id;
    const legs = getJourneyLegHistory(journeyId);
    res.json({ journeyId, count: legs.length, legs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. GET /journeys/:id/current-leg
 * Retrieves currently active or latest leg in a journey chain.
 */
router.get('/journeys/:id/current-leg', (req, res) => {
  try {
    const journeyId = req.params.id;
    const current = getCurrentLeg(journeyId);
    if (!current) {
      return res.status(404).json({ error: `No active leg found for journey '${journeyId}'` });
    }
    res.json({ journeyId, currentLeg: current });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8. POST /journeys/:id/legs
 * Appends a new leg to a journey chain.
 */
router.post('/journeys/:id/legs', (req, res) => {
  try {
    const journeyId = req.params.id;
    const nextLegOptions = req.body || {};
    const newLeg = appendNextLeg(journeyId, nextLegOptions);
    res.status(201).json({ journeyId, leg: newLeg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 9. POST /journeys/:id/legs/:legId/complete
 * Completes a journey leg and transitions it to immutable COMPLETED status.
 */
router.post('/journeys/:id/legs/:legId/complete', (req, res) => {
  try {
    const { id: journeyId, legId } = req.params;
    const chain = getOrCreateJourneyChain(journeyId);
    const target = chain.legs.find(l => l.legId === legId);

    if (!target) {
      return res.status(404).json({ error: `Leg '${legId}' not found in journey '${journeyId}'` });
    }

    const completedLeg = transitionLegStatus(target, 'COMPLETED');
    const idx = chain.legs.findIndex(l => l.legId === legId);
    chain.legs[idx] = completedLeg;

    recordNextJourneyMetric('next_leg_completion_count');

    res.json({
      message: `Leg '${legId}' completed and permanently sealed.`,
      journeyId,
      completedLeg,
      nextIntentRequired: true,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 10. GET /next-journey/metrics
 * Telemetry counters separating LIVE from SIMULATED metrics.
 */
router.get('/next-journey/metrics', (_req, res) => {
  try {
    const metrics = getNextJourneyMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

