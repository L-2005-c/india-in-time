'use strict';

/**
 * services/routing/routeCache.js
 * Tiered routing cache with strict freshness enforcement and dynamic TTLs.
 */

const { getAsync, setAsync } = require('../cache');

const LIVE_TTL_SEC = 3 * 60;          // 3 minutes for live traffic
const PRED_TTL_SEC = 20 * 60;         // 20 minutes for predictive traffic
const STATIC_TTL_SEC = 24 * 60 * 60;  // 24 hours for static road geometry

// In-Memory L1 Cache
const l1Cache = new Map();
const MAX_L1_SIZE = 800;

/**
 * Generates a normalized cache key.
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

  const fLat = Number(from[0]).toFixed(4);
  const fLon = Number(from[1]).toFixed(4);
  const tLat = Number(to[0]).toFixed(4);
  const tLon = Number(to[1]).toFixed(4);

  // Time bucketing: 2 min buckets for live traffic, 15 min buckets for predictive
  const bucketSize = hasLive ? 2 : 15;
  const timeBucket = Math.floor(departureMin / bucketSize) * bucketSize;

  return `route:v2:${mode}:${fLat},${fLon}>${tLat},${tLon}:t${timeBucket}:${preference}`;
}

/**
 * Retrieves a cached route with freshness check.
 */
async function getCachedRoute(key) {
  if (!key) return null;

  // L1 In-Memory check
  const l1Hit = l1Cache.get(key);
  if (l1Hit) {
    if (Date.now() < l1Hit.expiresAt) {
      return { ...l1Hit.data, fromCache: 'L1' };
    }
    l1Cache.delete(key);
  }

  // L2 Redis check
  try {
    const raw = await getAsync(key);
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && (!parsed.expiresAt || Date.now() < parsed.expiresAt)) {
        // Populate L1 for subsequent hot hits
        setL1(key, parsed.data || parsed, parsed.expiresAt || (Date.now() + 60000));
        return { ...(parsed.data || parsed), fromCache: 'L2_REDIS' };
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
  LIVE_TTL_SEC,
  PRED_TTL_SEC,
  STATIC_TTL_SEC,
};
