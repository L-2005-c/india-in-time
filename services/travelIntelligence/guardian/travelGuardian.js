'use strict';

/**
 * services/travelIntelligence/guardian/travelGuardian.js
 *
 * Real-Time Travel Guardian for India In-Time v3.0.
 * Continuously evaluates journey health against weather, traffic, delays, and closures.
 *
 * Possible Health States:
 * - ON_TRACK
 * - WATCH
 * - SUBOPTIMAL
 * - REPLAN_RECOMMENDED
 * - CRITICAL
 * - INSUFFICIENT_DATA
 */

const { evaluateTriggers, TRIGGER_SEVERITY } = require('./triggerFramework');
const { TRIP_HEALTH_STATES } = require('../journey/journeyStateEngine');

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
    };
  }

  const weatherTelemetry = context.weather || {};
  const trafficTelemetry = context.traffic || {};

  const activeTriggers = evaluateTriggers({
    journeyState,
    upcomingStops: candidateStops,
    weatherTelemetry,
    trafficTelemetry,
    travelerDna,
  });

  const criticalTriggers = activeTriggers.filter(t => t.severity === TRIGGER_SEVERITY.CRITICAL);
  const suboptimalTriggers = activeTriggers.filter(t => t.severity === TRIGGER_SEVERITY.SUBOPTIMAL);
  const watchTriggers = activeTriggers.filter(t => t.severity === TRIGGER_SEVERITY.WATCH);

  let tripHealth = TRIP_HEALTH_STATES.ON_TRACK;
  let shouldReplan = false;
  const reasons = [];

  if (criticalTriggers.length > 0) {
    tripHealth = TRIP_HEALTH_STATES.CRITICAL;
    shouldReplan = true;
    criticalTriggers.forEach(t => reasons.push(`[CRITICAL] ${t.message}`));
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

  return {
    tripHealth,
    shouldReplan,
    reasons,
    activeTriggers,
    preservedStops: completedStops.map(s => s.name),
    affectedUpcomingStops: upcomingStops.map(s => s.name),
    activeStop: journeyState.activeStop ? journeyState.activeStop.name : null,
    pacingLagMinutes: journeyState.pacingLagMinutes || 0,
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = {
  evaluateTripGuardian,
  TRIP_HEALTH_STATES,
};
