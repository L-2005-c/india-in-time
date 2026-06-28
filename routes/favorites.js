// routes/favorites.js — Bookmark / favorite places API
// POST   /api/favorites       — Add favorite
// GET    /api/favorites       — List favorites (optional ?city= filter)
// DELETE /api/favorites/:id   — Remove favorite

const express = require('express');
const router  = express.Router();
const { addFavorite, getUserFavorites, removeFavorite, isFavorite } = require('../db/queries');

// ── Add favorite ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { userId, placeName, city, lat, lon, category, notes } = req.body;

    if (!userId || !placeName || !city) {
      return res.status(400).json({ error: 'Missing required fields: userId, placeName, city' });
    }

    // Check if already favorited
    if (await isFavorite(userId, placeName, city)) {
      return res.status(409).json({ error: 'Already in favorites', alreadyFavorited: true });
    }

    await addFavorite({ userId, placeName, city, lat, lon, category, notes });
    res.status(201).json({ message: 'Added to favorites', placeName, city });
  } catch (err) {
    console.error('[favorites:add]', err.message);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

// ── List favorites ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId query param' });
    }

    const city = req.query.city || null;
    const favorites = await getUserFavorites(userId, city);

    res.json({ favorites, count: favorites.length });
  } catch (err) {
    console.error('[favorites:list]', err.message);
    res.status(500).json({ error: 'Failed to list favorites' });
  }
});

// ── Remove favorite ──────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.query.userId || req.body?.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    await removeFavorite(parseInt(req.params.id, 10), userId);

    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    console.error('[favorites:remove]', err.message);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

module.exports = router;
