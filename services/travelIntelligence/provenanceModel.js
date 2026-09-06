'use strict';

/**
 * services/travelIntelligence/provenanceModel.js
 *
 * Authoritative Intelligence Provenance & Truthfulness Contract.
 * Standardizes metadata, evidence tracking, data states, and user-facing vocabulary
 * across Weather, Traffic, Routing, Crowd, Darshan, Hazards, and POI verification.
 */

const DATA_STATES = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  UNAVAILABLE: 'UNAVAILABLE',
  OBSERVED: 'OBSERVED',
  ESTIMATED: 'ESTIMATED',
  PREDICTED: 'PREDICTED',
  LIVE: 'LIVE',
  OFFICIAL: 'OFFICIAL',
  STALE: 'STALE',
});

const CONFIDENCE_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

const ROUTE_TYPES = Object.freeze({
  LIVE_TRAFFIC_ROUTE: 'LIVE_TRAFFIC_ROUTE',
  TRAFFIC_AWARE_ROUTE: 'TRAFFIC_AWARE_ROUTE',
  ROAD_NETWORK_ESTIMATE: 'ROAD_NETWORK_ESTIMATE',
  GEODESIC_HEURISTIC_ESTIMATE: 'GEODESIC_HEURISTIC_ESTIMATE',
  UNKNOWN: 'UNKNOWN',
});

const HAZARD_SOURCES = Object.freeze({
  OFFICIAL_ALERT: 'OFFICIAL_ALERT',
  LIVE_WEATHER_SIGNAL: 'LIVE_WEATHER_SIGNAL',
  MODEL_PREDICTION: 'MODEL_PREDICTION',
  GENERAL_ADVISORY: 'GENERAL_ADVISORY',
  STATIC_SAFETY_GUIDANCE: 'STATIC_SAFETY_GUIDANCE',
});

const CROWD_METHODS = Object.freeze({
  RULE_BASED_ESTIMATE: 'RULE_BASED_ESTIMATE',
  HISTORICAL_PATTERN: 'HISTORICAL_PATTERN',
  ML_PREDICTION: 'ML_PREDICTION',
  LIVE_OBSERVATION: 'LIVE_OBSERVATION',
  USER_REPORT: 'USER_REPORT',
});

/**
 * Creates a standardized intelligence provenance record.
 * Answers: WHAT, WHEN, WHERE FROM, HOW, HOW FRESH, HOW CERTAIN.
 */
function createProvenanceRecord({
  value = null,
  status = DATA_STATES.UNKNOWN,
  source = 'unknown',
  method = 'unknown',
  generatedAt = new Date().toISOString(),
  validUntil = null,
  confidence = null,
  evidenceCount = 0,
  limitations = null,
} = {}) {
  const normalizedConfidence = typeof confidence === 'string'
    ? (CONFIDENCE_LEVELS[confidence.toUpperCase()] || null)
    : mapConfidenceScoreToBand(confidence);

  return {
    value,
    status: DATA_STATES[status] || DATA_STATES.UNKNOWN,
    source: String(source || 'unknown'),
    method: String(method || 'unknown'),
    generatedAt: generatedAt || new Date().toISOString(),
    validUntil: validUntil || null,
    confidence: normalizedConfidence,
    evidenceCount: Number.isFinite(evidenceCount) ? Math.max(0, evidenceCount) : 0,
    limitations: limitations || null,
  };
}

/**
 * Maps numeric scores (0-100) or null to evidence-backed bands.
 * Never manufactures precision or invents certainty from empty signals.
 */
function mapConfidenceScoreToBand(score) {
  if (score == null || !Number.isFinite(score) || score <= 0) return null;
  if (score >= 80) return CONFIDENCE_LEVELS.HIGH;
  if (score >= 50) return CONFIDENCE_LEVELS.MEDIUM;
  return CONFIDENCE_LEVELS.LOW;
}

/**
 * Checks if a timestamp exceeds a given age in seconds.
 */
function isDataStale(timestamp, maxAgeSeconds = 1800) {
  if (!timestamp) return true;
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) return true;
  return (Date.now() - ts) > (maxAgeSeconds * 1000);
}

/**
 * Translates internal engineering jargon to clean, human-readable vocabulary.
 */
function toTravelerLanguage(key, value) {
  const mappings = {
    CONFIDENCE: {
      HIGH: 'High Certainty',
      MEDIUM: 'Moderate Certainty',
      LOW: 'Early Estimate',
      null: 'Information Unavailable',
    },
    DATA_STATE: {
      LIVE: 'Live Now',
      PREDICTED: 'Forecasted',
      ESTIMATED: 'Estimated',
      HISTORICAL: 'Historical Trend',
      OFFICIAL: 'Official Schedule',
      UNAVAILABLE: 'Unavailable',
      UNKNOWN: 'Unknown',
      STALE: 'May Be Outdated',
    },
    ROUTE_TYPE: {
      LIVE_TRAFFIC_ROUTE: 'Live Traffic Route',
      TRAFFIC_AWARE_ROUTE: 'Traffic-Aware Estimate',
      ROAD_NETWORK_ESTIMATE: 'Standard Road Route',
      GEODESIC_HEURISTIC_ESTIMATE: 'Terrain & Distance Estimate',
      UNKNOWN: 'Route Unknown',
    },
  };

  const domain = mappings[key];
  if (!domain) return String(value || 'Unknown');
  return domain[value] || String(value || 'Unknown');
}

module.exports = {
  DATA_STATES,
  CONFIDENCE_LEVELS,
  ROUTE_TYPES,
  HAZARD_SOURCES,
  CROWD_METHODS,
  createProvenanceRecord,
  mapConfidenceScoreToBand,
  isDataStale,
  toTravelerLanguage,
};
