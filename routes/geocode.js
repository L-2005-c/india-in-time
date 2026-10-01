'use strict';
const appLogger = require('../lib/logger');
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
const { keepAliveAgent } = require('../lib/httpAgent');

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

// ── Photon fallback ─────────────────────────────────────────────────────
// Nominatim's own usage policy admits it can be slow/unavailable under load
// (the exact traffic pattern a live server produces), and until now this
// endpoint had no fallback at all — a Nominatim outage meant city search
// was fully broken for every user. Photon (komoot.io) is a free, public,
// no-API-key alternative geocoder; converts its GeoJSON response into the
// same array shape Nominatim returns so the frontend contract (`nd[0].lat`,
// `nd[0].lon`, `nd[0].name`) doesn't change regardless of which source
// actually answered.
async function geocodeViaPhoton(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q + ' India')}&limit=1`;
  const upstream = await fetch(url, {
    headers: { 'User-Agent': config.nominatim.userAgent },
    signal: AbortSignal.timeout(config.nominatim.timeoutMs),
    agent: keepAliveAgent,
  });
  if (!upstream.ok) {
    const err = new Error('Photon upstream error');
    err.upstreamStatus = upstream.status;
    throw err;
  }
  const data = await upstream.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  return features
    .filter(f => typeof f?.geometry?.coordinates?.[0] === 'number' && typeof f?.geometry?.coordinates?.[1] === 'number')
    .map(f => {
      const [lon, lat] = f.geometry.coordinates;
      const props = f.properties || {};
      const nameParts = [props.name, props.city, props.state, props.country].filter(Boolean);
      return {
        lat: String(lat),
        lon: String(lon),
        name: props.name || nameParts[0] || '',
        display_name: nameParts.join(', '),
      };
    });
}

const { resolveCanonicalPlace, validatePoiCoordinates } = require('../services/travelIntelligence/tourismPoi');

async function computeGeocode(q, cityHint = '') {
  const searchQuery = cityHint && !q.toLowerCase().includes(cityHint.toLowerCase())
    ? `${q} ${cityHint}`
    : q;

  let data;
  try {
    data = await throttledNominatimCall(async () => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}+India&format=json&limit=3`;
      const upstream = await fetch(url, {
        headers: {
          'Accept-Language': 'en-US,en',
          'User-Agent': config.nominatim.userAgent,
        },
        signal: AbortSignal.timeout(config.nominatim.timeoutMs),
        agent: keepAliveAgent,
      });

      if (!upstream.ok) {
        const err = new Error('Nominatim upstream error');
        err.upstreamStatus = upstream.status;
        throw err;
      }
      return upstream.json();
    });
  } catch (nominatimErr) {
    appLogger.warn('[geocode] Nominatim failed, falling back to Photon:', nominatimErr.message);
    data = null;
  }

  // Nominatim errored, or came back with nothing — try Photon before giving up
  if (!Array.isArray(data) || data.length === 0) {
    try {
      data = await geocodeViaPhoton(searchQuery);
    } catch (photonErr) {
      appLogger.warn('[geocode] Photon fallback also failed:', photonErr.message);
      data = [];
    }
  }

  const rawList = Array.isArray(data) ? data : [];
  const sanitized = [];
  for (const item of rawList) {
    let rLat = parseFloat(item.lat);
    let rLon = parseFloat(item.lon);
    if (Number.isNaN(rLat) || Number.isNaN(rLon)) continue;
    // Auto-detect and correct inverted coordinates (longitude in latitude)
    if (rLat >= 68 && rLat <= 98 && rLon >= 6 && rLon <= 38) {
      const tmp = rLat; rLat = rLon; rLon = tmp;
      item.lat = String(rLat);
      item.lon = String(rLon);
    }
    const val = validatePoiCoordinates(rLat, rLon, { cityHint });
    if (val.valid) {
      sanitized.push(item);
    }
  }

  return sanitized.length > 0 ? sanitized : rawList;
}

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query param: q' });

  const cityHint = (req.query.city || req.query.cityName || '').trim();
  const key = cityHint ? `${q.toLowerCase()}__${cityHint.toLowerCase()}` : q.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached) return res.json(cached);

  // Authoritative Canonical POI resolution (0ms, 100% verified, immune to rate-limits)
  const canon = resolveCanonicalPlace(q, { cityHint: cityHint || null });
  if (canon && canon.latitude && canon.longitude) {
    const payload = [{
      lat: String(canon.latitude),
      lon: String(canon.longitude),
      name: canon.displayName,
      display_name: `${canon.displayName}, ${canon.city || cityHint || 'India'}, ${canon.state || 'India'}, India`,
      source: 'canonical_verified',
      isGolden: true,
      canonicalId: canon.id,
    }];
    geocodeCache.set(key, payload);
    return res.json(payload);
  }

  try {
    let data;
    if (typeof geocodeCache.getOrFetch === 'function') {
      data = await geocodeCache.getOrFetch(key, async () => {
        const fresh = await computeGeocode(q, cityHint);
        return fresh && fresh.length > 0 ? fresh : undefined;
      });
      if (!data) data = await computeGeocode(q, cityHint);
    } else {
      data = await computeGeocode(q, cityHint);
      if (Array.isArray(data) && data.length > 0) {
        geocodeCache.set(key, data);
      }
    }
    res.json(data);
  } catch (err) {
    appLogger.error('[geocode]', err.message);
    if (err.upstreamStatus) {
      return res.status(502).json({ error: 'Nominatim upstream error', status: err.upstreamStatus });
    }
    res.status(500).json({ error: 'Geocode request failed' });
  }
});

module.exports = router;
