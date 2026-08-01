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

// A real itinerary never has more than a few dozen stops. Capping here
// isn't just tidiness: /status is O(n²) — suggestOpenAlternatives scans the
// full array for every closed place — so an unbounded places[] array lets
// one request burn CPU quadratically. 200 is generous headroom over any
// realistic trip while keeping worst case bounded (200² = 40,000, not
// 10,000² = 100,000,000).
const MAX_PLACES = 200;

// ── Batch place status (open/closed, badges, crowd, notifications) ─────────
router.post('/status', (req, res) => {
  try {
    const { weather, at } = req.body || {};
    const rawPlaces = req.body?.places;
    if (!Array.isArray(rawPlaces) || !rawPlaces.length) {
      return res.status(400).json({ error: 'places[] is required' });
    }
    const places = rawPlaces.slice(0, MAX_PLACES);
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
    const { personas, tripMode } = req.body || {};
    const rawPlaces = req.body?.places;
    if (!Array.isArray(rawPlaces) || !rawPlaces.length) {
      return res.status(400).json({ error: 'places[] is required' });
    }
    const places = rawPlaces.slice(0, MAX_PLACES);
    const scored = places.map((p) => ({
      name: p.name,
      score: personalizeScore(p.baseScore ?? 1, p, personas || [], tripMode || null),
    }));
    res.json({ scored });
  } catch (err) {
    console.error('[time-intelligence:score]', err.message);
    res.status(500).json({ error: 'Failed to compute personalized scores' });
  }
});

module.exports = router;
