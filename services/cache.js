// services/cache.js — LRU Cache with TTL
// Replaces bare Map caches throughout the app with a proper LRU implementation.

class LRUCache {
  /**
   * @param {object} opts
   * @param {number} opts.maxEntries  - Maximum entries before LRU eviction (default 500)
   * @param {number} opts.defaultTtlMs - Default TTL in ms (default 30 min)
   * @param {string} opts.name        - Cache name for logging
   */
  constructor(opts = {}) {
    this.maxEntries  = opts.maxEntries || 500;
    this.defaultTtlMs = opts.defaultTtlMs || 30 * 60 * 1000;
    this.name        = opts.name || 'cache';
    this._map        = new Map();      // key → { value, expiresAt }
    this._stats      = { hits: 0, misses: 0, evictions: 0, sets: 0 };
  }

  /**
   * Get a cached value. Returns undefined if expired or missing.
   * Moves the entry to the "most recently used" position.
   */
  get(key) {
    const entry = this._map.get(key);
    if (!entry) {
      this._stats.misses++;
      return undefined;
    }
    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      this._stats.misses++;
      return undefined;
    }
    // Move to end (most recently used) — delete + re-set
    this._map.delete(key);
    this._map.set(key, entry);
    this._stats.hits++;
    return entry.value;
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

    this._map.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtlMs),
    });
    this._stats.sets++;
  }

  /**
   * Delete a specific key.
   */
  delete(key) {
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

const placesCache = new LRUCache({
  name:        'places',
  maxEntries:  200,
  defaultTtlMs: config.cache.placesTtlMs,
});

const geminiCache = new LRUCache({
  name:        'gemini',
  maxEntries:  300,
  defaultTtlMs: config.cache.geminiTtlMs,
});

const weatherCache = new LRUCache({
  name:        'weather',
  maxEntries:  150, // stores a hot + stale-fallback entry per location (routes/weather.js)
  defaultTtlMs: config.cache.weatherTtlMs,
});

const geocodeCache = new LRUCache({
  name:        'geocode',
  maxEntries:  1000,
  defaultTtlMs: 60 * 60 * 1000, // 1 hour
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
