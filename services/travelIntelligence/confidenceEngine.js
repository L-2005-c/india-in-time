'use strict';

/**
 * services/travelIntelligence/confidenceEngine.js
 *
 * Evidence-Backed Confidence Evaluator.
 * Computes discrete, grounded confidence bands (HIGH, MEDIUM, LOW) or null.
 * Never invents certainty, never uses arbitrary base scores without evidence.
 */

const { CONFIDENCE_LEVELS } = require('./provenanceModel');

function computeConfidence(flags = {}) {
  const sources = [];
  if (flags.hasCoords) sources.push('coordinates');
  if (flags.hasOpeningHours) sources.push('openingHours');
  if (flags.hasWeather) sources.push('weather');
  if (flags.hasCategoryRules) sources.push('categoryRules');
  if (flags.hasTrafficEstimate) sources.push('trafficEstimate');
  if (flags.hasHistoricalHint) sources.push('historicalCrowd');
  if (flags.hasLiveTraffic) sources.push('liveTraffic');

  const evidenceCount = sources.length;
  if (evidenceCount === 0) {
    return {
      confidenceScore: 0,
      confidence: 0,
      confidenceBand: CONFIDENCE_LEVELS.LOW,
      confidenceLevel: 'Low',
      level: 'Low',
      confidenceReasons: ['No verified data sources available for this place'],
      sources: [],
      dataSources: [],
      evidenceCount: 0,
      dataFreshness: flags.dataFreshness || null,
      note: 'No evidence available — cannot determine confidence',
    };
  }

  // Evidence-backed scoring strictly derived from verified signals
  let rawScore = 0;
  if (flags.hasCoords) rawScore += 20;
  if (flags.hasOpeningHours) rawScore += 20;
  if (flags.hasWeather) rawScore += 20;
  if (flags.hasCategoryRules) rawScore += 10;
  if (flags.hasTrafficEstimate) rawScore += 10;
  if (flags.hasHistoricalHint) rawScore += 10;
  if (flags.hasLiveTraffic) rawScore += 10;

  const score = Math.min(100, rawScore);
  const band = score >= 70 ? CONFIDENCE_LEVELS.HIGH : (score >= 40 ? CONFIDENCE_LEVELS.MEDIUM : CONFIDENCE_LEVELS.LOW);
  const levelName = band === CONFIDENCE_LEVELS.HIGH ? 'High' : (band === CONFIDENCE_LEVELS.MEDIUM ? 'Medium' : 'Low');

  const confidenceReasons = [];
  if (!flags.hasWeather) confidenceReasons.push('weather unavailable');
  if (!flags.hasCoords) confidenceReasons.push('coordinates unavailable');
  if (!flags.hasOpeningHours) confidenceReasons.push('opening hours not verified');
  if (!flags.hasHistoricalHint) confidenceReasons.push('limited historical crowd observations');
  if (!flags.hasLiveTraffic) confidenceReasons.push('live traffic unavailable');

  return {
    confidenceScore: score,
    confidence: score,
    confidenceBand: band,
    confidenceLevel: levelName,
    level: levelName,
    confidenceReasons,
    sources,
    dataSources: sources,
    evidenceCount,
    dataFreshness: flags.dataFreshness || null,
    note: band === CONFIDENCE_LEVELS.HIGH
      ? 'Most key signals verified and available'
      : (band === CONFIDENCE_LEVELS.MEDIUM
        ? 'Core signals present; some estimates used'
        : 'Limited verified signals — relies primarily on fallback estimates'),
  };
}

module.exports = { computeConfidence };
