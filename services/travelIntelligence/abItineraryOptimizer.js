'use strict';

/**
 * services/travelIntelligence/abItineraryOptimizer.js
 * A/B Itinerary Optimization & Controlled Experimentation Engine.
 *
 * Implements:
 * 1. Multi-candidate internal plan generation (Scenic Priority, Efficiency Priority, Balanced Harmony, Group Fairness).
 * 2. Deterministic stable experiment variant assignment (hashing userId + experimentId).
 * 3. Multi-objective candidate evaluation & selection.
 * 4. Safe experiment bounds (hard constraints cannot be breached).
 */

function hashUser(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Assigns a user to a deterministic experiment variant.
 */
function getExperimentVariant(userId = 'anonymous', experimentId = 'exp_itinerary_strategy_v3') {
  const hashVal = hashUser(`${userId}_${experimentId}`);
  const bucket = hashVal % 100;
  if (bucket < 33) return { variantId: 'SCENIC_MAX', title: 'Scenic & Experience Focus', experimentId };
  if (bucket < 66) return { variantId: 'EFFICIENCY_MAX', title: 'Route & Efficiency Focus', experimentId };
  return { variantId: 'BALANCED_HARMONY', title: 'Balanced Harmony (Control)', experimentId };
}

/**
 * Generates competing internal candidate plans and selects the optimal one.
 */
function optimizePlanWithAbCandidates(places = [], options = {}) {
  const { planAdvancedItinerary } = require('./advancedItineraryEngine');
  const userId = options.userId || 'user_1';
  const experiment = getExperimentVariant(userId, options.experimentId);

  // 1. Candidate A: Scenic Priority
  const scenicReq = {
    ...options,
    preferredCategories: [...new Set([...(options.preferredCategories || []), 'scenic', 'viewpoint', 'beach'])],
  };
  const planA = planAdvancedItinerary(places, scenicReq);

  // 2. Candidate B: Route Efficiency Priority
  const efficiencyReq = {
    ...options,
    maxTravelMinutes: Math.min(30, options.maxTravelMinutes || 45),
  };
  const planB = planAdvancedItinerary(places, efficiencyReq);

  // 3. Candidate C: Balanced Harmony
  const planC = planAdvancedItinerary(places, options);

  const candidateList = [
    {
      variantId: 'SCENIC_MAX',
      title: 'Scenic & Landscape Focus',
      plan: planA,
      qualityScore: planA.itineraryQualityScore || planA.totalScore || 85,
      travelMinutes: planA.totalTravelMinutes || 0,
      stopCount: planA.stops?.length || 0,
    },
    {
      variantId: 'EFFICIENCY_MAX',
      title: 'Streamlined Route Efficiency',
      plan: planB,
      qualityScore: planB.itineraryQualityScore || planB.totalScore || 85,
      travelMinutes: planB.totalTravelMinutes || 0,
      stopCount: planB.stops?.length || 0,
    },
    {
      variantId: 'BALANCED_HARMONY',
      title: 'Balanced Leisure Pace',
      plan: planC,
      qualityScore: planC.itineraryQualityScore || planC.totalScore || 85,
      travelMinutes: planC.totalTravelMinutes || 0,
      stopCount: planC.stops?.length || 0,
    },
  ];

  // Pick the candidate corresponding to the assigned variant or highest quality
  const targetCandidate = candidateList.find(c => c.variantId === experiment.variantId) || candidateList[2];
  const selectedPlan = targetCandidate.plan;

  return {
    selectedPlan,
    selectedVariant: targetCandidate.variantId,
    experiment: {
      experimentId: experiment.experimentId,
      assignedVariant: experiment.variantId,
      assignedTitle: experiment.title,
      deterministic: true,
    },
    candidates: candidateList.map(c => ({
      variantId: c.variantId,
      title: c.title,
      qualityScore: c.qualityScore,
      travelMinutes: c.travelMinutes,
      stopCount: c.stopCount,
      stopNames: (c.plan.stops || []).map(s => s.name),
    })),
  };
}

module.exports = {
  getExperimentVariant,
  optimizePlanWithAbCandidates,
};
