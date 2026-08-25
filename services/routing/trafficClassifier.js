'use strict';

/**
 * services/routing/trafficClassifier.js
 * Standardizes traffic states, provenance tiers, and time-of-day predictive modeling.
 */

const TRAFFIC_STATUS = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HEAVY: 'HEAVY',
  SEVERE: 'SEVERE',
  UNKNOWN: 'UNKNOWN',
};

const TRAFFIC_PROVENANCE = {
  LIVE_TRAFFIC: 'live_traffic',         // Real-time telemetry from Google / Mapbox
  PREDICTED_TRAFFIC: 'predicted_traffic', // Time-of-day statistical congestion pattern
  HISTORICAL_ESTIMATE: 'historical_estimate', // Corridor historical average
  ROUTE_ESTIMATE: 'route_estimate',       // Static road network duration (no traffic signal)
  UNKNOWN: 'unknown',
};

/**
 * Maps a numeric congestion factor to a standard traffic status.
 * @param {number|null} factor - Ratio of actual/traffic duration vs free-flow duration
 * @returns {string} TRAFFIC_STATUS key
 */
function classifyTrafficStatus(factor) {
  if (!Number.isFinite(factor) || factor <= 0) return TRAFFIC_STATUS.UNKNOWN;
  if (factor <= 1.12) return TRAFFIC_STATUS.LOW;
  if (factor <= 1.38) return TRAFFIC_STATUS.MODERATE;
  if (factor <= 1.75) return TRAFFIC_STATUS.HEAVY;
  return TRAFFIC_STATUS.SEVERE;
}

/**
 * Time-of-day statistical congestion multiplier for Indian urban corridors.
 * @param {number} minuteOfDay - 0 to 1439
 * @param {number} baseCongestion - City baseline factor (e.g. 1.25 for Bengaluru/Mumbai, 1.10 for Vizag)
 * @returns {{ factor: number, status: string, label: string }}
 */
function getPredictiveTraffic(minuteOfDay = 720, baseCongestion = 1.0) {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  let mult = 1.0;
  let label = 'Normal traffic flow';

  if (m >= 8 * 60 + 30 && m <= 11 * 60) {
    mult = 1.50; // Morning rush hour
    label = 'Morning peak congestion';
  } else if (m > 11 * 60 && m < 14 * 60) {
    mult = 1.15; // Midday movement
    label = 'Moderate midday traffic';
  } else if (m >= 14 * 60 && m < 17 * 60 + 30) {
    mult = 1.08; // Afternoon lull
    label = 'Normal afternoon flow';
  } else if (m >= 17 * 60 + 30 && m <= 20 * 60 + 30) {
    mult = 1.60; // Evening peak rush hour
    label = 'Evening peak congestion';
  } else if (m > 20 * 60 + 30 && m < 22 * 60 + 30) {
    mult = 0.95; // Winding down
    label = 'Light evening traffic';
  } else {
    mult = 0.75; // Late night / early morning free flow
    label = 'Free-flowing light traffic';
  }

  const effectiveFactor = Math.round((mult * baseCongestion) * 100) / 100;
  return {
    factor: effectiveFactor,
    status: classifyTrafficStatus(effectiveFactor),
    label,
  };
}

/**
 * Computes transparent traffic metadata for a given route leg.
 */
function normalizeTrafficMetadata(opts = {}) {
  const {
    durationSec,
    durationInTrafficSec,
    provider,
    departureMinute = 720,
    baseCongestion = 1.0,
    hasRealtimeSignal = false,
  } = opts;

  if (hasRealtimeSignal && Number.isFinite(durationInTrafficSec) && Number.isFinite(durationSec) && durationSec > 0) {
    const rawFactor = durationInTrafficSec / durationSec;
    const congestionFactor = Math.max(0.7, Math.min(3.0, Math.round(rawFactor * 100) / 100));
    const status = classifyTrafficStatus(congestionFactor);
    const delayMinutes = Math.max(0, Math.round((durationInTrafficSec - durationSec) / 60));

    return {
      status,
      congestionFactor,
      delayMinutes,
      provenance: TRAFFIC_PROVENANCE.LIVE_TRAFFIC,
      freshness: new Date().toISOString(),
      label: `${status === TRAFFIC_STATUS.LOW ? 'Light' : status === TRAFFIC_STATUS.MODERATE ? 'Moderate' : status === TRAFFIC_STATUS.HEAVY ? 'Heavy' : 'Severe'} traffic (Live Telemetry)`,
    };
  }

  // Predictive time-of-day model
  const pred = getPredictiveTraffic(departureMinute, baseCongestion);
  const baseSec = Number.isFinite(durationSec) ? durationSec : 600;
  const trafficAwareSec = Math.round(baseSec * pred.factor);
  const delayMinutes = Math.max(0, Math.round((trafficAwareSec - baseSec) / 60));

  return {
    status: pred.status,
    congestionFactor: pred.factor,
    delayMinutes,
    provenance: provider === 'osrm' ? TRAFFIC_PROVENANCE.PREDICTED_TRAFFIC : TRAFFIC_PROVENANCE.HISTORICAL_ESTIMATE,
    freshness: new Date().toISOString(),
    label: `${pred.label} (Time-of-Day Model)`,
  };
}

module.exports = {
  TRAFFIC_STATUS,
  TRAFFIC_PROVENANCE,
  classifyTrafficStatus,
  getPredictiveTraffic,
  normalizeTrafficMetadata,
};
