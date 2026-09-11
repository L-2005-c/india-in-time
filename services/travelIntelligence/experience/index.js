'use strict';

/**
 * services/travelIntelligence/experience/index.js
 *
 * Unified Phase 4 Experience Value Intelligence module barrel.
 */

const { computeTimeBudget, PACE_BUFFER_RATIOS } = require('./timeBudgetEngine');
const { evaluatePlaceExperienceWindow } = require('./experienceWindowEngine');
const { generateCandidates, normalizeCandidate } = require('./candidateGenerator');
const { evaluateOpportunityCost } = require('./opportunityCostEngine');
const {
  evaluateExperienceValue,
  ACTION_TYPES,
  buildOptimalSequence,
  computeDivergenceAnalysis,
} = require('./experienceValueEngine');
const { generateExperienceExplanation } = require('./experienceExplanationEngine');
const {
  recordExperienceOutcome,
  getTripExperienceOutcomes,
  computeExperienceAccuracyMetrics,
  VALID_ACTIONS,
} = require('./outcomeTracker');

module.exports = {
  // Time Budgeting
  computeTimeBudget,
  PACE_BUFFER_RATIOS,

  // Temporal Experience Windows
  evaluatePlaceExperienceWindow,

  // Grounded Candidate Generation
  generateCandidates,
  normalizeCandidate,

  // Downstream Opportunity Cost
  evaluateOpportunityCost,

  // Core Value Optimization Engine
  evaluateExperienceValue,
  ACTION_TYPES,
  buildOptimalSequence,
  computeDivergenceAnalysis,

  // Grounded Explanation Engine
  generateExperienceExplanation,

  // Behavioral Learning & Outcome Tracking
  recordExperienceOutcome,
  getTripExperienceOutcomes,
  computeExperienceAccuracyMetrics,
  VALID_ACTIONS,
};
