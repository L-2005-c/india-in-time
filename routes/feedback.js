'use strict';
const appLogger = require('../lib/logger');
// routes/feedback.js — User feedback API
// POST /api/feedback/place   — Rate a specific stop (post-visit)
// GET  /api/feedback/place   — Aggregate rating for a place (?placeName=&city=)
// POST /api/feedback/app     — Overall app experience feedback
// GET  /api/feedback/app     — Aggregate app feedback (recent + average) — lightweight admin view

const express = require('express');
const router  = express.Router();
const {
  submitPlaceFeedback, getPlaceFeedbackSummary, getAllPlaceFeedback,
  submitAppFeedback, getAppFeedbackSummary,
} = require('../db/queries');
const { requireAdminRole } = require('../middleware/adminAuth');
const feedbackRead = requireAdminRole('owner', 'admin', 'analytics');
const { optionalAuth } = require('../middleware/auth');

// ── Per-place feedback ───────────────────────────────────────────────────────
// optionalAuth: feedback is allowed from signed-out users (no requireAuth),
// but if a userId gets attached at all it must be the verified req.uid from
// a real token — never the client-supplied body.userId. Previously this
// route trusted body.userId outright, so anyone could submit feedback that
// permanently attributes to someone else's account (same bug class that
// routes/trips.js and routes/favorites.js already fixed for their data).
router.post('/place', optionalAuth, async (req, res) => {
  try {
    const { placeName, city, rating, accurate, comment } = req.body;
    const userId = req.uid || null;

    if (!placeName || !city || !rating) {
      return res.status(400).json({ error: 'Missing required fields: placeName, city, rating' });
    }
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'rating must be an integer 1-5' });
    }
    if (comment && String(comment).length > 1000) {
      return res.status(400).json({ error: 'comment too long (max 1000 chars)' });
    }

    await submitPlaceFeedback({ userId, placeName, city, rating: r, accurate, comment });

    // Anonymous feedback remains analytics-only. Only verified users may train
    // the production crowd model, preventing unauthenticated model poisoning.
    if (req.uid) {
      try {
        const crowd = require('../services/crowd');
        await crowd.learnFromSingleFeedback({
          rating: r,
          accurate,
          cat: req.body.category || req.body.cat || 'default',
          daypart: req.body.daypart,
          isWeekend: !!req.body.isWeekend,
          month: new Date().getMonth() + 1,
        });
      } catch (_ml) { /* non-blocking */ }
    }

    res.status(201).json({ message: 'Feedback recorded', placeName, city });
  } catch (err) {
    appLogger.error('[feedback:place:add]', err.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.get('/place', feedbackRead, async (req, res) => {
  try {
    const { placeName, city } = req.query;
    if (!placeName || !city) return res.status(400).json({ error: 'Missing placeName or city query param' });
    const summary = await getPlaceFeedbackSummary(placeName, city);
    res.json(summary);
  } catch (err) {
    appLogger.error('[feedback:place:summary]', err.message);
    res.status(500).json({ error: 'Failed to load feedback summary' });
  }
});

// All raw place-feedback rows, for the admin dashboard.
router.get('/place/all', feedbackRead, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const rows = await getAllPlaceFeedback(limit);
    res.json({ count: rows.length, rows });
  } catch (err) {
    appLogger.error('[feedback:place:all]', err.message);
    res.status(500).json({ error: 'Failed to load feedback' });
  }
});

// ── Overall app experience feedback ─────────────────────────────────────────
router.post('/app', optionalAuth, async (req, res) => {
  try {
    const { rating, category, message, context } = req.body;
    const userId = req.uid || null;

    if (!rating) return res.status(400).json({ error: 'Missing required field: rating' });
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'rating must be an integer 1-5' });
    }
    if (message && String(message).length > 2000) {
      return res.status(400).json({ error: 'message too long (max 2000 chars)' });
    }
    const ALLOWED_CATEGORIES = new Set(['general', 'bug', 'feature_request', 'love_it', 'confusing']);
    const safeCategory = ALLOWED_CATEGORIES.has(category) ? category : 'general';

    await submitAppFeedback({
      userId, rating: r, category: safeCategory, message,
      context: context || null, userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ message: 'Thanks for the feedback!' });
  } catch (err) {
    appLogger.error('[feedback:app:add]', err.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.get('/app', feedbackRead, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const summary = await getAppFeedbackSummary(limit);
    res.json(summary);
  } catch (err) {
    appLogger.error('[feedback:app:summary]', err.message);
    res.status(500).json({ error: 'Failed to load feedback summary' });
  }
});

module.exports = router;
