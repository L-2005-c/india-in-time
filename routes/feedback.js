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
const { requireAdminKey } = require('../middleware/adminAuth');

// ── Per-place feedback ───────────────────────────────────────────────────────
router.post('/place', async (req, res) => {
  try {
    const { userId, placeName, city, rating, accurate, comment } = req.body;

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
    res.status(201).json({ message: 'Feedback recorded', placeName, city });
  } catch (err) {
    console.error('[feedback:place:add]', err.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.get('/place', requireAdminKey, async (req, res) => {
  try {
    const { placeName, city } = req.query;
    if (!placeName || !city) return res.status(400).json({ error: 'Missing placeName or city query param' });
    const summary = await getPlaceFeedbackSummary(placeName, city);
    res.json(summary);
  } catch (err) {
    console.error('[feedback:place:summary]', err.message);
    res.status(500).json({ error: 'Failed to load feedback summary' });
  }
});

// All raw place-feedback rows, for the admin dashboard.
router.get('/place/all', requireAdminKey, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const rows = await getAllPlaceFeedback(limit);
    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error('[feedback:place:all]', err.message);
    res.status(500).json({ error: 'Failed to load feedback' });
  }
});

// ── Overall app experience feedback ─────────────────────────────────────────
router.post('/app', async (req, res) => {
  try {
    const { userId, rating, category, message, context } = req.body;

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
    console.error('[feedback:app:add]', err.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

router.get('/app', requireAdminKey, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const summary = await getAppFeedbackSummary(limit);
    res.json(summary);
  } catch (err) {
    console.error('[feedback:app:summary]', err.message);
    res.status(500).json({ error: 'Failed to load feedback summary' });
  }
});

module.exports = router;
