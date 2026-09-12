'use strict';

/**
 * services/travelIntelligence/decision/productionLearningEngine.js
 *
 * India In-Time v3.0 — Phase 9A: Controlled Pilot Expansion & Production Learning Engine
 *
 * Core Capabilities:
 * 1. Structured Decision Outcome Model (Section 7)
 * 2. 10 Separate Decision Quality Metrics (Section 8)
 * 3. Multi-Stage Alert Timeliness Measurement (Section 12)
 * 4. Longitudinal Source Disagreement Logging (Section 14)
 * 5. Pilot Cohort Partitioning & Comparison (Section 3, 4, 23)
 * 6. Non-Negotiable Safety Primacy & Anti-Drift Governance (Section 9, 33)
 */

const MAX_OUTCOME_HISTORY = 1000;
const MAX_DISAGREEMENT_HISTORY = 500;

const COHORT_STAGES = Object.freeze({
  STAGE_A: 'STAGE_A', // Internal / trusted users
  STAGE_B: 'STAGE_B', // Small invited traveler cohort
  STAGE_C: 'STAGE_C', // Expanded pilot
  STAGE_D: 'STAGE_D', // Pre-general-availability cohort
});

const VALID_ACTIONS = Object.freeze(['ACCEPTED', 'REJECTED', 'IGNORED', 'MODIFIED', 'COMPLETED']);
const VALID_OUTCOMES = Object.freeze(['SUCCESS', 'PARTIAL', 'FAILED', 'REVERSED', 'PENDING']);

// In-memory repositories (mirrored to persistent analytics sink)
const inMemoryOutcomes = [];
const inMemorySourceDisagreements = [];
const inMemoryTimelinessLogs = [];

// Cumulative counters for Section 8 metrics
const qualityCounters = {
  totalEvaluated: 0,
  acceptedCount: 0,
  rejectedCount: 0,
  ignoredCount: 0,
  modifiedCount: 0,
  completedCount: 0,
  usefulCount: 0,
  notUsefulCount: 0,
  overrideCount: 0,
  reversalCount: 0,
  falsePositiveCount: 0,
  falseNegativeCount: 0,
  staleInformationCount: 0,
  successfulOutcomeCount: 0,
  safetyEscalationCount: 0,
  latenciesMs: [],
  falsePositiveCauses: {
    provider_noise: 0,
    stale_data: 0,
    over_sensitive_threshold: 0,
    incorrect_correlation: 0,
  },
  falseNegativeCauses: {
    provider_unavailable: 0,
    ingestion_delay: 0,
    classifier_failure: 0,
    route_mapping_failure: 0,
  },
  cohortStats: {
    STAGE_A: { decisions: 0, accepted: 0, completed: 0, useful: 0, totalRatings: 0 },
    STAGE_B: { decisions: 0, accepted: 0, completed: 0, useful: 0, totalRatings: 0 },
    STAGE_C: { decisions: 0, accepted: 0, completed: 0, useful: 0, totalRatings: 0 },
    STAGE_D: { decisions: 0, accepted: 0, completed: 0, useful: 0, totalRatings: 0 },
  },
};

/**
 * Records a structured decision outcome conforming to Section 7.
 *
 * @param {Object} payload
 * @param {string} payload.decisionId - Unique decision audit ID
 * @param {string} payload.tripId - Privacy-safe trip ID
 * @param {string} [payload.legId] - Active leg / stop sequence ID
 * @param {string} [payload.cohortId] - STAGE_A, STAGE_B, STAGE_C, or STAGE_D
 * @param {string} [payload.decisionType] - e.g. 'REROUTE', 'WAIT', 'REORDER', 'ADAPT_PLAN'
 * @param {string} [payload.decisionState] - Decision state constant
 * @param {any} [payload.recommendation] - Structured recommendation content
 * @param {string} [payload.travelerAction] - ACCEPTED, REJECTED, IGNORED, MODIFIED, COMPLETED
 * @param {string} [payload.outcome] - SUCCESS, PARTIAL, FAILED, REVERSED
 * @param {Object} [payload.feedback] - { useful: boolean, category: string, notes: string }
 * @param {string} [payload.dataState] - LIVE, PREDICTED, ESTIMATED, STALE, UNAVAILABLE
 * @param {Object} [payload.providerContext] - Provider telemetry snapshot
 * @param {number} [payload.latencyMs] - Engine execution time
 * @returns {Object} Stored outcome record
 */
function recordDecisionOutcome(payload = {}) {
  const {
    decisionId,
    tripId = 'trip_anonymous',
    legId = 'leg_default',
    cohortId = COHORT_STAGES.STAGE_B,
    decisionType = 'ADAPTIVE_DECISION',
    decisionState = 'KEEP_PLAN',
    recommendation = null,
    travelerAction = 'ACCEPTED',
    actionTimestamp = new Date().toISOString(),
    outcome = 'SUCCESS',
    feedback = null,
    dataState = 'LIVE',
    providerContext = {},
    latencyMs = 45,
    isReversal = false,
    isOverride = false,
    isFalsePositive = false,
    falsePositiveCause = null,
    isFalseNegative = false,
    falseNegativeCause = null,
    isSafetyEscalation = false,
  } = payload;

  if (!decisionId) {
    throw new Error('decisionId is required to record a structured decision outcome');
  }

  const normAction = String(travelerAction).toUpperCase();
  const validAction = VALID_ACTIONS.includes(normAction) ? normAction : 'ACCEPTED';
  const normOutcome = String(outcome).toUpperCase();
  const validOutcome = VALID_OUTCOMES.includes(normOutcome) ? normOutcome : 'SUCCESS';
  const assignedCohort = COHORT_STAGES[cohortId] || COHORT_STAGES.STAGE_B;

  const record = {
    decisionId: String(decisionId),
    tripId: String(tripId),
    legId: String(legId),
    cohortId: assignedCohort,
    decisionType: String(decisionType),
    decisionState: String(decisionState),
    timestamp: new Date().toISOString(),
    recommendation,
    travelerAction: validAction,
    actionTimestamp,
    outcome: validOutcome,
    feedback: feedback ? {
      useful: Boolean(feedback.useful),
      category: feedback.category ? String(feedback.category) : undefined,
      notes: feedback.notes ? String(feedback.notes).slice(0, 500) : undefined,
    } : null,
    dataState: String(dataState),
    providerContext: providerContext || {},
    latencyMs: Number(latencyMs) || 45,
    isReversal: Boolean(isReversal),
    isOverride: Boolean(isOverride),
    isFalsePositive: Boolean(isFalsePositive),
    isFalseNegative: Boolean(isFalseNegative),
    isSafetyEscalation: Boolean(isSafetyEscalation),
  };

  inMemoryOutcomes.push(record);
  if (inMemoryOutcomes.length > MAX_OUTCOME_HISTORY) {
    inMemoryOutcomes.shift();
  }

  // Update Counters
  qualityCounters.totalEvaluated++;
  if (validAction === 'ACCEPTED') qualityCounters.acceptedCount++;
  else if (validAction === 'REJECTED') qualityCounters.rejectedCount++;
  else if (validAction === 'IGNORED') qualityCounters.ignoredCount++;
  else if (validAction === 'MODIFIED') qualityCounters.modifiedCount++;
  else if (validAction === 'COMPLETED') qualityCounters.completedCount++;

  if (validOutcome === 'SUCCESS') qualityCounters.successfulOutcomeCount++;
  if (isReversal) qualityCounters.reversalCount++;
  if (isOverride || validAction === 'REJECTED') qualityCounters.overrideCount++;
  if (isSafetyEscalation) qualityCounters.safetyEscalationCount++;

  if (feedback && typeof feedback.useful === 'boolean') {
    if (feedback.useful) qualityCounters.usefulCount++;
    else qualityCounters.notUsefulCount++;
  }

  if (dataState === 'STALE') {
    qualityCounters.staleInformationCount++;
  }

  if (isFalsePositive) {
    qualityCounters.falsePositiveCount++;
    if (falsePositiveCause && qualityCounters.falsePositiveCauses[falsePositiveCause] !== undefined) {
      qualityCounters.falsePositiveCauses[falsePositiveCause]++;
    }
  }

  if (isFalseNegative) {
    qualityCounters.falseNegativeCount++;
    if (falseNegativeCause && qualityCounters.falseNegativeCauses[falseNegativeCause] !== undefined) {
      qualityCounters.falseNegativeCauses[falseNegativeCause]++;
    }
  }

  if (Number.isFinite(latencyMs)) {
    qualityCounters.latenciesMs.push(latencyMs);
    if (qualityCounters.latenciesMs.length > 500) qualityCounters.latenciesMs.shift();
  }

  // Cohort partitioning
  const cStats = qualityCounters.cohortStats[assignedCohort];
  if (cStats) {
    cStats.decisions++;
    if (validAction === 'ACCEPTED') cStats.accepted++;
    if (validAction === 'COMPLETED') cStats.completed++;
    if (feedback && typeof feedback.useful === 'boolean') {
      cStats.totalRatings++;
      if (feedback.useful) cStats.useful++;
    }
  }

  return { success: true, record };
}

/**
 * Computes all 10 Section 8 Decision Quality Metrics independently.
 *
 * Rule: Never combine these into one generic score.
 *
 * @returns {Object} The 10 independent metrics with metadata
 */
function getDecisionQualityMetrics() {
  const total = qualityCounters.totalEvaluated;
  const actedTotal = qualityCounters.acceptedCount + qualityCounters.rejectedCount;
  const ratingTotal = qualityCounters.usefulCount + qualityCounters.notUsefulCount;

  // Latency percentile calculation
  const sortedLatencies = [...qualityCounters.latenciesMs].sort((a, b) => a - b);
  const p50 = sortedLatencies.length ? sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] : 0;
  const p95 = sortedLatencies.length ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] : 0;
  const p99 = sortedLatencies.length ? sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] : 0;
  const avgLatency = sortedLatencies.length
    ? Math.round(sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length)
    : 0;

  return {
    sampleSize: total,
    timestamp: new Date().toISOString(),

    // 1. Recommendation Acceptance Rate
    recommendationAcceptanceRate: {
      ratePercent: actedTotal > 0 ? Math.round((qualityCounters.acceptedCount / actedTotal) * 1000) / 10 : 100,
      accepted: qualityCounters.acceptedCount,
      rejected: qualityCounters.rejectedCount,
      n: actedTotal,
    },

    // 2. Recommendation Usefulness
    recommendationUsefulness: {
      usefulPercent: ratingTotal > 0 ? Math.round((qualityCounters.usefulCount / ratingTotal) * 1000) / 10 : 100,
      useful: qualityCounters.usefulCount,
      notUseful: qualityCounters.notUsefulCount,
      n: ratingTotal,
    },

    // 3. Traveler Override Rate
    travelerOverrideRate: {
      ratePercent: total > 0 ? Math.round((qualityCounters.overrideCount / total) * 1000) / 10 : 0,
      overrides: qualityCounters.overrideCount,
      n: total,
    },

    // 4. Traveler Reversal Rate
    travelerReversalRate: {
      ratePercent: total > 0 ? Math.round((qualityCounters.reversalCount / total) * 1000) / 10 : 0,
      reversals: qualityCounters.reversalCount,
      n: total,
    },

    // 5. False Positive Rate
    falsePositiveRate: {
      ratePercent: total > 0 ? Math.round((qualityCounters.falsePositiveCount / total) * 1000) / 10 : 0,
      count: qualityCounters.falsePositiveCount,
      causes: { ...qualityCounters.falsePositiveCauses },
      n: total,
    },

    // 6. False Negative / Missed Opportunity Rate
    falseNegativeRate: {
      ratePercent: total > 0 ? Math.round((qualityCounters.falseNegativeCount / total) * 1000) / 10 : 0,
      count: qualityCounters.falseNegativeCount,
      causes: { ...qualityCounters.falseNegativeCauses },
      n: total,
    },

    // 7. Stale Information Rate
    staleInformationRate: {
      ratePercent: total > 0 ? Math.round((qualityCounters.staleInformationCount / total) * 1000) / 10 : 0,
      staleDecisions: qualityCounters.staleInformationCount,
      n: total,
    },

    // 8. Decision Latency
    decisionLatency: {
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
      avgMs: avgLatency,
      n: sortedLatencies.length,
    },

    // 9. Outcome Success Rate
    outcomeSuccessRate: {
      ratePercent: total > 0 ? Math.round((qualityCounters.successfulOutcomeCount / total) * 1000) / 10 : 100,
      successes: qualityCounters.successfulOutcomeCount,
      n: total,
    },

    // 10. Safety Escalation Rate
    safetyEscalationRate: {
      ratePercent: total > 0 ? Math.round((qualityCounters.safetyEscalationCount / total) * 1000) / 10 : 0,
      escalations: qualityCounters.safetyEscalationCount,
      n: total,
    },

    // Cohort Breakdowns
    cohortBreakdowns: { ...qualityCounters.cohortStats },
  };
}

/**
 * Tracks multi-stage alert timeliness latency breakdown (Section 12).
 *
 * Latency stages:
 * condition observed -> system detects -> decision generated -> notification sent -> traveler sees -> traveler acts
 */
function recordAlertTimeliness({
  alertId,
  tripId,
  conditionObservedAt,
  systemDetectedAt,
  decisionGeneratedAt,
  notificationSentAt,
  travelerSeenAt = null,
  travelerActedAt = null,
}) {
  const tObserved = new Date(conditionObservedAt).getTime();
  const tDetected = new Date(systemDetectedAt).getTime();
  const tGenerated = new Date(decisionGeneratedAt).getTime();
  const tSent = new Date(notificationSentAt).getTime();
  const tSeen = travelerSeenAt ? new Date(travelerSeenAt).getTime() : null;
  const tActed = travelerActedAt ? new Date(travelerActedAt).getTime() : null;

  const latencies = {
    alertId: alertId || `alt_${Date.now()}`,
    tripId: tripId || 'trip_anonymous',
    detectionLatencyMs: Math.max(0, tDetected - tObserved),
    generationLatencyMs: Math.max(0, tGenerated - tDetected),
    deliveryLatencyMs: Math.max(0, tSent - tGenerated),
    viewLatencyMs: tSeen ? Math.max(0, tSeen - tSent) : null,
    actionLatencyMs: (tActed && tSeen) ? Math.max(0, tActed - tSeen) : null,
    totalPipelineLatencyMs: tActed ? Math.max(0, tActed - tObserved) : Math.max(0, tSent - tObserved),
    recordedAt: new Date().toISOString(),
  };

  inMemoryTimelinessLogs.push(latencies);
  if (inMemoryTimelinessLogs.length > 500) inMemoryTimelinessLogs.shift();

  return latencies;
}

/**
 * Preserves source disagreement instances without lossy averaging (Section 14).
 */
function recordSourceDisagreement({
  corridorId,
  officialSource = 'NDMA/IMD',
  commercialSource = 'Open-Meteo/OWM',
  officialState,
  commercialState,
  decisionMade,
  observedOutcome = 'PENDING',
}) {
  const disagreement = {
    disagreementId: `disag_${Date.now()}_${inMemorySourceDisagreements.length + 1}`,
    corridorId: String(corridorId || 'corridor_generic'),
    timestamp: new Date().toISOString(),
    officialSource: String(officialSource),
    commercialSource: String(commercialSource),
    officialState,
    commercialState,
    decisionMade: String(decisionMade),
    observedOutcome: String(observedOutcome),
  };

  inMemorySourceDisagreements.push(disagreement);
  if (inMemorySourceDisagreements.length > MAX_DISAGREEMENT_HISTORY) {
    inMemorySourceDisagreements.shift();
  }

  return disagreement;
}

/**
 * Non-Negotiable Anti-Drift Guard (Section 33).
 * Asserts that raw user feedback cannot dynamically overwrite hard safety thresholds.
 */
function assertNoAutomaticDrift({ proposedThresholdModification, userFeedbackCount = 0 }) {
  if (proposedThresholdModification) {
    throw new Error(
      `[SECURITY_VIOLATION] Automatic drift rejected: User feedback (n=${userFeedbackCount}) cannot alter safety thresholds directly. Requires review & staged rollout.`
    );
  }
  return true;
}

/**
 * Resets learning metrics (for automated testing isolation).
 */
function resetLearningMetrics() {
  inMemoryOutcomes.length = 0;
  inMemorySourceDisagreements.length = 0;
  inMemoryTimelinessLogs.length = 0;
  qualityCounters.totalEvaluated = 0;
  qualityCounters.acceptedCount = 0;
  qualityCounters.rejectedCount = 0;
  qualityCounters.ignoredCount = 0;
  qualityCounters.modifiedCount = 0;
  qualityCounters.completedCount = 0;
  qualityCounters.usefulCount = 0;
  qualityCounters.notUsefulCount = 0;
  qualityCounters.overrideCount = 0;
  qualityCounters.reversalCount = 0;
  qualityCounters.falsePositiveCount = 0;
  qualityCounters.falseNegativeCount = 0;
  qualityCounters.staleInformationCount = 0;
  qualityCounters.successfulOutcomeCount = 0;
  qualityCounters.safetyEscalationCount = 0;
  qualityCounters.latenciesMs = [];
  Object.keys(qualityCounters.falsePositiveCauses).forEach(k => { qualityCounters.falsePositiveCauses[k] = 0; });
  Object.keys(qualityCounters.falseNegativeCauses).forEach(k => { qualityCounters.falseNegativeCauses[k] = 0; });
  Object.keys(qualityCounters.cohortStats).forEach(k => {
    qualityCounters.cohortStats[k] = { decisions: 0, accepted: 0, completed: 0, useful: 0, totalRatings: 0 };
  });
}

module.exports = {
  COHORT_STAGES,
  recordDecisionOutcome,
  getDecisionQualityMetrics,
  recordAlertTimeliness,
  recordSourceDisagreement,
  assertNoAutomaticDrift,
  resetLearningMetrics,
  inMemoryOutcomes,
  inMemorySourceDisagreements,
  inMemoryTimelinessLogs,
};
