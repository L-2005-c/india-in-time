'use strict';

/**
 * services/travelIntelligence/weather/weatherNormalizer.js
 *
 * Canonical Weather Normalizer for India In-Time v3.0.
 * Normalizes multi-provider meteorological telemetry into an immutable,
 * provenance-preserving Canonical Weather Object.
 */

const { DATA_STATES, CONFIDENCE_LEVELS } = require('../provenanceModel');

/**
 * Normalizes any provider output to the canonical weather record.
 */
function normalizeWeatherRecord({
  provider = 'UNKNOWN',
  dataState = DATA_STATES.UNKNOWN,
  confidence = CONFIDENCE_LEVELS.LOW,
  latitude = null,
  longitude = null,
  elevationM = null,
  temperatureC = null,
  apparentTempC = null,
  humidityPercent = null,
  windKph = null,
  precipitationProb = null,
  precipitationMm = 0,
  condition = 'Unknown',
  cloudCoverPercent = null,
  uvIndex = null,
  observedAt = null,
  issuedAt = null,
  forecastFor = null,
  validUntil = null,
  hourly = [],
  rawWarnings = [],
  elevationAudit = null,
} = {}) {
  const isNum = v => v !== null && v !== undefined && Number.isFinite(Number(v));

  const normLat = isNum(latitude) ? Number(latitude) : null;
  const normLon = isNum(longitude) ? Number(longitude) : null;
  const normTemp = isNum(temperatureC) ? Math.round(Number(temperatureC) * 10) / 10 : null;
  const normApparent = isNum(apparentTempC)
    ? Math.round(Number(apparentTempC) * 10) / 10
    : normTemp;
  const normHumidity = isNum(humidityPercent)
    ? Math.min(100, Math.max(0, Math.round(Number(humidityPercent))))
    : null;
  const normWind = isNum(windKph)
    ? Math.max(0, Math.round(Number(windKph) * 10) / 10)
    : null;
  const normRainProb = isNum(precipitationProb)
    ? Math.min(100, Math.max(0, Math.round(Number(precipitationProb))))
    : null;
  const normRainMm = isNum(precipitationMm)
    ? Math.max(0, Math.round(Number(precipitationMm) * 10) / 10)
    : 0;

  return {
    provider: String(provider),
    dataState: DATA_STATES[dataState] || DATA_STATES.UNKNOWN,
    confidence: CONFIDENCE_LEVELS[confidence] || CONFIDENCE_LEVELS.LOW,
    location: {
      latitude: normLat,
      longitude: normLon,
      elevationM: Number.isFinite(Number(elevationM)) ? Number(elevationM) : null,
    },
    metrics: {
      temperatureC: normTemp,
      apparentTempC: normApparent,
      humidityPercent: normHumidity,
      windKph: normWind,
      precipitationProb: normRainProb,
      precipitationMm: normRainMm,
      condition: String(condition || 'Unknown'),
      cloudCoverPercent: Number.isFinite(Number(cloudCoverPercent)) ? Math.min(100, Math.max(0, Number(cloudCoverPercent))) : null,
      uvIndex: Number.isFinite(Number(uvIndex)) ? Math.max(0, Number(uvIndex)) : null,
    },
    timestamps: {
      observedAt: observedAt || null,
      issuedAt: issuedAt || new Date().toISOString(),
      forecastFor: forecastFor || null,
      validUntil: validUntil || null,
    },
    hourly: Array.isArray(hourly) ? hourly : [],
    warnings: Array.isArray(rawWarnings) ? rawWarnings : [],
    elevationAudit: elevationAudit || null,
    isAvailable: normTemp !== null,
  };
}

module.exports = {
  normalizeWeatherRecord,
};
