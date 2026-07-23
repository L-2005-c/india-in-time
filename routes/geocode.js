// routes/geocode.js
// Proxies Nominatim city-search so the frontend never hits third-party APIs directly.
// GET /api/geocode?q=Kurnool
//
// This route has two responsibilities that both matter under real traffic:
//   1. Cache hits: geocodeCache (services/cache.js) avoids re-hitting Nominatim
//      for repeat searches — city names repeat constantly across users, and a
//      city's coordinates don't change, so a 1hr TTL cache has a high hit rate.
//      Only non-empty results are cached; an empty [] is often a transient typo
//      and isn't worth locking in for an hour.
//   2. Global throttle: Nominatim's usage policy caps the WHOLE APP at ~1
//      request/second, globally — not per user. routes/places.js already
//      respects this with sequential, delayed calls; this route must too, or
//      concurrent searches from different users can burst past that shared
//      limit and get the app's server IP rate-limited or banned, breaking
//      city search for everyone at once.

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

  const key = q.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached) return res.json(cached);

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

    // Only cache non-empty results — an empty [] is often a transient typo,
    // not worth locking in for an hour.
    // Shape: [{ lat, lon, name, display_name, ... }]
    if (Array.isArray(data) && data.length > 0) {
      geocodeCache.set(key, data);
    }
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
