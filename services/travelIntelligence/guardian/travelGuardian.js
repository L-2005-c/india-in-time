'use strict';

/**
 * services/travelIntelligence/guardian/travelGuardian.js
 *
 * Next-Gen Real-Time Travel Guardian for India In-Time v3.0.
 * Continuously evaluates journey health against weather, traffic, delays, closures,
 * Indian microclimate hazards, and predictive corridor risks.
 *
 * Capabilities:
 * - Authoritative Health Bands: ON_TRACK, WATCH, SUBOPTIMAL, SAFETY_CAUTION,
 *   SAFETY_ACTION_RECOMMENDED, REPLAN_RECOMMENDED, CRITICAL, INSUFFICIENT_DATA.
 * - Numerical Safety Score (0-100) reflecting overall corridor risk.
 * - Predictive Forward-Horizon Timeline: Evaluates hazard risks at exact projected arrival minutes.
 * - Smart Recovery Window Estimation: Detects transitory weather/traffic surges and suggests pause durations.
 * - Plain-language Actionable Guidance for stress-free traveler decisions.
 */

const { evaluateTriggers, TRIGGER_SEVERITY } = require('./triggerFramework');
const { TRIP_HEALTH_STATES } = require('../journey/journeyStateEngine');

/**
 * Computes an authoritative Safety Health Score from active triggers.
 * 100 = Pristine safety, 80-99 = Nominal, 60-79 = Caution, <60 = High Risk.
 */
function computeSafetyScore(activeTriggers = []) {
  let score = 100;
  for (const t of activeTriggers) {
    if (t.severity === TRIGGER_SEVERITY.CRITICAL) {
      score -= 35;
    } else if (t.severity === TRIGGER_SEVERITY.SEVERE || t.severity === TRIGGER_SEVERITY.WARNING) {
      score -= 20;
    } else if (t.severity === TRIGGER_SEVERITY.SUBOPTIMAL || t.severity === TRIGGER_SEVERITY.CAUTION) {
      score -= 10;
    } else if (t.severity === TRIGGER_SEVERITY.WATCH) {
      score -= 5;
    }
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Evaluates whether a detected disruption is transient and can be weathered via a short pause.
 */
function calculateRecoveryWindow(activeTriggers = [], weatherTelemetry = {}, trafficTelemetry = {}) {
  const isRecovering = trafficTelemetry.isRecovering || trafficTelemetry.disruption?.recoveryTrend === 'IMPROVING';
  const rainProb = weatherTelemetry.precipitationProb ?? 0;
  const isHeavyRain = rainProb >= 65 || /heavy|storm|downpour/i.test(weatherTelemetry.condition || '');
  const hasGhatRisk = activeTriggers.some(t => t.type === 'GHAT_ROAD_RISK');

  if (isHeavyRain && !hasGhatRisk && rainProb < 80) {
    return {
      isRecoveryViable: true,
      suggestedPauseMinutes: 40,
      clearingOutlook: 'Moderate localized passing shower expected to ease within 40-50 minutes.',
      guidance: 'Recommend a 40-minute coffee or sheltered stop; outdoor conditions should improve without needing major route changes.',
    };
  }

  if (isRecovering) {
    return {
      isRecoveryViable: true,
      suggestedPauseMinutes: 20,
      clearingOutlook: 'Traffic flow is recovering back to normal corridor baseline.',
      guidance: 'Corridor clearing underway; a brief 20-minute refreshment pause will allow traffic congestion to dissipate.',
    };
  }

  return {
    isRecoveryViable: false,
    suggestedPauseMinutes: 0,
    clearingOutlook: hasGhatRisk ? 'Persistent ghat hazard requires active replanning or detour.' : 'Stable observed conditions.',
    guidance: null,
  };
}

/**
 * Generates forward-looking stop-by-stop health timeline at projected arrival minutes.
 */
function buildPredictiveTimeline(stops = [], activeTriggers = [], currentLag = 0) {
  const triggerStopMap = new Map();
  for (const t of activeTriggers) {
    if (t.stopId) {
      if (!triggerStopMap.has(t.stopId)) triggerStopMap.set(t.stopId, []);
      triggerStopMap.get(t.stopId).push(t);
    }
  }

  return stops.map(stop => {
    const stopTriggers = triggerStopMap.get(stop.id) || [];
    let status = 'HEALTHY';
    if (stopTriggers.some(t => t.severity === TRIGGER_SEVERITY.CRITICAL)) {
      status = 'CRITICAL';
    } else if (stopTriggers.some(t => t.severity === TRIGGER_SEVERITY.WARNING || t.severity === TRIGGER_SEVERITY.SEVERE)) {
      status = 'WARNING';
    } else if (stopTriggers.length > 0) {
      status = 'CAUTION';
    }

    return {
      stopId: stop.id,
      stopName: stop.name,
      category: stop.category,
      projectedArrivalMinute: stop.projectedArrivalMinute || (stop.plannedArrivalMinute + currentLag),
      status,
      triggerCount: stopTriggers.length,
      primaryRisk: stopTriggers.length > 0 ? stopTriggers[0].message : null,
    };
  });
}

/**
 * Evaluates the active trip and determines whether adaptation is recommended.
 *
 * @param {Object} journeyState
 * @param {Object} context - Unified intelligence context
 * @param {Object} [travelerDna]
 * @returns {Object} Trip Health Evaluation & Recommendations
 */
function evaluateTripGuardian(journeyState, context = {}, travelerDna = {}) {
  if (!journeyState || !Array.isArray(journeyState.stops)) {
    return {
      tripHealth: TRIP_HEALTH_STATES.INSUFFICIENT_DATA,
      shouldReplan: false,
      reasons: ['Journey state unavailable or malformed'],
      activeTriggers: [],
      preservedStops: [],
      affectedUpcomingStops: [],
      safetyScore: 50,
      predictiveTimeline: [],
      recoveryWindow: { isRecoveryViable: false },
    };
  }

  const active = journeyState.activeStop;
  const upcomingStops = Array.isArray(journeyState.upcomingStops) && journeyState.upcomingStops.length
    ? journeyState.upcomingStops
    : journeyState.stops.filter(s => s.status === 'PLANNED');
  const candidateStops = active ? [active, ...upcomingStops] : (upcomingStops.length ? upcomingStops : journeyState.stops.filter(s => s.status === 'PLANNED' || s.status === 'ACTIVE'));
  const completedStops = journeyState.completedStops || journeyState.stops.filter(s => s.status === 'COMPLETED');

  // If no active or upcoming stops remain, trip is completed
  if (candidateStops.length === 0) {
    return {
      tripHealth: TRIP_HEALTH_STATES.ON_TRACK,
      shouldReplan: false,
      reasons: ['All stops completed or journey finished.'],
      activeTriggers: [],
      preservedStops: completedStops.map(s => s.name),
      affectedUpcomingStops: [],
      safetyScore: 100,
      predictiveTimeline: [],
      recoveryWindow: { isRecoveryViable: false },
      evaluatedAt: new Date().toISOString(),
    };
  }

  const weatherTelemetry = context.weather || {};
  const trafficTelemetry = context.traffic || {};
  const safetyTelemetry = context.safety || {};

  const activeTriggers = evaluateTriggers({
    journeyState,
    upcomingStops: candidateStops,
    weatherTelemetry,
    trafficTelemetry,
    travelerDna,
    safetyTelemetry,
  });

  const criticalTriggers = activeTriggers.filter(t => t.severity === TRIGGER_SEVERITY.CRITICAL);
  const severeTriggers = activeTriggers.filter(t => t.severity === TRIGGER_SEVERITY.SEVERE || t.severity === TRIGGER_SEVERITY.WARNING);
  const cautionTriggers = activeTriggers.filter(t => t.severity === TRIGGER_SEVERITY.CAUTION);
  const suboptimalTriggers = activeTriggers.filter(t => t.severity === TRIGGER_SEVERITY.SUBOPTIMAL);
  const watchTriggers = activeTriggers.filter(t => t.severity === TRIGGER_SEVERITY.WATCH);

  let tripHealth = TRIP_HEALTH_STATES.ON_TRACK;
  let shouldReplan = false;
  const reasons = [];

  if (criticalTriggers.length > 0) {
    tripHealth = TRIP_HEALTH_STATES.CRITICAL;
    shouldReplan = true;
    criticalTriggers.forEach(t => reasons.push(`[CRITICAL] ${t.message}`));
  } else if (severeTriggers.length > 0) {
    tripHealth = TRIP_HEALTH_STATES.SAFETY_ACTION_RECOMMENDED;
    shouldReplan = true;
    severeTriggers.forEach(t => reasons.push(`[SAFETY_ACTION] ${t.message}`));
  } else if (cautionTriggers.length > 0) {
    tripHealth = TRIP_HEALTH_STATES.SAFETY_CAUTION;
    shouldReplan = false;
    cautionTriggers.forEach(t => reasons.push(`[SAFETY_CAUTION] ${t.message}`));
  } else if (suboptimalTriggers.length >= 2) {
    tripHealth = TRIP_HEALTH_STATES.REPLAN_RECOMMENDED;
    shouldReplan = true;
    suboptimalTriggers.forEach(t => reasons.push(`[SUBOPTIMAL] ${t.message}`));
  } else if (suboptimalTriggers.length === 1) {
    tripHealth = TRIP_HEALTH_STATES.SUBOPTIMAL;
    shouldReplan = true;
    reasons.push(`[SUBOPTIMAL] ${suboptimalTriggers[0].message}`);
  } else if (watchTriggers.length > 0) {
    tripHealth = TRIP_HEALTH_STATES.WATCH;
    shouldReplan = false;
    watchTriggers.forEach(t => reasons.push(`[WATCH] ${t.message}`));
  } else {
    reasons.push('Current plan remains optimal under observed conditions.');
  }

  const safetyScore = computeSafetyScore(activeTriggers);
  const recoveryWindow = calculateRecoveryWindow(activeTriggers, weatherTelemetry, trafficTelemetry);
  const predictiveTimeline = buildPredictiveTimeline(candidateStops, activeTriggers, journeyState.pacingLagMinutes || 0);

  // Derive plain-language actionable guidance
  let actionableGuidance = 'Continue journey on current planned trajectory.';
  if (tripHealth === TRIP_HEALTH_STATES.CRITICAL) {
    actionableGuidance = 'Immediate adaptation required: Severe weather or route obstruction threatens safety. Reroute to sheltered haven.';
  } else if (tripHealth === TRIP_HEALTH_STATES.SAFETY_ACTION_RECOMMENDED || tripHealth === TRIP_HEALTH_STATES.REPLAN_RECOMMENDED) {
    actionableGuidance = 'Adaptation advised: Remaining stops impaired by closing times or worsening conditions. Tap Adapt Plan to optimize.';
  } else if (recoveryWindow.isRecoveryViable) {
    actionableGuidance = recoveryWindow.guidance;
  }

  return {
    tripHealth,
    shouldReplan,
    reasons,
    activeTriggers,
    preservedStops: completedStops.map(s => s.name),
    affectedUpcomingStops: upcomingStops.map(s => s.name),
    activeStop: journeyState.activeStop ? journeyState.activeStop.name : null,
    pacingLagMinutes: journeyState.pacingLagMinutes || 0,
    safetyScore,
    recoveryWindow,
    predictiveTimeline,
    actionableGuidance,
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = {
  evaluateTripGuardian,
  computeSafetyScore,
  calculateRecoveryWindow,
  buildPredictiveTimeline,
  TRIP_HEALTH_STATES,
};
