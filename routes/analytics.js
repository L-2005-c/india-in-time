'use strict';
const appLogger = require('../lib/logger');
// routes/analytics.js — API usage analytics
// GET /api/analytics/summary — Usage summary (last 24h by default)

const express = require('express');
const router  = express.Router();
const { getApiUsageSummary } = require('../db/queries');
const { placesCache, geminiCache, weatherCache, geocodeCache } = require('../services/cache');
const geminiService = require('../services/gemini');
const { requireAdminRole } = require('../middleware/adminAuth');
const analyticsRead = requireAdminRole('owner', 'admin', 'analytics');
const analyticsWrite = requireAdminRole('owner', 'admin');

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
router.get('/summary', analyticsRead, async (req, res) => {
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
    appLogger.error('[analytics]', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Gemini cost / usage dashboard data
router.get('/gemini', analyticsRead, async (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours, 10) || 24, 168);
    const { getGeminiUsageSummary } = require('../db/queries');
    const usage = await getGeminiUsageSummary(hours);
    const live = geminiService.getStats();
    const USD_PER_1K_IN = 0.000075;
    const USD_PER_1K_OUT = 0.0003;
    let estUsd = 0;
    for (const row of usage.byModel || []) {
      estUsd += (row.tokens_in / 1000) * USD_PER_1K_IN + (row.tokens_out / 1000) * USD_PER_1K_OUT;
    }
    res.json({
      hours,
      byModel: usage.byModel,
      live,
      estimatedCostUsd: Math.round(estUsd * 10000) / 10000,
      note: 'Estimated cost uses approximate Gemini Flash rates; verify against Google Cloud billing.',
    });
  } catch (err) {
    appLogger.error('[analytics/gemini]', err.message);
    res.status(500).json({ error: 'Failed to fetch Gemini usage' });
  }
});

router.get('/ml/crowd', analyticsRead, async (_req, res) => {
  try {
    const crowdModel = require('../services/ml/crowdModel');
    await crowdModel.ensureLoaded();
    res.json(crowdModel.getModelInfo());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ml/crowd/train', analyticsWrite, async (req, res) => {
  try {
    const crowdModel = require('../services/ml/crowdModel');
    const limit = Math.min(parseInt(req.body?.limit || req.query.limit, 10) || 500, 2000);
    const result = await crowdModel.trainFromFeedback(limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/providers', analyticsRead, (_req, res) => {
  try {
    const { listProviders } = require('../services/ai/provider');
    res.json({ providers: listProviders() });
  } catch (e) {
    res.json({ providers: [{ name: 'gemini', primary: true }], error: e.message });
  }
});

function formatUptime(seconds) {

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

module.exports = { router, analyticsMiddleware };
