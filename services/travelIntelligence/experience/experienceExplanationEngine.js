'use strict';

/**
 * services/travelIntelligence/experience/experienceExplanationEngine.js
 *
 * Grounded Explanation Engine for India In-Time v3.0 Phase 4.
 * Generates transparent, deterministic, audit-friendly explanations
 * for Experience Value recommendations without LLM hallucination.
 */

/**
 * Generates a structured explanation for an evaluated experience recommendation.
 *
 * @param {Object} recommendation - An item from evaluateExperienceValue().recommendations
 * @param {Object} [context] - Contextual metadata (timeBudget, weather, dna)
 * @returns {Object} Structured explanation object
 */
function generateExperienceExplanation(recommendation = {}, context = {}) {
  if (!recommendation || !recommendation.candidate) {
    return {
      headline: 'Experience recommendation unavailable',
      primaryDriver: 'INSUFFICIENT_DATA',
      confidence: 50,
      factors: [],
      tradeoff: 'No active recommendation to evaluate.',
    };
  }

  const { candidate, compositeScore, visitScore, dnaMatchScore, windowScore, opportunityCost, windowEval, provenance } = recommendation;
  const candName = candidate.name || 'Destination';

  // Determine Primary Driver
  let primaryDriver = 'FEASIBLE_VALUE_MAXIMIZATION';
  let headline = `Prioritize ${candName} to maximize journey value.`;

  if (windowEval?.isGoldenHour) {
    primaryDriver = 'OPTIMAL_LIGHTING_WINDOW';
    headline = `Visit ${candName} now to catch optimal lighting during the golden hour.`;
  } else if (candidate.indoorOutdoor === 'indoor' && context?.weather?.isRaining) {
    primaryDriver = 'WEATHER_SHELTER_HAVEN';
    headline = `Head to ${candName} as a sheltered indoor haven during current rainfall.`;
  } else if (dnaMatchScore >= 80) {
    primaryDriver = 'DNA_AFFINITY_MATCH';
    headline = `${candName} strongly matches your personal travel preferences (${dnaMatchScore}% affinity).`;
  } else if (windowEval?.closingRisk) {
    primaryDriver = 'AVOIDS_CLOSING_RISK';
    headline = `Visit ${candName} now before closing hours restrict entry.`;
  } else if (provenance === 'PLANNED_STOP') {
    primaryDriver = 'ON_TRACK_PLANNED_STOP';
    headline = `Proceed with ${candName} as planned to keep the remaining itinerary balanced.`;
  }

  // Factor Breakdown
  const factors = [
    {
      dimension: 'Temporal Viability',
      score: windowScore,
      weight: '35%',
      contribution: Math.round(windowScore * 0.35),
      detail: windowEval?.reasons?.[0] || 'Within open operational window',
    },
    {
      dimension: 'Personal Travel DNA',
      score: dnaMatchScore,
      weight: '30%',
      contribution: Math.round(dnaMatchScore * 0.30),
      detail: `Matches preferred categories (${candidate.cat})`,
    },
    {
      dimension: 'Destination Appeal',
      score: visitScore,
      weight: '35%',
      contribution: Math.round(visitScore * 0.35),
      detail: 'High contextual scenic and operational appeal',
    },
  ];

  if (opportunityCost?.penaltyScore > 0) {
    factors.push({
      dimension: 'Opportunity Cost Penalty',
      score: -opportunityCost.penaltyScore,
      weight: 'Subtractive',
      contribution: -opportunityCost.penaltyScore,
      detail: opportunityCost.tradeoffSummary || 'Downstream time squeeze',
    });
  }

  // Confidence Calculation
  let confidence = 85;
  if (windowEval?.openingDetails?.hoursUnknown) confidence -= 15;
  if (!context?.weather || context.weather.dataQuality === 'unavailable') confidence -= 10;
  if (candidate.distanceKm == null) confidence -= 10;

  return {
    placeId: candidate.id,
    placeName: candName,
    compositeScore,
    headline,
    primaryDriver,
    confidence: Math.max(30, Math.min(95, confidence)),
    factors,
    tradeoff: opportunityCost?.tradeoffSummary || 'Zero downstream sacrifices; fits cleanly in schedule.',
    provenance: candidate.provenance,
    auditTrail: {
      generatedAt: new Date().toISOString(),
      temporalScore: windowScore,
      dnaScore: dnaMatchScore,
      visitScore,
      oppCostPenalty: opportunityCost?.penaltyScore || 0,
      hoursStatus: windowEval?.openingDetails?.status || 'UNKNOWN',
    },
  };
}

module.exports = {
  generateExperienceExplanation,
};
