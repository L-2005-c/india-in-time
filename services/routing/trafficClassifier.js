'use strict';

/**
 * services/routing/trafficClassifier.js
 *
 * Standardizes traffic states, multi-city predictive congestion curves,
 * day-of-week sensitivity, weather-traffic coupling, and delay attribution.
 */

const TRAFFIC_STATUS = {
  FREE_FLOW: 'FREE_FLOW',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HEAVY: 'HEAVY',
  SEVERE: 'SEVERE',
  GRIDLOCK: 'GRIDLOCK',
  UNKNOWN: 'UNKNOWN',
};

const TRAFFIC_PROVENANCE = {
  LIVE_TRAFFIC: 'live_traffic',           // Real-time telemetry from Google / Mapbox
  PREDICTED_TRAFFIC: 'predicted_traffic', // Multi-city localized statistical congestion model
  HISTORICAL_ESTIMATE: 'historical_estimate', // Corridor historical average
  ROUTE_ESTIMATE: 'route_estimate',       // Static road network duration (no traffic signal)
  UNKNOWN: 'unknown',
};

// City Baseline Congestion Profiles
const CITY_CONGESTION_PROFILES = {
  bengaluru: { baseline: 1.35, morningPeak: 1.70, eveningPeak: 1.85, weekendEve: 1.55 },
  mumbai:    { baseline: 1.30, morningPeak: 1.65, eveningPeak: 1.80, weekendEve: 1.60 },
  delhi:     { baseline: 1.25, morningPeak: 1.60, eveningPeak: 1.75, weekendEve: 1.50 },
  hyderabad: { baseline: 1.20, morningPeak: 1.50, eveningPeak: 1.65, weekendEve: 1.45 },
  chennai:   { baseline: 1.18, morningPeak: 1.45, eveningPeak: 1.60, weekendEve: 1.40 },
  kolkata:   { baseline: 1.22, morningPeak: 1.50, eveningPeak: 1.65, weekendEve: 1.45 },
  pune:      { baseline: 1.20, morningPeak: 1.50, eveningPeak: 1.65, weekendEve: 1.50 },
  jaipur:    { baseline: 1.12, morningPeak: 1.35, eveningPeak: 1.45, weekendEve: 1.40 },
  goa:       { baseline: 1.08, morningPeak: 1.20, eveningPeak: 1.45, weekendEve: 1.60 },
  visakhapatnam: { baseline: 1.10, morningPeak: 1.35, eveningPeak: 1.45, weekendEve: 1.38 },
  vizag:     { baseline: 1.10, morningPeak: 1.35, eveningPeak: 1.45, weekendEve: 1.38 },
};

/**
 * Maps a numeric congestion factor to a standard traffic status.
 *
 * @param {number|null} factor - Ratio of actual/traffic duration vs free-flow duration
 * @returns {string} TRAFFIC_STATUS key
 */
function classifyTrafficStatus(factor) {
  if (!Number.isFinite(factor) || factor <= 0) return TRAFFIC_STATUS.UNKNOWN;
  if (factor < 0.90) return TRAFFIC_STATUS.FREE_FLOW;
  if (factor <= 1.12) return TRAFFIC_STATUS.LOW;
  if (factor <= 1.38) return TRAFFIC_STATUS.MODERATE;
  if (factor <= 1.75) return TRAFFIC_STATUS.HEAVY;
  if (factor <= 2.20) return TRAFFIC_STATUS.SEVERE;
  return TRAFFIC_STATUS.GRIDLOCK;
}

/**
 * Multi-city time-of-day predictive traffic model with day-of-week & weather coupling.
 *
 * @param {number} minuteOfDay - 0 to 1439
 * @param {Object} opts - Options (city, dayOfWeek, weatherRainMm, temperatureC)
 * @returns {{ factor: number, status: string, label: string, confidence: number }}
 */
function getPredictiveTraffic(minuteOfDay = 720, opts = {}) {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const cityName = String(opts.city || '').trim().toLowerCase();
  const profile = CITY_CONGESTION_PROFILES[cityName] || { baseline: 1.15, morningPeak: 1.50, eveningPeak: 1.60, weekendEve: 1.45 };
  const dayOfWeek = Number.isInteger(opts.dayOfWeek) ? opts.dayOfWeek : 3; // 0=Sun, 6=Sat, default Wed
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  let multiplier = 1.0;
  let label = 'Normal traffic flow';

  if (!isWeekend) {
    // Weekday commuter curves
    if (m >= 8 * 60 + 30 && m <= 11 * 60) {
      multiplier = profile.morningPeak;
      label = 'Morning commuter rush peak';
    } else if (m > 11 * 60 && m < 14 * 60) {
      multiplier = 1.15;
      label = 'Moderate midday movement';
    } else if (m >= 14 * 60 && m < 17 * 60) {
      multiplier = 1.05;
      label = 'Normal afternoon flow';
    } else if (m >= 17 * 60 && m <= 20 * 60 + 30) {
      multiplier = profile.eveningPeak;
      label = 'Evening peak rush congestion';
    } else if (m > 20 * 60 + 30 && m < 22 * 60 + 30) {
      multiplier = 0.95;
      label = 'Winding down evening traffic';
    } else {
      multiplier = 0.75;
      label = 'Late night / early morning free flow';
    }
  } else {
    // Weekend leisure & tourism curves
    if (m >= 9 * 60 && m <= 12 * 60) {
      multiplier = 1.25;
      label = 'Weekend morning leisure movement';
    } else if (m >= 16 * 60 && m <= 22 * 60) {
      multiplier = profile.weekendEve;
      label = 'Weekend evening tourism & market rush';
    } else if (m > 22 * 60 || m < 8 * 60) {
      multiplier = 0.72;
      label = 'Weekend off-peak free flow';
    } else {
      multiplier = 1.05;
      label = 'Standard weekend daytime traffic';
    }
  }

  // Weather coupling (monsoon rain slowdowns)
  let weatherMultiplier = 1.0;
  if (opts.weatherRainMm && opts.weatherRainMm > 5.0) {
    weatherMultiplier = opts.weatherRainMm > 15.0 ? 1.30 : 1.18; // Heavy rain slows road traffic
    label += ` (Heavy rain slowdown +${Math.round((weatherMultiplier - 1) * 100)}%)`;
  }

  const effectiveFactor = Math.max(0.7, Math.round((multiplier * weatherMultiplier) * 100) / 100);
  return {
    factor: effectiveFactor,
    status: classifyTrafficStatus(effectiveFactor),
    label,
    confidence: 85,
  };
}

/**
 * Computes transparent traffic metadata for a given route leg.
 *
 * @param {Object} opts
 * @returns {Object} Traffic Metadata Contract
 */
function normalizeTrafficMetadata(opts = {}) {
  const {
    durationSec,
    durationInTrafficSec,
    provider,
    departureMinute = 720,
    city = '',
    dayOfWeek = 3,
    weatherRainMm = 0,
    hasRealtimeSignal = false,
  } = opts;

  if (hasRealtimeSignal && Number.isFinite(durationInTrafficSec) && Number.isFinite(durationSec) && durationSec > 0) {
    const rawFactor = durationInTrafficSec / durationSec;
    const congestionFactor = Math.max(0.7, Math.min(3.5, Math.round(rawFactor * 100) / 100));
    const status = classifyTrafficStatus(congestionFactor);
    const delayMinutes = Math.max(0, Math.round((durationInTrafficSec - durationSec) / 60));

    return {
      status,
      congestionFactor,
      delayMinutes,
      provenance: TRAFFIC_PROVENANCE.LIVE_TRAFFIC,
      freshness: new Date().toISOString(),
      label: `${status} traffic (Live Telemetry)`,
    };
  }

  // Predictive multi-city time-of-day model
  const pred = getPredictiveTraffic(departureMinute, { city, dayOfWeek, weatherRainMm });
  const baseSec = Number.isFinite(durationSec) ? durationSec : 600;
  const trafficAwareSec = Math.round(baseSec * pred.factor);
  const delayMinutes = Math.max(0, Math.round((trafficAwareSec - baseSec) / 60));

  return {
    status: pred.status,
    congestionFactor: pred.factor,
    delayMinutes,
    provenance: provider === 'osrm' ? TRAFFIC_PROVENANCE.PREDICTED_TRAFFIC : TRAFFIC_PROVENANCE.HISTORICAL_ESTIMATE,
    freshness: new Date().toISOString(),
    label: `${pred.label} (City Model)`,
  };
}

module.exports = {
  TRAFFIC_STATUS,
  TRAFFIC_PROVENANCE,
  CITY_CONGESTION_PROFILES,
  classifyTrafficStatus,
  getPredictiveTraffic,
  normalizeTrafficMetadata,
};
