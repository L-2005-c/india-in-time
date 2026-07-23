// routes/geocode.js
// Proxies Nominatim city-search so the frontend never hits third-party APIs directly.
// GET /api/geocode?q=Kurnool

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();
const { geocodeCache } = require('../services/cache');

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query param: q' });

  // geocodeCache already existed (and was already reported in
  // /api/health/ready + /api/analytics/summary) but nothing ever actually
  // called .get()/.set() on it, so every search — including repeats of the
  // exact same city name from different users — hit Nominatim directly.
  // Nominatim's usage policy caps at 1 req/sec *globally* for the whole
  // app (see routes/places.js, which is careful about this); with no cache
  // here, real traffic risks that shared limit and getting the server's IP
  // throttled or banned. City names repeat constantly, so this is a cheap,
  // high hit-rate cache: 1 hour TTL is fine since a city's coordinates
  // don't change.
  const key = q.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached) return res.json(cached);

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}+India&format=json&limit=1`;
    const upstream = await fetch(url, {
      headers: {
        'Accept-Language': 'en-US,en',
        // Nominatim requires a valid User-Agent in production
        'User-Agent': 'IndiaInTime/1.0 (travel-planner-app)',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: 'Nominatim upstream error', status: upstream.status });
    }

    const data = await upstream.json();
    // Only cache non-empty results — an empty [] is often a transient typo,
    // not worth locking in for an hour.
    if (Array.isArray(data) && data.length > 0) {
      geocodeCache.set(key, data);
    }
    // Return as-is; shape: [{ lat, lon, name, display_name, ... }]
    res.json(data);
  } catch (err) {
    console.error('[geocode]', err.message);
    res.status(500).json({ error: 'Geocode request failed' });
  }
});

module.exports = router;
