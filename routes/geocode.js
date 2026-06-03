// routes/geocode.js
// Proxies Nominatim city-search so the frontend never hits third-party APIs directly.
// GET /api/geocode?q=Kurnool

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query param: q' });

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
    // Return as-is; shape: [{ lat, lon, name, display_name, ... }]
    res.json(data);
  } catch (err) {
    console.error('[geocode]', err.message);
    res.status(500).json({ error: 'Geocode request failed', detail: err.message });
  }
});

module.exports = router;
