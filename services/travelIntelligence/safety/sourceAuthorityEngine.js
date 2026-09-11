'use strict';

/**
 * services/travelIntelligence/safety/sourceAuthorityEngine.js
 *
 * Source Authority & Conflict Detection Engine for India In-Time v3.0.
 *
 * Rules:
 * 1. Deterministic authority hierarchy:
 *    OFFICIAL_ACTIVE_WARNING > OFFICIAL_OBSERVED > HIGH_CONFIDENCE_LIVE_OBSERVATION
 *    > OFFICIAL_FORECAST > MODEL_FORECAST > DERIVED_ESTIMATE > HISTORICAL
 * 2. Never silently average away important conflicts.
 * 3. Every evaluation exposes:
 *    selectedSource, rejectedSources, selectionReason, sourceConflict
 */

const { SAFETY_DATA_STATES } = require('./safetySignalModel');

const AUTHORITY_TIERS = Object.freeze({
  OFFICIAL_ACTIVE_WARNING: 10,
  OFFICIAL_OBSERVED: 9,
  HIGH_CONFIDENCE_LIVE_OBSERVATION: 8,
  OFFICIAL_FORECAST: 7,
  MODEL_FORECAST: 5,
  DERIVED_ESTIMATE: 3,
  HISTORICAL: 1,
  UNKNOWN: 0,
});

function getSourceTier(signal) {
  if (signal.dataState === SAFETY_DATA_STATES.OFFICIAL_WARNING && !signal.isStale) {
    return AUTHORITY_TIERS.OFFICIAL_ACTIVE_WARNING;
  }
  if (signal.dataState === SAFETY_DATA_STATES.OBSERVED && signal.sourceType?.includes('GOVERNMENT')) {
    return AUTHORITY_TIERS.OFFICIAL_OBSERVED;
  }
  if (signal.dataState === SAFETY_DATA_STATES.OBSERVED || signal.dataState === SAFETY_DATA_STATES.LIVE) {
    return AUTHORITY_TIERS.HIGH_CONFIDENCE_LIVE_OBSERVATION;
  }
  if (signal.dataState === SAFETY_DATA_STATES.FORECAST && signal.sourceType?.includes('GOVERNMENT')) {
    return AUTHORITY_TIERS.OFFICIAL_FORECAST;
  }
  if (signal.dataState === SAFETY_DATA_STATES.FORECAST || signal.dataState === SAFETY_DATA_STATES.PREDICTED) {
    return AUTHORITY_TIERS.MODEL_FORECAST;
  }
  if (signal.dataState === SAFETY_DATA_STATES.ESTIMATED) {
    return AUTHORITY_TIERS.DERIVED_ESTIMATE;
  }
  return AUTHORITY_TIERS.HISTORICAL;
}

/**
 * Arbitrates multiple candidate sources for a corridor/hazard condition.
 */
function arbitrateSafetySources(candidateSignals = []) {
  if (!Array.isArray(candidateSignals) || candidateSignals.length === 0) {
    return {
      selectedSource: null,
      rejectedSources: [],
      selectionReason: 'NO_SOURCES_AVAILABLE',
      sourceConflict: false,
      conflictExplanation: null,
    };
  }

  if (candidateSignals.length === 1) {
    const s = candidateSignals[0];
    return {
      selectedSource: s,
      rejectedSources: [],
      selectionReason: `SOLE_AVAILABLE_SOURCE (${s.provider || 'PROVIDER'})`,
      sourceConflict: false,
      conflictExplanation: null,
    };
  }

  // Sort by authority tier descending, then by freshness (most recent issuedAt)
  const ranked = candidateSignals.map(s => ({
    signal: s,
    tier: getSourceTier(s),
    isFresh: !s.isStale,
    issuedTime: new Date(s.issuedAt || 0).getTime(),
  })).sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;
    if (b.isFresh !== a.isFresh) return (b.isFresh ? 1 : 0) - (a.isFresh ? 1 : 0);
    return b.issuedTime - a.issuedTime;
  });

  const winner = ranked[0].signal;
  const rejected = ranked.slice(1).map(r => r.signal);

  // Detect conflicts: does an official warning disagree with a model forecast?
  let sourceConflict = false;
  let conflictExplanation = null;

  const officialWarning = ranked.find(r => r.tier >= AUTHORITY_TIERS.OFFICIAL_ACTIVE_WARNING);
  const modelEstimate = ranked.find(r => r.tier === AUTHORITY_TIERS.MODEL_FORECAST);

  if (officialWarning && modelEstimate) {
    const officialSev = officialWarning.signal.severity;
    const modelSev = modelEstimate.signal.severity;

    if (officialSev !== modelSev) {
      sourceConflict = true;
      conflictExplanation = `Sources disagree: Official warning (${officialSev}) remains active even though model forecast indicates ${modelSev}.`;
      winner.sourceConflict = true;
      winner.conflictExplanation = conflictExplanation;
    }
  }

  return {
    selectedSource: winner,
    rejectedSources: rejected,
    selectionReason: `HIGHEST_AUTHORITY_AND_FRESHNESS (${winner.provider}: Tier ${ranked[0].tier})`,
    sourceConflict,
    conflictExplanation,
  };
}

module.exports = {
  AUTHORITY_TIERS,
  getSourceTier,
  arbitrateSafetySources,
};
