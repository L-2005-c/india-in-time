'use strict';

/**
 * services/travelIntelligence/safety/personalizedExposureEngine.js
 *
 * Personalized Exposure & Hard Safety Constraints Engine for India In-Time v3.0.
 *
 * Mathematical Formulation:
 * Exposure = Hazard × Route Exposure × Temporal Overlap × Traveler Context × Journey Constraints
 *
 * Absolute Invariants:
 * 1. Hard safety constraints (Road Closures, Evacuations) strictly OVERRIDE traveler preferences.
 * 2. Never infer medical or disability diagnoses. Only use explicitly declared constraints.
 * 3. Specialized Hazard Grounding:
 *    - Satellite hotspot => FIRE_ANOMALY (never confirmed road fire without report)
 *    - Heavy rain + river => FLOOD_RISK (never FLOODED_ROAD without road telemetry)
 *    - Mountain + rain => LANDSLIDE_RISK (never ACTIVE_LANDSLIDE without road telemetry)
 */

const { HAZARD_TYPES, SAFETY_DATA_STATES } = require('./safetySignalModel');
const { EXPOSURE_LEVELS } = require('./geospatialSafetyEngine');
const { TEMPORAL_STATES } = require('./temporalSafetyEngine');

/**
 * Evaluates personalized exposure for a traveler against a safety signal.
 */
function evaluatePersonalizedExposure({
  signal = {},
  geospatial = {},
  temporal = {},
  travelerDna = {},
  _journeyConstraints = {},
} = {}) {
  const isDirectIntersection = geospatial.isDirectRouteIntersection || geospatial.exposureLevel === EXPOSURE_LEVELS.DIRECT_INTERSECTION;
  const isTemporalOverlap = temporal.isOverlap !== false && temporal.state !== TEMPORAL_STATES.NO_TEMPORAL_OVERLAP;

  // 1. Hard Safety Constraints Check (Inviolable)
  const isAuthoritativeClosure = signal.hazardType === HAZARD_TYPES.ROAD_CLOSURE
    || signal.hazardType === HAZARD_TYPES.BRIDGE_CLOSURE
    || signal.hazardType === HAZARD_TYPES.EVACUATION_ALERT
    || signal.hazardType === HAZARD_TYPES.OFFICIAL_RESTRICTION;

  const isHardOverride = isAuthoritativeClosure && (
    isDirectIntersection ||
    geospatial.exposureLevel === EXPOSURE_LEVELS.HIGH ||
    geospatial.exposureLevel === EXPOSURE_LEVELS.MODERATE ||
    signal.severity === 'CRITICAL' ||
    signal.severity === 'SEVERE'
  );

  if (isHardOverride) {
    return {
      isHardSafetyConstraint: true,
      exposureScore: 1.0,
      exposureBand: 'CRITICAL',
      isExposed: true,
      groundedHazardType: signal.hazardType,
      groundingNotice: null,
      reason: `Official directive: ${signal.hazardType} (${signal.source || 'Official warning'}) strictly closes corridor. Traveler preference cannot override this restriction.`,
      recommendedState: 'AVOID',
      canTravelerOverride: false,
    };
  }

  // 2. Specialized Hazard Grounding Guards (Rules 35-37)
  let groundedHazardType = signal.hazardType;
  let groundingNotice = null;

  if (signal.hazardType === HAZARD_TYPES.FOREST_FIRE && signal.dataState !== SAFETY_DATA_STATES.OFFICIAL_WARNING) {
    groundedHazardType = HAZARD_TYPES.FIRE_ANOMALY;
    groundingNotice = 'Satellite thermal detection classified as FIRE_ANOMALY; unconfirmed on roadway.';
  } else if (signal.hazardType === HAZARD_TYPES.FLOOD && !signal.evidence?.some(e => /closed|impassable|submerged/i.test(e))) {
    groundedHazardType = HAZARD_TYPES.FLOOD_RISK;
    groundingNotice = 'Elevated hydrological advisory classified as FLOOD_RISK; road not verified submerged.';
  } else if (signal.hazardType === HAZARD_TYPES.LANDSLIDE && !signal.evidence?.some(e => /blocked|slide debris|closed/i.test(e))) {
    groundedHazardType = HAZARD_TYPES.LANDSLIDE_RISK;
    groundingNotice = 'Ghat slope saturation classified as LANDSLIDE_RISK; active blockage unconfirmed.';
  }

  // 3. If no geospatial or temporal overlap, exposure is negligible
  if (geospatial.exposureLevel === EXPOSURE_LEVELS.NONE || !isTemporalOverlap) {
    return {
      isHardSafetyConstraint: false,
      exposureScore: 0.0,
      exposureBand: 'NONE',
      isExposed: false,
      groundedHazardType,
      groundingNotice,
      reason: 'Hazard location or validity window does not intersect traveler route.',
      recommendedState: 'CONTINUE',
      canTravelerOverride: true,
    };
  }

  // 4. Personalization Dimensions (Explicit Declarations Only)
  const rainTolerance = travelerDna.rainExposureTolerance ?? travelerDna.rainTolerance ?? 40;
  const nightTolerance = travelerDna.nightTravelTolerance ?? 50;
  const ghatTolerance = travelerDna.ghatTolerance ?? 50;
  const heatTolerance = travelerDna.heatExposureTolerance ?? travelerDna.heatTolerance ?? 50;

  const isVulnerableParty = Boolean(
    travelerDna.travellingWithChildren ||
    travelerDna.travellingWithElderly ||
    travelerDna.mobilityConstraintDeclared ||
    travelerDna.medicalConstraintDeclared
  );

  let vulnerabilityMultiplier = 1.0;
  if (isVulnerableParty) vulnerabilityMultiplier += 0.35;
  if (travelerDna.nightTravelRestricted) vulnerabilityMultiplier += 0.25;

  // Compute raw exposure
  let baseScore = 0.4;
  if (geospatial.exposureLevel === EXPOSURE_LEVELS.DIRECT_INTERSECTION) baseScore = 0.85;
  else if (geospatial.exposureLevel === EXPOSURE_LEVELS.HIGH) baseScore = 0.65;
  else if (geospatial.exposureLevel === EXPOSURE_LEVELS.MODERATE) baseScore = 0.45;

  // Modify by hazard specific tolerance
  if (groundedHazardType === HAZARD_TYPES.HEAVY_RAIN || groundedHazardType === HAZARD_TYPES.WEATHER_WARNING) {
    if (rainTolerance <= 25) baseScore += 0.20;
    else if (rainTolerance >= 75) baseScore -= 0.15;
  } else if (groundedHazardType === HAZARD_TYPES.EXTREME_HEAT) {
    if (heatTolerance <= 25) baseScore += 0.25;
    else if (heatTolerance >= 75) baseScore -= 0.15;
  } else if (groundedHazardType === HAZARD_TYPES.GHAT_HAZARD) {
    if (ghatTolerance <= 25 || nightTolerance <= 25) baseScore += 0.30;
    else if (ghatTolerance >= 75) baseScore -= 0.15;
  }

  const finalScore = Math.min(1.0, Math.max(0.05, baseScore * vulnerabilityMultiplier));

  let exposureBand = 'LOW';
  let recommendedState = 'WATCH';

  if (finalScore >= 0.75) {
    exposureBand = 'HIGH';
    recommendedState = 'REPLACE_STOP';
  } else if (finalScore >= 0.50) {
    exposureBand = 'MODERATE';
    recommendedState = 'CAUTION';
  } else {
    exposureBand = 'LOW';
    recommendedState = 'WATCH';
  }

  return {
    isHardSafetyConstraint: isAuthoritativeClosure,
    exposureScore: Math.round(finalScore * 100) / 100,
    exposureBand,
    isExposed: true,
    groundedHazardType,
    groundingNotice,
    reason: `Route exposure (${geospatial.exposureLevel}) with temporal overlap (${temporal.overlapMinutes || 60}m). Traveler profile factors applied.`,
    recommendedState: isAuthoritativeClosure ? 'AVOID' : recommendedState,
    canTravelerOverride: !isAuthoritativeClosure,
  };
}

module.exports = {
  evaluatePersonalizedExposure,
};
