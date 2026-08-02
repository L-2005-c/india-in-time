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
    // Tried once, only after every retry against the primary model has
    // failed, and only for retryable failures (network errors, 429, 5xx —
    // never for a 4xx that means the request itself was bad, since a
    // different model won't fix that). Real, same-provider resilience
    // against "this one model is overloaded/rate-limited/deprecated" —
    // deliberately NOT a cross-provider fallback (e.g. OpenAI/Anthropic),
    // since that would need a second provider's API key and account this
    // deployment doesn't have, and shipping an integration that's never
    // been called for real would be worse than not having it. Set to ''
    // to disable.
    fallbackModel:   process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash',
    // Optional second Gemini API key, ideally from a SEPARATE Google Cloud
    // project/billing account than GEMINI_API_KEY. Still the same provider
    // (generativelanguage.googleapis.com) — a full Gemini/Google outage
    // takes this down too, same as the primary key. What it DOES cover:
    // the primary key/project hitting its own quota, getting rate-limited,
    // or its billing/auth getting suspended independently of Google's
    // service being up. Tried only after the primary key has exhausted
    // ALL of its own retries (see callGemini in services/gemini.js) — this
    // deliberately replaces trying fallbackModel on the primary key; once
    // we're switching credentials we go straight to the secondary key with
    // the primary model, then fall back to fallbackModel on the secondary
    // key only if that also fails. Unset by default — leave '' to disable.
    secondaryApiKey: process.env.GEMINI_API_KEY_SECONDARY || '',
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

  // MapTiler (map tiles). Optional — deliberately NOT requireEnv()'d, since
  // the frontend already has a CARTO/OSM fallback chain (see TILE_SOURCES
  // in app.js) and should keep working without this. When set, the /api/config
  // endpoint exposes it to the frontend so it's tried first. This key is
  // inherently public once served to the browser (it goes straight into an
  // <img>/tile request URL) — the actual protection is restricting it to
  // your domain in the MapTiler dashboard, not keeping it out of app.js.
  maptilerKey: (process.env.MAPTILER_KEY || '').trim(),
};

// ── Frontend index.html resolution ──────────────────────────────────────────
// scripts/build-frontend.js produces frontend/public/dist/index.html
// (referencing the minified, content-hashed JS/CSS it also builds) but does
// NOT touch the source frontend/public/index.html. This resolves which one
// to actually serve at request time: the dist build when it exists and
// we're in production, the source file otherwise (local dev, or a
// production deploy that simply hasn't run `npm run build:frontend` — this
// fails back safely rather than 404ing).
const fs = require('fs');
const path = require('path');

config.resolveIndexHtmlPath = function resolveIndexHtmlPath() {
  const distIndex = path.join(config.publicDir, 'dist', 'index.html');
  if (config.isProd && fs.existsSync(distIndex)) return distIndex;
  return path.join(config.publicDir, 'index.html');
};

module.exports = config;
