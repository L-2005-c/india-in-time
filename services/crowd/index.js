'use strict';

/**
 * services/crowd/index.js
 *
 * Unified Public Facade for all Crowd Intelligence Capabilities:
 * 1. Heuristic & rule-based crowd scoring (crowdEngine)
 * 2. High-resolution diurnal/seasonal crowd curves (crowdCurve)
 * 3. ML classification & feature encoding models (crowdModel)
 * 4. User feedback adaptive learning loop (crowdLearner)
 * 5. Spatial & temporal historical crowd observation store (historicalCrowdStore)
 */

const crowdEngine = require('../travelIntelligence/crowdEngine');
const crowdCurve = require('../travelIntelligence/crowdCurve');
const crowdModel = require('../ml/crowdModel');
const crowdLearner = require('../travelIntelligence/crowdLearner');
const historicalCrowdStore = require('../travelIntelligence/historicalCrowdStore');

module.exports = {
  // ── 1. Core Rule & Context Engine ──────────────────────────────────────────
  computeCrowd: crowdEngine.computeCrowd,
  predictCrowdLegacy: crowdEngine.predictCrowdLegacy,

  // ── 2. Diurnal Crowd Curves ────────────────────────────────────────────────
  generatePredictiveCrowdCurve: crowdCurve.generatePredictiveCrowdCurve,
  CATEGORY_HOURLY_PROFILES: crowdCurve.CATEGORY_HOURLY_PROFILES,

  // ── 3. ML Classification & Predictive Modeling ─────────────────────────────
  predictCrowd: crowdModel.predictCrowd,
  updateOnline: crowdModel.updateOnline,
  trainFromFeedback: crowdModel.trainFromFeedback,
  learnFromSingleFeedback: crowdModel.learnFromSingleFeedback,
  ensureLoaded: crowdModel.ensureLoaded,
  getModelInfo: crowdModel.getModelInfo,
  buildFeatures: crowdModel.buildFeatures,
  feedbackToLabel: crowdModel.feedbackToLabel,
  MODEL_VERSION: crowdModel.MODEL_VERSION,
  FEATURE_DIM: crowdModel.FEATURE_DIM,

  // ── 4. Adaptive Feedback & Online Learning ─────────────────────────────────
  getLearnedCrowdPrior: crowdLearner.getLearnedCrowdPrior,
  blendLearnedCrowd: crowdLearner.blendLearnedCrowd,
  clearLearnerCache: crowdLearner.clearLearnerCache,
  getMlOrPriorCrowd: crowdLearner.getMlOrPriorCrowd,

  // ── 5. Historical Crowd Store & Observational Priors ───────────────────────
  lookupHistoricalCrowd: historicalCrowdStore.lookupHistoricalCrowd,
  lookupHistoricalCrowdAsync: historicalCrowdStore.lookupHistoricalCrowdAsync,
  attachHistoricalCrowdBatch: historicalCrowdStore.attachHistoricalCrowdBatch,
};
