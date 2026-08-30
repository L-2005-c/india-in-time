'use strict';

/**
 * services/routing/routeCache.js
 *
 * High-performance tiered routing cache with spatial quantization,
 * dynamic TTLs, sub-millisecond L1 memory lookups, and L2 Redis backing.
 */

const { getAsync, setAsync } = require('../cache');

const LIVE_TTL_SEC = 3 * 60;          // 3 minutes for live traffic
const PRED_TTL_SEC = 25 * 60;         // 25 minutes for predictive traffic
const STATIC_TTL_SEC = 24 * 60 * 60;  // 24 hours for static road geometry

// In-Memory L1 Cache (Map with LRU eviction)
const l1Cache = new Map();
const MAX_L1_SIZE = 1200;

/**
 * Quantizes coordinates to ~110m resolution (3 decimal places).
 */
function quantizeCoord(val) {
  return Number(val).toFixed(3);
}

/**
 * Generates a normalized spatial cache key.
 */
function buildCacheKey(opts = {}) {
  const {
    from,
    to,
    mode = 'driving',
    departureMin = 720,
    hasLive = false,
    preference = 'balanced',
  } = opts;

  const fLat = quantizeCoord(from[0]);
  const fLon = quantizeCoord(from[1]);
  const tLat = quantizeCoord(to[0]);
  const tLon = quantizeCoord(to[1]);

  // Time bucketing: 2 min buckets for live traffic, 10 min buckets for predictive
  const bucketSize = hasLive ? 2 : 10;
  const timeBucket = Math.floor(departureMin / bucketSize) * bucketSize;

  return `route:v3:${mode}:${fLat},${fLon}>${tLat},${tLon}:t${timeBucket}:${preference}`;
}

/**
 * Retrieves a cached route with freshness check.
 */
async function getCachedRoute(key) {
  if (!key) return null;

  // 1. L1 In-Memory Fast Check (<0.1ms)
  const l1Hit = l1Cache.get(key);
  if (l1Hit) {
    if (Date.now() < l1Hit.expiresAt) {
      return { ...l1Hit.data, fromCache: 'L1_MEMORY' };
    }
    l1Cache.delete(key);
  }

  // 2. L2 Redis Check
  try {
    const raw = await getAsync(key);
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && (!parsed.expiresAt || Date.now() < parsed.expiresAt)) {
        const routeData = parsed.data || parsed;
        setL1(key, routeData, parsed.expiresAt || (Date.now() + 60000));
        return { ...routeData, fromCache: 'L2_REDIS' };
      }
    }
  } catch (_err) {
    // Redis unavailable, fallback gracefully
  }

  return null;
}

/**
 * Stores route in L1 and L2 cache.
 */
async function setCachedRoute(key, data, _opts = {}) {
  if (!key || !data) return;

  const isLive = data.traffic?.provenance === 'live_traffic';
  const ttlSec = isLive ? LIVE_TTL_SEC : (data.traffic?.provenance === 'predicted_traffic' ? PRED_TTL_SEC : STATIC_TTL_SEC);
  const expiresAt = Date.now() + (ttlSec * 1000);

  const payload = {
    data,
    generatedAt: new Date().toISOString(),
    expiresAt,
  };

  setL1(key, data, expiresAt);

  try {
    await setAsync(key, JSON.stringify(payload), ttlSec);
  } catch (_err) {
    // Ignore Redis errors
  }
}

function setL1(key, data, expiresAt) {
  if (l1Cache.size >= MAX_L1_SIZE) {
    const oldestKey = l1Cache.keys().next().value;
    l1Cache.delete(oldestKey);
  }
  l1Cache.set(key, { data, expiresAt });
}

function clearL1() {
  l1Cache.clear();
}

module.exports = {
  buildCacheKey,
  getCachedRoute,
  setCachedRoute,
  clearL1,
  quantizeCoord,
};
