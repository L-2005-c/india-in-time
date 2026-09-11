'use strict';

/**
 * services/travelIntelligence/nextJourney/nextLegDecisionEngine.js
 *
 * Master Next-Leg Decision Orchestrator (Phase 6).
 *
 * Synthesizes:
 * - Safety & Risk (Phase 3 authoritative supremacy)
 * - Hard Departure Constraints & Deadlines (Airport, Train, Bus)
 * - Tourist Trust Intelligence (Phase 5 registry & price transparency)
 * - Experience Value (Phase 4 multi-stop optimization)
 * - Traffic & Disruption (Phase 2)
 * - Weather Truth (Phase 1-2)
 *
 * Invariant Hierarchy:
 * SAFETY > HARD CONSTRAINTS > FEASIBILITY > TRUST > TOTAL JOURNEY VALUE > INDIVIDUAL EXPERIENCE VALUE > PERSONAL PREFERENCE
 */

const { resolveDestinationIntent, DESTINATION_INTENTS } = require('./destinationIntentResolver');
const { findCandidateAccommodations } = require('./accommodationIntelligence');
const { evaluateCorridorDiningChain } = require('./corridorDiningEngine');
const { evaluateTransportHubCandidates, DEADLINE_STATES } = require('./transportHubEngine');
const { evaluateOvernightViability, OVERNIGHT_RECOMMENDATION } = require('./overnightStayEngine');
const { nextJourneyObservability } = require('./nextJourneyObservability');
const appLogger = require('../../../lib/logger');

const NEXT_LEG_DECISIONS = Object.freeze({
  START_NEXT_LEG: 'START_NEXT_LEG',
  CHOOSE_STAY: 'CHOOSE_STAY',
  CHOOSE_RESTAURANT: 'CHOOSE_RESTAURANT',
  WAIT: 'WAIT',
  DELAY: 'DELAY',
  REROUTE: 'REROUTE',
  REORDER: 'REORDER',
  CHANGE_DESTINATION: 'CHANGE_DESTINATION',
  HOLD_OR_DIVERT: 'HOLD_OR_DIVERT',
  END_JOURNEY: 'END_JOURNEY',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
});

/**
 * Evaluates and recommends the optimal next journey leg.
 */
async function evaluateNextLegDecision({
  tripId = 'active_trip',
  currentLocation = null,
  intentType = DESTINATION_INTENTS.GO_TO_HOTEL,
  rawInput = '',
  currentMinute = 1140, // 19:00 default
  nextDayPlans = null,
  userProfile = {},
  tripContext = {},
  _activeDisruptions = [],
  activeSafetyAlerts = [],
  isSimulated = false,
} = {}) {
  appLogger.info(`[nextLegDecisionEngine] Evaluating next leg for trip '${tripId}' with intent '${intentType}'`);

  // 1. Resolve intent into target destination or candidate set
  const intentResolution = await resolveDestinationIntent({
    intentType,
    rawInput,
    currentLocation,
    userProfile,
    tripContext,
  });

  if (intentResolution.intentType === DESTINATION_INTENTS.END_JOURNEY) {
    return {
      decision: NEXT_LEG_DECISIONS.END_JOURNEY,
      tripId,
      intentType,
      isSimulated,
      recommendedDestination: null,
      candidates: [],
      explanation: {
        headline: 'Journey Concluded',
        summary: 'Traveler elected to conclude travel session. No further legs planned.',
        safetyStatus: 'CLEAR',
        confidence: 'HIGH',
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  // 2. Evaluate Overnight Viability (contextual halt)
  const overnightCheck = evaluateOvernightViability({
    currentMinute,
    plannedRemainingTransitMinutes: 120,
    routeTerrainType: tripContext.terrain || 'STANDARD_HIGHWAY',
    activeWeatherHazards: activeSafetyAlerts,
    tripPacingMinutesToday: tripContext.pacingMinutesToday || 450,
  });

  let candidates = [];
  let decision = NEXT_LEG_DECISIONS.START_NEXT_LEG;

  // 3. Generate & Score Candidates based on resolved intent
  if (intentType === DESTINATION_INTENTS.GO_TO_HOTEL || intentType === DESTINATION_INTENTS.OVERNIGHT_STAY) {
    decision = NEXT_LEG_DECISIONS.CHOOSE_STAY;
    candidates = findCandidateAccommodations({
      currentLocation,
      nextDayDestination: nextDayPlans?.departureDestination || null,
      arrivalMinute: currentMinute,
      maxCandidates: 4,
    });
  } else if (intentType === DESTINATION_INTENTS.GO_TO_RESTAURANT) {
    decision = NEXT_LEG_DECISIONS.CHOOSE_RESTAURANT;
    candidates = evaluateCorridorDiningChain({
      currentLocation,
      nextDestination: tripContext.activeHotel || nextDayPlans?.departureDestination || null,
      currentMinute,
      dietaryPreference: userProfile.dietary,
      maxCandidates: 3,
    });
  } else if (
    intentType === DESTINATION_INTENTS.GO_TO_AIRPORT ||
    intentType === DESTINATION_INTENTS.GO_TO_RAILWAY_STATION ||
    intentType === DESTINATION_INTENTS.GO_TO_BUS_STATION
  ) {
    candidates = evaluateTransportHubCandidates({
      currentLocation,
      hubList: intentResolution.candidates || [],
      currentMinute,
      scheduledDepartureMinute: nextDayPlans?.scheduledDepartureMinute || tripContext.scheduledDepartureMinute || null,
      hubCategory: intentResolution.primaryDestination?.category,
    });
  } else if (intentResolution.destination) {
    // Single resolved destination (e.g. HOME, Tirupati, or custom POI)
    candidates = [{
      id: intentResolution.destination.id || 'resolved_destination',
      name: intentResolution.destination.displayName || intentResolution.destination.name,
      lat: intentResolution.destination.lat,
      lon: intentResolution.destination.lon,
      city: intentResolution.destination.city,
      distanceKm: intentResolution.distanceKm || 12.0,
      etaMinutes: Math.round((intentResolution.distanceKm || 12.0) * 2.0) + 10,
      trustState: 'SUPPORTED',
      compositeScore: 90,
      isPrivateLocation: Boolean(intentResolution.destination.isPrivateLocation),
    }];
  }

  // 4. Invariant: Safety Supremacy (Phase 3 strictly overrides next-leg choice)
  for (const cand of candidates) {
    if (cand.lat && cand.lon) {
      const isCandidateHazardous = Array.isArray(activeSafetyAlerts) && activeSafetyAlerts.some(a =>
        a.severity === 'CRITICAL' || a.severity === 'EMERGENCY' ||
        /landslide|flood|cyclone|closed/i.test(a.hazard || a.type || a.name || '')
      );

      cand.safetyVerdict = isCandidateHazardous ? 'HAZARDOUS' : 'SAFE';
      cand.safetyReason = isCandidateHazardous ? 'Critical safety advisory on candidate corridor.' : null;

      // Drop or downgrade unsafe candidates
      if (cand.safetyVerdict === 'AVOID' || cand.safetyVerdict === 'HAZARDOUS') {
        cand.compositeScore = 0;
        cand.safetyDisqualified = true;
      } else if (cand.safetyVerdict === 'CAUTION') {
        cand.compositeScore -= 25;
      }
    } else {
      cand.safetyVerdict = 'SAFE';
    }
  }

  // Filter out completely disqualified candidates unless all are disqualified
  const safeCandidates = candidates.filter(c => !c.safetyDisqualified);
  const safetyOverrideActive = candidates.some(c => c.safetyDisqualified) || (Array.isArray(activeSafetyAlerts) && activeSafetyAlerts.some(a => a.severity === 'CRITICAL' || a.severity === 'EMERGENCY'));
  const evaluatedCandidates = safeCandidates.length > 0 ? safeCandidates : candidates;

  evaluatedCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
  const primaryRecommendation = evaluatedCandidates[0] || null;

  if (safetyOverrideActive && (safeCandidates.length === 0 || (Array.isArray(activeSafetyAlerts) && activeSafetyAlerts.some(a => a.severity === 'CRITICAL')))) {
    decision = NEXT_LEG_DECISIONS.HOLD_OR_DIVERT;
  }

  // 5. Invariant: Hard Departure Deadlines outrank experience value
  if (primaryRecommendation?.deadlineEvaluation?.deadlineState === DEADLINE_STATES.DEADLINE_RISK) {
    decision = NEXT_LEG_DECISIONS.DELAY;
  } else if (primaryRecommendation?.deadlineEvaluation?.deadlineState === DEADLINE_STATES.MISSED_DEADLINE) {
    decision = NEXT_LEG_DECISIONS.CHANGE_DESTINATION;
  }

  // 6. Construct Structured Explainability Contract (Section 37)
  const explanation = generateExplainabilityContract({
    intentType,
    recommendation: primaryRecommendation,
    overnightCheck,
    tripContext,
    nextDayPlans,
  });

  nextJourneyObservability.record('next_leg_decision_count', isSimulated);
  if (safetyOverrideActive) {
    nextJourneyObservability.record('next_leg_safety_intervention', isSimulated);
  }
  if (primaryRecommendation?.deadlineEvaluation?.deadlineState === DEADLINE_STATES.DEADLINE_RISK) {
    nextJourneyObservability.record('deadline_risk_count', isSimulated);
  }

  return {
    decision,
    tripId,
    intentType,
    isSimulated,
    safetyOverrideActive: Boolean(safetyOverrideActive),
    recommendedDestination: primaryRecommendation,
    candidates: evaluatedCandidates,
    overnightAssessment: overnightCheck,
    explanation,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Builds the structured explainability contract answering:
 * WHERE, WHY, ETA, COST, TRAVEL EFFORT, SAFETY, TRUST, CURRENT CONDITIONS, CONSTRAINTS, TRADEOFF, CONFIDENCE.
 */
function generateExplainabilityContract({
  _intentType,
  recommendation,
  overnightCheck,
  tripContext,
  nextDayPlans,
} = {}) {
  if (!recommendation) {
    return {
      headline: 'Insufficient Destination Data',
      why: ['Could not verify feasible destination candidates under current constraints.'],
      confidence: 'LOW',
    };
  }

  const where = recommendation.name;
  const eta = `${recommendation.etaMinutes || recommendation.transitMinutes || 35} minutes`;
  const cost = recommendation.totalKnownPrice ? `₹${recommendation.totalKnownPrice}` : 'Standard transit fare';
  const travelEffort = `${recommendation.distanceKm || 10} km driving effort`;
  const safety = recommendation.safetyVerdict || 'CLEAR';
  const trust = recommendation.trustState || 'SUPPORTED';
  const currentConditions = tripContext?.weather?.condition || 'Clear & operational';
  const constraints = recommendation.checkInHoursText ? `Check-in: ${recommendation.checkInHoursText}` : 'Standard access';
  const tradeoff = recommendation.tradeoff || recommendation.corridorSummary || 'Direct optimal progression';
  const confidence = recommendation.compositeScore >= 80 ? 'HIGH' : 'MEDIUM';

  const why = [];
  why.push(`Destination '${where}' offers the best balance of safety, time, and journey utility.`);

  if (recommendation.tomorrowUtility === 'HIGHLY_FAVORABLE') {
    why.push(`Directly positions traveler on tomorrow's departure corridor for ${nextDayPlans?.departureDestination?.name || 'next city'}.`);
  }
  if (recommendation.trustState === 'TRUSTED') {
    why.push('Provider verified against official tourism and business registries.');
  }
  if (overnightCheck?.recommendation === OVERNIGHT_RECOMMENDATION.STAY_HIGHLY_RECOMMENDED) {
    why.push('Halting for the night avoids nocturnal ghat road hazards.');
  }

  return {
    where,
    why,
    eta,
    cost,
    travelEffort,
    safety,
    trust,
    currentConditions,
    constraints,
    tradeoff,
    confidence,
    headline: `Recommended Next Leg: ${where}`,
  };
}

module.exports = {
  NEXT_LEG_DECISIONS,
  evaluateNextLegDecision,
  generateExplainabilityContract,
};
