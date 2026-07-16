// routes/time-intelligence.js — GeoAI Time Intelligence Engine API
// POST /api/time-intelligence/status   — batch status for a list of places
// POST /api/time-intelligence/score    — personalized itinerary re-scoring

const express = require('express');
const router = express.Router();
const {
  getBatchState,
  personalizeScore,
  suggestOpenAlternatives,
} = require('../services/timeIntelligence');

// ── Batch place status (open/closed, badges, crowd, notifications) ─────────
router.post('/status', (req, res) => {
  try {
    const { places, weather, at } = req.body || {};
    if (!Array.isArray(places) || !places.length) {
      return res.status(400).json({ error: 'places[] is required' });
    }
    const now = at ? new Date(at) : new Date();
    const states = getBatchState(places, now, weather || null);

    // Attach "similar open nearby" suggestions for anything currently closed
    const withAlternatives = states.map((state, i) => {
      if (!state.isOpenNow) {
        state.alternatives = suggestOpenAlternatives(places[i], places, now, weather || null);
      }
      return state;
    });

    res.json({ at: now.toISOString(), places: withAlternatives });
  } catch (err) {
    console.error('[time-intelligence:status]', err.message);
    res.status(500).json({ error: 'Failed to compute time intelligence status' });
  }
});

// ── Personalized scoring for itinerary ranking ──────────────────────────────
router.post('/score', (req, res) => {
  try {
    const { places, personas } = req.body || {};
    if (!Array.isArray(places) || !places.length) {
      return res.status(400).json({ error: 'places[] is required' });
    }
    const scored = places.map((p) => ({
      name: p.name,
      score: personalizeScore(p.baseScore ?? 1, p, personas || []),
    }));
    res.json({ scored });
  } catch (err) {
    console.error('[time-intelligence:score]', err.message);
    res.status(500).json({ error: 'Failed to compute personalized scores' });
  }
});

module.exports = router;
