// routes/places.js — v6 (uses unified services)
const express = require('express');
const router  = express.Router();
const config  = require('../config');
const { placesCache } = require('../services/cache');
const { distKm } = require('../utils/geo');
const PLACE_CACHE_TTL_MS = config.cache.placesTtlMs;
const {
  filterPlacesByPrefs,
} = require('../utils/placesMerge');
const {
  getPlaces, fetchWiki, fetchCuratedCityFallback, fetchCuratedFoodFallback,
  fetchNominatimFallback, hydrateAiPlaces,
} = require('../services/placesDiscovery');
function cacheKey(cityName, lat, lon, totalMinutes, prefs = []) {
  return [
    String(cityName || '').trim().toLowerCase(),
    Number(lat).toFixed(3),
    Number(lon).toFixed(3),
    parseInt(totalMinutes, 10) || 600,
    Array.isArray(prefs) ? [...prefs].sort().join(',') : '',
  ].join('|');
}

function getCachedPlaces(key) {
  return placesCache.get(key) || null;
}

function setCachedPlaces(key, payload) {
  if (!payload || !Array.isArray(payload.places) || payload.places.length === 0) return;
  placesCache.set(key, payload, PLACE_CACHE_TTL_MS);
}

const { staticCityPlaces } = require('../data/city-seeds');


function deleteCachedPlaces(key) {
  placesCache.delete(key);
}

// ── Refresh throttle ─────────────────────────────────────────────────────────
// Tracks the last time each cache key was force-refreshed, independent of
// the per-IP rate limiter, so a real cost cap exists per city/query even
// across many different IPs.
const REFRESH_COOLDOWN_MS = 60 * 1000;
const lastRefreshAt = new Map();

function canRefresh(key) {
  const now = Date.now();
  const last = lastRefreshAt.get(key) || 0;
  if (now - last < REFRESH_COOLDOWN_MS) return false;
  lastRefreshAt.set(key, now);
  // Bound memory — this Map only needs to hold recent activity.
  if (lastRefreshAt.size > 2000) {
    const cutoff = now - REFRESH_COOLDOWN_MS;
    for (const [k, t] of lastRefreshAt) {
      if (t < cutoff) lastRefreshAt.delete(k);
    }
  }
  return true;
}

router.post('/', async (req, res) => {
  const { lat, lon, cityName, totalMinutes, refresh, prefs = [] } = req.body;
  const wantFoodOnly = Array.isArray(prefs) && prefs.length === 1 && prefs[0] === 'food';
  if (lat==null||lon==null) return res.status(400).json({ error:'Missing lat/lon' });
  console.log(`\n[places] ${cityName} (${lat},${lon})`);
  const key = cacheKey(cityName, lat, lon, totalMinutes, prefs);

  // `refresh: true` is meant for "my data looks stale, force a re-fetch" —
  // it bypasses the cache and triggers Gemini + Wikipedia + Nominatim all at
  // once. Since it's caller-controlled with no ownership check, anyone could
  // otherwise force that expensive multi-source fetch on every request just
  // by always sending refresh:true (the per-IP rate limiter still applies,
  // but that alone still allows a steady drip of full-cost fetches, and
  // multiple IPs can target the same popular city). Cap actual bypasses to
  // once per cache key per minute — everyone past the first refresher in
  // that window still gets a fast, fresh-enough cached response.
  const requestedRefresh = !!refresh;
  const effectiveRefresh = requestedRefresh && canRefresh(key);
  if (requestedRefresh && !effectiveRefresh) {
    console.log(`[places] Refresh requested for ${cityName} but throttled (already refreshed recently) — serving cache instead`);
  }
  const refreshNow = effectiveRefresh;

  if (refreshNow) {
    console.log(`[places] Refresh requested for ${cityName}; bypassing cache`);
    deleteCachedPlaces(key);
  }
  const cached = refreshNow ? null : getCachedPlaces(key);
  if (!refreshNow && cached) {
    console.log(`[places] Cache hit for ${cityName}`);
    return res.json(cached);
  }
  const staticPlaces = filterPlacesByPrefs(staticCityPlaces(cityName), prefs);
  try {
    // ── Fetch ALL sources in parallel ────────────────────────────────────────────
    // Strategy: gather every reliable source simultaneously, then merge & dedup.
    // Never return early — always combine AI names (Nominatim-geocoded) +
    // Wikipedia (ground-truth coords) + Nominatim fallback search.
    // ── Fetch sources safely without overloading Nominatim ──────────────────
    // Wikipedia and Gemini API can run concurrently.
    const pWiki = wantFoodOnly ? Promise.resolve([]) : fetchWiki(lat, lon, cityName);
    const pAi   = wantFoodOnly ? Promise.resolve([]) : getPlaces(cityName, lat, lon, totalMinutes);

    // Nominatim strictly limits to 1 request per second globally per IP.
    // We MUST execute Curated (which geocodes) and Nominatim Fallback sequentially
    // to avoid HTTP 429 Too Many Requests, which breaks the subsequent AI geocoding.
    let curatedCity = [];
    if (!wantFoodOnly) {
      curatedCity = await fetchCuratedCityFallback(lat, lon, cityName).catch(e => {
        console.error('[places] Curated fallback failed:', e.message); return [];
      });
    }

    const nominatimRaw = await fetchNominatimFallback(lat, lon, cityName, { foodOnly: wantFoodOnly }).catch(e => {
      console.error('[places] Nominatim fallback failed:', e.message); return [];
    });

    const wikiResult = await pWiki.catch(e => { console.error('[places] Wiki failed:', e.message); return []; });
    const aiResult   = await pAi.catch(e => { console.error('[places] AI discovery failed:', e.message); return []; });

    const wiki = Array.isArray(wikiResult) ? wikiResult : [];
    const aiPlacesRaw = Array.isArray(aiResult) ? aiResult : [];
    
    // Now that fallbacks are done, hydrate AI places (this also geocodes sequentially)
    const aiRanked = filterPlacesByPrefs(
      await hydrateAiPlaces(aiPlacesRaw, [...staticPlaces, ...curatedCity, ...wiki, ...nominatimRaw], lat, lon, cityName),
      prefs
    );

    console.log(`[places] Sources: AI-ranked:${aiRanked.length} Static:${staticPlaces.length} Wiki:${wiki.length} Curated:${curatedCity.length} Nominatim:${nominatimRaw.length}`);

    // ── Merge all sources, dedup by normalised name ───────────────────────────
    const seen    = new Set();
    const merged  = [];

    function addPlaces(list) {
      for (const p of (list || [])) {
        const k = String(p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        if (!k || k.length < 2 || seen.has(k)) continue;
        if (!p.coords || p.coords.length < 2) continue;
        seen.add(k);
        merged.push(p);
      }
    }

    // Priority order: AI geocoded (has open/close times) → Wikipedia (trusted coords)
    // → curated seeds → Nominatim fallback search
    addPlaces(aiRanked);
    addPlaces(staticPlaces);
    addPlaces(filterPlacesByPrefs(curatedCity, prefs));
    addPlaces(filterPlacesByPrefs(wiki,        prefs));
    addPlaces(filterPlacesByPrefs(nominatimRaw, prefs));

    // If food-only, also add curated food seeds
    if (wantFoodOnly) {
      const curatedFood = await fetchCuratedFoodFallback(lat, lon, cityName).catch(() => []);
      addPlaces(curatedFood);
    }

    console.log(`[places] Final merged pool before proximity-dedup: ${merged.length} places (prefs: ${prefs.join(',') || 'all'})`);

    // ── Proximity dedup ─────────────────────────────────────────────────────
    // Exact-name dedup above misses the SAME physical place listed under a
    // different name variant from another source (e.g. "Sri Kanaka Mahalakshmi
    // Temple" vs "Sri Kanaka Mahalakshmi Ammavari Temple" — one static seed,
    // one AI/Nominatim discovery). If two places are within ~180m of each
    // other AND share a significant name word, they're almost certainly the
    // same spot — keep only the first (higher-priority source).
    const PROX_STOP = new Set(['the','of','and','temple','beach','fort','park','museum','lake','garden','road','street','point','view','city','centre','center']);
    const sigWords = n => String(n || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !PROX_STOP.has(w));
    const dedupedMerged = [];
    for (const place of merged) {
      const words = sigWords(place.name);
      const isDup = dedupedMerged.some(kept => {
        if (!kept.coords?.length || !place.coords?.length) return false;
        if (distKm(kept.coords[0], kept.coords[1], place.coords[0], place.coords[1]) > 0.18) return false;
        const kWords = sigWords(kept.name);
        return words.some(w => kWords.includes(w));
      });
      if (!isDup) dedupedMerged.push(place);
    }
    merged.length = 0;
    merged.push(...dedupedMerged);

    console.log(`[places] Final merged pool: ${merged.length} places (prefs: ${prefs.join(',') || 'all'})`);

    if (merged.length >= 3) {
      const payload = { places: merged, source: 'ranked_sources', count: merged.length };
      setCachedPlaces(key, payload);
      return res.json(payload);
    }

    // Last resort: return whatever we have unfiltered
    const anything = filterPlacesByPrefs(
      [...aiRanked, ...staticPlaces, ...curatedCity, ...wiki, ...nominatimRaw].filter((p, i, arr) =>
        p?.coords?.length >= 2 &&
        arr.findIndex(x => String(x.name||'').toLowerCase() === String(p.name||'').toLowerCase()) === i
      ),
      prefs
    );
    const payload = { places: anything, source: 'last_resort', count: anything.length };
    setCachedPlaces(key, payload);
    return res.json(payload);

  } catch(err) {
    console.error('[places] Error:', err.message);
    try {
      const wiki = await fetchWiki(lat, lon, cityName).catch(() => []);
      const curatedCity = await fetchCuratedCityFallback(lat, lon, cityName).catch(() => []);
      const nominatimFallback = await fetchNominatimFallback(lat, lon, cityName, { foodOnly: wantFoodOnly }).catch(() => []);
      const all = filterPlacesByPrefs(
          [...staticPlaces, ...curatedCity, ...wiki, ...nominatimFallback].filter((p, i, arr) =>
          p?.coords?.length >= 2 &&
          arr.findIndex(x => String(x.name||'').toLowerCase() === String(p.name||'').toLowerCase()) === i
        ),
        prefs
      );
      const payload = { places: all, source: 'error_fallback', count: all.length };
      setCachedPlaces(key, payload);
      return res.json(payload);
    } catch (err) {
      console.error('[places] fetch failed:', err.message);
      return res.status(500).json({ error: 'Places fetch failed' });
    }
  }
});

module.exports = router;
