// routes/trips.js — Save, load, share trips API
// POST /api/trips       — Save trip                         (auth required)
// GET  /api/trips       — List MY trips                      (auth required)
// GET  /api/trips/:id   — Load a trip I own                  (auth required)
// DELETE /api/trips/:id — Delete a trip I own                (auth required)
// POST /api/trips/:id/share      — Generate share link for a trip I own (auth required)
// GET  /api/trips/shared/:token  — Load shared trip           (public, by design)

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { saveTrip, getUserTrips, getTripById, getTripByShareToken, updateTripShareToken, deleteTrip } = require('../db/queries');
const { requireAuth } = require('../middleware/auth');

// ── Save a trip ──────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { city, cityLat, cityLon, config: tripConfig, stops } = req.body;

    if (!city || !stops || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: city, stops[]' });
    }

    const id = crypto.randomUUID();
    await saveTrip({
      id,
      userId:     req.uid, // trusted, from verified token — never from the client body
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

// ── List my trips ────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const trips = await getUserTrips(req.uid, 50);
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

// ── Load a shared trip (intentionally public — this IS the sharing feature) ──
router.get('/shared/:token', async (req, res) => {
  try {
    const trip = await getTripByShareToken(req.params.token);
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
      // Note: no share_token/user_id echoed back here — a share link should
      // only ever reveal the trip content, not other internal identifiers.
    });
  } catch (err) {
    console.error('[trips:shared]', err.message);
    res.status(500).json({ error: 'Failed to load shared trip' });
  }
});

// ── Load a specific trip (must be the owner) ─────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const trip = await getTripById(req.params.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    if (trip.user_id !== req.uid) {
      // 404 instead of 403 so this endpoint can't be used to fingerprint
      // which trip IDs exist for other users.
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

// ── Delete a trip (must be the owner) ────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    // deleteTrip's SQL already scopes DELETE ... WHERE id = $1 AND user_id = $2,
    // so passing the verified req.uid here means this can never touch another
    // user's row, even if the id is guessed.
    await deleteTrip(req.params.id, req.uid);

    res.json({ message: 'Trip deleted' });
  } catch (err) {
    console.error('[trips:delete]', err.message);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

// ── Generate shareable link (must be the owner) ──────────────────────────────
router.post('/:id/share', requireAuth, async (req, res) => {
  try {
    const trip = await getTripById(req.params.id);
    if (!trip || trip.user_id !== req.uid) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // If already has a share token, return it
    if (trip.share_token) {
      return res.json({ shareToken: trip.share_token, shareUrl: `/api/trips/shared/${trip.share_token}` });
    }

    // Generate a short, URL-safe token
    const token = crypto.randomBytes(8).toString('base64url');
    await updateTripShareToken(req.params.id, token);

    res.json({ shareToken: token, shareUrl: `/api/trips/shared/${token}` });
  } catch (err) {
    console.error('[trips:share]', err.message);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

module.exports = router;
