// routes/geocode.js
// Proxies Nominatim city-search so the frontend never hits third-party APIs directly.
// GET /api/geocode?q=Kurnool
//
// Two things this route used to get wrong (both fixed here):
//   1. services/cache.js already defines a `geocodeCache` (1000 entries,
//      1hr TTL) for exactly this purpose, but this file never imported it —
//      every keystroke-search hit Nominatim fresh, even for a query someone
//      else had already searched seconds earlier.
//   2. Nominatim's usage policy caps the WHOLE APP at ~1 request/second,
//      globally — not per user. routes/places.js already respects this
//      (see its sequential, delayed calls), but this route fired requests
//      with no throttle at all. Under any real concurrent traffic this is
//      the single most likely way to get the app's server IP banned from
//      Nominatim, breaking city search for every user at once.

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();
const config  = require('../config');
const { geocodeCache } = require('../services/cache');

// ── Global sequential throttle ────────────────────────────────────────────
// Serializes outbound Nominatim calls across ALL concurrent requests (not
// per-IP) so the app-wide rate never exceeds Nominatim's ~1 req/sec policy,
// regardless of how many users are searching at once.
let queueTail = Promise.resolve();
function throttledNominatimCall(fn) {
  const run = () => fn();
  const result = queueTail.then(run, run); // run even if a prior call errored
  queueTail = result.catch(() => {}).then(() => new Promise(r => setTimeout(r, config.nominatim.delayMs)));
  return result;
}

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query param: q' });

  const cacheKey = q.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) {
    return res.json(cached);
  }

  try {
    const data = await throttledNominatimCall(async () => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}+India&format=json&limit=1`;
      const upstream = await fetch(url, {
        headers: {
          'Accept-Language': 'en-US,en',
          // Nominatim requires a valid, identifying User-Agent in production
          'User-Agent': config.nominatim.userAgent,
        },
        signal: AbortSignal.timeout(config.nominatim.timeoutMs),
      });

      if (!upstream.ok) {
        const err = new Error('Nominatim upstream error');
        err.upstreamStatus = upstream.status;
        throw err;
      }
      return upstream.json();
    });

    // Shape: [{ lat, lon, name, display_name, ... }]
    geocodeCache.set(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[geocode]', err.message);
    if (err.upstreamStatus) {
      return res.status(502).json({ error: 'Nominatim upstream error', status: err.upstreamStatus });
    }
    res.status(500).json({ error: 'Geocode request failed' });
  }
});

module.exports = router;
