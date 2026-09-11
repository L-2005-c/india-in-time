'use strict';

/**
 * services/travelIntelligence/nextJourney/nextJourneyObservability.js
 *
 * Real-Time Telemetry & Observability Engine for Phase 6.
 *
 * Strictly separates LIVE operational metrics from SIMULATED metrics.
 */

const liveMetrics = {
  next_leg_intent_count: 0,
  next_leg_creation_count: 0,
  next_leg_completion_count: 0,
  home_selection: 0,
  hotel_selection: 0,
  restaurant_selection: 0,
  airport_selection: 0,
  rail_selection: 0,
  bus_selection: 0,
  custom_destination_selection: 0,
  next_leg_evaluation_count: 0,
  next_leg_decision_count: 0,
  next_leg_adaptation_count: 0,
  deadline_risk_count: 0,
  hotel_trust_conflict: 0,
  next_leg_safety_intervention: 0,
  next_leg_notification: 0,
  next_leg_outcome: 0,
};

const simulatedMetrics = { ...liveMetrics };

function recordNextJourneyMetric(metricName, isSimulated = false, delta = 1) {
  const store = isSimulated ? simulatedMetrics : liveMetrics;
  if (Object.prototype.hasOwnProperty.call(store, metricName)) {
    store[metricName] += delta;
  }
}

function getNextJourneyMetrics() {
  return {
    live: { ...liveMetrics },
    simulated: { ...simulatedMetrics },
    timestamp: new Date().toISOString(),
  };
}

function resetNextJourneyMetrics() {
  Object.keys(liveMetrics).forEach(k => {
    liveMetrics[k] = 0;
    simulatedMetrics[k] = 0;
  });
}

const nextJourneyObservability = {
  record: recordNextJourneyMetric,
  getMetrics: getNextJourneyMetrics,
  reset: resetNextJourneyMetrics,
};

module.exports = {
  recordNextJourneyMetric,
  getNextJourneyMetrics,
  resetNextJourneyMetrics,
  nextJourneyObservability,
};
