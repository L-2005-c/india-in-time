// ─────────────────────────────────────────────
//  India In-Time — Backend Server  (server.js)
//  ✅ v2.0 — Production-grade fullstack
// ─────────────────────────────────────────────

const config  = require('./config');
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const cluster = require('cluster');
const os      = require('os');

// ── Clustering (10k User Concurrency) ────────────────────────────────────────
if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`\n🚀 India In-Time API v2.0 Primary (${process.pid}) is running`);
  console.log(`   Forking ${numCPUs} workers for high concurrency...`);
  
  const { initDatabase, closeDatabase } = require('./db/init');
  initDatabase(config.db.path);

  // Purge expired cache on startup
  try {
    const { purgeExpiredCache } = require('./db/queries');
    purgeExpiredCache();
  } catch (_e) {}

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`⚠️  Worker ${worker.process.pid} died. Forking a new one...`);
    cluster.fork();
  });

  function primaryShutdown(signal) {
    console.log(`\n🛑 Primary received ${signal} — shutting down...`);
    closeDatabase();
    process.exit(0);
  }
  process.on('SIGTERM', () => primaryShutdown('SIGTERM'));
  process.on('SIGINT',  () => primaryShutdown('SIGINT'));

} else {
// ── Initialize Database for Worker ───────────────────────────────────────────
const { initDatabase, closeDatabase } = require('./db/init');
initDatabase(config.db.path);

// ── Import middleware ────────────────────────────────────────────────────────
const { requestLogger }   = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { aiLimiter, placesLimiter, weatherLimiter, generalLimiter } = require('./middleware/rateLimiter');
const { validateAiRequest, validatePlacesRequest, validateWeatherRequest, validateGeocodeRequest } = require('./middleware/validator');
const { analyticsMiddleware } = require('./routes/analytics');

// ── Import routes ────────────────────────────────────────────────────────────
const geocodeRoutes      = require('./routes/geocode');
const placesRoutes       = require('./routes/places');
const weatherRoutes      = require('./routes/weather');
const weatherAlertRoutes = require('./routes/weather-alerts');
const aiRoutes           = require('./routes/ai');
const tripsRoutes        = require('./routes/trips');
const favoritesRoutes    = require('./routes/favorites');
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

// 2. CORS
app.use(cors({ origin: config.corsOrigin }));

// 3. Body parsing
app.use(express.json({ limit: config.server.bodyLimit }));

// 4. Response compression
try {
  const compression = require('compression');
  app.use(compression({ threshold: 1024 })); // compress responses > 1KB
} catch (_e) {
  console.warn('⚠️  compression package not installed — skipping response compression');
}

// 5. Security headers
try {
  const helmet = require('helmet');
  app.use(helmet({
    contentSecurityPolicy: false, // disable CSP (our inline scripts/styles need it)
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false, // disable COOP so Firebase OAuth popups work on mobile
  }));
} catch (_e) {
  console.warn('⚠️  helmet package not installed — skipping security headers');
}

// 6. Analytics logging (logs all /api/ requests to DB)
app.use(analyticsMiddleware);

// ── API Routes (with rate limiting + validation) ─────────────────────────────

// Geocode
app.use('/api/geocode', generalLimiter, validateGeocodeRequest, geocodeRoutes);

// Places
app.use('/api/places', placesLimiter, validatePlacesRequest, placesRoutes);

// Weather
app.use('/api/weather', weatherLimiter, validateWeatherRequest, weatherRoutes);
app.use('/api/weather-alerts', weatherLimiter, weatherAlertRoutes);

// AI (most expensive — strictest rate limiting)
app.use('/api/ai', aiLimiter, validateAiRequest, aiRoutes);

// Trips (save/load/share)
app.use('/api/trips', generalLimiter, tripsRoutes);

// Favorites
app.use('/api/favorites', generalLimiter, favoritesRoutes);

// Analytics
app.use('/api/analytics', analyticsRoutes);

// ── Health Checks ────────────────────────────────────────────────────────────
const geminiService = require('./services/gemini');
const { placesCache, geminiCache, weatherCache, geocodeCache } = require('./services/cache');

// Basic health check
app.get('/api/health', (_req, res) => {
  res.json({
    status:  'ok',
    ts:      Date.now(),
    uptime:  Math.round(process.uptime()),
    version: '2.0.0',
  });
});

// Detailed readiness probe
app.get('/api/health/ready', (_req, res) => {
  const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const gemini = geminiService.getStats();

  res.json({
    status:   'ready',
    ts:       Date.now(),
    uptime:   Math.round(process.uptime()),
    memory:   `${memMB}MB`,
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

// Simple liveness probe
app.get('/api/health/live', (_req, res) => {
  res.json({ status: 'alive', ts: Date.now() });
});

// ── Serve Frontend (static files) ────────────────────────────────────────────
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
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`   ✅ Worker ${process.pid} started and listening on port ${PORT}`);
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n🛑  ${signal} received — shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('   ✅ HTTP server closed');

    // Close database
    closeDatabase();

    // Purge expired cache
    try {
      const { purgeExpiredCache } = require('./db/queries');
      purgeExpiredCache();
    } catch (_e) {}

    console.log('   ✅ Cleanup complete. Goodbye!\n');
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    console.error('   ⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, config.server.shutdownTimeoutMs);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('💥  Uncaught exception:', err);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('💥  Unhandled rejection:', reason);
});

} // End of cluster worker block
