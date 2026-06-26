// routes/trips.js — Save, load, share trips API
// POST /api/trips       — Save trip
// GET  /api/trips       — List user's trips
// GET  /api/trips/:id   — Load specific trip
// DELETE /api/trips/:id — Delete trip
// POST /api/trips/:id/share      — Generate share link
// GET  /api/trips/shared/:token  — Load shared trip (public)

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { saveTrip, getUserTrips, getTripById, getTripByShareToken, updateTripShareToken, deleteTrip } = require('../db/queries');

// ── Save a trip ──────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { city, cityLat, cityLon, config: tripConfig, stops, userId } = req.body;

    if (!city || !stops || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: city, stops[]' });
    }

    const id = crypto.randomUUID();
    saveTrip({
      id,
      userId:     userId || null,
      city,
      cityLat:    cityLat || null,
      cityLon:    cityLon || null,
      configJson: JSON.stringify(tripConfig || {}),
      stopsJson:  JSON.stringify(stops),
    });

    res.status(201).json({ id, message: 'Trip saved successfully' });
  } catch (err) {
    console.error('[trips:save]', err.message);
    res.status(500).json({ error: 'Failed to save trip' });
  }
});

// ── List user's trips ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId query param' });
    }

    const trips = getUserTrips(userId, 50);
    const formatted = trips.map(t => ({
      id:         t.id,
      city:       t.city,
      cityLat:    t.city_lat,
      cityLon:    t.city_lon,
      stopsCount: JSON.parse(t.stops_json || '[]').length,
      status:     t.status,
      shareToken: t.share_token,
      createdAt:  t.created_at,
    }));

    res.json({ trips: formatted, count: formatted.length });
  } catch (err) {
    console.error('[trips:list]', err.message);
    res.status(500).json({ error: 'Failed to list trips' });
  }
});

// ── Load a specific trip ─────────────────────────────────────────────────────
router.get('/shared/:token', (req, res) => {
  try {
    const trip = getTripByShareToken(req.params.token);
    if (!trip) {
      return res.status(404).json({ error: 'Shared trip not found' });
    }

    res.json({
      id:       trip.id,
      city:     trip.city,
      cityLat:  trip.city_lat,
      cityLon:  trip.city_lon,
      config:   JSON.parse(trip.config_json || '{}'),
      stops:    JSON.parse(trip.stops_json || '[]'),
      createdAt: trip.created_at,
    });
  } catch (err) {
    console.error('[trips:shared]', err.message);
    res.status(500).json({ error: 'Failed to load shared trip' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const trip = getTripById(req.params.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json({
      id:       trip.id,
      city:     trip.city,
      cityLat:  trip.city_lat,
      cityLon:  trip.city_lon,
      config:   JSON.parse(trip.config_json || '{}'),
      stops:    JSON.parse(trip.stops_json || '[]'),
      status:   trip.status,
      shareToken: trip.share_token,
      createdAt: trip.created_at,
    });
  } catch (err) {
    console.error('[trips:get]', err.message);
    res.status(500).json({ error: 'Failed to load trip' });
  }
});

// ── Delete a trip ────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const userId = req.query.userId || req.body?.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const result = deleteTrip(req.params.id, userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Trip not found or not authorized' });
    }

    res.json({ message: 'Trip deleted' });
  } catch (err) {
    console.error('[trips:delete]', err.message);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

// ── Generate shareable link ──────────────────────────────────────────────────
router.post('/:id/share', (req, res) => {
  try {
    const trip = getTripById(req.params.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // If already has a share token, return it
    if (trip.share_token) {
      return res.json({ shareToken: trip.share_token, shareUrl: `/api/trips/shared/${trip.share_token}` });
    }

    // Generate a short, URL-safe token
    const token = crypto.randomBytes(8).toString('base64url');
    updateTripShareToken(req.params.id, token);

    res.json({ shareToken: token, shareUrl: `/api/trips/shared/${token}` });
  } catch (err) {
    console.error('[trips:share]', err.message);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

module.exports = router;
