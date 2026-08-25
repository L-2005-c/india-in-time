'use strict';
const appLogger = require('../lib/logger');
// services/cache.js — LRU Cache with TTL
// Replaces bare Map caches throughout the app with a proper LRU implementation.

class LRUCache {
  /**
   * @param {object} opts
   * @param {number} opts.maxEntries  - Maximum entries before LRU eviction (default 500)
   * @param {number} opts.defaultTtlMs - Default TTL in ms (default 30 min)
   * @param {string} opts.name        - Cache name for logging
   * @param {object} [opts.redis]     - Shared ioredis client (optional — see bottom of file)
   */
  constructor(opts = {}) {
    this.maxEntries  = opts.maxEntries || 500;
    this.defaultTtlMs = opts.defaultTtlMs || 30 * 60 * 1000;
    this.name        = opts.name || 'cache';
    this._map        = new Map();      // key → { value, expiresAt }
    this._stats      = { hits: 0, misses: 0, evictions: 0, sets: 0, redisWarmHits: 0 };
    this._redis      = opts.redis || null;
    this._inFlight   = new Map();      // key -> Promise (for single-flight request coalescing)
  }

  _redisKey(key) {
    return `cache:${this.name}:${key}`;
  }

  /**
   * Get a cached value. Returns undefined if expired or missing.
   * Moves the entry to the "most recently used" position.
   */
  get(key) {
    const entry = this._map.get(key);
    if (!entry) {
      this._stats.misses++;
      if (this._redis) this._warmFromRedisInBackground(key);
      return undefined;
    }
    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      this._stats.misses++;
      if (this._redis) this._warmFromRedisInBackground(key);
      return undefined;
    }
    // Move to end (most recently used) — delete + re-set
    this._map.delete(key);
    this._map.set(key, entry);
    this._stats.hits++;
    return entry.value;
  }

  /**
   * Async get that awaits Redis if not present in local memory.
   */
  async getAsync(key) {
    const local = this.get(key);
    if (local !== undefined) return local;
    if (!this._redis) return undefined;

    try {
      const raw = await this._redis.get(this._redisKey(key));
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      if (typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) return undefined;
      
      this.set(key, parsed.value, parsed.expiresAt - Date.now());
      this._stats.redisWarmHits++;
      return parsed.value;
    } catch {
      return undefined;
    }
  }

  /**
   * Single-flight read-through cache fetcher.
   * Eliminates cache stampedes by sharing the same in-flight Promise among concurrent callers.
   */
  async getOrFetch(key, fetcher, ttlMs) {
    const cached = await this.getAsync(key);
    if (cached !== undefined) return cached;

    if (this._inFlight.has(key)) {
      return this._inFlight.get(key);
    }

    const task = (async () => {
      try {
        const fresh = await fetcher();
        if (fresh !== undefined && fresh !== null) {
          this.set(key, fresh, ttlMs);
        }
        return fresh;
      } finally {
        this._inFlight.delete(key);
      }
    })();

    this._inFlight.set(key, task);
    return task;
  }

  _warmFromRedisInBackground(key) {
    this._redis.get(this._redisKey(key))
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) return;
        // Only warm if still not present locally — another request may
        // have already populated it (or the real source) while we waited.
        if (!this._map.has(key)) {
          this._map.set(key, { value: parsed.value, expiresAt: parsed.expiresAt });
          this._stats.redisWarmHits++;
        }
      })
      .catch(() => {}); // Redis unavailable/slow — silently keep in-memory-only behavior
  }

  /**
   * Check if a key exists and is not expired (without updating LRU order).
   */
  has(key) {
    const entry = this._map.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Set a value with optional per-entry TTL override.
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlMs] - Override default TTL for this entry
   */
  set(key, value, ttlMs) {
    // Remove existing entry to reset LRU order
    if (this._map.has(key)) {
      this._map.delete(key);
    }

    // Evict LRU entries if at capacity
    while (this._map.size >= this.maxEntries) {
      const oldestKey = this._map.keys().next().value;
      this._map.delete(oldestKey);
      this._stats.evictions++;
    }

    const expiresAt = Date.now() + (ttlMs || this.defaultTtlMs);
    this._map.set(key, { value, expiresAt });
    this._stats.sets++;

    // Fire-and-forget write-through to Redis so other processes/instances
    // can warm from it too. Never awaited, never lets a Redis failure
    // affect the caller — set() itself stays synchronous and always
    // succeeds locally regardless of Redis's state.
    if (this._redis) {
      const ttlSeconds = Math.max(1, Math.ceil((ttlMs || this.defaultTtlMs) / 1000));
      this._redis
        .set(this._redisKey(key), JSON.stringify({ value, expiresAt }), 'EX', ttlSeconds)
        .catch(() => {});
    }
  }

  /**
   * Delete a specific key.
   */
  delete(key) {
    if (this._redis) this._redis.del(this._redisKey(key)).catch(() => {});
    return this._map.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear() {
    this._map.clear();
  }

  /**
   * Get the current size.
   */
  get size() {
    return this._map.size;
  }

  /**
   * Purge all expired entries (housekeeping).
   */
  purgeExpired() {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this._map) {
      if (now > entry.expiresAt) {
        this._map.delete(key);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Get cache statistics.
   */
  getStats() {
    const total = this._stats.hits + this._stats.misses;
    return {
      name:      this.name,
      size:      this._map.size,
      maxSize:   this.maxEntries,
      hits:      this._stats.hits,
      misses:    this._stats.misses,
      evictions: this._stats.evictions,
      sets:      this._stats.sets,
      hitRate:   total > 0 ? ((this._stats.hits / total) * 100).toFixed(1) + '%' : 'N/A',
    };
  }

  /**
   * Reset statistics counters.
   */
  resetStats() {
    this._stats = { hits: 0, misses: 0, evictions: 0, sets: 0 };
  }
}

// ── Pre-configured cache instances ────────────────────────────────────────────

const config = require('../config');

// Optional shared Redis client for the write-through/warm-on-miss L2 layer
// above. Same on/off switch as middleware/rateLimiter.js (REDIS_URL) — unset
// by default, meaning every cache here behaves exactly as it always has
// (in-memory, per-process only). A dedicated client is used here rather than
// sharing rateLimiter's, since that module doesn't export its instance and
// the two have different failure-tolerance needs (rate limiting fails open
// on error; caching just silently misses).
let redis = null;
if (process.env.REDIS_URL) {
  const Redis = require('ioredis');
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1, // caching must never block waiting on Redis
    lazyConnect: false,
  });
  redis.on('error', (err) => {
    appLogger.warn('[cache] Redis error (falling back to in-memory-only for this operation):', err.message);
  });
} else {
  appLogger.info('[cache] REDIS_URL not set — per-process in-memory caching only (no cross-instance sharing).');
}

const placesCache = new LRUCache({
  name:        'places',
  maxEntries:  200,
  defaultTtlMs: config.cache.placesTtlMs,
  redis,
});

const geminiCache = new LRUCache({
  name:        'gemini',
  maxEntries:  300,
  defaultTtlMs: config.cache.geminiTtlMs,
  redis,
});

const weatherCache = new LRUCache({
  name:        'weather',
  maxEntries:  50,
  defaultTtlMs: config.cache.weatherTtlMs,
  redis,
});

const geocodeCache = new LRUCache({
  name:        'geocode',
  maxEntries:  1000,
  defaultTtlMs: 60 * 60 * 1000, // 1 hour
  redis,
});

// Periodic cleanup every 5 minutes
setInterval(() => {
  [placesCache, geminiCache, weatherCache, geocodeCache].forEach(c => c.purgeExpired());
}, 5 * 60 * 1000).unref();

module.exports = {
  LRUCache,
  placesCache,
  geminiCache,
  weatherCache,
  geocodeCache,
};
