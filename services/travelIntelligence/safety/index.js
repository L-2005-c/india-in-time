'use strict';

/**
 * services/travelIntelligence/safety/index.js
 *
 * Unified Safety & Risk Intelligence Facade for India In-Time v3.0.
 */

const {
  getSafetyProviders,
  OFFICIAL_PROVIDERS,
  fetchNdmaAlerts,
  fetchImdWarnings,
  fetchCwcFloodAdvisories,
  fetchFsiFireAlerts,
} = require('./safetySourceAdapters');
const { createSafetySignal, HAZARD_TYPES, SAFETY_SEVERITIES, SAFETY_DATA_STATES } = require('./safetySignalModel');
const { calibrateSafetyConfidences } = require('./safetyDualConfidence');
const { arbitrateSafetySources } = require('./sourceAuthorityEngine');
const { evaluateSignalFreshness } = require('./freshnessEngine');
const { evaluateGeospatialExposure } = require('./geospatialSafetyEngine');
const { evaluateTemporalOverlap } = require('./temporalSafetyEngine');
const { evaluatePersonalizedExposure } = require('./personalizedExposureEngine');
const { evaluateSafetyDecision, SAFETY_DECISION_STATES } = require('./safetyDecisionEngine');
const { dispatchSafetyNotification, resolveSafetyNotification } = require('../disruption/disruptionNotificationEngine');

/**
 * Evaluates the comprehensive safety posture of an active or planned journey.
 */
function evaluateJourneySafety({
  tripId = 'active_trip',
  journeyState = {},
  travelerDna = {},
  signals = [],
  customSignal = null,
  now = Date.now(),
  isSimulation = false,
} = {}) {
  // Aggregate candidate signals
  const candidateSignals = Array.isArray(signals) ? [...signals] : [];
  if (customSignal) {
    candidateSignals.push(createSafetySignal({
      ...customSignal,
      dataState: isSimulation ? SAFETY_DATA_STATES.SIMULATED : (customSignal.dataState || SAFETY_DATA_STATES.OFFICIAL_WARNING),
    }));
  }

  // If no candidate signals provided and journey has active/upcoming stops, evaluate regional signals
  if (candidateSignals.length === 0) {
    return {
      safetyStatus: 'SAFE_TO_CONTINUE',
      decision: SAFETY_DECISION_STATES.CONTINUE,
      activeSignalsCount: 0,
      signals: [],
      evaluatedAt: new Date(now).toISOString(),
      notification: null,
      explanation: {
        primaryDriver: 'No active safety advisories or hazard detections on corridor.',
        nextStep: 'Proceed according to itinerary.',
      },
    };
  }

  // 1. Source Arbitration & Conflict Check
  const arbitration = arbitrateSafetySources(candidateSignals);
  const primarySignal = arbitration.selectedSource;

  if (!primarySignal) {
    return {
      safetyStatus: 'INSUFFICIENT_DATA',
      decision: SAFETY_DECISION_STATES.INSUFFICIENT_DATA,
      activeSignalsCount: 0,
      signals: [],
      evaluatedAt: new Date(now).toISOString(),
      notification: null,
      explanation: {
        primaryDriver: 'Safety source data unavailable.',
        nextStep: 'Proceed with vigilance; refresh telemetry.',
      },
    };
  }

  // 2. Freshness Evaluation
  const freshness = evaluateSignalFreshness(primarySignal, now);
  primarySignal.freshness = freshness.freshness;
  primarySignal.isStale = freshness.isStale;
  primarySignal.ageMinutes = freshness.ageMinutes;

  // 3. Geospatial Exposure Evaluation
  const stops = Array.isArray(journeyState.stops) ? journeyState.stops : [];
  const geospatial = evaluateGeospatialExposure({
    signal: primarySignal,
    journeyState,
    stops,
  });

  // 4. Temporal Overlap Evaluation
  const currentMinute = Number(journeyState.currentMinute || 600);
  const temporal = evaluateTemporalOverlap({
    signal: primarySignal,
    travelerStartMinute: currentMinute,
    travelerEndMinute: currentMinute + 180,
    nowMinute: currentMinute,
  });

  // 5. Personalized Exposure & Hard Safety Constraints
  const personalized = evaluatePersonalizedExposure({
    signal: primarySignal,
    geospatial,
    temporal,
    travelerDna,
  });
  primarySignal.groundedHazardType = personalized.groundedHazardType;

  // 6. Tri-Dimensional Confidence Calibration
  const confidences = calibrateSafetyConfidences({
    signal: primarySignal,
    routeDistanceKm: geospatial.minDistanceKm,
    hasOfficialConfirmation: primarySignal.dataState === SAFETY_DATA_STATES.OFFICIAL_WARNING,
    isDirectRouteIntersection: geospatial.isDirectRouteIntersection,
  });
  primarySignal.hazardConfidence = confidences.hazardConfidence;
  primarySignal.causeConfidence = confidences.causeConfidence;
  primarySignal.impactConfidence = confidences.impactConfidence;

  // 7. Safety Decision Generation
  const decisionResult = evaluateSafetyDecision({
    signal: primarySignal,
    geospatial,
    temporal,
    exposure: personalized,
    travelerDna,
    journeyState,
  });

  // 8. Proactive Notification Dispatch (if conditions warrant warning/alert)
  let notificationResult = null;
  const warrantsNotification = decisionResult.decision !== SAFETY_DECISION_STATES.CONTINUE;

  if (warrantsNotification) {
    const journeyImpact = {
      impactState: personalized.exposureBand === 'HIGH' ? 'HIGH_IMPACT' : 'MODERATE_IMPACT',
      affectedStops: geospatial.affectedStops,
      reason: decisionResult.explanation?.primaryDriver,
    };

    notificationResult = dispatchSafetyNotification({
      tripId,
      signal: primarySignal,
      journeyImpact,
      travelerExposure: personalized,
      recommendedDecision: decisionResult,
      now,
    });
  }

  // Map to UI Safety Status
  let safetyStatus = 'SAFE_TO_CONTINUE';
  if (decisionResult.decision === SAFETY_DECISION_STATES.EMERGENCY || decisionResult.decision === SAFETY_DECISION_STATES.AVOID) {
    safetyStatus = 'CRITICAL';
  } else if (decisionResult.decision === SAFETY_DECISION_STATES.REPLACE_STOP || decisionResult.decision === SAFETY_DECISION_STATES.REROUTE) {
    safetyStatus = 'REPLAN_RECOMMENDED';
  } else if (decisionResult.decision === SAFETY_DECISION_STATES.CAUTION || decisionResult.decision === SAFETY_DECISION_STATES.DELAY) {
    safetyStatus = 'CAUTION';
  } else if (decisionResult.decision === SAFETY_DECISION_STATES.WATCH) {
    safetyStatus = 'WATCH';
  } else if (decisionResult.decision === SAFETY_DECISION_STATES.INSUFFICIENT_DATA) {
    safetyStatus = 'INSUFFICIENT_DATA';
  }

  return {
    safetyStatus,
    decision: decisionResult.decision,
    planAppropriate: decisionResult.planAppropriate,
    primarySignal,
    confidence: primarySignal.confidence || 'MEDIUM',
    hazardConfidence: primarySignal.hazardConfidence,
    causeConfidence: primarySignal.causeConfidence,
    impactConfidence: primarySignal.impactConfidence,
    dataState: primarySignal.dataState,
    freshness: primarySignal.freshness,
    sourceConflict: arbitration.sourceConflict,
    conflictExplanation: arbitration.conflictExplanation,
    isSimulation: Boolean(isSimulation || primarySignal.dataState === SAFETY_DATA_STATES.SIMULATED),
    activeSignalsCount: candidateSignals.length,
    geospatial,
    temporal,
    exposure: personalized,
    explanation: decisionResult.explanation,
    notification: notificationResult?.notification || null,
    evaluatedAt: new Date(now).toISOString(),
  };
}

/**
 * Controlled demonstration hook for testing safety mutations.
 */
function simulateSafetyEvent({
  tripId = 'active_trip',
  journeyState = {},
  travelerDna = {},
  scenario = 'HEAVY_RAIN_GHAT_LANDSLIDE',
  now = Date.now(),
} = {}) {
  let customSignal = null;

  if (scenario === 'OFFICIAL_ROAD_CLOSURE') {
    customSignal = {
      provider: 'POLICE_TRAFFIC_CONTROL',
      source: 'District Police Administration & Highways Authority',
      sourceType: 'GOVERNMENT_LAW_ENFORCEMENT',
      hazardType: HAZARD_TYPES.ROAD_CLOSURE,
      severity: SAFETY_SEVERITIES.CRITICAL,
      dataState: SAFETY_DATA_STATES.SIMULATED,
      location: { name: 'Araku Ghat NH516E', coords: [18.2325, 82.9150] },
      affectedArea: 'Ghat Section Hairpin 14-22',
      radiusMeters: 15000,
      evidence: ['Official Police Barrier Notice #402', 'Road structurally compromised'],
      description: 'Official road closure: Araku Ghat corridor closed to all traffic due to road damage.',
      isStale: false,
      confidence: 'HIGH',
    };
  } else if (scenario === 'DATA_UNAVAILABLE') {
    customSignal = {
      provider: 'SAFETY_SENSOR_HUB',
      source: 'Regional Telemetry Hub',
      sourceType: 'TELEMETRY_NETWORK',
      hazardType: HAZARD_TYPES.UNKNOWN_HAZARD,
      severity: SAFETY_SEVERITIES.WATCH,
      dataState: SAFETY_DATA_STATES.UNAVAILABLE,
      evidence: [],
      description: 'Current safety information could not be refreshed from upstream providers.',
      isStale: true,
      confidence: 'LOW',
    };
  } else {
    // Default: HEAVY_RAIN_GHAT_LANDSLIDE
    customSignal = {
      provider: 'IMD',
      source: 'IMD Amaravati Meteorological Centre',
      sourceType: 'NATIONAL_METEOROLOGICAL_SERVICE',
      hazardType: HAZARD_TYPES.LANDSLIDE_RISK,
      severity: SAFETY_SEVERITIES.WARNING,
      dataState: SAFETY_DATA_STATES.SIMULATED,
      location: { name: 'Borra to Araku Corridor', coords: [18.2811, 83.0402] },
      affectedArea: 'Highland Ghat Section',
      radiusMeters: 12000,
      evidence: ['Continuous torrential downpour (>120mm)', 'Saturated slope runoff'],
      description: 'Heavy rain & elevated mudslide risk along Borra-Araku highland road.',
      isStale: false,
      confidence: 'HIGH',
    };
  }

  return evaluateJourneySafety({
    tripId,
    journeyState,
    travelerDna,
    customSignal,
    now,
    isSimulation: true,
  });
}

/**
 * Refreshes live safety feeds from official government adapters (NDMA, IMD).
 */
async function refreshLiveSafetyFeeds({ district = null, force = false } = {}) {
  const [ndmaSignals, imdSignals] = await Promise.all([
    fetchNdmaAlerts({ force }).catch(() => []),
    fetchImdWarnings({ district, force }).catch(() => []),
  ]);
  return [...ndmaSignals, ...imdSignals];
}

module.exports = {
  getSafetyProviders,
  OFFICIAL_PROVIDERS,
  fetchNdmaAlerts,
  fetchImdWarnings,
  fetchCwcFloodAdvisories,
  fetchFsiFireAlerts,
  refreshLiveSafetyFeeds,
  createSafetySignal,
  HAZARD_TYPES,
  SAFETY_SEVERITIES,
  SAFETY_DATA_STATES,
  SAFETY_DECISION_STATES,
  evaluateJourneySafety,
  simulateSafetyEvent,
  resolveSafetyCondition: resolveSafetyNotification,
};
