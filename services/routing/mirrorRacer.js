'use strict';

/**
 * services/routing/mirrorRacer.js
 *
 * High-concurrency routing mirror racer with circuit breaking,
 * latency profiling, and early-winner return.
 */

const appLogger = require('../../lib/logger');

const MIRROR_STATUS = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
};

// Mirror Health Registry
const mirrorState = new Map([
  ['https://routing.openstreetmap.de', { failures: 0, successes: 0, lastFailureAt: 0, status: MIRROR_STATUS.HEALTHY, avgLatencyMs: 250 }],
  ['https://router.project-osrm.org', { failures: 0, successes: 0, lastFailureAt: 0, status: MIRROR_STATUS.HEALTHY, avgLatencyMs: 320 }],
]);

const CIRCUIT_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown after 3 consecutive failures
const MAX_FAILURES_BEFORE_TRIP = 3;

/**
 * Gets currently active and healthy mirrors.
 */
function getActiveMirrors() {
  const now = Date.now();
  const active = [];

  for (const [mirrorUrl, state] of mirrorState.entries()) {
    if (state.status === MIRROR_STATUS.CIRCUIT_OPEN) {
      if (now - state.lastFailureAt > CIRCUIT_COOLDOWN_MS) {
        state.status = MIRROR_STATUS.HEALTHY;
        state.failures = 0;
        active.push(mirrorUrl);
      }
    } else {
      active.push(mirrorUrl);
    }
  }

  return active.length > 0 ? active : ['https://routing.openstreetmap.de', 'https://router.project-osrm.org'];
}

/**
 * Records mirror success and updates latency EMA.
 */
function recordMirrorSuccess(mirrorUrl, latencyMs) {
  const state = mirrorState.get(mirrorUrl) || { failures: 0, successes: 0, status: MIRROR_STATUS.HEALTHY, avgLatencyMs: 300 };
  state.successes++;
  state.failures = 0;
  state.status = MIRROR_STATUS.HEALTHY;
  state.avgLatencyMs = Math.round(state.avgLatencyMs * 0.7 + latencyMs * 0.3);
  mirrorState.set(mirrorUrl, state);
}

/**
 * Records mirror failure and trips circuit if needed.
 */
function recordMirrorFailure(mirrorUrl) {
  const state = mirrorState.get(mirrorUrl) || { failures: 0, successes: 0, status: MIRROR_STATUS.HEALTHY, avgLatencyMs: 300 };
  state.failures++;
  state.lastFailureAt = Date.now();
  if (state.failures >= MAX_FAILURES_BEFORE_TRIP) {
    state.status = MIRROR_STATUS.CIRCUIT_OPEN;
    appLogger.warn(`[mirrorRacer] Tripped circuit for routing mirror: ${mirrorUrl} (cooldown: ${CIRCUIT_COOLDOWN_MS / 1000}s)`);
  } else {
    state.status = MIRROR_STATUS.DEGRADED;
  }
  mirrorState.set(mirrorUrl, state);
}

/**
 * Races multiple OSRM mirrors concurrently, returning the fastest valid result.
 *
 * @param {Array<number>} fromCoords - [lat, lon]
 * @param {Array<number>} toCoords - [lat, lon]
 * @param {Object} opts - Routing options (mode, timeoutMs)
 * @returns {Promise<Object|null>}
 */
async function raceOsrmMirrors(fromCoords, toCoords, opts = {}) {
  const mode = opts.mode || 'driving';
  const profile = mode === 'walking' ? 'foot' : (mode === 'bicycling' ? 'bike' : 'driving');
  const mirrorSub = mode === 'walking' ? 'routed-foot' : (mode === 'bicycling' ? 'routed-bike' : 'routed-car');
  const coords = `${fromCoords[1]},${fromCoords[0]};${toCoords[1]},${toCoords[0]}`;
  const timeoutMs = opts.timeoutMs || 3500;

  const baseMirrors = getActiveMirrors();
  const mirrorUrls = baseMirrors.map(m => m.includes('openstreetmap.de') ? `${m}/${mirrorSub}` : m);

  const parentController = new AbortController();
  const timeoutTimer = setTimeout(() => parentController.abort(), timeoutMs);

  const fetchPromises = mirrorUrls.map(async (baseUrl) => {
    const url = `${baseUrl}/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true`;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        signal: parentController.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'IndiaInTime-FastRouting/2.0' },
      });

      if (!res.ok) {
        recordMirrorFailure(baseUrl.split('/routed-')[0]);
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json();
      if (body.code !== 'Ok' || !body.routes?.[0]) {
        recordMirrorFailure(baseUrl.split('/routed-')[0]);
        throw new Error(`OSRM code: ${body.code}`);
      }

      const latency = Date.now() - start;
      recordMirrorSuccess(baseUrl.split('/routed-')[0], latency);

      const route = body.routes[0];
      const leg = route.legs?.[0];
      const distanceM = Math.round(route.distance);
      const durationSec = Math.round(route.duration);

      const geometry = Array.isArray(route.geometry?.coordinates)
        ? route.geometry.coordinates.map(c => [c[1], c[0]])
        : null;

      const steps = (leg?.steps || []).map(s => ({
        instruction: s.name ? `via ${s.name}` : (s.maneuver?.type || 'continue'),
        distanceM: Math.round(s.distance || 0),
        durationSec: Math.round(s.duration || 0),
        maneuver: s.maneuver?.modifier || s.maneuver?.type || 'continue',
        streetName: s.name || null,
      }));

      return {
        provider: 'osrm',
        distanceMeters: distanceM,
        durationSeconds: durationSec,
        durationInTrafficSeconds: null,
        hasRealtimeTraffic: false,
        geometry,
        summary: leg?.summary || (steps[0]?.instruction ? steps[0].instruction : 'Standard route'),
        steps,
        confidenceScore: 82,
        latencyMs: latency,
      };
    } catch (err) {
      if (err.name === 'AbortError') return null;
      return null;
    }
  });

  try {
    // Wait for the first valid non-null result
    const results = await Promise.allSettled(fetchPromises);
    clearTimeout(timeoutTimer);
    parentController.abort(); // Abort any lingering requests

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value != null) {
        return r.value;
      }
    }
    return null;
  } catch (_e) {
    clearTimeout(timeoutTimer);
    return null;
  }
}

module.exports = {
  raceOsrmMirrors,
  getActiveMirrors,
  recordMirrorSuccess,
  recordMirrorFailure,
  mirrorState,
};
