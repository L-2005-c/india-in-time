// ─────────────────────────────────────────────
//  India In-Time — Backend Server  (server.js)
//  ✅ v2.0 — Production-grade fullstack
// ─────────────────────────────────────────────

const config  = require('./config');
const express = require('express');
require('express-async-errors');
const cors    = require('cors');
const cluster = require('cluster');
const os      = require('os');
const logger  = require('./lib/logger');

// ── Clustering (10k User Concurrency) ────────────────────────────────────────
// IMPORTANT: the rate limiter (middleware/rateLimiter.js) keeps its counters
// in a plain in-memory Map by default. Each cluster worker is a SEPARATE OS
// process with its own memory, so forking N workers silently creates N
// independent rate-limit buckets per IP — e.g. with 4 CPUs your "15 req/min"
// AI limit actually allows up to ~60 req/min, split across whichever worker
// each request lands on. middleware/rateLimiter.js now supports an optional
// Redis-backed shared counter (set REDIS_URL) that fixes this — so once
// Redis is configured it's safe to use every CPU core; until then we cap
// workers to 1 so the limiter behaves correctly. (The Gemini circuit
// breaker in services/gemini.js is also per-worker, but that's fine left
// as-is — each worker independently guarding itself against Gemini failures
// is a reasonable resilience pattern, not a correctness bug like the rate
// limiter split was.) Set CLUSTER_WORKERS to override either way.
// Production recommendation: set REDIS_URL so rate limits and optional
// shared caches are process-safe. Without Redis we force a single worker
// so in-memory rate-limit buckets cannot be silently multiplied.
let numCPUs = parseInt(process.env.CLUSTER_WORKERS, 10)
  || (process.env.REDIS_URL ? os.cpus().length : 1);
if (numCPUs > 1 && !process.env.REDIS_URL) {
  const msg = 'CLUSTER_WORKERS>1 without REDIS_URL multiplies per-worker rate-limit buckets; refusing in production. Set REDIS_URL (recommended default for multi-worker) or CLUSTER_WORKERS=1.';
  if (process.env.NODE_ENV === 'production') {
    console.error('❌', msg);
    process.exit(1);
  }
  console.warn('⚠️', msg, '— forcing CLUSTER_WORKERS=1');
  numCPUs = 1;
}
if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL && numCPUs === 1) {
  console.warn('ℹ️  REDIS_URL not set — running single-worker. For multi-core production scale, set REDIS_URL and raise CLUSTER_WORKERS.');
}

// Vercel serverless functions are a fresh process per invocation — there's
// no meaningful "primary forks workers" relationship there, and spawning
// child processes via cluster.fork() inside a serverless sandbox is
// generally unsupported. Without this guard, cluster.isPrimary is always
// true on a fresh Vercel invocation, so the branch below would try to fork
// workers instead of ever reaching the Express app setup in the `else`
// branch — meaning routes were never registered on Vercel at all. VERCEL is
// set automatically by the Vercel runtime; see README.md's Deployment
// section for the broader Render-vs-Vercel caveat this is part of.
const isServerless = !!process.env.VERCEL;

if (!isServerless && cluster.isPrimary) {
  logger.info({ pid: process.pid, workers: numCPUs }, '🚀 India In-Time API v2.0 Primary is running, forking workers...');
  
  const { initDatabase, closeDatabase } = require('./db/init');
  
  (async () => {
    try {
      await initDatabase();
      
      // Purge expired cache on startup
      try {
        const { purgeExpiredCache } = require('./db/queries');
        await purgeExpiredCache();
      } catch (_e) {}

      for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
      }
    } catch (err) {
      logger.error({ err }, 'Failed to initialize primary database');
      process.exit(1);
    }
  })();

  cluster.on('exit', (worker, code, signal) => {
    logger.warn({ pid: worker.process.pid, code, signal }, '⚠️  Worker died — forking a replacement');
    cluster.fork();
  });

  function primaryShutdown(signal) {
    logger.info({ signal }, '🛑 Primary received shutdown signal');
    closeDatabase().then(() => process.exit(0));
  }
  process.on('SIGTERM', () => primaryShutdown('SIGTERM'));
  process.on('SIGINT',  () => primaryShutdown('SIGINT'));

} else {
// ── Initialize Database for Worker ───────────────────────────────────────────
const { initDatabase, closeDatabase } = require('./db/init');

// ── Import middleware ────────────────────────────────────────────────────────
const { requestLogger }   = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { aiLimiter, placesLimiter, weatherLimiter, generalLimiter, timeIntelLimiter } = require('./middleware/rateLimiter');
const { validateAiRequest, validatePlacesRequest, validateTimeIntelRequest, validateWeatherRequest, validateGeocodeRequest } = require('./middleware/validator');
const { analyticsMiddleware } = require('./routes/analytics');
const { apiVersion } = require('./middleware/apiVersion');
const { maintenanceGuard, listFlags, setFlag, getFlag, requireAiEnabled } = require('./lib/featureFlags');
const { idempotency } = require('./middleware/idempotency');
const { writeAudit } = require('./lib/auditLog');

// ── Import routes ────────────────────────────────────────────────────────────
const geocodeRoutes      = require('./routes/geocode');
const placesRoutes       = require('./routes/places');
const weatherRoutes      = require('./routes/weather');
const weatherAlertRoutes = require('./routes/weather-alerts');
const aiRoutes           = require('./routes/ai');
const tripsRoutes        = require('./routes/trips');
const favoritesRoutes    = require('./routes/favorites');
const timeIntelRoutes    = require('./routes/time-intelligence');
const travelDataRoutes   = require('./routes/travel-data');
const feedbackRoutes     = require('./routes/feedback');
const { router: analyticsRoutes } = require('./routes/analytics');

const app  = express();
const PORT = config.port;

// ── Trust proxy (for Render/Vercel — correct req.ip) ─────────────────────────
if (config.server.trustProxy) {
  app.set('trust proxy', 1);
}

// ── Global Middleware (order matters!) ────────────────────────────────────────

// 1. Request logging + ID assignment
app.use(requestLogger);
app.use(maintenanceGuard);
app.use(idempotency);
app.use('/api', apiVersion);

// 2. CORS
// (config/index.js already fails fast at boot if CORS_ORIGIN='*' in
// production and CORS_ALLOW_WILDCARD isn't explicitly set — see there.)
app.use(cors({ origin: config.corsOrigin }));

// 3. Body parsing
app.use(express.json({ limit: config.server.bodyLimit }));

// 4. Response compression
try {
  const compression = require('compression');
  app.use(compression({ threshold: 1024 })); // compress responses > 1KB
} catch (_e) {
  logger.warn('⚠️  compression package not installed — skipping response compression');
}

// 5. Security headers
app.use(require('./middleware/security').buildSecurityMiddleware());

// 6. Analytics logging (logs all /api/ requests to DB)
app.use(analyticsMiddleware);

// ── API Routes (with rate limiting + validation) ─────────────────────────────

// Geocode
app.use('/api/geocode', generalLimiter, validateGeocodeRequest, geocodeRoutes);

// Places
app.use('/api/places', placesLimiter, validatePlacesRequest, placesRoutes);

// Weather
app.use('/api/weather', weatherLimiter, validateWeatherRequest, weatherRoutes);
app.use('/api/weather-alerts', weatherLimiter, validateWeatherRequest, weatherAlertRoutes);

// AI (most expensive — strictest rate limiting)
app.use('/api/ai', requireAiEnabled, aiLimiter, validateAiRequest, aiRoutes);

// Trips (save/load/share)
app.use('/api/trips', generalLimiter, tripsRoutes);

// Favorites
app.use('/api/favorites', generalLimiter, favoritesRoutes);

// GeoAI Time Intelligence Engine (open/closed status, crowd, badges, personalization)
app.use('/api/time-intelligence', timeIntelLimiter, validateTimeIntelRequest, timeIntelRoutes);
app.use('/api/travel-data', generalLimiter, travelDataRoutes);

// Feedback (per-place ratings + overall app experience)
app.use('/api/feedback', generalLimiter, feedbackRoutes);

// Analytics
app.use('/api/analytics', analyticsRoutes);

// ── Health Checks ────────────────────────────────────────────────────────────
const geminiService = require('./services/gemini');
const { placesCache, geminiCache, weatherCache, geocodeCache } = require('./services/cache');
const { requireAdminAuth } = require('./middleware/adminAuth');

// Basic health check — this is the one render.yaml's healthCheckPath and the
// Dockerfile's HEALTHCHECK actually poll, deliberately kept public/minimal
// (no internal state) so load balancers and uptime monitors can hit it
// without credentials.
app.get('/api/health', (_req, res) => {
  res.json({
    status:  'ok',
    ts:      Date.now(),
    uptime:  Math.round(process.uptime()),
    version: '2.0.0',
  });
});

// Detailed readiness probe — exposes cache stats and the Gemini circuit
// breaker's internal state, which is operationally useful but not something
// an unauthenticated caller should be able to see (memory footprint and
// circuit state are minor, but a real diagnostic surface should still not
// be wide open — see the technical due-diligence notes on this endpoint).
// Gated with the same admin auth as the feedback dashboard; not wired into
// any platform healthcheck path, so this doesn't affect deploy healthchecks.
// Kubernetes-style readiness (public, no secrets) — fails if DB unreachable
app.get('/api/ready', async (_req, res) => {
  const checks = { db: false, redis: null, maintenance: getFlag('maintenanceMode') };
  try {
    const { getDb } = require('./db/init');
    const pool = getDb();
    if (pool) {
      await pool.query('SELECT 1');
      checks.db = true;
    }
  } catch (e) {
    checks.dbError = e.message;
  }
  if (process.env.REDIS_URL) {
    try {
      const Redis = require('ioredis');
      const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000, lazyConnect: true });
      await r.connect();
      await r.ping();
      checks.redis = true;
      r.disconnect();
    } catch (e) {
      checks.redis = false;
      checks.redisError = e.message;
    }
  }
  const ok = checks.db && !checks.maintenance && (checks.redis !== false);
  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', checks, ts: Date.now() });
});

app.get('/api/health/ready', requireAdminAuth, async (_req, res) => {
  const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const gemini = geminiService.getStats();
  const checks = { db: false, redis: null };
  try {
    const { getDb } = require('./db/init');
    const pool = getDb();
    if (pool) {
      await pool.query('SELECT 1');
      checks.db = true;
    }
  } catch (e) {
    checks.dbError = e.message;
  }
  if (process.env.REDIS_URL) {
    try {
      const Redis = require('ioredis');
      const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000, lazyConnect: true });
      await r.connect();
      await r.ping();
      checks.redis = true;
      r.disconnect();
    } catch (e) {
      checks.redis = false;
    }
  }

  res.json({
    status:   checks.db ? 'ready' : 'degraded',
    ts:       Date.now(),
    uptime:   Math.round(process.uptime()),
    memory:   `${memMB}MB`,
    checks,
    flags: listFlags(),
    gemini: {
      circuitState: gemini.circuitState,
      totalCalls:   gemini.total,
      successRate:  gemini.total > 0 ? ((gemini.success / gemini.total) * 100).toFixed(1) + '%' : 'N/A',
    },
    caches: {
      places:  placesCache.getStats(),
      gemini:  geminiCache.getStats(),
      weather: weatherCache.getStats(),
      geocode: geocodeCache.getStats(),
    },
  });
});

// Feature flag admin
app.get('/api/admin/flags', requireAdminAuth, (_req, res) => {
  res.json({ flags: listFlags() });
});
app.post('/api/admin/flags', requireAdminAuth, (req, res) => {
  const { name, value } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const v = setFlag(name, value);
  writeAudit({ action: 'flag.set', actor: 'admin', resource: name, outcome: 'success', meta: { value: v }, ip: req.ip, requestId: req.requestId });
  res.json({ flags: listFlags() });
});

// Simple liveness probe
app.get('/api/health/live', (_req, res) => {
  res.json({ status: 'alive', ts: Date.now() });
});

// ── Observability: Prometheus-compatible metrics (admin-gated) ───────────────
// Exposes process, Gemini, and cache counters for scraping by Prometheus,
// Grafana Agent, or any metrics sidecar. Kept behind admin auth so the
// detailed internal counters are not a public reconnaissance surface.
app.get('/api/metrics', requireAdminAuth, (_req, res) => {
  const mem = process.memoryUsage();
  const gemini = geminiService.getStats();
  const lines = [
    '# HELP process_uptime_seconds Process uptime in seconds',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${process.uptime().toFixed(1)}`,
    '# HELP process_heap_bytes Node.js heap used bytes',
    '# TYPE process_heap_bytes gauge',
    `process_heap_bytes ${mem.heapUsed}`,
    '# HELP process_rss_bytes Resident set size bytes',
    '# TYPE process_rss_bytes gauge',
    `process_rss_bytes ${mem.rss}`,
    '# HELP gemini_requests_total Total Gemini API attempts',
    '# TYPE gemini_requests_total counter',
    `gemini_requests_total ${gemini.total || 0}`,
    '# HELP gemini_success_total Successful Gemini responses',
    '# TYPE gemini_success_total counter',
    `gemini_success_total ${gemini.success || 0}`,
    '# HELP gemini_failure_total Failed Gemini attempts',
    '# TYPE gemini_failure_total counter',
    `gemini_failure_total ${gemini.failure || 0}`,
    '# HELP gemini_cached_total Responses served from cache',
    '# TYPE gemini_cached_total counter',
    `gemini_cached_total ${gemini.cached || 0}`,
    '# HELP gemini_circuit_trips_total Circuit breaker open events',
    '# TYPE gemini_circuit_trips_total counter',
    `gemini_circuit_trips_total ${gemini.circuitTrips || 0}`,
    '# HELP gemini_circuit_state Circuit state (0=CLOSED,1=HALF_OPEN,2=OPEN)',
    '# TYPE gemini_circuit_state gauge',
    `gemini_circuit_state ${{ CLOSED: 0, HALF_OPEN: 1, OPEN: 2 }[gemini.circuitState] ?? -1}`,
  ];
  for (const [name, cache] of [
    ['places', placesCache],
    ['gemini', geminiCache],
    ['weather', weatherCache],
    ['geocode', geocodeCache],
  ]) {
    const s = cache.getStats ? cache.getStats() : {};
    lines.push(`# HELP cache_${name}_size Current entries in ${name} cache`);
    lines.push(`# TYPE cache_${name}_size gauge`);
    lines.push(`cache_${name}_size ${s.size ?? s.entries ?? 0}`);
    if (s.hits != null) {
      lines.push(`# HELP cache_${name}_hits_total Cache hits`);
      lines.push(`# TYPE cache_${name}_hits_total counter`);
      lines.push(`cache_${name}_hits_total ${s.hits}`);
    }
    if (s.misses != null) {
      lines.push(`# HELP cache_${name}_misses_total Cache misses`);
      lines.push(`# TYPE cache_${name}_misses_total counter`);
      lines.push(`cache_${name}_misses_total ${s.misses}`);
    }
  }
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n') + '\n');
});

// Public, minimal client config. Only ever add values here that are safe to
// hand to any visitor's browser (this endpoint has no auth). maptilerKeys is
// fine to expose this way — each one is going straight into a tile <img> URL
// either way, and they're meant to be restricted by domain in the MapTiler
// dashboard, not kept secret. Do NOT add GEMINI_API_KEY,
// FIREBASE_SERVICE_ACCOUNT, or ADMIN_FEEDBACK_KEY here.
app.get('/api/openapi.json', (_req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const yaml = fs.readFileSync(path.join(__dirname, 'docs', 'openapi.yaml'), 'utf8');
    // Minimal YAML→JSON for the subset we ship (avoid adding a YAML dep):
    // serve raw YAML with correct content-type for Swagger UI / redoc.
    res.type('text/yaml').send(yaml);
  } catch (e) {
    res.status(404).json({ error: 'OpenAPI spec not found' });
  }
});
app.get('/api/openapi', (_req, res) => res.redirect(302, '/api/openapi.json'));

app.get('/api/config', (_req, res) => {
  res.json({
    maptilerKeys: config.maptilerKeys,
  });
});

// ── Serve Frontend (static files) ────────────────────────────────────────────

// Explicit route for the app shell, ahead of express.static's own default-
// index behavior — this is what actually wires scripts/build-frontend.js's
// output into real traffic. In production, if `npm run build:frontend` has
// been run, this serves the minified frontend/public/dist/index.html
// (which references the content-hashed JS/CSS build-frontend.js also
// produced) instead of the raw source file. If no dist build exists yet —
// local dev, or a deploy that hasn't run the build step — this falls back
// to the ordinary frontend/public/index.html, so nothing breaks either way.
app.get(['/', '/index.html'], (_req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(config.resolveIndexHtmlPath());
});

// Minified build output (frontend/public/dist/) has content-hashed
// filenames (see scripts/build-frontend.js), so it's safe to cache
// aggressively and immutably — a code change produces a new filename
// rather than invalidating a cached one.
app.use('/dist', express.static(require('path').join(config.publicDir, 'dist'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
}));

// Vite default emits /assets/* while Express only mounted /dist. Without this,
// production index.html from dist/ references /assets/*.js|.css that 404 —
// white/unstyled shell (login chrome only). Serve hashed build assets at /assets.
app.use('/assets', express.static(require('path').join(config.publicDir, 'dist', 'assets'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
}));

app.use(express.static(config.publicDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    // Prevent caching for critical app shell files
    if (
      filePath.endsWith('sw.js') ||
      filePath.endsWith('client-api.js') ||
      filePath.endsWith('api.js') ||
      filePath.endsWith('app.js') ||
      filePath.endsWith('styles.css') ||
      filePath.endsWith('manifest.json') ||
      filePath.endsWith('index.html') ||
      filePath.endsWith('logo-mark.png') ||
      filePath.endsWith('favicon-32.png') ||
      filePath.endsWith('apple-touch-icon.png') ||
      filePath.endsWith('icon-192.png') ||
      filePath.endsWith('icon-512.png')
    ) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // 1 week cache for static assets to handle 10k users easily
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  }
}));

// ── SPA fallback + 404 handler ───────────────────────────────────────────────
app.use(notFoundHandler);

// ── Global error handler (MUST be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────────────────
function startLongRunningServer() {
  initDatabase().then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info({ pid: process.pid, port: PORT }, '✅ Worker started and listening');
    });

    // ── Connection tuning for high concurrency ──────────────────────────────────
    // keepAliveTimeout should exceed most load balancers' idle timeout (commonly
    // 60s on AWS ALB / Render / Railway) so the LB doesn't race the server to
    // close a socket it's about to reuse. headersTimeout must stay a few
    // seconds above keepAliveTimeout (Node requirement) and shields the process
    // from slow/stalled clients holding sockets open under load.
    server.keepAliveTimeout = 65000;
    server.headersTimeout   = 66000;

    // ── Graceful Shutdown ────────────────────────────────────────────────────────
    function gracefulShutdown(signal) {
      logger.info({ signal }, '🛑 Received shutdown signal — shutting down gracefully');

      // Stop accepting new connections
      server.close(async () => {
        logger.info('✅ HTTP server closed');

        // Flush any buffered analytics rows and purge expired cache entries
        // BEFORE closing the pool — both need a live connection. (Previously
        // purgeExpiredCache ran after closeDatabase() and silently failed
        // every time; flushAnalyticsBuffer wasn't called at all, so up to
        // ~2s of usage logs were lost on every deploy.)
        try {
          const { purgeExpiredCache, flushAnalyticsBuffer } = require('./db/queries');
          await flushAnalyticsBuffer();
          await purgeExpiredCache();
        } catch (_e) {}

        // Close database
        await closeDatabase();

        logger.info('✅ Cleanup complete. Goodbye!');
        process.exit(0);
      });

      // Force exit after timeout
      setTimeout(() => {
        logger.error({ timeoutMs: config.server.shutdownTimeoutMs }, '⚠️  Forced shutdown after timeout');
        process.exit(1);
      }, config.server.shutdownTimeoutMs);
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (err) => {
      logger.fatal({ err }, '💥 Uncaught exception');
      gracefulShutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, '💥 Unhandled rejection');
    });
  }).catch(err => {
    logger.fatal({ err }, '💥 Failed to start worker database');
    process.exit(1);
  });
}

if (isServerless) {
  // Don't bind a port or wire process-level SIGTERM/SIGINT/uncaughtException
  // handlers here — Vercel manages the process lifecycle itself, there's no
  // persistent socket to "gracefully close" in the request-per-invocation
  // model, and a serverless instance can be frozen/recycled between calls in
  // ways that make long-lived signal handlers unreliable anyway. Just make
  // sure the DB pool is initialized so the routes above can use it.
  initDatabase().catch(err => {
    logger.fatal({ err }, '💥 Failed to initialize database (serverless)');
  });
} else {
  startLongRunningServer();
}

// Exported so Vercel's Node builder (see vercel.json) can use this Express
// app directly as the request handler. Has no effect on Render/Docker/local,
// which run this file directly via `node server.js` and rely on
// startLongRunningServer()'s app.listen() above instead.
module.exports = app;

}
