'use strict';
const appLogger = require('../lib/logger');
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
const { resolveCanonicalPlace, isPermanentlyClosedPlace, validatePoiCoordinates } = require('../services/travelIntelligence/tourismPoi');
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

async function computePlaces({ lat, lon, cityName, totalMinutes, prefs, wantFoodOnly, wantsFood, staticPlaces }) {
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
        appLogger.error('[places] Curated fallback failed:', e.message); return [];
      });
    }

    const nominatimRaw = await fetchNominatimFallback(lat, lon, cityName, { foodOnly: wantFoodOnly }).catch(e => {
      appLogger.error('[places] Nominatim fallback failed:', e.message); return [];
    });

    const wikiResult = await pWiki.catch(e => { appLogger.error('[places] Wiki failed:', e.message); return []; });
    const aiResult   = await pAi.catch(e => { appLogger.error('[places] AI discovery failed:', e.message); return []; });

    const wiki = Array.isArray(wikiResult) ? wikiResult : [];
    const aiPlacesRaw = Array.isArray(aiResult) ? aiResult : [];
    
    // Now that fallbacks are done, hydrate AI places (this also geocodes sequentially)
    const aiRanked = filterPlacesByPrefs(
      await hydrateAiPlaces(aiPlacesRaw, [...staticPlaces, ...curatedCity, ...wiki, ...nominatimRaw], lat, lon, cityName),
      prefs
    );

    appLogger.info(`[places] Sources: AI-ranked:${aiRanked.length} Static:${staticPlaces.length} Wiki:${wiki.length} Curated:${curatedCity.length} Nominatim:${nominatimRaw.length}`);

    // ── Merge all sources, dedup by normalised name ───────────────────────────
    const seen    = new Set();
    const merged  = [];

    function addPlaces(list) {
      for (const p of (list || [])) {
        if (!p || isPermanentlyClosedPlace(p)) continue;
        const k = String(p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        if (!k || k.length < 2 || seen.has(k)) continue;
        if (!p.coords || p.coords.length < 2) continue;
        const integrity = validatePoiCoordinates(p.coords[0], p.coords[1], {
          cityHint: cityName,
          category: p.cat,
        });
        if (!integrity.valid) {
          appLogger.warn(`[places] Rejected "${p.name}" with invalid/offshore coords [${p.coords}]: ${integrity.reason}`);
          continue;
        }
        p.coords = [integrity.lat, integrity.lon];
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

    // If food is wanted at all (food-only OR one of several preferences),
    // also add curated food seeds so mixed trips get real restaurant
    // candidates, not just whatever AI/Wiki/Nominatim happened to surface.
    if (wantsFood) {
      const curatedFood = await fetchCuratedFoodFallback(lat, lon, cityName).catch(() => []);
      addPlaces(filterPlacesByPrefs(curatedFood, prefs));
    }

    appLogger.info(`[places] Final merged pool before proximity-dedup: ${merged.length} places (prefs: ${prefs.join(',') || 'all'})`);

    // ── Proximity dedup ─────────────────────────────────────────────────────
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

    // Canonical enrichment & quality scoring pass
    const canonicalPlaces = [];
    for (const p of dedupedMerged) {
      const canonical = resolveCanonicalPlace(p, {
        cityHint: cityName,
        categoryHint: p.cat,
        cityCoords: { lat, lon },
      });
      if (canonical) {
        canonicalPlaces.push({
          ...p,
          id: p.id || canonical.id,
          name: p.name,
          canonicalName: canonical.canonicalName,
          coords: canonical.coords || p.coords,
          cat: canonical.category,
          category: canonical.category,
          tourismStatus: canonical.tourismStatus,
          verificationStatus: canonical.verificationStatus,
          coordinateSource: canonical.coordinateSource,
          qualityScore: canonical.qualityScore,
        });
      } else {
        const integrity = validatePoiCoordinates(p.coords[0], p.coords[1], {
          cityHint: cityName,
          category: p.cat,
        });
        if (integrity.valid) {
          canonicalPlaces.push({
            ...p,
            coords: [integrity.lat, integrity.lon],
          });
        }
      }
    }

    merged.length = 0;
    merged.push(...canonicalPlaces);

    appLogger.info(`[places] Final merged pool: ${merged.length} places (prefs: ${prefs.join(',') || 'all'})`);

    if (merged.length >= 3) {
      return { places: merged, source: 'ranked_sources', count: merged.length };
    }

    // Last resort: below the 3-result threshold, but `merged` here is
    // already fully deduped (exact-name + proximity) — just relax the
    // count requirement rather than rebuilding from raw, non-deduped sources.
    const anything = merged;
    return { places: anything, source: 'last_resort', count: anything.length };

  } catch(err) {
    appLogger.error('[places] Error:', err.message);
    try {
      const wiki = await fetchWiki(lat, lon, cityName).catch(() => []);
      const curatedCity = await fetchCuratedCityFallback(lat, lon, cityName).catch(() => []);
      const nominatimFallback = await fetchNominatimFallback(lat, lon, cityName, { foodOnly: wantFoodOnly }).catch(() => []);
      const curatedFood = wantsFood ? await fetchCuratedFoodFallback(lat, lon, cityName).catch(() => []) : [];
      const all = filterPlacesByPrefs(
          [...staticPlaces, ...curatedCity, ...wiki, ...nominatimFallback, ...curatedFood].filter((p, i, arr) =>
          p?.coords?.length >= 2 &&
          !isPermanentlyClosedPlace(p) &&
          arr.findIndex(x => String(x.name||'').toLowerCase() === String(p.name||'').toLowerCase()) === i
        ),
        prefs
      );
      return { places: all, source: 'error_fallback', count: all.length };
    } catch (innerErr) {
      appLogger.error('[places] fetch failed:', innerErr.message);
      throw innerErr;
    }
  }
}

router.post('/', async (req, res) => {
  const { lat, lon, cityName, totalMinutes, refresh, prefs = [] } = req.body;
  const wantFoodOnly = Array.isArray(prefs) && prefs.length === 1 && prefs[0] === 'food';
  const wantsFood = Array.isArray(prefs) && prefs.includes('food');
  if (lat==null||lon==null) return res.status(400).json({ error:'Missing lat/lon' });
  appLogger.info(`\n[places] ${cityName} (${lat},${lon})`);
  const key = cacheKey(cityName, lat, lon, totalMinutes, prefs);

  const requestedRefresh = !!refresh;
  const effectiveRefresh = requestedRefresh && canRefresh(key);
  if (requestedRefresh && !effectiveRefresh) {
    appLogger.info(`[places] Refresh requested for ${cityName} but throttled (already refreshed recently) — serving cache instead`);
  }
  const refreshNow = effectiveRefresh;

  if (refreshNow) {
    appLogger.info(`[places] Refresh requested for ${cityName}; bypassing cache`);
    deleteCachedPlaces(key);
  }
  const cached = refreshNow ? null : getCachedPlaces(key);
  if (!refreshNow && cached) {
    appLogger.info(`[places] Cache hit for ${cityName}`);
    return res.json(cached);
  }
  const staticPlaces = filterPlacesByPrefs(staticCityPlaces(cityName), prefs);

  try {
    const fetcher = () => computePlaces({ lat, lon, cityName, totalMinutes, prefs, wantFoodOnly, wantsFood, staticPlaces });
    let payload;
    if (refreshNow || typeof placesCache.getOrFetch !== 'function') {
      payload = await fetcher();
      setCachedPlaces(key, payload);
    } else {
      payload = await placesCache.getOrFetch(key, fetcher, PLACE_CACHE_TTL_MS);
    }
    return res.json(payload);
  } catch (_err) {
    return res.status(500).json({ error: 'Places fetch failed' });
  }
});

module.exports = router;
