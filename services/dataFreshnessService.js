'use strict';

/**
 * services/dataFreshnessService.js
 *
 * Production Data Freshness & Provenance Standard (Phase 6 Requirement).
 * Enforces unified provenance, freshness contracts, and graceful fallbacks across all domains:
 * - Traffic
 * - Weather
 * - AQI
 * - Alerts
 * - Closures
 * - Transit
 * - POIs
 *
 * Guaranteed Contract:
 * {
 *   value: any,
 *   domain: string,
 *   provider: string,
 *   provenance: 'LIVE' | 'HISTORICAL' | 'PREDICTED' | 'ESTIMATED' | 'UNKNOWN' | 'CACHED',
 *   retrievedAt: string (ISO),
 *   expiresAt: string (ISO),
 *   freshness: 'FRESH' | 'RECENT' | 'AGING' | 'STALE' | 'EXPIRED',
 *   confidence: number (0.0 to 1.0),
 *   isStale: boolean,
 *   isExpired: boolean,
 *   metadata: object
 * }
 */

const DOMAIN_DEFAULTS = Object.freeze({
  traffic: {
    ttlMs: 3 * 60 * 1000,          // 3 min cache TTL
    staleAfterMs: 15 * 60 * 1000,   // 15 min stale threshold
    defaultProvider: 'google_osrm_hybrid',
    defaultProvenance: 'LIVE',
  },
  weather: {
    ttlMs: 30 * 60 * 1000,         // 30 min cache TTL
    staleAfterMs: 60 * 60 * 1000,   // 60 min stale threshold
    defaultProvider: 'open_meteo',
    defaultProvenance: 'LIVE',
  },
  aqi: {
    ttlMs: 60 * 60 * 1000,         // 60 min cache TTL
    staleAfterMs: 120 * 60 * 1000,  // 2 hr stale threshold
    defaultProvider: 'cpcb_open_meteo',
    defaultProvenance: 'LIVE',
  },
  alerts: {
    ttlMs: 15 * 60 * 1000,         // 15 min cache TTL
    staleAfterMs: 60 * 60 * 1000,   // 60 min stale threshold
    defaultProvider: 'ndma_state_disaster',
    defaultProvenance: 'LIVE',
  },
  closures: {
    ttlMs: 60 * 60 * 1000,         // 60 min cache TTL
    staleAfterMs: 180 * 60 * 1000,  // 3 hr stale threshold
    defaultProvider: 'pwd_traffic_police',
    defaultProvenance: 'LIVE',
  },
  transit: {
    ttlMs: 10 * 60 * 1000,         // 10 min cache TTL
    staleAfterMs: 30 * 60 * 1000,   // 30 min stale threshold
    defaultProvider: 'transit_gtfs_hybrid',
    defaultProvenance: 'LIVE',
  },
  pois: {
    ttlMs: 24 * 60 * 60 * 1000,    // 24 hr cache TTL
    staleAfterMs: 7 * 24 * 60 * 60 * 1000, // 7 days stale threshold
    defaultProvider: 'canonical_poi_registry',
    defaultProvenance: 'VERIFIED',
  },
});

const FRESHNESS_LEVELS = Object.freeze({
  FRESH: 'FRESH',
  RECENT: 'RECENT',
  AGING: 'AGING',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED',
});

/**
 * Calculates current freshness classification given retrieved timestamp and window boundaries.
 */
function calculateFreshness(retrievedAt, ttlMs, staleAfterMs) {
  const ageMs = Math.max(0, Date.now() - new Date(retrievedAt).getTime());
  if (ageMs <= ttlMs * 0.5) return FRESHNESS_LEVELS.FRESH;
  if (ageMs <= ttlMs) return FRESHNESS_LEVELS.RECENT;
  if (ageMs <= staleAfterMs) return FRESHNESS_LEVELS.AGING;
  if (ageMs <= staleAfterMs * 2) return FRESHNESS_LEVELS.STALE;
  return FRESHNESS_LEVELS.EXPIRED;
}

/**
 * Core wrapper enforcing the standardized data contract.
 */
function wrapDataFreshness(value, options = {}) {
  const domain = (options.domain || 'unknown').toLowerCase();
  const domainConfig = DOMAIN_DEFAULTS[domain] || {
    ttlMs: 5 * 60 * 1000,
    staleAfterMs: 30 * 60 * 1000,
    defaultProvider: 'unknown',
    defaultProvenance: 'ESTIMATED',
  };

  const retrievedAt = options.retrievedAt
    ? new Date(options.retrievedAt).toISOString()
    : new Date().toISOString();

  const ttlMs = Number(options.ttlMs) || domainConfig.ttlMs;
  const staleAfterMs = Number(options.staleAfterMs) || domainConfig.staleAfterMs;
  const expiresAt = new Date(new Date(retrievedAt).getTime() + ttlMs).toISOString();

  const ageMs = Math.max(0, Date.now() - new Date(retrievedAt).getTime());
  const isExpired = ageMs > ttlMs;
  const isStale = ageMs > staleAfterMs;
  const freshness = calculateFreshness(retrievedAt, ttlMs, staleAfterMs);

  const confidence = typeof options.confidence === 'number'
    ? Math.max(0, Math.min(1.0, options.confidence))
    : 0.95;

  return {
    value,
    domain,
    provider: options.provider || domainConfig.defaultProvider,
    provenance: options.provenance || domainConfig.defaultProvenance,
    retrievedAt,
    expiresAt,
    freshness,
    confidence,
    isStale,
    isExpired,
    metadata: options.metadata || {},
  };
}

/**
 * Evaluates and re-checks freshness of an existing wrapped object.
 */
function reevaluateFreshness(item) {
  if (!item || !item.retrievedAt) return item;
  const domain = (item.domain || 'unknown').toLowerCase();
  const domainConfig = DOMAIN_DEFAULTS[domain] || { ttlMs: 5 * 60 * 1000, staleAfterMs: 30 * 60 * 1000 };
  const ageMs = Math.max(0, Date.now() - new Date(item.retrievedAt).getTime());
  const ttlMs = item.expiresAt ? (new Date(item.expiresAt).getTime() - new Date(item.retrievedAt).getTime()) : domainConfig.ttlMs;
  const staleAfterMs = domainConfig.staleAfterMs;

  item.isExpired = ageMs > ttlMs;
  item.isStale = ageMs > staleAfterMs;
  item.freshness = calculateFreshness(item.retrievedAt, ttlMs, staleAfterMs);
  return item;
}

/**
 * Safe fallback envelope to guarantee that the UI never displays blank screens.
 */
function createSafeFallback(domain, fallbackValue, reason = 'UPSTREAM_UNAVAILABLE') {
  return wrapDataFreshness(fallbackValue, {
    domain,
    provider: 'resilient_offline_fallback',
    provenance: 'ESTIMATED',
    confidence: 0.50,
    metadata: {
      fallback: true,
      reason,
      message: 'Operating in high-availability offline mode; upstream live provider temporarily unreachable.',
    },
  });
}

// Domain-Specific Factories
const wrapTrafficData = (val, opts) => wrapDataFreshness(val, { domain: 'traffic', ...opts });
const wrapWeatherData = (val, opts) => wrapDataFreshness(val, { domain: 'weather', ...opts });
const wrapAqiData = (val, opts) => wrapDataFreshness(val, { domain: 'aqi', ...opts });
const wrapAlertsData = (val, opts) => wrapDataFreshness(val, { domain: 'alerts', ...opts });
const wrapClosureData = (val, opts) => wrapDataFreshness(val, { domain: 'closures', ...opts });
const wrapTransitData = (val, opts) => wrapDataFreshness(val, { domain: 'transit', ...opts });
const wrapPoiData = (val, opts) => wrapDataFreshness(val, { domain: 'pois', ...opts });

module.exports = {
  DOMAIN_DEFAULTS,
  FRESHNESS_LEVELS,
  wrapDataFreshness,
  reevaluateFreshness,
  createSafeFallback,
  wrapTrafficData,
  wrapWeatherData,
  wrapAqiData,
  wrapAlertsData,
  wrapClosureData,
  wrapTransitData,
  wrapPoiData,
};
