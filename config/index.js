// config/index.js — Centralized configuration
// All environment variables are validated and typed here.
// Production validation is explicit via validateProductionConfig() so merely
// importing config in a unit test can never terminate a Jest worker.

try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (err) {
  if (err && err.code !== 'MODULE_NOT_FOUND') throw err;
  // dotenv is a normal runtime dependency. Keep config import resilient for
  // diagnostics and static checks when a local node_modules tree is partial.
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd   = NODE_ENV === 'production';

// ── Validate critical vars ──────────────────────────────────────────────────
function requireEnv(key) {
  const val = process.env[key];
  return (val || '').trim();
}

function configError(message) {
  const err = new Error(`Production configuration error: ${message}`);
  err.code = 'PRODUCTION_CONFIG_INVALID';
  return err;
}

const corsOrigin = process.env.CORS_ORIGIN || '*';

// ── Config object ───────────────────────────────────────────────────────────
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
    aiUser:   parseInt(process.env.RATE_LIMIT_AI_USER, 10) || 30,
    places:   parseInt(process.env.RATE_LIMIT_PLACES, 10)   || 10,
    weather:  parseInt(process.env.RATE_LIMIT_WEATHER, 10)  || 60,
    general:  parseInt(process.env.RATE_LIMIT_GENERAL, 10)  || 100,
    timeIntel: parseInt(process.env.RATE_LIMIT_TIME_INTEL, 10) || 30,
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
    bodyLimit:          process.env.BODY_LIMIT || '2mb',
    shutdownTimeoutMs:  parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 15000,
    trustProxy:         isProd,
    requestTimeoutMs:   parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000,
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
  // endpoint exposes these to the frontend so one is tried first. These keys
  // are inherently public once served to the browser (they go straight into
  // an <img>/tile request URL) — the actual protection is restricting each
  // one to your domain in the MapTiler dashboard, not keeping them out of
  // app.js.
  //
  // Supports up to 4 keys (MAPTILER_KEY, MAPTILER_KEY_2, MAPTILER_KEY_3,
  // MAPTILER_KEY_4) so free-tier load (100k map loads/month each) doesn't
  // all land on one key. The frontend tries them in order — key 1 first,
  // then automatically fails over to key 2, key 3, key 4 in sequence once
  // the current one starts erroring hard (quota exhausted, etc.) — see
  // /api/config in server.js and the MapTiler block in app.js.
  maptilerKeys: [
    process.env.MAPTILER_KEY,
    process.env.MAPTILER_KEY_2,
    process.env.MAPTILER_KEY_3,
    process.env.MAPTILER_KEY_4,
  ].map(k => (k || '').trim()).filter(Boolean),
};

// ── Frontend index.html resolution ──────────────────────────────────────────
// Frontend shell resolution:
// - Development fallback: frontend/public/dev-index.html. Production is dist-only.
// - Opt-in dist: set USE_DIST_FRONTEND=1 in production after verifying
//   /dist/assets/* paths resolve (Vite base is /dist/).
// This default was chosen after a production blank-page incident where
// dist/index.html referenced /assets/* that Express did not serve.
const fs = require('fs');
const path = require('path');

config.resolveIndexHtmlPath = function resolveIndexHtmlPath() {
  const distIndex = path.join(config.publicDir, 'dist', 'index.html');
  const sourceIndex = path.join(config.publicDir, 'dev-index.html');
  const forceSource = process.env.USE_SOURCE_FRONTEND === '1' || process.env.USE_SOURCE_FRONTEND === 'true';
  const forceDist = process.env.USE_DIST_FRONTEND === '1' || process.env.USE_DIST_FRONTEND === 'true';

  if (forceSource && config.isProd) {
    throw configError('USE_SOURCE_FRONTEND is forbidden in production; deploy the verified Vite dist build');
  }
  if (forceSource) return sourceIndex;

  function distIsHealthy() {
    if (!fs.existsSync(distIndex)) return false;
    try {
      const html = fs.readFileSync(distIndex, 'utf8');
      // Collect script/link asset paths referenced by dist index
      const refs = [];
      const re = /(?:src|href)=["']([^"']*assets\/[^"']+)["']/g;
      let m;
      while ((m = re.exec(html)) !== null) refs.push(m[1]);
      if (!refs.length) return false;
      // Each ref must exist on disk under publicDir (paths are absolute like /dist/assets/x.js)
      for (const ref of refs) {
        const rel = ref.replace(/^\//, '');
        // Also try: /dist/assets/foo -> public/dist/assets/foo
        //           /assets/foo -> public/dist/assets/foo (legacy)
        const candidates = [
          path.join(config.publicDir, rel),
          path.join(config.publicDir, 'dist', rel.replace(/^dist\//, '')),
          path.join(config.publicDir, 'dist', 'assets', path.basename(rel)),
        ];
        if (!candidates.some((c) => fs.existsSync(c))) return false;
      }
      return true;
    } catch (_e) {
      return false;
    }
  }

  if (config.isProd) {
    if (distIsHealthy()) return distIndex;
    throw configError('Production frontend build is missing or unhealthy: run npm run build:frontend before startup');
  }
  if (forceDist && fs.existsSync(distIndex)) return distIndex;
  return sourceIndex;
};

// Enterprise runtime toggles (also see lib/featureFlags.js)
config.enterprise = {
  requireRedisInProd: process.env.REQUIRE_REDIS_IN_PROD !== 'false',
  auditEnabled: process.env.AUDIT_LOG_ENABLED !== 'false',
  // Shared admin keys are never enabled in runtime development or production.
  // The compatibility path exists only inside automated test fixtures so the
  // production application has no standing shared-secret admin credential.
};

function validateProductionConfig() {
  if (!config.isProd) return config;

  const missing = [];
  if (!config.gemini.apiKey) missing.push('GEMINI_API_KEY');
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) missing.push('FIREBASE_SERVICE_ACCOUNT');
  if (config.enterprise.requireRedisInProd && !process.env.REDIS_URL) missing.push('REDIS_URL');

  const cors = config.corsOrigin;
  if (cors === '*' && process.env.CORS_ALLOW_WILDCARD !== 'true') {
    missing.push('CORS_ORIGIN (must be a real frontend origin)');
  }

  if (missing.length) {
    throw configError(`missing/invalid: ${missing.join(', ')}`);
  }
  return config;
}

config.validateProductionConfig = validateProductionConfig;

module.exports = config;

