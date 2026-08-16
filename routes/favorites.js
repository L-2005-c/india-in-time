'use strict';
const appLogger = require('../lib/logger');
// routes/favorites.js — Bookmark / favorite places API
// POST   /api/favorites       — Add favorite            (auth required)
// GET    /api/favorites       — List MY favorites (optional ?city= filter)  (auth required)
// DELETE /api/favorites/:id   — Remove a favorite I own  (auth required)

const express = require('express');
const router  = express.Router();
const { addFavorite, getUserFavorites, removeFavorite, isFavorite } = require('../db/queries');
const { requireAuth } = require('../middleware/auth');

// ── Add favorite ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { placeName, city, lat, lon, category, notes } = req.body;

    if (!placeName || !city) {
      return res.status(400).json({ error: 'Missing required fields: placeName, city' });
    }

    // Check if already favorited
    if (await isFavorite(req.uid, placeName, city)) {
      return res.status(409).json({ error: 'Already in favorites', alreadyFavorited: true });
    }

    await addFavorite({ userId: req.uid, placeName, city, lat, lon, category, notes });
    res.status(201).json({ message: 'Added to favorites', placeName, city });
  } catch (err) {
    appLogger.error('[favorites:add]', err.message);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

// ── List my favorites ────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const city = req.query.city || null;
    const favorites = await getUserFavorites(req.uid, city);

    res.json({ favorites, count: favorites.length });
  } catch (err) {
    appLogger.error('[favorites:list]', err.message);
    res.status(500).json({ error: 'Failed to list favorites' });
  }
});

// ── Remove favorite (must be the owner) ──────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    // removeFavorite's SQL scopes DELETE ... WHERE id = $1 AND user_id = $2,
    // so this can never remove another user's favorite even if the numeric
    // id is guessed.
    await removeFavorite(parseInt(req.params.id, 10), req.uid);

    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    appLogger.error('[favorites:remove]', err.message);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

module.exports = router;
