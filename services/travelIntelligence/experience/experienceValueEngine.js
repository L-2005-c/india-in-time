'use strict';

/**
 * services/travelIntelligence/experience/experienceValueEngine.js
 *
 * Core Experience Value Optimization Engine for India In-Time v3.0 Phase 4.
 *
 * Core Product Question:
 * "Given how much usable time this traveler has left, what experience should
 * they choose next to maximize journey value under current real-world conditions?"
 *
 * Enforces Architectural Invariants:
 * 1. SAFETY > HARD CONSTRAINTS > FEASIBILITY > EXPERIENCE VALUE > PERSONAL PREFERENCE
 * 2. COMPLETED STOPS REMAIN IMMUTABLE
 * 3. NO POI HALLUCINATION — ALL CANDIDATES HAVE GROUNDED PROVENANCE
 * 4. ANTI-CHURN STABILITY (delta < 5 does not flap recommendations without event)
 */

const { computeTimeBudget } = require('./timeBudgetEngine');
const { evaluatePlaceExperienceWindow } = require('./experienceWindowEngine');
const { generateCandidates } = require('./candidateGenerator');
const { evaluateOpportunityCost } = require('./opportunityCostEngine');
const { generateExperienceExplanation } = require('./experienceExplanationEngine');
const { computeVisitScore, computeTimeScore, openingToScore, trafficToScore } = require('../scoringEngine');
const { computeDnaMatch, sanitizeDnaProfile } = require('../personalTravelDna');
const { calculateSolarTimes } = require('../astronomyTime');
const { distKm } = require('../../../utils/geo');
const { STOP_STATUSES } = require('../journey/journeyStateEngine');

const ACTION_TYPES = Object.freeze({
  DO_NOW: 'DO_NOW',
  DO_NEXT: 'DO_NEXT',
  SWAP_FOR: 'SWAP_FOR',
  DEFER_TO_LATER: 'DEFER_TO_LATER',
  REST_OR_REFUEL: 'REST_OR_REFUEL',
});

/**
 * Computes the composite experience value and ranked recommendations.
 *
 * @param {Object} options
 * @param {Object} options.journeyState - Active JourneyState
 * @param {Object} [options.travelerDna] - Traveler DNA profile
 * @param {Object} [options.weather] - Current weather truth / forecast
 * @param {Object} [options.traffic] - Current traffic conditions
 * @param {Object} [options.safetyDecision] - Authoritative Phase 3 safety decision
 * @param {Array<Object>} [options.activeHazards] - Active hazard list
 * @param {Array<Object>} [options.candidatePool] - Optional explicit candidate pool
 * @param {string} [options.cityName='visakhapatnam'] - City or circuit identifier
 * @param {number} [options.currentMinute] - Current minute (overrides state)
 * @param {Date} [options.referenceDate] - Reference date
 * @param {Array<Object>} [options.previousRecommendations] - Prior evaluation for anti-churn
 * @returns {Object} Full Experience Value Evaluation and Recommendations
 */
function evaluateExperienceValue({
  journeyState = {},
  travelerDna = {},
  timeBudget: overrideTimeBudget = null,
  weather = null,
  traffic = null,
  safetyDecision = null,
  activeHazards = [],
  candidatePool = [],
  customPoolOnly = false,
  cityName = 'visakhapatnam',
  currentMinute = null,
  dayEndMinute = 1320,
  referenceDate = new Date(),
  previousRecommendations = null,
  trustEvaluations = null,
} = {}) {
  const currentMin = currentMinute != null
    ? Number(currentMinute)
    : Number(journeyState?.currentMinute || 540);

  const dna = sanitizeDnaProfile(travelerDna);

  // 1. Time Budget
  const timeBudget = overrideTimeBudget || computeTimeBudget({
    journeyState,
    travelerDna: dna,
    currentMinute: currentMin,
    dayEndMinute,
  });

  // Current location & solar times
  const currentLoc = journeyState?.currentLocation || (
    journeyState?.activeStop ? { lat: journeyState.activeStop.lat, lon: journeyState.activeStop.lon } : { lat: 17.6868, lon: 83.2185 }
  );
  const solarTimes = calculateSolarTimes(currentLoc.lat, currentLoc.lon, referenceDate);

  // 2. Candidate Generation
  const candidates = generateCandidates({
    journeyState,
    cityName,
    currentLocation: currentLoc,
    customPool: candidatePool,
    customPoolOnly,
    activeHazards,
  });

  // 3. Evaluate each candidate
  const evaluatedCandidates = [];

  for (const cand of candidates) {
    // 0. Safety Decision Override
    if (safetyDecision && (safetyDecision.decision === 'EMERGENCY' || safetyDecision.decision === 'AVOID')) {
      if (cand.indoorOutdoor !== 'indoor') {
        continue; // Drop outdoor stops under emergency or avoid directives
      }
    }

    // Window assessment
    const windowEval = evaluatePlaceExperienceWindow(cand, {
      currentMinute: currentMin,
      referenceDate,
      weather,
      visitMinutes: cand.visitMinutes,
    });

    // Feasibility Check
    if (windowEval.windowViability === 'CLOSED') {
      continue; // Skip closed places
    }

    // Opportunity Cost assessment
    const oppCost = evaluateOpportunityCost({
      candidate: cand,
      journeyState,
      timeBudget,
      solarTimes,
    });

    // Scoring Engine Visit Score
    const timeScore = computeTimeScore(cand, {
      nowMin: currentMin,
      isBestTimeNow: windowEval.isGoldenHour,
      daypart: currentMin < 720 ? 'morning' : (currentMin < 1020 ? 'afternoon' : 'evening'),
      goldenIn: windowEval.isGoldenHour,
    });

    const visitScoreResult = computeVisitScore({
      weatherScore: weather?.score ?? (weather?.isRaining ? (cand.indoorOutdoor === 'indoor' ? 85 : 25) : 80),
      crowdScore: 70,
      trafficScore: trafficToScore(traffic),
      scenicScore: (cand.cat === 'scenic' || cand.is_sunset_spot) ? 90 : 60,
      timeScore,
      openingScore: openingToScore(windowEval.openingDetails),
      preferenceScore: 75,
    }, cand);

    // Traveler DNA Affinity
    const dnaMatch = computeDnaMatch(cand, dna);

    // Fatigue & Heat Penalty
    let fatiguePenalty = 0;
    if (timeBudget.pacingLagMinutes > 30) fatiguePenalty += 5;
    if (currentMin >= 720 && currentMin <= 900 && cand.indoorOutdoor === 'outdoor') fatiguePenalty += 10;

    // Phase 5 Trust Assessment
    const candTrust = cand.trustEvaluation || (trustEvaluations && (trustEvaluations[cand.id] || trustEvaluations[cand.name]));
    let trustPenalty = 0;
    let trustBoost = 0;

    if (candTrust) {
      if (candTrust.overallTrustState === 'HIGH_RISK') {
        continue; // Invariant: Safety & High Risk entities are dropped
      } else if (candTrust.overallTrustState === 'CONFLICTED') {
        trustPenalty = 30; // Heavy penalty for conflicted credentials / route conflicts
      } else if (candTrust.overallTrustState === 'TRUSTED') {
        trustBoost = 5;
      }
    }

    // Composite Experience Value Formula
    // Weights: Visit Quality (35%), DNA Alignment (30%), Temporal Window (35%) - OppCost Penalty - Fatigue Penalty - Trust Penalty + Trust Boost
    const rawComposite = (
      visitScoreResult.visitScore * 0.35 +
      dnaMatch.score * 0.30 +
      windowEval.temporalScore * 0.35
    ) - oppCost.penaltyScore - fatiguePenalty - trustPenalty + trustBoost;

    const baseComposite = (cand.rawCandidate?.compositeScore ?? cand.rawCandidate?.rawScore) != null
      ? Number(cand.rawCandidate.compositeScore ?? cand.rawCandidate.rawScore)
      : Math.max(5, Math.min(100, Math.round(rawComposite)));
    const compositeScore = baseComposite;

    // Factor Levels (Structured UI & Explainability schema)
    const factorLevels = {
      travelerFit: dnaMatch.score >= 80 ? 'HIGH' : (dnaMatch.score >= 55 ? 'MEDIUM' : 'LOW'),
      timeEfficiency: cand.visitMinutes <= 60 ? 'HIGH' : (cand.visitMinutes <= 100 ? 'MODERATE' : 'DEMANDING'),
      windowSuitability: windowEval.temporalScore >= 75 ? 'OPTIMAL' : (windowEval.temporalScore >= 50 ? 'FAVORABLE' : 'CONSTRAINED'),
      weatherSuitability: weather?.isRaining ? (cand.indoorOutdoor === 'indoor' ? 'SHELTERED' : 'EXPOSED') : 'SUITABLE',
      safety: 'CLEAR',
      trustState: candTrust ? (candTrust.overallTrustState || 'SUPPORTED') : 'SUPPORTED',
      opportunityCost: oppCost.opportunityCostLevel === 'LOW' ? 'LOW' : (oppCost.opportunityCostLevel === 'MODERATE' ? 'MODERATE' : 'SACRIFICE DETECTED'),
      valueIndex: compositeScore,
      valueBadge: compositeScore >= 85 ? 'HIGH VALUE' : (compositeScore >= 70 ? 'STRONG FIT' : (compositeScore >= 50 ? 'MODERATE' : 'LOW PRIORITY')),
    };

    // Determine Action Type
    let actionType = ACTION_TYPES.DO_NOW;
    if (cand.cat === 'food' || (cand.indoorOutdoor === 'indoor' && fatiguePenalty > 8)) {
      actionType = ACTION_TYPES.REST_OR_REFUEL;
    } else if (oppCost.opportunityCostLevel === 'PROHIBITIVE' || oppCost.opportunityCostLevel === 'HIGH') {
      actionType = ACTION_TYPES.DEFER_TO_LATER;
    } else if (cand.provenance !== 'PLANNED_STOP') {
      actionType = ACTION_TYPES.SWAP_FOR;
    } else if (journeyState?.activeStop && cand.id !== journeyState.activeStop.id) {
      actionType = ACTION_TYPES.DO_NEXT;
    }

    const explanation = generateExperienceExplanation({
      candidate: cand,
      compositeScore,
      visitScore: visitScoreResult.visitScore,
      dnaMatchScore: dnaMatch.score,
      windowScore: windowEval.temporalScore,
      opportunityCost: oppCost,
      windowEval,
      provenance: cand.provenance,
    }, { weather, timeBudget });

    evaluatedCandidates.push({
      candidate: cand,
      compositeScore,
      totalJourneyValue: compositeScore,
      actionType,
      visitScore: visitScoreResult.visitScore,
      dnaMatchScore: dnaMatch.score,
      windowScore: windowEval.temporalScore,
      opportunityCostPenalty: oppCost.penaltyScore,
      fatiguePenalty,
      trustPenalty,
      trustBoost,
      trustEvaluation: candTrust || null,
      factorLevels,
      explanation,
      windowEval,
      opportunityCost: oppCost,
      provenance: cand.provenance,
    });
  }

  // 4. Bounded Multi-Stop Lookahead Chain Optimization (Total Journey Value vs Single Stop)
  computeMultiStopChains(evaluatedCandidates, timeBudget);

  // Rank candidates descending by totalJourneyValue (primary), then individual compositeScore (secondary)
  evaluatedCandidates.sort((a, b) => {
    if (b.totalJourneyValue !== a.totalJourneyValue) {
      return b.totalJourneyValue - a.totalJourneyValue;
    }
    return b.compositeScore - a.compositeScore;
  });

  // Anti-Churn / Recommendation Stability
  if (previousRecommendations && previousRecommendations.length > 0 && evaluatedCandidates.length > 0) {
    const prevTop = previousRecommendations[0];
    const newTop = evaluatedCandidates[0];

    // If new top is different from previous top, but score delta is under 5 points
    if (prevTop.candidate?.id !== newTop.candidate?.id) {
      const prevInNew = evaluatedCandidates.find(e => e.candidate.id === prevTop.candidate?.id);
      if (prevInNew) {
        const prevVal = prevInNew.totalJourneyValue ?? prevInNew.compositeScore;
        const newVal = newTop.totalJourneyValue ?? newTop.compositeScore;
        if ((newVal - prevVal) < 5) {
          // Retain previous top to avoid jitter unless an active hazard triggered the change
          const hasHazardEvent = activeHazards.some(h => h.targetPlaceId === prevTop.candidate.id);
          if (!hasHazardEvent) {
            evaluatedCandidates.splice(evaluatedCandidates.indexOf(prevInNew), 1);
            evaluatedCandidates.unshift(prevInNew);
          }
        }
      }
    }
  }

  // Top recommendations (limit 5)
  const topRecommendations = evaluatedCandidates.slice(0, 5);

  // Sequence lookahead for remaining stops
  const sequencePlan = buildOptimalSequence(topRecommendations, journeyState);

  return {
    tripId: journeyState?.tripId || 'trip_active',
    evaluatedAt: new Date().toISOString(),
    currentMinute: currentMin,
    timeBudget,
    candidateCount: candidates.length,
    evaluatedCount: evaluatedCandidates.length,
    primaryRecommendation: topRecommendations[0] || null,
    recommendations: topRecommendations,
    sequencePlan,
    divergenceAnalysis: computeDivergenceAnalysis(journeyState, topRecommendations),
  };
}

/**
 * Estimates transit duration between two candidate coordinates in minutes.
 */
function estimateTransitMinutes(locA, locB) {
  if (!locA || !locB) return 0;
  const latA = Number(locA.lat);
  const lonA = Number(locA.lon);
  const latB = Number(locB.lat);
  const lonB = Number(locB.lon);
  if (!Number.isFinite(latA) || !Number.isFinite(lonA) || !Number.isFinite(latB) || !Number.isFinite(lonB)) {
    return 0;
  }
  const d = distKm(latA, lonA, latB, lonB);
  if (d <= 0.2) return 0;
  // Assume ~25 km/h urban transit
  return Math.max(5, Math.min(60, Math.ceil((d / 25) * 60)));
}

/**
 * Bounded multi-stop lookahead sequence evaluation.
 * Evaluates feasible 1 to 3 stop chains within the remaining usable time budget.
 * Maximizes Total Cumulative Journey Value across the entire feasible chain.
 */
function computeMultiStopChains(evaluatedCandidates, timeBudget) {
  const usableMinutes = Number(timeBudget?.usableExperienceMinutes ?? timeBudget?.usableTimeMinutes ?? 120);

  for (const item of evaluatedCandidates) {
    const candA = item.candidate;
    const durA = Number(candA.visitMinutes || 60);

    let bestChainValue = item.compositeScore;
    let bestChainPlan = [candA.id];
    let bestChainDuration = durA;
    let bestChainNames = [candA.name];

    if (durA <= usableMinutes) {
      // Look for 2nd stop
      for (const itemB of evaluatedCandidates) {
        if (itemB.candidate.id === candA.id) continue;
        const candB = itemB.candidate;
        const durB = Number(candB.visitMinutes || 60);
        const transitAB = estimateTransitMinutes(candA, candB);
        const totalAB = durA + transitAB + durB;

        if (totalAB <= usableMinutes) {
          const valAB = item.compositeScore + itemB.compositeScore;
          if (valAB > bestChainValue) {
            bestChainValue = valAB;
            bestChainPlan = [candA.id, candB.id];
            bestChainDuration = totalAB;
            bestChainNames = [candA.name, candB.name];
          }

          // Look for 3rd stop (depth 3 bounded lookahead)
          for (const itemC of evaluatedCandidates) {
            if (itemC.candidate.id === candA.id || itemC.candidate.id === candB.id) continue;
            const candC = itemC.candidate;
            const durC = Number(candC.visitMinutes || 60);
            const transitBC = estimateTransitMinutes(candB, candC);
            const totalABC = totalAB + transitBC + durC;

            if (totalABC <= usableMinutes) {
              const valABC = valAB + itemC.compositeScore;
              if (valABC > bestChainValue) {
                bestChainValue = valABC;
                bestChainPlan = [candA.id, candB.id, candC.id];
                bestChainDuration = totalABC;
                bestChainNames = [candA.name, candB.name, candC.name];
              }
            }
          }
        }
      }
    }

    item.totalJourneyValue = bestChainValue;
    item.chainPlan = bestChainPlan;
    item.chainNames = bestChainNames;
    item.chainDurationMinutes = bestChainDuration;
  }
}

/**
 * Builds an optimal sequence for the next 2-3 stops avoiding unnecessary backtracking.
 */
function buildOptimalSequence(topRecommendations, journeyState) {
  if (!topRecommendations || topRecommendations.length === 0) return [];

  const origin = journeyState?.currentLocation || { lat: 17.6868, lon: 83.2185 };
  const pool = topRecommendations.slice(0, 3).map(r => r.candidate);

  // Greedy nearest-feasible sequence
  const sequence = [];
  let curr = origin;
  const remaining = [...pool];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distKm(curr.lat, curr.lon, remaining[i].lat, remaining[i].lon);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const nextStop = remaining.splice(bestIdx, 1)[0];
    sequence.push({
      id: nextStop.id,
      name: nextStop.name,
      cat: nextStop.cat,
      lat: nextStop.lat,
      lon: nextStop.lon,
      distanceFromPrevKm: Math.round(bestDist * 10) / 10,
    });
    curr = nextStop;
  }

  return sequence;
}

/**
 * Analyzes divergence between original planned stops and recommendations.
 */
function computeDivergenceAnalysis(journeyState, topRecommendations) {
  const originalPlanned = (journeyState?.stops || [])
    .filter(s => s.status === STOP_STATUSES.PLANNED)
    .map(s => s.id);

  const recommendedIds = topRecommendations.map(r => r.candidate.id);

  const preserved = recommendedIds.filter(id => originalPlanned.includes(id));
  const substituted = recommendedIds.filter(id => !originalPlanned.includes(id));

  return {
    originalUpcomingCount: originalPlanned.length,
    recommendedCount: topRecommendations.length,
    preservedPlannedStops: preserved,
    newSubstitutions: substituted,
    hasSubstitutions: substituted.length > 0,
  };
}

module.exports = {
  evaluateExperienceValue,
  ACTION_TYPES,
  buildOptimalSequence,
  computeDivergenceAnalysis,
};
