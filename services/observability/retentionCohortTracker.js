'use strict';

/**
 * services/observability/retentionCohortTracker.js
 *
 * Phase 10A Longitudinal Cohort Retention & Traveler Engagement Instrumentation.
 * Enforces Zero-Fabrication standards: Never reports extrapolated or synthetic D30 metrics.
 *
 * Formal Definitions:
 * - ACTIVATED_USER: User created account and generated or accepted >= 1 itinerary.
 * - ACTIVE_JOURNEY: Traveler actively navigating, updating, or completing a live trip leg.
 * - RETURNING_USER: User initiating meaningful interaction >= 24 hours post-activation.
 * - RETAINED_USER: User with qualified journey/planning activity within window [D0, D7, D30].
 */

const crypto = require('crypto');

const RETENTION_DEFINITIONS = Object.freeze({
  ACTIVATED_USER: 'Account created + at least 1 itinerary generated or saved',
  ACTIVE_JOURNEY: 'Live navigation, active stop check-in, or real-time replan adaptation',
  RETURNING_USER: 'Meaningful travel interaction >= 24h post-activation timestamp',
  RETAINED_USER: 'User with active journey or decision interactions within designated window',
});

// In-memory cohort tracking store with pseudonymized identifiers
const cohortStore = {
  cohorts: new Map(), // cohortId -> { startDate, users: Map(pseudoId -> { activatedAt, interactions: [] }) }
  userCohortMap: new Map(), // pseudoId -> cohortId
  salt: process.env.ANALYTICS_SALT || 'iit-p10a-retention-salt',
};

function pseudonymize(userId) {
  if (!userId) return 'anon-' + crypto.randomBytes(6).toString('hex');
  return crypto.createHmac('sha256', cohortStore.salt).update(String(userId)).digest('hex').slice(0, 16);
}

function getCohortKey(date = new Date()) {
  const d = new Date(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNumber = 1 + Math.round((firstThursday - yearStart.valueOf()) / 604800000);
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

function recordTravelerActivity({ userId, eventType, timestamp = Date.now(), _metadata = {} }) {
  const pseudoId = pseudonymize(userId);
  const now = new Date(timestamp);
  
  let cohortKey = cohortStore.userCohortMap.get(pseudoId);
  if (!cohortKey) {
    cohortKey = getCohortKey(now);
    cohortStore.userCohortMap.set(pseudoId, cohortKey);
  }

  if (!cohortStore.cohorts.has(cohortKey)) {
    cohortStore.cohorts.set(cohortKey, {
      cohortId: cohortKey,
      startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString(),
      users: new Map(),
    });
  }

  const cohort = cohortStore.cohorts.get(cohortKey);
  if (!cohort.users.has(pseudoId)) {
    cohort.users.set(pseudoId, {
      pseudoId,
      activatedAt: now.toISOString(),
      interactions: [],
      isActivated: false,
    });
  }

  const userRecord = cohort.users.get(pseudoId);
  userRecord.interactions.push({
    eventType,
    timestamp: now.toISOString(),
    isMeaningful: ['itinerary_plan', 'itinerary_accept', 'stop_completed', 'reroute_accepted', 'assistant_decision_query'].includes(eventType),
  });

  if (['itinerary_plan', 'itinerary_accept'].includes(eventType)) {
    userRecord.isActivated = true;
  }
}

/**
 * Calculates empirical retention metrics for a cohort.
 * Strictly implements Phase 10A Zero-Fabrication Rule:
 * If the observation window has not reached 30 days, D30 MUST return 'NOT YET ESTABLISHED'.
 */
function evaluateCohortRetention(cohortKey, referenceTime = Date.now()) {
  const cohort = cohortStore.cohorts.get(cohortKey);
  if (!cohort) {
    return {
      cohortKey,
      status: 'COHORT_NOT_FOUND',
      sampleSize: 0,
      d0: null,
      d7: null,
      d30: 'NOT YET ESTABLISHED',
    };
  }

  const startDate = new Date(cohort.startDate).getTime();
  const daysElapsed = (referenceTime - startDate) / (1000 * 60 * 60 * 24);

  const activatedUsers = Array.from(cohort.users.values()).filter(u => u.isActivated);
  const n = activatedUsers.length;

  if (n === 0) {
    return {
      cohortKey,
      status: 'NO_ACTIVATED_USERS',
      sampleSize: 0,
      d0: '0.0%',
      d7: 'NOT YET ESTABLISHED',
      d7Status: 'NOT YET ESTABLISHED',
      d30: 'NOT YET ESTABLISHED',
      d30Status: 'NOT YET ESTABLISHED',
    };
  }

  // D0: 100% of activated users
  const d0Rate = 100.0;

  // D7: Active on or after Day 7
  let d7Status = 'NOT YET ESTABLISHED';
  let d7Rate = null;
  if (daysElapsed >= 7) {
    const d7Count = activatedUsers.filter(u => {
      const uStart = new Date(u.activatedAt).getTime();
      return u.interactions.some(i => {
        const iTime = new Date(i.timestamp).getTime();
        const diffDays = (iTime - uStart) / (1000 * 60 * 60 * 24);
        return diffDays >= 7 && diffDays < 14 && i.isMeaningful;
      });
    }).length;
    d7Rate = ((d7Count / n) * 100).toFixed(1) + '%';
    d7Status = 'MEASURED';
  }

  // D30: Active on or after Day 30
  let d30Status = 'NOT YET ESTABLISHED';
  let d30Rate = 'NOT YET ESTABLISHED';
  if (daysElapsed >= 30) {
    const d30Count = activatedUsers.filter(u => {
      const uStart = new Date(u.activatedAt).getTime();
      return u.interactions.some(i => {
        const iTime = new Date(i.timestamp).getTime();
        const diffDays = (iTime - uStart) / (1000 * 60 * 60 * 24);
        return diffDays >= 30 && diffDays < 37 && i.isMeaningful;
      });
    }).length;
    d30Rate = ((d30Count / n) * 100).toFixed(1) + '%';
    d30Status = 'MEASURED';
  }

  return {
    cohortKey,
    cohortStartDate: cohort.startDate,
    daysObserved: Math.floor(daysElapsed),
    sampleSize: n,
    definitions: RETENTION_DEFINITIONS,
    d0: `${d0Rate.toFixed(1)}%`,
    d7: d7Rate || 'NOT YET ESTABLISHED',
    d7Status,
    d30: d30Rate,
    d30Status,
    targetD30: '>= 25%',
    targetSatisfied: d30Status === 'MEASURED' ? parseFloat(d30Rate) >= 25.0 : false,
    limitations: daysElapsed < 30
      ? `Observation window (${Math.floor(daysElapsed)} days) has not matured to 30 days; longitudinal retention cannot be computed without synthetic data fabrication.`
      : 'Measured on active pilot cohort.',
  };
}

module.exports = {
  RETENTION_DEFINITIONS,
  pseudonymize,
  getCohortKey,
  recordTravelerActivity,
  evaluateCohortRetention,
  _cohortStore: cohortStore,
};
