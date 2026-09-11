'use strict';

/**
 * services/travelIntelligence/safety/safetySignalModel.js
 *
 * Canonical Safety Signal Model for India In-Time v3.0.
 * Standardizes safety evidence across official warnings, observed conditions, and sensor feeds.
 */

const crypto = require('crypto');

const HAZARD_TYPES = Object.freeze({
  WEATHER_WARNING: 'WEATHER_WARNING',
  HEAVY_RAIN: 'HEAVY_RAIN',
  THUNDERSTORM: 'THUNDERSTORM',
  LIGHTNING: 'LIGHTNING',
  EXTREME_HEAT: 'EXTREME_HEAT',
  EXTREME_COLD: 'EXTREME_COLD',
  HIGH_WIND: 'HIGH_WIND',
  LOW_VISIBILITY: 'LOW_VISIBILITY',
  FLOOD: 'FLOOD',
  FLASH_FLOOD: 'FLASH_FLOOD',
  WATERLOGGING: 'WATERLOGGING',
  LANDSLIDE: 'LANDSLIDE',
  LANDSLIDE_RISK: 'LANDSLIDE_RISK',
  FOREST_FIRE: 'FOREST_FIRE',
  WILDFIRE_SMOKE: 'WILDFIRE_SMOKE',
  FIRE_ANOMALY: 'FIRE_ANOMALY',
  ROAD_HAZARD: 'ROAD_HAZARD',
  ROAD_CLOSURE: 'ROAD_CLOSURE',
  BRIDGE_CLOSURE: 'BRIDGE_CLOSURE',
  GHAT_HAZARD: 'GHAT_HAZARD',
  CYCLONE: 'CYCLONE',
  EARTHQUAKE: 'EARTHQUAKE',
  TSUNAMI: 'TSUNAMI',
  WILDLIFE_HAZARD: 'WILDLIFE_HAZARD',
  OFFICIAL_RESTRICTION: 'OFFICIAL_RESTRICTION',
  EVACUATION_ALERT: 'EVACUATION_ALERT',
  UNKNOWN_HAZARD: 'UNKNOWN_HAZARD',
});

const SAFETY_SEVERITIES = Object.freeze({
  INFO: 'INFO',
  WATCH: 'WATCH',
  CAUTION: 'CAUTION',
  WARNING: 'WARNING',
  SEVERE: 'SEVERE',
  CRITICAL: 'CRITICAL',
});

const SAFETY_DATA_STATES = Object.freeze({
  OBSERVED: 'OBSERVED',
  LIVE: 'LIVE',
  OFFICIAL_WARNING: 'OFFICIAL_WARNING',
  FORECAST: 'FORECAST',
  PREDICTED: 'PREDICTED',
  ESTIMATED: 'ESTIMATED',
  HISTORICAL: 'HISTORICAL',
  STALE: 'STALE',
  UNAVAILABLE: 'UNAVAILABLE',
  SIMULATED: 'SIMULATED',
});

/**
 * Creates and normalizes a Canonical SafetySignal record.
 */
function createSafetySignal({
  id = null,
  provider = 'UNKNOWN_PROVIDER',
  source = 'Unspecified Source',
  sourceType = 'GENERAL_ADVISORY',
  providerRecordId = null,
  hazardType = HAZARD_TYPES.UNKNOWN_HAZARD,
  hazardState = 'ACTIVE',
  severity = SAFETY_SEVERITIES.WARNING,
  confidence = 'MEDIUM',
  causeConfidence = 'MEDIUM',
  impactConfidence = 'MEDIUM',
  provenance = {},
  dataState = SAFETY_DATA_STATES.ESTIMATED,
  observedAt = null,
  issuedAt = new Date().toISOString(),
  validFrom = null,
  validUntil = null,
  retrievedAt = new Date().toISOString(),
  location = null,
  geometry = null,
  affectedArea = 'Corridor',
  radiusMeters = 5000,
  evidence = [],
  sourceUrl = null,
  sourcePayloadHash = null,
  description = null,
  affectedSegment = null,
  isStale = false,
  freshness = 'FRESH',
} = {}) {
  const normHazardType = HAZARD_TYPES[hazardType] || HAZARD_TYPES.UNKNOWN_HAZARD;
  const normSeverity = SAFETY_SEVERITIES[severity] || SAFETY_SEVERITIES.WARNING;
  const normDataState = SAFETY_DATA_STATES[dataState] || SAFETY_DATA_STATES.ESTIMATED;

  const generatedId = id || `sig_${provider.toLowerCase()}_${normHazardType.toLowerCase()}_${crypto.randomBytes(4).toString('hex')}`;
  const computedHash = sourcePayloadHash || crypto.createHash('sha256').update(JSON.stringify({
    provider,
    normHazardType,
    normSeverity,
    issuedAt,
    location,
  })).digest('hex').substring(0, 16);

  return {
    id: generatedId,
    provider: String(provider),
    source: String(source),
    sourceType: String(sourceType),
    providerRecordId: providerRecordId ? String(providerRecordId) : null,
    hazardType: normHazardType,
    hazardState: String(hazardState),
    severity: normSeverity,
    confidence: String(confidence).toUpperCase(),
    causeConfidence: String(causeConfidence).toUpperCase(),
    impactConfidence: String(impactConfidence).toUpperCase(),
    provenance: {
      sourceUrl: sourceUrl || provenance.sourceUrl || null,
      sourcePayloadHash: computedHash,
      retrievedAt,
      ...provenance,
    },
    dataState: normDataState,
    observedAt: observedAt ? new Date(observedAt).toISOString() : null,
    issuedAt: issuedAt ? new Date(issuedAt).toISOString() : new Date().toISOString(),
    validFrom: validFrom ? new Date(validFrom).toISOString() : null,
    validUntil: validUntil ? new Date(validUntil).toISOString() : null,
    retrievedAt,
    location: location ? {
      name: location.name || 'Location',
      coords: Array.isArray(location.coords) ? location.coords.map(Number) : null,
    } : null,
    geometry: geometry || (location?.coords ? { type: 'Circle', radiusMeters } : null),
    affectedArea: String(affectedArea || 'Route Corridor'),
    radiusMeters: Number(radiusMeters) || 5000,
    evidence: Array.isArray(evidence) ? evidence : (evidence ? [String(evidence)] : []),
    description: description || `${normSeverity} alert for ${normHazardType.replace(/_/g, ' ')} in ${affectedArea}.`,
    affectedSegment: affectedSegment || null,
    freshness: String(freshness).toUpperCase(),
    isStale: Boolean(isStale),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  HAZARD_TYPES,
  SAFETY_SEVERITIES,
  SAFETY_DATA_STATES,
  createSafetySignal,
};
