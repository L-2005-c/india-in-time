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
  CAUTION: 'CAUTION',
  WARNING: 'WARNING',
  SEVERE: 'SEVERE',
  CRITICAL: 'CRITICAL',
});

const NOTIFICATION_LIFECYCLES = Object.freeze({
  DETECTED: 'DETECTED',
  ACTIVE: 'ACTIVE',
  ESCALATED: 'ESCALATED',
  RESOLVED: 'RESOLVED',
  EXPIRED: 'EXPIRED',
  STALE: 'STALE',
});

const NOTIFICATION_ACTIONS = Object.freeze({
  VIEW_OPTIONS: 'VIEW_OPTIONS',
  APPLY_NEW_PLAN: 'APPLY_NEW_PLAN',
  KEEP_EXISTING: 'KEEP_EXISTING',
  REROUTE: 'REROUTE',
  WAIT_AND_RECHECK: 'WAIT_AND_RECHECK',
  EXPLORE_ALTERNATIVES: 'EXPLORE_ALTERNATIVES',
  // Phase 3 Safety Actions
  ACCEPT: 'ACCEPT',
  DECLINE: 'DECLINE',
  WAIT: 'WAIT',
  REPLACE_STOP: 'REPLACE_STOP',
  VIEW_ALTERNATIVE: 'VIEW_ALTERNATIVE',
  DISMISS: 'DISMISS',
  REASSESS: 'REASSESS',
});

// In-memory notification state registry: tripId -> array of notifications
const tripNotificationLogs = new Map();
// Deduplication registry: `${tripId}:${hazardId || disruptionId}` -> { lastNotifiedAt, lastSeverity, lastDelay, version }
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
 * Builds and dispatches a Phase 3 Safety & Risk proactive notification.
 */
function dispatchSafetyNotification({
  tripId = 'active_trip',
  signal = {},
  journeyImpact = {},
  travelerExposure = {},
  recommendedDecision = {},
  now = Date.now(),
}) {
  const severity = signal.severity || NOTIFICATION_SEVERITIES.WARNING;
  const isHardClosure = signal.hazardType === 'ROAD_CLOSURE' || signal.hazardType === 'EVACUATION_ALERT';
  const isEmergencyOverride = severity === NOTIFICATION_SEVERITIES.CRITICAL || isHardClosure;

  const dedupKey = `${tripId}:${signal.id || signal.hazardType}:${signal.affectedSegment || 'route'}`;
  const record = notificationDeduplicationRecords.get(dedupKey);

  // Check cooldown & escalation
  let reason = 'INITIAL_SAFETY_NOTIFICATION';
  let version = 1;

  if (record) {
    version = record.version + 1;
    const elapsedMs = now - record.lastNotifiedAt;
    const severityRanks = { INFO: 0, WATCH: 1, CAUTION: 2, WARNING: 3, SEVERE: 4, CRITICAL: 5 };
    const currentRank = severityRanks[severity] || 0;
    const previousRank = severityRanks[record.lastSeverity] || 0;

    if (currentRank > previousRank) {
      reason = `SEVERITY_ESCALATED (${record.lastSeverity} -> ${severity})`;
    } else if (isEmergencyOverride) {
      reason = 'EMERGENCY_OVERRIDE';
    } else if (elapsedMs < COOLDOWN_WINDOW_MS) {
      return {
        dispatched: false,
        reason: `SUPPRESSED_BY_COOLDOWN (last notified ${(elapsedMs / 60000).toFixed(1)}m ago)`,
      };
    } else {
      reason = 'COOLDOWN_EXPIRED_CONDITION_ACTIVE';
    }
  }

  // 7 structured answers
  let whatHappened = signal.description || `Safety condition detected: ${signal.hazardType}.`;
  if (signal.isStale) {
    whatHappened = `Current safety information could not be refreshed. The previous warning was last confirmed ${signal.ageMinutes || 40} minutes ago.`;
  } else if (signal.sourceConflict) {
    whatHappened = `Sources disagree on ${signal.hazardType}: Official warning remains active even though the current model forecast indicates lighter intensity.`;
  }

  const where = signal.location?.name || signal.affectedArea || 'Planned Route Segment';
  const howBad = signal.evidence?.[0] || `${signal.severity} severity condition`;
  const howKnown = signal.source ? `${signal.source} (${signal.dataState || 'OBSERVED'})` : 'Authoritative sensor network';
  const doesItAffectTrip = journeyImpact.reason || (travelerExposure.isExposed
    ? `Direct overlap: Traveler scheduled to be in ${where} during active window.`
    : 'Identified on or adjacent to travel corridor.');
  const whatShouldIDo = recommendedDecision.explanation?.nextStep || (isHardClosure ? 'Avoid route segment; follow official diversion.' : 'Review safe alternatives.');
  const whyThisRecommendation = recommendedDecision.explanation?.primaryDriver || 'Conservative interpretation prioritized for traveler safety.';

  const availableActions = [
    NOTIFICATION_ACTIONS.ACCEPT,
    NOTIFICATION_ACTIONS.DECLINE,
    NOTIFICATION_ACTIONS.WAIT,
    NOTIFICATION_ACTIONS.REROUTE,
    NOTIFICATION_ACTIONS.REPLACE_STOP,
    NOTIFICATION_ACTIONS.VIEW_ALTERNATIVE,
    NOTIFICATION_ACTIONS.DISMISS,
  ];

  const notificationId = `notif_safe_${crypto.randomBytes(6).toString('hex')}`;
  const notification = {
    notificationId,
    tripId,
    category: 'SAFETY',
    severity,
    lifecycleState: signal.isStale ? NOTIFICATION_LIFECYCLES.STALE : NOTIFICATION_LIFECYCLES.ACTIVE,
    hazardType: signal.hazardType,
    hazardId: signal.id,
    version,
    whatHappened,
    where,
    howBad,
    howKnown,
    source: signal.source || 'Official Feed',
    provider: signal.provider || 'NDMA/IMD',
    sourceType: signal.sourceType || 'GOVERNMENT_WARNING',
    issuedAt: signal.issuedAt || new Date(now).toISOString(),
    observedAt: signal.observedAt || null,
    validUntil: signal.validUntil || null,
    dataState: signal.dataState || 'OFFICIAL_WARNING',
    freshness: signal.freshness || 'FRESH',
    hazardConfidence: signal.confidence || signal.hazardConfidence || 'HIGH',
    causeConfidence: signal.causeConfidence || 'HIGH',
    impactConfidence: signal.impactConfidence || 'MEDIUM',
    journeyImpact: journeyImpact.impactState || 'HIGH_IMPACT',
    recommendedAction: recommendedDecision.decision || 'CAUTION',
    recommendationReason: whyThisRecommendation,
    affectedStops: journeyImpact.affectedStops || [],
    affectedSegments: signal.affectedSegment ? [signal.affectedSegment] : [],
    actions: availableActions,
    timestamp: new Date(now).toISOString(),
    status: 'ACTIVE',
    answers: {
      whatHappened,
      where,
      howBad,
      howKnown,
      whatDoesItMeanForYourTrip: doesItAffectTrip,
      whatShouldYouDoRightNow: whatShouldIDo,
      whyThisRecommendation,
    },
  };

  notificationDeduplicationRecords.set(dedupKey, {
    lastNotifiedAt: now,
    lastSeverity: severity,
    lastDelay: 0,
    version,
  });

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
    reason,
  };
}

/**
 * Dispatches a resolution notification when a safety hazard clears.
 */
function resolveSafetyNotification({
  tripId = 'active_trip',
  hazardId = 'hazard_001',
  hazardType = 'Safety condition',
  reason = 'Hazard expired or no longer on route',
  now = Date.now(),
} = {}) {
  const notificationId = `notif_res_${crypto.randomBytes(6).toString('hex')}`;
  const notification = {
    notificationId,
    tripId,
    category: 'SAFETY',
    severity: NOTIFICATION_SEVERITIES.INFO,
    lifecycleState: NOTIFICATION_LIFECYCLES.RESOLVED,
    hazardType,
    hazardId,
    whatHappened: `Safety condition resolved for ${hazardType}.`,
    where: 'Planned route',
    howBad: 'Resolved / Normal conditions restored',
    howKnown: 'Authoritative telemetry confirms condition is no longer active on corridor.',
    source: 'Safety Monitoring Engine',
    dataState: 'OBSERVED',
    freshness: 'FRESH',
    hazardConfidence: 'HIGH',
    causeConfidence: 'HIGH',
    impactConfidence: 'NO_IMPACT',
    journeyImpact: 'NO_IMPACT',
    recommendedAction: 'CONTINUE',
    recommendationReason: reason || 'The previously identified safety condition no longer materially affects the evaluated route based on the latest available data.',
    reason: reason || 'Hazard resolved',
    timestamp: new Date(now).toISOString(),
    status: 'RESOLVED',
    answers: {
      whatHappened: `Safety condition resolved for ${hazardType}.`,
      where: 'Planned route',
      howBad: 'Condition cleared',
      howKnown: 'Authoritative telemetry confirms clearance.',
      whatDoesItMeanForYourTrip: 'Your next route segment is no longer within the active warning window. Your planned route can be reassessed.',
      whatShouldYouDoRightNow: 'Resume planned journey or reassess itinerary.',
      whyThisRecommendation: 'The previously identified safety condition no longer materially affects the evaluated route based on the latest available data.',
    },
    actions: [NOTIFICATION_ACTIONS.ACCEPT, NOTIFICATION_ACTIONS.REASSESS],
  };

  let tripLogs = tripNotificationLogs.get(tripId);
  if (!tripLogs) {
    tripLogs = [];
    tripNotificationLogs.set(tripId, tripLogs);
  }

  for (const n of tripLogs) {
    if (n.hazardId === hazardId && n.status === 'ACTIVE') {
      n.status = 'RESOLVED';
      n.lifecycleState = NOTIFICATION_LIFECYCLES.RESOLVED;
    }
  }

  tripLogs.unshift(notification);
  return { resolved: true, notification };
}

/**
 * Builds and dispatches a Phase 4 Experience Value proactive notification.
 */
function dispatchExperienceNotification({
  tripId = 'active_trip',
  recommendation = {},
  explanation = {},
  timeBudget = {},
  now = Date.now(),
} = {}) {
  const candidate = recommendation.candidate || {};
  const placeId = candidate.id || 'destination';
  const dedupKey = `${tripId}:exp:${placeId}`;

  const record = notificationDeduplicationRecords.get(dedupKey);
  let version = 1;

  if (record) {
    version = record.version + 1;
    const elapsedMs = now - record.lastNotifiedAt;
    if (elapsedMs < COOLDOWN_WINDOW_MS) {
      return {
        dispatched: false,
        reason: `SUPPRESSED_BY_COOLDOWN (last notified ${(elapsedMs / 60000).toFixed(1)}m ago)`,
      };
    }
  }

  const notificationId = `notif_exp_${crypto.randomBytes(6).toString('hex')}`;
  const notification = {
    notificationId,
    tripId,
    category: 'EXPERIENCE_VALUE',
    severity: NOTIFICATION_SEVERITIES.INFO,
    headline: `✨ BEST USE OF TIME: ${candidate.name || 'Optimal Experience'}`,
    actionType: recommendation.actionType || 'DO_NOW',
    qa: {
      whatHappened: `High-value experience window detected for ${candidate.name || 'destination'}.`,
      why: explanation.headline || 'High alignment with your available time and preferences.',
      howLong: `${candidate.visitMinutes || 45} minutes recommended stay.`,
      when: `Current usable time bank: ${timeBudget.usableExperienceMinutes ?? 45} minutes.`,
      doesItAffectTrip: explanation.tradeoff || 'Fits within usable schedule without sacrificing stops.',
      whatShouldIDo: recommendation.actionType === 'DO_NOW' ? 'Visit now to capture optimal conditions.' : 'Review experience recommendation.',
      howConfidentAreWe: `${explanation.confidence || 85}% confidence grounded in temporal and destination telemetry.`,
    },
    recommendation,
    explanation,
    availableActions: [
      NOTIFICATION_ACTIONS.ACCEPT,
      NOTIFICATION_ACTIONS.DECLINE,
      NOTIFICATION_ACTIONS.VIEW_OPTIONS,
    ],
    timestamp: new Date(now).toISOString(),
    status: 'ACTIVE',
  };

  notificationDeduplicationRecords.set(dedupKey, {
    lastNotifiedAt: now,
    lastSeverity: NOTIFICATION_SEVERITIES.INFO,
    lastDelay: 0,
    version,
  });

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
  NOTIFICATION_LIFECYCLES,
  NOTIFICATION_ACTIONS,
  dispatchDisruptionNotification,
  dispatchSafetyNotification,
  dispatchExperienceNotification,
  resolveSafetyNotification,
  getTripNotifications,
  resetNotificationEngine,
};
