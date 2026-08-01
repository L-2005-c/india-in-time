// routes/analytics.js — API usage analytics
// GET /api/analytics/summary — Usage summary (last 24h by default)

const express = require('express');
const router  = express.Router();
const { getApiUsageSummary } = require('../db/queries');
const { placesCache, geminiCache, weatherCache, geocodeCache } = require('../services/cache');
const geminiService = require('../services/gemini');
const { requireAdminKey } = require('../middleware/adminAuth');

// ── Analytics middleware — log all API requests ──────────────────────────────
function analyticsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    // Only log /api/ routes
    if (!req.path.startsWith('/api/')) return;
    // Don't log the analytics endpoint itself to avoid infinite loop
    if (req.path.startsWith('/api/analytics')) return;

    try {
      const { logApiUsage } = require('../db/queries');
      logApiUsage({
        endpoint:   req.path,
        method:     req.method,
        ip:         req.ip || req.connection?.remoteAddress,
        userAgent:  req.headers['user-agent'],
        statusCode: res.statusCode,
        responseMs: Date.now() - start,
        requestId:  req.requestId,
      });
    } catch (_e) {
      // Non-critical — fail silently
    }
  });

  next();
}

// ── Summary endpoint ─────────────────────────────────────────────────────────
// Was previously public — exposed server memory, node version, Gemini
// success rate and cache internals to anyone. Now gated like /api/feedback.
router.get('/summary', requireAdminKey, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    const usage = await getApiUsageSummary(Math.min(hours, 168)); // max 7 days

    // Add cache stats
    const cacheStats = {
      places:  placesCache.getStats(),
      gemini:  geminiCache.getStats(),
      weather: weatherCache.getStats(),
      geocode: geocodeCache.getStats(),
    };

    // Add Gemini service stats
    const geminiStats = geminiService.getStats();

    // Server stats
    const serverStats = {
      uptime:     process.uptime(),
      uptimeHuman: formatUptime(process.uptime()),
      memoryMB:   Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
    };

    res.json({
      server: serverStats,
      apiUsage: usage,
      caches: cacheStats,
      gemini: geminiStats,
    });
  } catch (err) {
    console.error('[analytics]', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

module.exports = { router, analyticsMiddleware };
