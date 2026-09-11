'use strict';

/**
 * services/travelIntelligence/safety/safetyDualConfidence.js
 *
 * Tri-Dimensional Safety Confidence Model for India In-Time v3.0.
 *
 * Evaluates:
 * 1. Hazard Confidence: How sure are we that this condition physically exists?
 * 2. Cause Confidence: How sure are we about what caused it?
 * 3. Impact Confidence: How sure are we that it directly threatens THIS traveler's itinerary?
 */

const { HAZARD_TYPES, SAFETY_DATA_STATES } = require('./safetySignalModel');

/**
 * Calibrates the tri-dimensional confidence for a safety signal.
 */
function calibrateSafetyConfidences({
  signal = {},
  routeDistanceKm = null,
  hasOfficialConfirmation = false,
  isDirectRouteIntersection = false,
} = {}) {
  let hazardConfidence = 'MEDIUM';
  let causeConfidence = 'MEDIUM';
  let impactConfidence = 'LOW';

  const hazardType = signal.hazardType;
  const dataState = signal.dataState;

  // 1. Hazard Confidence Calibration
  if (dataState === SAFETY_DATA_STATES.OFFICIAL_WARNING || dataState === SAFETY_DATA_STATES.OBSERVED || dataState === SAFETY_DATA_STATES.LIVE) {
    hazardConfidence = 'HIGH';
  } else if (dataState === SAFETY_DATA_STATES.PREDICTED || dataState === SAFETY_DATA_STATES.FORECAST) {
    hazardConfidence = 'MEDIUM';
  } else if (dataState === SAFETY_DATA_STATES.ESTIMATED || dataState === SAFETY_DATA_STATES.HISTORICAL) {
    hazardConfidence = 'LOW';
  } else if (dataState === SAFETY_DATA_STATES.UNAVAILABLE) {
    hazardConfidence = 'LOW';
  }

  // 2. Cause Confidence Calibration
  const effectiveHazard = signal.groundedHazardType || hazardType;
  if (
    effectiveHazard === HAZARD_TYPES.FIRE_ANOMALY ||
    effectiveHazard === HAZARD_TYPES.FOREST_FIRE ||
    signal.provider === 'FSI' ||
    signal.source === 'FSI'
  ) {
    // Satellite hotspots confirm thermal anomaly, but NOT confirmed road fire without ground report
    causeConfidence = hasOfficialConfirmation ? 'HIGH' : 'LOW';
  } else if (hazardType === HAZARD_TYPES.ROAD_CLOSURE || hazardType === HAZARD_TYPES.EVACUATION_ALERT) {
    causeConfidence = hasOfficialConfirmation || dataState === SAFETY_DATA_STATES.OFFICIAL_WARNING ? 'HIGH' : 'MEDIUM';
  } else if (hazardType === HAZARD_TYPES.LANDSLIDE_RISK || hazardType === HAZARD_TYPES.FLOOD || hazardType === HAZARD_TYPES.FLASH_FLOOD) {
    causeConfidence = hasOfficialConfirmation ? 'HIGH' : 'MEDIUM';
  } else if (hazardType === HAZARD_TYPES.WEATHER_WARNING || hazardType === HAZARD_TYPES.HEAVY_RAIN || hazardType === HAZARD_TYPES.CYCLONE) {
    causeConfidence = 'HIGH';
  } else if (hazardType === HAZARD_TYPES.UNKNOWN_HAZARD) {
    causeConfidence = 'LOW';
  }

  // 3. Impact Confidence Calibration
  if (isDirectRouteIntersection) {
    impactConfidence = 'HIGH';
  } else if (routeDistanceKm != null && routeDistanceKm <= 5) {
    impactConfidence = 'HIGH';
  } else if (routeDistanceKm != null && routeDistanceKm <= 20) {
    impactConfidence = 'MEDIUM';
  } else if (routeDistanceKm != null && routeDistanceKm > 20) {
    impactConfidence = 'LOW';
  }

  return {
    hazardConfidence,
    causeConfidence,
    impactConfidence,
  };
}

module.exports = {
  calibrateSafetyConfidences,
};
