// config/index.js — Centralized configuration
// All environment variables are validated and typed here.
// Fail-fast if critical vars are missing in production.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd   = NODE_ENV === 'production';

// ── Validate critical vars ──────────────────────────────────────────────────
function requireEnv(key) {
  const val = process.env[key];
  if (!val || !val.trim()) {
    console.error(`❌  Missing required environment variable: ${key}`);
    if (isProd) process.exit(1);
  }
  return (val || '').trim();
}

// ── Config object ───────────────────────────────────────────────────────────
// CORS_ORIGIN='*' in production means ANY website can call this API with
// credentials-adjacent requests. server.js used to only console.warn about
// this; that's easy to miss in deploy logs. Fail fast instead, the same way
// requireEnv() does for other critical vars, unless explicitly opted out
// via CORS_ALLOW_WILDCARD=true (e.g. for a short-lived preview deploy).
const corsOrigin = process.env.CORS_ORIGIN || '*';
if (isProd && corsOrigin === '*' && process.env.CORS_ALLOW_WILDCARD !== 'true') {
  console.error(
    '❌  CORS_ORIGIN is not set (or is "*") in production. This allows any website ' +
    'to call this API. Set CORS_ORIGIN to your real frontend origin (e.g. ' +
    'https://indiaintime.com), or explicitly set CORS_ALLOW_WILDCARD=true if this ' +
    'is intentional (e.g. a public read-only API).'
  );
  process.exit(1);
}

const config = {
  env:  NODE_ENV,
  port: parseInt(process.env.PORT, 10) || 3000,
  isProd,

  // CORS
  corsOrigin,

  // Gemini AI
  gemini: {
    apiKey:          requireEnv('GEMINI_API_KEY'),
    model:           process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    maxRetries:      parseInt(process.env.GEMINI_MAX_RETRIES, 10) || 3,
    timeoutMs:       parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 20000,
    imageTimeoutMs:  parseInt(process.env.GEMINI_IMAGE_TIMEOUT_MS, 10) || 30000,
    maxConcurrent:   parseInt(process.env.GEMINI_MAX_CONCURRENT, 10) || 5,
    circuitBreaker: {
      failureThreshold: 5,   // consecutive failures before tripping
      resetTimeMs:      30000, // 30s cooldown
    },
  },

  // Rate limiting (requests per minute per IP)
  rateLimit: {
    ai:       parseInt(process.env.RATE_LIMIT_AI, 10)       || 15,
    places:   parseInt(process.env.RATE_LIMIT_PLACES, 10)   || 10,
    weather:  parseInt(process.env.RATE_LIMIT_WEATHER, 10)  || 60,
    general:  parseInt(process.env.RATE_LIMIT_GENERAL, 10)  || 100,
    windowMs: 60 * 1000, // 1 minute window
  },

  // Cache
  cache: {
    maxEntries:     parseInt(process.env.CACHE_MAX_ENTRIES, 10)     || 500,
    placesTtlMs:    parseInt(process.env.CACHE_PLACES_TTL_MS, 10)  || 30 * 60 * 1000,
    weatherTtlMs:   parseInt(process.env.CACHE_WEATHER_TTL_MS, 10) || 5  * 60 * 1000,
    geminiTtlMs:    parseInt(process.env.CACHE_GEMINI_TTL_MS, 10)  || 10 * 60 * 1000,
  },

  // Server
  server: {
    bodyLimit:          process.env.BODY_LIMIT || '5mb',
    shutdownTimeoutMs:  10000,
    trustProxy:         isProd,
  },

  // Paths
  publicDir: require('path').join(__dirname, '..', 'frontend', 'public'),

  // Nominatim (used by routes/geocode.js's throttled outbound calls)
  nominatim: {
    userAgent: process.env.NOMINATIM_USER_AGENT || 'IndiaInTime/2.0 (travel-planner-app)',
    timeoutMs: parseInt(process.env.NOMINATIM_TIMEOUT_MS, 10) || 9000,
    delayMs:   parseInt(process.env.NOMINATIM_DELAY_MS, 10)   || 1100, // Nominatim's usage policy caps the whole app at ~1 req/sec, globally
  },
};

module.exports = config;
