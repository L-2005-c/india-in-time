'use strict';

/**
 * services/travelIntelligence/disruption/disruptionNotificationEngine.js
 *
 * India In-Time v3.0 — Travel Guardian Proactive Notification Dispatcher
 *
 * Core Principles:
 * 1. Proactive, informative alerts that answer:
 *    WHAT HAPPENED? WHY? HOW LONG? WHEN? DOES IT AFFECT MY TRIP? WHAT SHOULD I DO? HOW CONFIDENT ARE WE?
 * 2. Anti-Spam & Deduplication:
 *    - Strict cooldown (15m) for identical or stable conditions.
 *    - Allows escalation when severity materially degrades (WATCH -> WARNING -> SEVERE).
 *    - Emergency override for verified road closures or critical safety hazards.
 * 3. Never silently rewrite itinerary: Delivers actionable choice payloads to traveler.
 */

const crypto = require('crypto');

const NOTIFICATION_SEVERITIES = Object.freeze({
  INFO: 'INFO',
  WATCH: 'WATCH',
  WARNING: 'WARNING',
  SEVERE: 'SEVERE',
  CRITICAL: 'CRITICAL',
});

const NOTIFICATION_ACTIONS = Object.freeze({
  VIEW_OPTIONS: 'VIEW_OPTIONS',
  APPLY_NEW_PLAN: 'APPLY_NEW_PLAN',
  KEEP_EXISTING: 'KEEP_EXISTING',
  REROUTE: 'REROUTE',
  WAIT_AND_RECHECK: 'WAIT_AND_RECHECK',
  EXPLORE_ALTERNATIVES: 'EXPLORE_ALTERNATIVES',
});

// In-memory notification state registry: tripId -> array of notifications
const tripNotificationLogs = new Map();
// Deduplication registry: `${tripId}:${disruptionId}` -> { lastNotifiedAt, lastSeverity, lastDelay, version }
const notificationDeduplicationRecords = new Map();

const COOLDOWN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Determines whether a notification is eligible to be dispatched, respecting deduplication and escalation.
 */
function shouldDispatchNotification({
  tripId,
  disruptionId,
  severity,
  delayMinutes,
  isEmergencyOverride = false,
  now = Date.now(),
}) {
  if (isEmergencyOverride) {
    return { shouldDispatch: true, reason: 'EMERGENCY_OVERRIDE', version: 1 };
  }

  // Only WARNING, SEVERE, CRITICAL or proactive high-impact WATCH warrant traveler interruption
  if (severity === NOTIFICATION_SEVERITIES.INFO) {
    return { shouldDispatch: false, reason: 'SEVERITY_BELOW_INTERRUPTION_THRESHOLD' };
  }

  const dedupKey = `${tripId}:${disruptionId}`;
  const record = notificationDeduplicationRecords.get(dedupKey);

  if (!record) {
    return { shouldDispatch: true, reason: 'INITIAL_DISRUPTION_NOTIFICATION', version: 1 };
  }

  const elapsedMs = now - record.lastNotifiedAt;

  // Check Escalation: Did severity increase?
  const severityRanks = { WATCH: 1, WARNING: 2, SEVERE: 3, CRITICAL: 4 };
  const currentRank = severityRanks[severity] || 0;
  const previousRank = severityRanks[record.lastSeverity] || 0;

  if (currentRank > previousRank) {
    return {
      shouldDispatch: true,
      reason: `SEVERITY_ESCALATED (${record.lastSeverity} -> ${severity})`,
      version: record.version + 1,
    };
  }

  // Check Material Deterioration: Did delay jump by >= 15 minutes?
  if (delayMinutes - record.lastDelay >= 15) {
    return {
      shouldDispatch: true,
      reason: `MATERIAL_DELAY_INCREASE (+${delayMinutes - record.lastDelay}m)`,
      version: record.version + 1,
    };
  }

  // Inside cooldown window for unchanged condition -> suppress
  if (elapsedMs < COOLDOWN_WINDOW_MS) {
    return {
      shouldDispatch: false,
      reason: `SUPPRESSED_BY_COOLDOWN (last notified ${(elapsedMs / 60000).toFixed(1)}m ago)`,
    };
  }

  return { shouldDispatch: true, reason: 'COOLDOWN_EXPIRED_CONDITION_ACTIVE', version: record.version + 1 };
}

/**
 * Builds and records a proactive Travel Guardian notification from a disruption and journey impact evaluation.
 *
 * @param {Object} input
 * @param {string} input.tripId
 * @param {Object} input.disruption - From classifyDisruption
 * @param {Object} input.journeyImpact - From evaluateJourneyImpact
 * @param {Object} [input.recommendedDecision] - From Decision Engine
 * @param {number} [input.now]
 * @returns {Object} Notification outcome
 */
function dispatchDisruptionNotification({
  tripId = 'active_trip',
  disruption = {},
  journeyImpact = {},
  recommendedDecision = {},
  now = Date.now(),
} = {}) {
  const disruptionId = disruption.disruptionId || 'dsr_generic';
  const severity = disruption.severity || NOTIFICATION_SEVERITIES.WARNING;
  const delayMinutes = Number(disruption.estimatedDelay || 0);
  const isEmergencyOverride = disruption.eventType === 'ROAD_CLOSURE' ||
    disruption.eventType === 'EMERGENCY' ||
    severity === NOTIFICATION_SEVERITIES.CRITICAL;

  const dedupCheck = shouldDispatchNotification({
    tripId,
    disruptionId,
    severity,
    delayMinutes,
    isEmergencyOverride,
    now,
  });

  if (!dedupCheck.shouldDispatch) {
    return {
      dispatched: false,
      reason: dedupCheck.reason,
      disruptionId,
    };
  }

  // 1. Structure the 7 core answers
  const isCauseVerified = disruption.isCauseVerified === true;
  const causeLabel = isCauseVerified
    ? disruption.eventType.replace(/_/g, ' ')
    : 'Currently unverified';

  const whatHappened = delayMinutes > 0
    ? `Your planned transit along ${disruption.corridor || 'the corridor'} has increased by ~${delayMinutes} minutes (${disruption.delayRange || ''}).`
    : `A traffic condition has been detected along ${disruption.corridor || 'your route'}.`;

  const why = isCauseVerified
    ? `Verified event: ${disruption.evidence?.[0] || disruption.eventType}.`
    : `Major congestion detected. Cause is ${causeLabel}.`;

  const howLong = `Estimated delay: +${delayMinutes} min (Duration: ~${disruption.delayRange || '45-60 min'}).`;
  const when = disruption.detectedAt ? `Active now (Detected at ${new Date(disruption.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : 'Active now';

  let doesItAffectTrip = 'Your remaining stops are currently on track.';
  if (journeyImpact.threatenedWindows?.length > 0) {
    doesItAffectTrip = journeyImpact.threatenedWindows.map(w => w.detail).join('; ');
  } else if (journeyImpact.breachedConstraints?.length > 0) {
    doesItAffectTrip = journeyImpact.breachedConstraints.map(b => b.detail).join('; ');
  } else if (delayMinutes >= 25) {
    doesItAffectTrip = `Compresses schedule buffer for remaining ${journeyImpact.remainingStopsCount || 0} stops.`;
  }

  const decisionState = recommendedDecision.decision || 'ADAPT_PLAN';
  let whatShouldIDo = 'Review route options in Trip Control Center.';
  if (decisionState === 'WAIT') {
    whatShouldIDo = 'Wait 15–20 minutes at current stop to let peak congestion dissipate before departing.';
  } else if (decisionState === 'REROUTE') {
    whatShouldIDo = 'Take the recommended bypass corridor to save travel time.';
  } else if (decisionState === 'REORDER') {
    whatShouldIDo = 'Reorder your next stops to avoid the congested corridor during peak rush.';
  } else if (decisionState === 'ALTERNATIVE_REQUIRED' || decisionState === 'REPLACE_STOP') {
    whatShouldIDo = 'Substitute affected stop with nearby open cultural/indoor alternative.';
  }

  const confidenceStatement = `Disruption confidence: ${disruption.disruptionConfidence || 'HIGH'}. Cause confidence: ${disruption.causeConfidence || 'LOW'}.`;

  const availableActions = [NOTIFICATION_ACTIONS.VIEW_OPTIONS];
  if (decisionState === 'REROUTE') availableActions.push(NOTIFICATION_ACTIONS.REROUTE);
  if (decisionState === 'WAIT') availableActions.push(NOTIFICATION_ACTIONS.WAIT_AND_RECHECK);
  if (decisionState === 'REORDER') availableActions.push(NOTIFICATION_ACTIONS.APPLY_NEW_PLAN);
  if (decisionState === 'ALTERNATIVE_REQUIRED') availableActions.push(NOTIFICATION_ACTIONS.EXPLORE_ALTERNATIVES);
  availableActions.push(NOTIFICATION_ACTIONS.KEEP_EXISTING);

  const notificationId = `notif_${crypto.randomBytes(6).toString('hex')}`;
  const notification = {
    notificationId,
    tripId,
    disruptionId,
    version: dedupCheck.version,
    severity,
    headline: severity === 'CRITICAL' ? '🚨 CRITICAL ROUTE ALERT' : (severity === 'SEVERE' ? '⚠️ MAJOR TRAFFIC DISRUPTION' : '⚡ TRAFFIC ALERT'),
    qa: {
      whatHappened,
      why,
      howLong,
      when,
      doesItAffectTrip,
      whatShouldIDo,
      howConfidentAreWe: confidenceStatement,
    },
    disruptionConfidence: disruption.disruptionConfidence || 'HIGH',
    causeConfidence: disruption.causeConfidence || 'LOW',
    isCauseVerified,
    causeLabel,
    availableActions,
    recommendedAction: decisionState,
    timestamp: new Date(now).toISOString(),
    status: 'ACTIVE',
  };

  // Record in deduplication table
  const dedupKey = `${tripId}:${disruptionId}`;
  notificationDeduplicationRecords.set(dedupKey, {
    lastNotifiedAt: now,
    lastSeverity: severity,
    lastDelay: delayMinutes,
    version: dedupCheck.version,
  });

  // Record in trip log
  let tripLogs = tripNotificationLogs.get(tripId);
  if (!tripLogs) {
    tripLogs = [];
    tripNotificationLogs.set(tripId, tripLogs);
  }
  tripLogs.unshift(notification);
  if (tripLogs.length > 50) tripLogs.pop();

  return {
    dispatched: true,
    notification,
    reason: dedupCheck.reason,
  };
}

/**
 * Retrieves notifications for a trip.
 */
function getTripNotifications(tripId) {
  return tripNotificationLogs.get(tripId) || [];
}

/**
 * Clears deduplication cache (for testing).
 */
function resetNotificationEngine() {
  tripNotificationLogs.clear();
  notificationDeduplicationRecords.clear();
}

module.exports = {
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_ACTIONS,
  dispatchDisruptionNotification,
  getTripNotifications,
  resetNotificationEngine,
};
