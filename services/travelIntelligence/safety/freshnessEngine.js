'use strict';

/**
 * services/travelIntelligence/safety/freshnessEngine.js
 *
 * Multi-Provider Freshness & Lifecycle Engine for India In-Time v3.0.
 *
 * Rules:
 * 1. Freshness is hazard- and provider-dependent (no universal TTL).
 * 2. When stale, NEVER continue claiming LIVE.
 * 3. Formats human-readable explanation of data age.
 */

const FRESHNESS_STATES = Object.freeze({
  FRESH: 'FRESH',
  AGING: 'AGING',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const DEFAULT_TTLS_SECONDS = Object.freeze({
  NOWCAST: 1800,        // 30 min
  WEATHER_WARNING: 7200,// 2 hours
  CYCLONE: 10800,       // 3 hours
  FLOOD: 14400,         // 4 hours
  FIRE_ANOMALY: 14400,  // 4 hours
  ROAD_CLOSURE: 7200,   // 2 hours
  DEFAULT: 3600,        // 1 hour
});

/**
 * Evaluates the freshness state of a safety signal.
 */
function evaluateSignalFreshness(signal, now = Date.now()) {
  if (!signal || !signal.issuedAt) {
    return {
      freshness: FRESHNESS_STATES.UNAVAILABLE,
      isStale: true,
      ageMinutes: null,
      explanation: 'Safety telemetry timestamp unavailable.',
    };
  }

  const issuedTime = new Date(signal.issuedAt).getTime();
  if (Number.isNaN(issuedTime)) {
    return {
      freshness: FRESHNESS_STATES.UNAVAILABLE,
      isStale: true,
      ageMinutes: null,
      explanation: 'Malformed signal timestamp.',
    };
  }

  // Check validUntil expiration first
  if (signal.validUntil) {
    const validUntilTime = new Date(signal.validUntil).getTime();
    if (!Number.isNaN(validUntilTime) && now > validUntilTime) {
      const expiredAgoMinutes = Math.round((now - validUntilTime) / 60000);
      return {
        freshness: FRESHNESS_STATES.EXPIRED,
        isStale: true,
        ageMinutes: Math.round((now - issuedTime) / 60000),
        explanation: `Safety warning expired ${expiredAgoMinutes} minutes ago.`,
      };
    }
  }

  const ageSeconds = Math.max(0, (now - issuedTime) / 1000);
  const ageMinutes = Math.round(ageSeconds / 60);

  const ttlSeconds = signal.freshnessPolicySeconds || DEFAULT_TTLS_SECONDS[signal.hazardType] || DEFAULT_TTLS_SECONDS.DEFAULT;

  if (ageSeconds <= ttlSeconds * 0.7) {
    return {
      freshness: FRESHNESS_STATES.FRESH,
      isStale: false,
      ageMinutes,
      explanation: `Latest official information is current (${ageMinutes}m old).`,
    };
  }

  if (ageSeconds <= ttlSeconds) {
    return {
      freshness: FRESHNESS_STATES.AGING,
      isStale: false,
      ageMinutes,
      explanation: `Information is aging (${ageMinutes}m old); approaching refresh interval.`,
    };
  }

  // Past TTL => STALE
  return {
    freshness: FRESHNESS_STATES.STALE,
    isStale: true,
    ageMinutes,
    explanation: `Latest available official information is ${ageMinutes} minutes old and could not be refreshed.`,
  };
}

module.exports = {
  FRESHNESS_STATES,
  evaluateSignalFreshness,
};
