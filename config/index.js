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
const config = {
  env:  NODE_ENV,
  port: parseInt(process.env.PORT, 10) || 3000,
  isProd,

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',

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

  // Database
  db: {
    path: process.env.DB_PATH || require('path').join(__dirname, '..', 'data', 'india-in-time.db'),
  },

  // Server
  server: {
    bodyLimit:          process.env.BODY_LIMIT || '5mb',
    shutdownTimeoutMs:  10000,
    trustProxy:         isProd,
  },

  // Nominatim
  nominatim: {
    userAgent:  'IndiaInTime/2.0 (travel-planner-app)',
    timeoutMs:  9000,
    delayMs:    200,  // polite delay between batched requests
    maxDistKm:  40,   // max distance from city center
  },

  // Paths
  publicDir: require('path').join(__dirname, '..', 'frontend', 'public'),
};

module.exports = config;
