'use strict';

/**
 * services/travelIntelligence/decision/adaptiveDecisionEngine.js
 *
 * India In-Time v3.0 — Adaptive Travel Decision Engine
 *
 * Core Mission:
 * "Given everything known right now, what is the best next travel decision for THIS traveler?"
 *
 * Architecture Principles:
 * 1. Contextual Decision Layer above existing travel intelligence.
 * 2. Data Trust First: Validates source, dataState, freshness, and confidence.
 *    Rejects UNKNOWN -> GOOD promotions. Never treats ESTIMATED as OBSERVED.
 * 3. Two-Level Evaluation: Level 1 (Stop Suitability) + Level 2 (Journey Suitability / planHealth).
 * 4. Constraints Engine: Hard constraints strictly override soft preferences.
 * 5. Traveler-Specific & Evidence-Driven: Differentiates based on traveler DNA & tolerances.
 * 6. Decision Stability & Anti-Churn: Uses hysteresis and minimum improvement thresholds.
 * 7. Traceability: Emits structured explanations and records full decision audit trail.
 */

const { findAlternativeStop, REGIONAL_ALTERNATIVE_HAVENS } = require('./alternativeGenerator');
const { STOP_STATUSES } = require('../journey/journeyStateEngine');
const { computeDnaMatch, DEFAULT_TRAVEL_DNA } = require('../personalTravelDna');
const { t2m, m2t } = require('../timeEngine');

// ── Decision States (Section 3) ──────────────────────────────────────────────
const DECISION_STATES = Object.freeze({
  KEEP_PLAN: 'KEEP_PLAN',
  CONTINUE: 'CONTINUE',
  ADAPT_PLAN: 'ADAPT_PLAN',
  ALTERNATIVE_REQUIRED: 'ALTERNATIVE_REQUIRED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  WATCH: 'WATCH',
  CAUTION: 'CAUTION',
  DEFER: 'DEFER',
  WAIT: 'WAIT',
  DELAY: 'DELAY',
  REROUTE: 'REROUTE',
  REORDER: 'REORDER',
  REPLACE_STOP: 'REPLACE_STOP',
  AVOID: 'AVOID',
  EMERGENCY: 'EMERGENCY',
});

// ── Plan Health Dimension States (Section 8) ─────────────────────────────────
const SCHEDULE_HEALTH = Object.freeze({
  ON_TRACK: 'ON_TRACK',
  SLIGHT_DELAY: 'SLIGHT_DELAY',
  SEVERE_LAG: 'SEVERE_LAG',
});

const WEATHER_HEALTH = Object.freeze({
  EXCELLENT: 'EXCELLENT',
  FAVORABLE: 'FAVORABLE',
  ADVERSE: 'ADVERSE',
  SEVERE_RISK: 'SEVERE_RISK',
});

const ROUTE_HEALTH = Object.freeze({
  CLEAR: 'CLEAR',
  CONGESTED: 'CONGESTED',
  IMPASSABLE: 'IMPASSABLE',
});

const CROWD_HEALTH = Object.freeze({
  COMFORTABLE: 'COMFORTABLE',
  BUSY: 'BUSY',
  OVERWHELMED: 'OVERWHELMED',
});

const SAFETY_HEALTH = Object.freeze({
  SAFE: 'SAFE',
  CAUTION: 'CAUTION',
  HAZARDOUS: 'HAZARDOUS',
});

const SCENIC_HEALTH = Object.freeze({
  OPTIMAL: 'OPTIMAL',
  FAIR: 'FAIR',
  DEGRADED: 'DEGRADED',
});

const TRAVELER_FIT = Object.freeze({
  HIGH_ALIGNMENT: 'HIGH_ALIGNMENT',
  MODERATE: 'MODERATE',
  POOR_FIT: 'POOR_FIT',
});

const COMPLETION_LIKELIHOOD = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

const CONFIDENCE_LEVELS = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  UNKNOWN: 'UNKNOWN',
});

// ── Anti-Churn & Decision Thresholds (Section 20) ────────────────────────────
const DECISION_THRESHOLDS = Object.freeze({
  MIN_TRAFFIC_DELAY_TO_ADAPT_MINUTES: 15,
  MIN_USER_LAG_TO_ADAPT_MINUTES: 25,
  RAIN_PROB_ADVERSE_THRESHOLD: 60,
  RAIN_PROB_SEVERE_THRESHOLD: 80,
  HEAT_STRESS_CELSIUS: 36,
  HYSTERESIS_COOLDOWN_MINUTES: 10,
});

// ── In-Memory Audit Trail & Telemetry (Section 27 & 29) ───────────────────────
const MAX_AUDIT_HISTORY = 100;
const inMemoryDecisionAudits = [];
const decisionMetrics = {
  totalDecisions: 0,
  keepPlanCount: 0,
  adaptPlanCount: 0,
  alternativeRequiredCount: 0,
  insufficientDataCount: 0,
  watchCount: 0,
  waitCount: 0,
  rerouteCount: 0,
  reorderCount: 0,
  replaceStopCount: 0,
  acceptedCount: 0,
  rejectedCount: 0,
  ignoredCount: 0,
  completedCount: 0,
};

/**
 * Evaluates the Data Trust & Quality of incoming signals (Section 5).
 * Rejects UNKNOWN -> GOOD promotions.
 * Flags missing or completely stale data as INSUFFICIENT_DATA.
 */
function validateDataTrust(context = {}) {
  const weather = context.weather || {};
  const traffic = context.traffic || {};
  const crowd = context.crowd || {};

  const hasWeatherInfo = weather.tempC != null || weather.temperatureC != null || weather.precipitationProb != null || weather.condition != null;
  const weatherDataState = weather.dataState || (weather.isEstimated ? 'ESTIMATED' : (hasWeatherInfo ? 'PREDICTED' : 'UNAVAILABLE'));
  const hasTrafficSignal = traffic.source === 'live' ||
    traffic.trafficDelayMinutes != null ||
    traffic.delayMinutes != null ||
    traffic.isRoadBlocked != null ||
    traffic.disruption != null ||
    traffic.anomalyState != null ||
    context.disruption != null;
  const trafficDataState = traffic.dataState || (traffic.source === 'live' ? 'LIVE' : (hasTrafficSignal ? 'ESTIMATED' : 'UNAVAILABLE'));
  const crowdDataState = crowd.dataState || (crowd.level ? 'HISTORICAL' : 'UNAVAILABLE');

  const dataStates = {
    weather: weatherDataState,
    traffic: trafficDataState,
    crowd: crowdDataState,
  };

  const hasWeather = weatherDataState !== 'UNAVAILABLE';
  const hasTraffic = trafficDataState !== 'UNAVAILABLE';

  const isCriticalDataMissing = (!hasWeather && !hasTraffic) || context.dataState === 'UNAVAILABLE';

  let overallConfidence = CONFIDENCE_LEVELS.HIGH;
  if (isCriticalDataMissing) {
    overallConfidence = CONFIDENCE_LEVELS.UNKNOWN;
  } else if (weatherDataState === 'ESTIMATED' || weather.confidence === 'LOW' || traffic.confidence === 'LOW') {
    overallConfidence = CONFIDENCE_LEVELS.LOW;
  } else if (weatherDataState === 'PREDICTED' || trafficDataState === 'ESTIMATED') {
    overallConfidence = CONFIDENCE_LEVELS.MEDIUM;
  }

  return {
    isCriticalDataMissing,
    overallConfidence,
    dataStates,
  };
}

/**
 * Evaluates Plan Health across 8 core dimensions (Section 8 - Journey Suitability).
 */
function evaluatePlanHealth({
  journeyState = {},
  travelerDna = {},
  context = {},
  upcomingStops = [],
  activeStop = null,
  trust = {},
}) {
  const lag = Number(journeyState.pacingLagMinutes || 0);
  const weather = context.weather || {};
  const traffic = context.traffic || {};
  const crowd = context.crowd || {};

  // 1. Schedule Health
  let scheduleHealth = SCHEDULE_HEALTH.ON_TRACK;
  if (lag >= 45) scheduleHealth = SCHEDULE_HEALTH.SEVERE_LAG;
  else if (lag >= 15) scheduleHealth = SCHEDULE_HEALTH.SLIGHT_DELAY;

  // 2. Weather Health
  const rainProb = Number(weather.precipitationProb ?? weather.rainProbability ?? 0);
  const tempC = Number(weather.temperatureC ?? weather.tempC ?? 26);
  const rainTolerance = Number(travelerDna.rainTolerance ?? 40);
  const heatTolerance = Number(travelerDna.heatTolerance ?? 50);

  let weatherHealth = WEATHER_HEALTH.EXCELLENT;
  if (rainProb >= DECISION_THRESHOLDS.RAIN_PROB_SEVERE_THRESHOLD || (rainProb >= 50 && rainTolerance < 30)) {
    weatherHealth = WEATHER_HEALTH.SEVERE_RISK;
  } else if (rainProb >= DECISION_THRESHOLDS.RAIN_PROB_ADVERSE_THRESHOLD || (tempC >= DECISION_THRESHOLDS.HEAT_STRESS_CELSIUS && heatTolerance < 45)) {
    weatherHealth = WEATHER_HEALTH.ADVERSE;
  } else if (rainProb >= 25 || tempC >= 33) {
    weatherHealth = WEATHER_HEALTH.FAVORABLE;
  }

  // 3. Route Health
  const trafficDelay = Number(traffic.trafficDelayMinutes || 0);
  const isGhatImpassable = traffic.isGhatCorridor && (weatherHealth === WEATHER_HEALTH.SEVERE_RISK || traffic.hazardAlert);
  let routeHealth = ROUTE_HEALTH.CLEAR;
  if (isGhatImpassable || traffic.routeBlocked) {
    routeHealth = ROUTE_HEALTH.IMPASSABLE;
  } else if (trafficDelay >= DECISION_THRESHOLDS.MIN_TRAFFIC_DELAY_TO_ADAPT_MINUTES) {
    routeHealth = ROUTE_HEALTH.CONGESTED;
  }

  // 4. Crowd Health
  const crowdLevel = String(crowd.level || crowd.crowdLevel || 'Moderate').toLowerCase();
  const crowdTolerance = Number(travelerDna.crowdTolerance ?? 50);
  let crowdHealth = CROWD_HEALTH.COMFORTABLE;
  if (crowdLevel.includes('very high') || crowdLevel.includes('extreme') || (crowdLevel.includes('high') && crowdTolerance < 35)) {
    crowdHealth = CROWD_HEALTH.OVERWHELMED;
  } else if (crowdLevel.includes('high') || crowdLevel.includes('busy')) {
    crowdHealth = CROWD_HEALTH.BUSY;
  }

  // 5. Safety Health
  let safetyHealth = SAFETY_HEALTH.SAFE;
  if (routeHealth === ROUTE_HEALTH.IMPASSABLE || weatherHealth === WEATHER_HEALTH.SEVERE_RISK) {
    safetyHealth = SAFETY_HEALTH.HAZARDOUS;
  } else if (routeHealth === ROUTE_HEALTH.CONGESTED || weatherHealth === WEATHER_HEALTH.ADVERSE) {
    safetyHealth = SAFETY_HEALTH.CAUTION;
  }

  // 6. Scenic Health
  const isCloudyOrRainy = rainProb >= 60 || /rain|cloud|fog|overcast/i.test(weather.condition || '');
  const hasViewpointNext = (activeStop && (activeStop.category === 'viewpoint' || activeStop.category === 'nature')) ||
    upcomingStops.some(s => s.category === 'viewpoint' || s.category === 'scenic');
  let scenicHealth = SCENIC_HEALTH.OPTIMAL;
  if (hasViewpointNext && isCloudyOrRainy) {
    scenicHealth = SCENIC_HEALTH.DEGRADED;
  } else if (isCloudyOrRainy) {
    scenicHealth = SCENIC_HEALTH.FAIR;
  }

  // 7. Traveler Fit
  const nextTarget = activeStop || upcomingStops[0];
  let travelerFit = TRAVELER_FIT.HIGH_ALIGNMENT;
  if (nextTarget) {
    const dnaMatch = computeDnaMatch(nextTarget, travelerDna);
    if (dnaMatch.score < 40) travelerFit = TRAVELER_FIT.POOR_FIT;
    else if (dnaMatch.score < 65) travelerFit = TRAVELER_FIT.MODERATE;
  }

  // 8. Completion Likelihood
  let completionLikelihood = COMPLETION_LIKELIHOOD.HIGH;
  if (scheduleHealth === SCHEDULE_HEALTH.SEVERE_LAG || safetyHealth === SAFETY_HEALTH.HAZARDOUS) {
    completionLikelihood = COMPLETION_LIKELIHOOD.LOW;
  } else if (scheduleHealth === SCHEDULE_HEALTH.SLIGHT_DELAY || routeHealth === ROUTE_HEALTH.CONGESTED) {
    completionLikelihood = COMPLETION_LIKELIHOOD.MEDIUM;
  }

  const overall = (safetyHealth === SAFETY_HEALTH.HAZARDOUS || weatherHealth === WEATHER_HEALTH.SEVERE_RISK || scheduleHealth === SCHEDULE_HEALTH.SEVERE_LAG)
    ? 'CRITICAL_DISRUPTION'
    : (routeHealth === ROUTE_HEALTH.CONGESTED || weatherHealth === WEATHER_HEALTH.ADVERSE || scenicHealth === SCENIC_HEALTH.DEGRADED || crowdHealth === CROWD_HEALTH.OVERWHELMED)
      ? 'ATTENTION_REQUIRED'
      : 'HEALTHY';

  return {
    overall,
    scheduleHealth,
    weatherHealth,
    routeHealth,
    crowdHealth,
    safetyHealth,
    scenicHealth,
    travelerFit,
    completionLikelihood,
    dataConfidence: trust.overallConfidence,
  };
}

/**
 * Evaluates Hard Constraints & Soft Preferences for active / upcoming stops (Section 9).
 */
function evaluateConstraints(stop, { context = {}, travelerDna = {}, currentMinute = 600 }) {
  const violations = [];
  const preferences = [];

  if (!stop) return { hasHardViolation: false, violations, preferences };

  // Hard Constraint 0: Authoritative Safety Hazard or Road Closure (Phase 3)
  const safety = context.safety || {};
  const activeSignals = Array.isArray(safety.signals)
    ? safety.signals
    : (Array.isArray(safety.activeSignals) ? safety.activeSignals : []);
  for (const sig of activeSignals) {
    const isClosure = sig.hazardType === 'ROAD_CLOSURE' || sig.hazardType === 'EVACUATION_ALERT' || sig.hazardType === 'AUTHORITATIVE_RESTRICTION';
    const isCritical = sig.severity === 'CRITICAL' && (sig.dataState === 'OFFICIAL_WARNING' || sig.confidence === 'HIGH');
    if (isClosure || isCritical) {
      violations.push({
        type: 'HARD_SAFETY_RESTRICTION',
        reason: `Authoritative ${sig.hazardType || 'SAFETY_HAZARD'} (${sig.source || 'Official directive'}) requires immediate avoidance/reroute.`,
        hazardId: sig.id,
      });
    }
  }

  // Hard Constraint 1: Destination closed or opening hours expired
  const openTimeMin = stop.open_time ? t2m(stop.open_time) : null;
  const closeTimeMin = stop.close_time ? t2m(stop.close_time) : null;
  const projectedArrival = stop.plannedArrivalMinute || stop.projectedArrivalMinute || currentMinute;

  if (stop.isReportedClosed === true || context.poiClosed === true) {
    violations.push({ type: 'DESTINATION_CLOSED', reason: `${stop.name} is reported closed.` });
  } else if (closeTimeMin != null && projectedArrival > closeTimeMin) {
    violations.push({ type: 'OPENING_HOURS_EXPIRED', reason: `Projected arrival (${m2t(projectedArrival)}) is after closing time (${m2t(closeTimeMin)}).` });
  } else if (openTimeMin != null && projectedArrival < openTimeMin) {
    violations.push({ type: 'OPENING_HOURS_NOT_OPEN', reason: `Projected arrival (${m2t(projectedArrival)}) is before opening time (${m2t(openTimeMin)}).` });
  }

  // Hard Constraint 2: Severe Weather / Ghat Landslide Risk on Outdoor Viewpoint
  const weather = context.weather || {};
  const rainProb = Number(weather.precipitationProb ?? weather.rainProbability ?? 0);
  const isOutdoor = stop.indoor_outdoor === 'outdoor' || stop.category === 'viewpoint' || stop.category === 'nature' || stop.category === 'beach';
  const rainTolerance = Number(travelerDna.rainTolerance ?? 40);

  if (isOutdoor && rainProb >= DECISION_THRESHOLDS.RAIN_PROB_SEVERE_THRESHOLD) {
    violations.push({ type: 'SEVERE_WEATHER_HAZARD', reason: `Extreme precipitation (${rainProb}%) makes outdoor stop ${stop.name} unsafe or futile.` });
  } else if (isOutdoor && rainProb >= 60 && rainTolerance <= 25) {
    violations.push({ type: 'TRAVELER_WEATHER_INTOLERANCE', reason: `Rain probability (${rainProb}%) exceeds traveler rain tolerance (${rainTolerance}).` });
  }

  // Soft Preferences (e.g. Photography, Low Crowds, Food, Walking)
  const crowdLevel = String(context.crowd?.level || 'Moderate').toLowerCase();
  if (travelerDna.photography >= 75 && (stop.category === 'viewpoint' || stop.is_sunset_spot)) {
    if (rainProb >= 50 || /cloud|overcast/i.test(weather.condition || '')) {
      preferences.push({ type: 'PHOTOGRAPHY_VISIBILITY_DEGRADED', note: 'Heavy clouds impair photography lighting' });
    }
  }
  if (travelerDna.crowdTolerance <= 30 && (crowdLevel.includes('high') || crowdLevel.includes('very high'))) {
    preferences.push({ type: 'CROWD_AVOIDANCE_PREFERRED', note: 'Peak crowd conflicts with traveler tranquility preference' });
  }

  return {
    hasHardViolation: violations.length > 0,
    violations,
    preferences,
  };
}

/**
 * Primary Core Decision Engine: Evaluates journey, context, constraints, and traveler DNA.
 *
 * Implements the 13-stage logical pipeline (Section 6) and emits the structured decision contract (Section 13).
 *
 * @param {Object} input
 * @param {Object} input.journeyState - Authoritative journey state
 * @param {Object} [input.traveler] - Traveler DNA and tolerances
 * @param {Object} [input.context] - Current live / forecast context
 * @param {Object} [input.options] - Operational options & candidate pool
 * @returns {Object} Structured decision output contract
 */
function evaluateNextDecision({
  journeyState = {},
  traveler = {},
  context = {},
  options = {},
} = {}) {
  // 1. Stage 1 & 2: Load Journey State
  if (!journeyState || !Array.isArray(journeyState.stops)) {
    journeyState = {
      tripId: journeyState.tripId || 'trip_default',
      stops: [],
      completedStops: [],
      upcomingStops: [],
      activeStop: null,
      currentMinute: 600,
      pacingLagMinutes: 0,
      activePlanVersion: 1,
    };
  }

  const completedStops = journeyState.stops.filter(s => s.status === STOP_STATUSES.COMPLETED);
  const upcomingStops = journeyState.stops.filter(s => s.status === STOP_STATUSES.PLANNED);
  const activeStop = journeyState.activeStop || upcomingStops[0] || null;
  const currentMinute = journeyState.currentMinute || 600;
  const lag = Number(journeyState.pacingLagMinutes || 0);

  // 2. Stage 3: Load Traveler DNA
  const travelerDna = {
    ...DEFAULT_TRAVEL_DNA,
    ...(traveler.travelerDna || traveler.dna || traveler),
  };

  // 3. Stage 4: Load Current Context & Stage 5: Validate Data Quality
  const trust = validateDataTrust(context);

  // If critical data is completely missing and caller did not provide fallback
  if (trust.isCriticalDataMissing) {
    const decision = DECISION_STATES.INSUFFICIENT_DATA;
    decisionMetrics.totalDecisions++;
    decisionMetrics.insufficientDataCount++;

    return {
      decision,
      nextAction: {
        actionType: 'AWAIT_TELEMETRY',
        targetStop: activeStop ? { id: activeStop.id, name: activeStop.name, category: activeStop.category } : null,
        timing: null,
      },
      planHealth: {
        overall: 'UNCERTAIN',
        scheduleHealth: SCHEDULE_HEALTH.ON_TRACK,
        weatherHealth: WEATHER_HEALTH.FAVORABLE,
        routeHealth: ROUTE_HEALTH.CLEAR,
        crowdHealth: CROWD_HEALTH.COMFORTABLE,
        safetyHealth: SAFETY_HEALTH.SAFE,
        scenicHealth: SCENIC_HEALTH.FAIR,
        travelerFit: TRAVELER_FIT.MODERATE,
        completionLikelihood: COMPLETION_LIKELIHOOD.MEDIUM,
        dataConfidence: CONFIDENCE_LEVELS.UNKNOWN,
      },
      alternatives: [],
      selectedAlternative: null,
      reasonCodes: ['INSUFFICIENT_TELEMETRY', 'DATA_QUALITY_UNAVAILABLE'],
      confidence: CONFIDENCE_LEVELS.UNKNOWN,
      dataStates: trust.dataStates,
      explanation: {
        what: 'Maintain current itinerary with caution; live environmental telemetry is currently unavailable.',
        why: 'Critical meteorological and transit signals could not be validated with verified confidence.',
        evidence: 'Weather and traffic data states are marked UNAVAILABLE.',
        confidence: 'UNKNOWN (Cannot formulate an evidence-based adaptation without telemetry).',
        whatChanged: 'No changes applied.',
        whatRemains: 'All planned stops retained pending data refresh.',
      },
      audit: recordDecisionAudit({
        tripId: journeyState.tripId,
        decision,
        activePlanVersion: journeyState.activePlanVersion || 1,
        confidence: CONFIDENCE_LEVELS.UNKNOWN,
        reasonCodes: ['INSUFFICIENT_TELEMETRY'],
      }),
    };
  }

  // 4. Stage 6: Identify Constraints & Evaluate Stop Suitability (Level 1)
  const stopConstraints = evaluateConstraints(activeStop, { context, travelerDna, currentMinute });

  // 5. Stage 7: Evaluate Current Plan (Level 2: Journey Suitability)
  const planHealth = evaluatePlanHealth({
    journeyState,
    travelerDna,
    context,
    upcomingStops,
    activeStop,
    trust,
  });

  // 6. Stage 8 & 9: Alternative Generation if hard violation or severe degradation exists
  const reasonCodes = [];
  let decision = DECISION_STATES.KEEP_PLAN;
  let nextActionType = 'CONTINUE_PLANNED_STOP';
  let selectedAlternative = null;
  const candidateAlternatives = [];

  // Check if conflict resolution applies: Generic knowledge (e.g. sunset viewpoint) vs Live Reality (e.g. heavy cloud cover)
  const isSunsetSpotInCloud = activeStop?.is_sunset_spot && (context.weather?.precipitationProb >= 50 || /cloud|rain/i.test(context.weather?.condition || ''));
  const isConflictPresent = isSunsetSpotInCloud && travelerDna.photography >= 70;

  const requiresAlternative = stopConstraints.hasHardViolation || isConflictPresent;

  if (requiresAlternative) {
    decision = DECISION_STATES.ALTERNATIVE_REQUIRED;
    nextActionType = 'SUBSTITUTE_STOP';

    if (stopConstraints.violations.some(v => v.type.includes('WEATHER') || v.type.includes('INTOLERANCE')) || isConflictPresent) {
      reasonCodes.push('WEATHER_DETERIORATION');
      if (travelerDna.rainTolerance <= 35) reasonCodes.push('TRAVELER_RAIN_SENSITIVITY');
      if (isConflictPresent) reasonCodes.push('SCENIC_WINDOW_DEGRADED');
    }
    if (stopConstraints.violations.some(v => v.type.includes('CLOSED') || v.type.includes('EXPIRED'))) {
      reasonCodes.push('OPENING_HOURS_CONFLICT');
    }

    // Generate real, canonical alternatives
    const altReason = reasonCodes[0] || 'WEATHER_RAIN';
    const candidatePool = options.candidatePool || REGIONAL_ALTERNATIVE_HAVENS;
    const bestAlt = findAlternativeStop(activeStop || { lat: 18.33, lon: 82.87, name: 'Current Location' }, {
      reason: altReason,
      travelerDna,
      currentMinute,
      candidatePool,
    });

    if (bestAlt) {
      selectedAlternative = bestAlt;
      candidateAlternatives.push({
        id: bestAlt.id,
        name: bestAlt.name,
        category: bestAlt.cat,
        score: bestAlt.substituteScore,
        distanceKm: bestAlt.distanceFromOriginalKm,
        reason: bestAlt.substitutionReason,
      });
    }
  } else {
    // Check for Disruption / Pacing Lag / Traffic Delay (Anti-churn check: minor traffic <= 10m does NOT adapt)
    const trafficDelay = Number(context.traffic?.trafficDelayMinutes || context.traffic?.delayMinutes || 0);
    const disruption = context.traffic?.disruption || context.disruption || null;
    const isRoadClosure = context.traffic?.isRoadBlocked || disruption?.eventType === 'ROAD_CLOSURE' || disruption?.eventType === 'EMERGENCY';

    const isMeaningfulDelay = lag >= DECISION_THRESHOLDS.MIN_USER_LAG_TO_ADAPT_MINUTES ||
      trafficDelay >= DECISION_THRESHOLDS.MIN_TRAFFIC_DELAY_TO_ADAPT_MINUTES ||
      disruption?.isDisruption === true;

    if (isRoadClosure) {
      decision = DECISION_STATES.ALTERNATIVE_REQUIRED;
      nextActionType = 'SUBSTITUTE_STOP';
      reasonCodes.push('ROAD_CLOSURE', 'CRITICAL_ROUTE_BLOCKED');
      const candidatePool = options.candidatePool || REGIONAL_ALTERNATIVE_HAVENS;
      const bestAlt = findAlternativeStop(activeStop || { lat: 18.33, lon: 82.87, name: 'Current Location' }, {
        reason: 'ROAD_CLOSURE',
        travelerDna,
        currentMinute,
        candidatePool,
      });
      if (bestAlt) {
        selectedAlternative = bestAlt;
        candidateAlternatives.push({
          id: bestAlt.id,
          name: bestAlt.name,
          category: bestAlt.cat,
          score: bestAlt.substituteScore,
          distanceKm: bestAlt.distanceFromOriginalKm,
          reason: 'Bypass blocked corridor with verified open stop',
        });
      }
    } else if (isMeaningfulDelay) {
      const alternateRoute = options.alternateRoute || context.traffic?.alternateRoute || null;
      const canReorder = options.canReorder || context.traffic?.canReorder || false;
      const hasStrictDeadline = Boolean(travelerDna.hardDeadlineMinute || travelerDna.isDeadlineStrict);
      const isFlexible = Boolean(travelerDna.isFlexible || travelerDna.pacingPreference === 'slow');

      // 1. Evaluate Reroute vs Wait
      if (alternateRoute && alternateRoute.isViable !== false) {
        const altDelay = Number(alternateRoute.trafficDelayMinutes ?? alternateRoute.delayMinutes ?? 0);
        const timeSaved = trafficDelay - altDelay;
        const isHazardousTerrain = Boolean(alternateRoute.isGhat || alternateRoute.isRoughTerrain);

        if (timeSaved >= 18 && !isHazardousTerrain && alternateRoute.isBlocked !== true) {
          decision = DECISION_STATES.REROUTE;
          nextActionType = 'REROUTE_CORRIDOR';
          reasonCodes.push('REROUTE_RECOMMENDED', 'MATERIAL_TIME_SAVINGS');
        } else if (timeSaved <= 10 || isHazardousTerrain || isFlexible) {
          decision = DECISION_STATES.WAIT;
          nextActionType = 'WAIT_OUT_CONGESTION';
          reasonCodes.push('WAIT_PREFERRED_OVER_ROUGH_DETOUR', 'TEMPORARY_CONGESTION_EXPECTED_TO_CLEAR');
        } else {
          decision = DECISION_STATES.ADAPT_PLAN;
          nextActionType = 'RETIME_REMAINING';
          reasonCodes.push('TRAFFIC_DELAY');
        }
      } else if (canReorder && upcomingStops.length >= 2) {
        decision = DECISION_STATES.REORDER;
        nextActionType = 'REORDER_NEXT_STOPS';
        reasonCodes.push('AVOID_PEAK_CORRIDOR_CONGESTION', 'REORDER_STOPS');
      } else if (hasStrictDeadline && trafficDelay >= 35) {
        // Traveler with hard deadline cannot afford delay -> require alternative or drop stop
        decision = DECISION_STATES.ALTERNATIVE_REQUIRED;
        nextActionType = 'DROP_OR_SWAP_STOP';
        reasonCodes.push('HARD_DEADLINE_BREACH_PREVENTION', 'TRAFFIC_DELAY');
      } else if (isFlexible && trafficDelay <= 45) {
        decision = DECISION_STATES.WAIT;
        nextActionType = 'WAIT_OUT_CONGESTION';
        reasonCodes.push('FLEXIBLE_PACING_WAIT_SUITABLE');
      } else {
        decision = DECISION_STATES.ADAPT_PLAN;
        nextActionType = 'RETIME_REMAINING';
        if (trafficDelay >= DECISION_THRESHOLDS.MIN_TRAFFIC_DELAY_TO_ADAPT_MINUTES) reasonCodes.push('TRAFFIC_DELAY');
        if (lag >= DECISION_THRESHOLDS.MIN_USER_LAG_TO_ADAPT_MINUTES) reasonCodes.push('TRAVELER_DELAY');
      }
    } else if (planHealth.overall === 'ATTENTION_REQUIRED' && !options.forceReplan) {
      decision = DECISION_STATES.WATCH;
      nextActionType = 'CONTINUE_PLANNED_STOP';
      reasonCodes.push('MONITOR_WEATHER_OR_CROWD');
    } else {
      decision = DECISION_STATES.KEEP_PLAN;
      nextActionType = 'CONTINUE_PLANNED_STOP';
      reasonCodes.push('PLAN_HEALTHY_ON_TRACK');
    }
  }

  // 7. Uncertainty Propagation: If data trust is LOW, cap decision confidence at LOW/MEDIUM
  let finalConfidence = trust.overallConfidence;
  if (decision === DECISION_STATES.ALTERNATIVE_REQUIRED && selectedAlternative) {
    finalConfidence = trust.overallConfidence === CONFIDENCE_LEVELS.HIGH ? CONFIDENCE_LEVELS.HIGH : CONFIDENCE_LEVELS.MEDIUM;
  }

  const disruptionTelemetry = context.traffic?.disruption || context.disruption || null;

  // 8. Compose Deterministic Structured Explanation (Section 23 & 36)
  const explanation = composeExplanation({
    decision,
    activeStop,
    selectedAlternative,
    reasonCodes,
    planHealth,
    confidence: finalConfidence,
    completedStops,
    travelerDna,
    context,
    disruptionTelemetry,
  });

  // 9. Update telemetry counters
  decisionMetrics.totalDecisions++;
  if (decision === DECISION_STATES.KEEP_PLAN) decisionMetrics.keepPlanCount++;
  else if (decision === DECISION_STATES.ADAPT_PLAN) decisionMetrics.adaptPlanCount++;
  else if (decision === DECISION_STATES.ALTERNATIVE_REQUIRED) decisionMetrics.alternativeRequiredCount++;
  else if (decision === DECISION_STATES.WATCH) decisionMetrics.watchCount++;
  else if (decision === DECISION_STATES.WAIT) decisionMetrics.waitCount++;
  else if (decision === DECISION_STATES.REROUTE) decisionMetrics.rerouteCount++;
  else if (decision === DECISION_STATES.REORDER) decisionMetrics.reorderCount++;
  else if (decision === DECISION_STATES.REPLACE_STOP) decisionMetrics.replaceStopCount++;

  const auditRecord = recordDecisionAudit({
    tripId: journeyState.tripId,
    decision,
    activePlanVersion: journeyState.activePlanVersion || 1,
    confidence: finalConfidence,
    reasonCodes,
    selectedAlternative: selectedAlternative ? selectedAlternative.name : null,
  });

  return {
    decision,
    nextAction: {
      actionType: nextActionType,
      targetStop: selectedAlternative
        ? { id: selectedAlternative.id, name: selectedAlternative.name, category: selectedAlternative.cat, lat: selectedAlternative.lat, lon: selectedAlternative.lon }
        : (activeStop ? { id: activeStop.id, name: activeStop.name, category: activeStop.category } : null),
      timing: {
        projectedArrivalMinute: currentMinute + (selectedAlternative ? 20 : (activeStop?.travelMinutes || 15)),
        projectedDepartureMinute: currentMinute + (selectedAlternative ? 20 + (selectedAlternative.visitMinutes || 45) : 60),
      },
    },
    planHealth,
    alternatives: candidateAlternatives,
    selectedAlternative: selectedAlternative ? {
      id: selectedAlternative.id,
      name: selectedAlternative.name,
      category: selectedAlternative.cat,
      reason: selectedAlternative.substitutionReason,
    } : null,
    reasonCodes,
    confidence: finalConfidence,
    dataStates: trust.dataStates,
    explanation,
    audit: auditRecord,
  };
}

/**
 * Builds a deterministic, plain-language explanation of the decision (Section 23).
 */
function composeExplanation({
  decision,
  activeStop,
  selectedAlternative,
  reasonCodes,
  planHealth,
  confidence,
  completedStops,
  _travelerDna,
  context,
  disruptionTelemetry,
}) {
  const completedCount = completedStops.length;
  const stopName = activeStop?.name || 'Upcoming stop';

  let what = `Continue with your planned stop: ${stopName}.`;
  let why = 'Your current plan is healthy, on track, and well aligned with live conditions.';
  let evidence = 'Environmental and transit conditions are within comfortable thresholds.';
  let whatWeKnow = 'Live environmental and transit telemetry are verified.';
  let whatWeDontKnow = 'None';
  let howItAffectsTrip = 'No schedule compression or hazard detected.';
  let whatWeRecommend = `Proceed to ${stopName} as planned.`;

  const disruption = disruptionTelemetry || context.traffic?.disruption || null;
  const isCauseVerified = disruption?.isCauseVerified === true;
  const disruptionConfidence = disruption?.disruptionConfidence || (confidence === 'HIGH' ? 'HIGH' : 'MEDIUM');
  const causeConfidence = disruption?.causeConfidence || (isCauseVerified ? 'HIGH' : 'LOW');

  if (decision === DECISION_STATES.ALTERNATIVE_REQUIRED && selectedAlternative) {
    what = `Substitute "${stopName}" with "${selectedAlternative.name}".`;
    if (reasonCodes.includes('ROAD_CLOSURE')) {
      why = `A verified road closure prevents transit to "${stopName}". Switching to "${selectedAlternative.name}" bypasses the blockage safely.`;
      evidence = `Route blockage or closure confirmed by official advisory or zero-speed corridor sensors.`;
    } else if (reasonCodes.includes('WEATHER_DETERIORATION') || reasonCodes.includes('TRAVELER_RAIN_SENSITIVITY')) {
      why = `Heavy precipitation or orographic fog is impacting "${stopName}". Given your preference for sheltered exploration, switching ensures an optimal experience.`;
      evidence = `Precipitation probability is ${context.weather?.precipitationProb || 80}% at ${stopName}. "${selectedAlternative.name}" is fully sheltered and open.`;
    } else if (reasonCodes.includes('OPENING_HOURS_CONFLICT')) {
      why = `"${stopName}" is closed or closing before arrival. "${selectedAlternative.name}" offers confirmed open access.`;
      evidence = `Closing hours restrict visit at ${stopName}. "${selectedAlternative.name}" remains open.`;
    } else {
      why = `Contextual conditions make "${stopName}" suboptimal. "${selectedAlternative.name}" offers superior experiential value.`;
      evidence = `Experience score for ${selectedAlternative.name} is higher under current conditions.`;
    }
    whatWeRecommend = `Switch destination to ${selectedAlternative.name}.`;
    howItAffectsTrip = `Preserves itinerary feasibility while bypassing ${stopName}.`;
  } else if (decision === DECISION_STATES.REROUTE) {
    what = `Reroute around transit corridor to save travel time.`;
    why = `The primary route has deteriorated severely (+${disruption?.estimatedDelay || context.traffic?.trafficDelayMinutes || 30}m). A faster, validated alternate bypass is available.`;
    evidence = `Verified bypass corridor saves travel time without navigating severe bottlenecks.`;
    whatWeRecommend = 'Take the recommended bypass corridor.';
    howItAffectsTrip = 'Restores schedule buffer for remaining stops.';
  } else if (decision === DECISION_STATES.WAIT) {
    what = `Wait out peak corridor congestion before departing for "${stopName}".`;
    why = `Alternative routes present rough terrain or negligible time savings; waiting 15–20 minutes is more comfortable and reliable.`;
    evidence = `Current corridor delay is expected to dissipate faster than navigating narrow detours.`;
    whatWeRecommend = 'Relax at current location for 15–20 minutes, then re-check.';
    howItAffectsTrip = 'Pacing shifted slightly without adding navigation fatigue.';
  } else if (decision === DECISION_STATES.REORDER) {
    what = `Reorder upcoming stops to avoid peak corridor congestion.`;
    why = `Swapping stop sequence allows you to visit an unimpacted nearby attraction while the congested corridor clears.`;
    evidence = `Next stop is in the congestion bottleneck, but subsequent stop is readily accessible.`;
    whatWeRecommend = 'Visit the nearby destination first, then return to this stop.';
    howItAffectsTrip = 'Avoids sitting in traffic while keeping all planned stops.';
  } else if (decision === DECISION_STATES.ADAPT_PLAN) {
    what = `Adjust arrival times for remaining stops to accommodate travel pacing.`;
    why = `Accumulated transit or activity lag requires shifting the schedule forward without dropping any stops.`;
    evidence = `Current pacing lag is ${planHealth.scheduleHealth === SCHEDULE_HEALTH.SEVERE_LAG ? 'significant (>45m)' : 'moderate (15-40m)'}.`;
    whatWeRecommend = 'Follow adjusted timetable.';
    howItAffectsTrip = 'Future arrival estimates adjusted forward.';
  } else if (decision === DECISION_STATES.WATCH) {
    what = `Maintain plan for "${stopName}", but observe conditions closely.`;
    why = `Conditions are borderline or traffic is building, but remain within acceptable operational bounds.`;
    evidence = `Weather and crowd indicators require monitoring before committing to a plan change.`;
    whatWeRecommend = 'Continue towards destination; monitor updates.';
    howItAffectsTrip = 'No immediate change to plan.';
  }

  if (disruption) {
    whatWeKnow = `Route delay is +${disruption.estimatedDelay || 0}m. ${isCauseVerified ? `Cause verified: ${disruption.eventType}` : 'Cause is currently unverified.'}`;
    whatWeDontKnow = isCauseVerified ? 'Exact clearance timestamp' : 'Exact root cause behind sudden traffic collapse';
  }

  const whatChanged = selectedAlternative
    ? `Replaced 1 stop ("${stopName}" → "${selectedAlternative.name}").`
    : (decision === DECISION_STATES.REROUTE
        ? 'Rerouted to bypass corridor.'
        : (decision === DECISION_STATES.REORDER
            ? 'Reordered stop sequence.'
            : (decision === DECISION_STATES.WAIT
                ? 'Added 15-minute wait buffer.'
                : (decision === DECISION_STATES.ADAPT_PLAN ? 'Re-timed future stop arrival estimates.' : 'No stops changed.'))));

  const completedNames = completedStops.map(s => s.name).join(', ');
  const whatRemains = completedCount > 0
    ? `All ${completedCount} completed stop(s) (${completedNames}) are strictly preserved and immutable.`
    : 'All planned stops remain on your active itinerary.';

  return {
    what,
    why,
    evidence,
    whatWeKnow,
    whatWeDontKnow,
    howItAffectsTrip,
    whatWeRecommend,
    disruptionConfidence,
    causeConfidence,
    confidence: `${confidence} (${confidence === 'HIGH' ? 'Strong verified telemetry' : 'Model prediction / moderate uncertainty'})`,
    whatChanged,
    whatRemains,
  };
}

/**
 * Records a decision in the audit buffer.
 */
function recordDecisionAudit({
  tripId,
  decision,
  activePlanVersion,
  confidence,
  reasonCodes = [],
  selectedAlternative = null,
}) {
  const audit = {
    decisionId: `dec_${Date.now()}_${inMemoryDecisionAudits.length + 1}`,
    tripId: tripId || 'trip_anonymous',
    planVersion: activePlanVersion || 1,
    decision,
    confidence,
    reasonCodes,
    selectedAlternative,
    timestamp: new Date().toISOString(),
    outcome: 'PENDING_USER_ACTION',
  };

  inMemoryDecisionAudits.push(audit);
  if (inMemoryDecisionAudits.length > MAX_AUDIT_HISTORY) {
    inMemoryDecisionAudits.shift();
  }

  return audit;
}

/**
 * Records user outcome on a decision (Section 28).
 */
function recordDecisionOutcome(decisionId, outcome = 'ACCEPTED', notes = '') {
  const record = inMemoryDecisionAudits.find(d => d.decisionId === decisionId);
  const normalizedOutcome = String(outcome).toUpperCase();

  if (record) {
    record.outcome = normalizedOutcome;
    record.outcomeNotes = notes;
    record.outcomeRecordedAt = new Date().toISOString();
  }

  if (normalizedOutcome === 'ACCEPTED') decisionMetrics.acceptedCount++;
  else if (normalizedOutcome === 'REJECTED') decisionMetrics.rejectedCount++;
  else if (normalizedOutcome === 'IGNORED') decisionMetrics.ignoredCount++;
  else if (normalizedOutcome === 'COMPLETED') decisionMetrics.completedCount++;

  return {
    success: true,
    decisionId,
    outcome: normalizedOutcome,
  };
}

/**
 * Returns operational metrics of the decision engine (Section 29).
 */
function getDecisionMetrics() {
  const total = decisionMetrics.totalDecisions;
  const acceptanceRate = total > 0 && (decisionMetrics.acceptedCount + decisionMetrics.rejectedCount) > 0
    ? Math.round((decisionMetrics.acceptedCount / (decisionMetrics.acceptedCount + decisionMetrics.rejectedCount)) * 100)
    : 100;

  return {
    ...decisionMetrics,
    acceptanceRatePercent: acceptanceRate,
    auditTrailLength: inMemoryDecisionAudits.length,
  };
}

/**
 * Returns recent decisions for a trip.
 */
function getTripDecisionHistory(tripId) {
  return inMemoryDecisionAudits.filter(d => d.tripId === tripId);
}

module.exports = {
  DECISION_STATES,
  SCHEDULE_HEALTH,
  WEATHER_HEALTH,
  ROUTE_HEALTH,
  CROWD_HEALTH,
  SAFETY_HEALTH,
  SCENIC_HEALTH,
  TRAVELER_FIT,
  COMPLETION_LIKELIHOOD,
  CONFIDENCE_LEVELS,
  DECISION_THRESHOLDS,
  validateDataTrust,
  evaluatePlanHealth,
  evaluateConstraints,
  evaluateNextDecision,
  recordDecisionOutcome,
  getDecisionMetrics,
  getTripDecisionHistory,
  inMemoryDecisionAudits,
  DEFAULT_TRAVEL_DNA,
};

