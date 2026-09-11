'use strict';

/**
 * services/travelIntelligence/disruption/index.js
 *
 * India In-Time v3.0 — Disruption Intelligence Layer Facade
 */

const {
  detectTrafficAnomaly,
  TRAFFIC_ANOMALY_STATES,
  resetCorridorHistories,
} = require('./trafficAnomalyDetector');

const {
  EVENT_TYPES,
  CANONICAL_PLANNED_EVENTS,
  queryPlannedEvents,
  correlateEventWithTraffic,
} = require('./eventIntelligence');

const {
  classifyDisruption,
  DISRUPTION_CAUSES,
  DISRUPTION_SEVERITIES,
  DATA_STATES,
} = require('./disruptionClassifier');

const {
  evaluateJourneyImpact,
  JOURNEY_IMPACT_STATES,
} = require('./journeyImpactEngine');

const {
  dispatchDisruptionNotification,
  getTripNotifications,
  resetNotificationEngine,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_ACTIONS,
} = require('./disruptionNotificationEngine');

/**
 * Executes the full end-to-end disruption intelligence pipeline for a trip:
 *
 * TRAFFIC / EVENT INPUT
 *         ↓
 * DATA VALIDATION
 *         ↓
 * BASELINE COMPARISON
 *         ↓
 * TRAFFIC ANOMALY DETECTION
 *         ↓
 * DISRUPTION CLASSIFICATION
 *         ↓
 * CAUSE EVIDENCE & CONFIDENCES
 *         ↓
 * JOURNEY IMPACT
 *         ↓
 * NOTIFICATION EVALUATION
 *
 * @param {Object} input
 * @returns {Object} Complete disruption intelligence evaluation result
 */
function evaluateTripDisruptions({
  tripId = 'active_trip',
  journeyState = {},
  travelerDna = {},
  currentTravelMinutes,
  freeFlowMinutes = null,
  corridorName = 'Transit Corridor',
  coords = null,
  incidentReport = null,
  customEvents = null,
  minuteOfDay = null,
  timestamp = Date.now(),
  isSimulation = false,
  recommendedDecision = null,
} = {}) {
  const currentMin = minuteOfDay != null ? minuteOfDay : (journeyState.currentMinute || 720);

  // 1. Detect Traffic Anomaly
  const trafficAnomaly = detectTrafficAnomaly({
    corridorKey: corridorName,
    currentTravelMinutes,
    freeFlowMinutes,
    coords,
    minuteOfDay: currentMin,
    timestamp,
  });

  // 2. Classify Disruption & Confidences
  const disruption = classifyDisruption({
    tripId,
    trafficAnomaly,
    incidentReport,
    coords,
    corridorName,
    targetMinute: currentMin,
    customEvents,
    isSimulation,
  });

  // 3. Evaluate Journey Impact on THIS trip
  const journeyImpact = evaluateJourneyImpact({
    journeyState,
    disruption,
    travelerDna,
  });
  disruption.journeyImpact = journeyImpact.impactState;
  disruption.affectedStops = journeyImpact.affectedStops;

  // 4. Evaluate Proactive Travel Guardian Notification
  const notificationOutcome = dispatchDisruptionNotification({
    tripId,
    disruption,
    journeyImpact,
    recommendedDecision: recommendedDecision || { decision: journeyImpact.hasHardViolations ? 'ALTERNATIVE_REQUIRED' : 'ADAPT_PLAN' },
    now: timestamp,
  });

  return {
    tripId,
    trafficAnomaly,
    disruption,
    journeyImpact,
    notificationOutcome,
    evaluatedAt: new Date(timestamp).toISOString(),
  };
}

module.exports = {
  evaluateTripDisruptions,
  detectTrafficAnomaly,
  TRAFFIC_ANOMALY_STATES,
  resetCorridorHistories,
  EVENT_TYPES,
  CANONICAL_PLANNED_EVENTS,
  queryPlannedEvents,
  correlateEventWithTraffic,
  classifyDisruption,
  DISRUPTION_CAUSES,
  DISRUPTION_SEVERITIES,
  DATA_STATES,
  evaluateJourneyImpact,
  JOURNEY_IMPACT_STATES,
  dispatchDisruptionNotification,
  getTripNotifications,
  resetNotificationEngine,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_ACTIONS,
};
