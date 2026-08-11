// routingEngine.js — Live routing via public OSRM with timeout + heuristic fallback
// Never invents live traffic; labels source clearly.
const { distKm } = require('../../utils/geo');

const OSRM_BASE = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const ROUTING_TIMEOUT_MS = Number(process.env.ROUTING_TIMEOUT_MS) || 4000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function cacheKey(from, to) {
  return `${from[0].toFixed(4)},${from[1].toFixed(4)}>${to[0].toFixed(4)},${to[1].toFixed(4)}`;
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key, data) {
  if (cache.size > 500) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
  cache.set(key, { at: Date.now(), data });
}

/**
 * Fetch route from OSRM (or compatible) with hard timeout.
 * Returns null on any failure — caller must fall back.
 */
async function fetchOsrmRoute(fromCoords, toCoords, opts = {}) {
  if (!fromCoords || !toCoords) return null;
  if (!Number.isFinite(fromCoords[0]) || !Number.isFinite(toCoords[0])) return null;

  const key = cacheKey(fromCoords, toCoords);
  const cached = getCached(key);
  if (cached) return { ...cached, fromCache: true };

  const profile = opts.profile || 'driving';
  // OSRM expects lon,lat
  const coords = `${fromCoords[1]},${fromCoords[0]};${toCoords[1]},${toCoords[0]}`;
  const url = `${OSRM_BASE}/route/v1/${profile}/${coords}?overview=false&alternatives=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || ROUTING_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'IndiaInTime-TravelIntelligence/1.0' },
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.code !== 'Ok' || !body.routes?.[0]) return null;
    const route = body.routes[0];
    const data = {
      durationSec: Math.round(route.duration),
      distanceM: Math.round(route.distance),
      source: 'live',
      provider: 'osrm',
      congestion: 1.0, // OSRM public demo has limited live congestion; treat as free-flow baseline
    };
    setCache(key, data);
    return data;
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve travel between two points:
 * 1) explicit liveTraffic if provided
 * 2) OSRM live route (if enableLiveRouting)
 * 3) null → caller uses heuristic
 */

/**
 * Optional Google Directions API adapter.
 * Requires GOOGLE_MAPS_API_KEY. Returns same shape as OSRM live payload or null.
 */
async function fetchGoogleRoute(fromCoords, toCoords, opts = {}) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY;
  if (!key) return null;
  if (!fromCoords || !toCoords) return null;

  const origin = `${fromCoords[0]},${fromCoords[1]}`;
  const dest = `${toCoords[0]},${toCoords[1]}`;
  const mode = opts.mode || 'driving';
  const departure = opts.departureTime ? `&departure_time=${Math.floor(new Date(opts.departureTime).getTime() / 1000)}` : '&departure_time=now';
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&mode=${mode}&traffic_model=best_guess${departure}&key=${key}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || ROUTING_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.status !== 'OK' || !body.routes?.[0]?.legs?.[0]) return null;
    const leg = body.routes[0].legs[0];
    const durationSec = leg.duration_in_traffic?.value ?? leg.duration?.value;
    const distanceM = leg.distance?.value;
    if (!Number.isFinite(durationSec)) return null;
    // Approximate congestion: traffic duration vs static duration
    let congestion = 1.0;
    if (leg.duration?.value && leg.duration_in_traffic?.value) {
      congestion = Math.max(0.7, Math.min(2.5, leg.duration_in_traffic.value / leg.duration.value));
    }
    return {
      durationSec: Math.round(durationSec),
      distanceM: distanceM != null ? Math.round(distanceM) : null,
      source: 'live',
      provider: 'google',
      congestion,
    };
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveLiveTravel(opts = {}) {
  const { fromCoords, toCoords, liveTraffic = null, enableLiveRouting = true } = opts;

  if (liveTraffic && Number.isFinite(liveTraffic.durationSec)) {
    return {
      durationSec: liveTraffic.durationSec,
      distanceM: liveTraffic.distanceM ?? null,
      congestion: liveTraffic.congestion ?? 1.0,
      source: 'live',
      provider: liveTraffic.provider || 'client',
    };
  }

  if (!enableLiveRouting) return null;
  if (process.env.DISABLE_LIVE_ROUTING === '1') return null;

  if (fromCoords && toCoords) {
    const km = distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
    if (km > 120) return null;
  }

  const provider = (process.env.ROUTING_PROVIDER || '').toLowerCase();
  // Prefer Google when key is configured or explicitly requested
  if (provider === 'google' || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY) {
    const g = await fetchGoogleRoute(fromCoords, toCoords, opts);
    if (g) return g;
  }
  // Fallback: public OSRM
  if (provider === 'osrm' || provider === '' || provider === 'auto') {
    return fetchOsrmRoute(fromCoords, toCoords, opts);
  }
  return null;
}

module.exports = {
  fetchOsrmRoute,
  fetchGoogleRoute,
  resolveLiveTravel,
  ROUTING_TIMEOUT_MS,
};
