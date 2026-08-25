'use strict';

/**
 * services/routing/routingService.js
 * Authoritative, production-grade routing and travel-time engine.
 * Single source of truth for distances, durations, ETAs, and traffic intelligence.
 */

const { distKm } = require('../../utils/geo');
const { validateRouteCoordinates } = require('./coordinateValidator');
const { normalizeTrafficMetadata, TRAFFIC_STATUS, TRAFFIC_PROVENANCE } = require('./trafficClassifier');
const { buildCacheKey, getCachedRoute, setCachedRoute } = require('./routeCache');

const ROAD_NETWORK_FACTOR = 1.42; // Real-world Indian road distance vs haversine straight-line
const ROUTING_TIMEOUT_MS = Number(process.env.ROUTING_TIMEOUT_MS) || 4500;

/**
 * Formats distance into a clean user-facing string.
 */
function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return '--';
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters)} m`;
  return `${(Math.round(km * 10) / 10).toFixed(1)} km`;
}

/**
 * Formats duration into a clean user-facing string.
 */
function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '--';
  const m = Math.round(minutes);
  if (m < 60) return `${m} mins`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} mins`;
}

/**
 * Google Directions / Routes API Adapter.
 */
async function fetchGoogleRoute(fromCoords, toCoords, opts = {}) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY;
  if (!key) return null;

  const mode = opts.mode || 'driving';
  const departure = opts.departureTime
    ? `&departure_time=${Math.floor(new Date(opts.departureTime).getTime() / 1000)}`
    : '&departure_time=now';
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromCoords[0]},${fromCoords[1]}&destination=${toCoords[0]},${toCoords[1]}&mode=${mode}&traffic_model=best_guess${departure}&key=${key}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || ROUTING_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.status !== 'OK' || !body.routes?.[0]?.legs?.[0]) return null;

    const leg = body.routes[0].legs[0];
    const durationSec = leg.duration?.value || Math.round((leg.distance?.value || 1000) / 7.5);
    const durationInTrafficSec = leg.duration_in_traffic?.value || durationSec;
    const distanceM = leg.distance?.value || Math.round(distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]) * 1420);

    const steps = (leg.steps || []).map(s => ({
      instruction: (s.html_instructions || '').replace(/<[^>]*>?/gm, ''),
      distanceM: s.distance?.value || 0,
      durationSec: s.duration?.value || 0,
      maneuver: s.maneuver || 'continue',
    }));

    return {
      provider: 'google',
      distanceMeters: distanceM,
      durationSeconds: durationSec,
      durationInTrafficSeconds: durationInTrafficSec,
      hasRealtimeTraffic: !!leg.duration_in_traffic?.value,
      summary: body.routes[0].summary || 'Fastest route',
      steps,
      confidenceScore: 92,
    };
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Public OSRM Multi-Mirror Adapter.
 */
async function fetchOsrmRoute(fromCoords, toCoords, opts = {}) {
  const mode = opts.mode || 'driving';
  const profile = mode === 'walking' ? 'foot' : (mode === 'bicycling' ? 'bike' : 'driving');
  const mirrorSub = mode === 'walking' ? 'routed-foot' : (mode === 'bicycling' ? 'routed-bike' : 'routed-car');
  const coords = `${fromCoords[1]},${fromCoords[0]};${toCoords[1]},${toCoords[0]}`;

  const mirrors = [
    `https://routing.openstreetmap.de/${mirrorSub}`,
    'https://router.project-osrm.org',
  ];

  for (const mirror of mirrors) {
    const url = `${mirror}/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs || ROUTING_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'IndiaInTime-RoutingEngine/2.0' },
      });
      if (!res.ok) continue;
      const body = await res.json();
      if (body.code !== 'Ok' || !body.routes?.[0]) continue;

      const route = body.routes[0];
      const leg = route.legs?.[0];
      const distanceM = Math.round(route.distance);
      const durationSec = Math.round(route.duration);

      const geometry = Array.isArray(route.geometry?.coordinates)
        ? route.geometry.coordinates.map(c => [c[1], c[0]]) // GeoJSON lon,lat to Leaflet lat,lon
        : null;

      const steps = (leg?.steps || []).map(s => ({
        instruction: s.name ? `via ${s.name}` : (s.maneuver?.type || 'continue'),
        distanceM: Math.round(s.distance || 0),
        durationSec: Math.round(s.duration || 0),
        maneuver: s.maneuver?.modifier || s.maneuver?.type || 'continue',
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
        confidenceScore: 78,
      };
    } catch (_err) {
      // Try next mirror
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/**
 * Calibrated Road Network Fallback Engine.
 */
function calculateRoadNetworkFallback(fromCoords, toCoords, opts = {}) {
  const straightKm = distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
  const roadKm = straightKm * ROAD_NETWORK_FACTOR;
  const distanceMeters = Math.round(roadKm * 1000);

  const mode = opts.mode || 'driving';
  let speedKmPerMin = 0.32; // ~19.2 km/h urban driving
  if (mode === 'walking') speedKmPerMin = 0.075; // 4.5 km/h
  else if (mode === 'bicycling') speedKmPerMin = 0.20; // 12 km/h
  else if (mode === 'transit') speedKmPerMin = 0.24; // 14.4 km/h

  const baseMinutes = Math.max(mode === 'walking' ? 3 : 6, Math.round(roadKm / speedKmPerMin));
  const durationSeconds = baseMinutes * 60;

  return {
    provider: 'road_network_model',
    distanceMeters,
    durationSeconds,
    durationInTrafficSeconds: null,
    hasRealtimeTraffic: false,
    geometry: [fromCoords, toCoords],
    summary: 'Estimated road route',
    steps: [{ instruction: 'Follow road route to destination', distanceM: distanceMeters, durationSec: durationSeconds, maneuver: 'depart' }],
    confidenceScore: 65,
  };
}

/**
 * Authoritative Route Calculator (Point-to-Point).
 *
 * @param {Array|Object} origin - [lat, lon] or {lat, lon}
 * @param {Array|Object} destination - [lat, lon] or {lat, lon}
 * @param {Object} opts - Routing options (mode, departureTime, preference, bypassCache)
 * @returns {Promise<Object>} Canonical Route Response
 */
async function calculateRoute(origin, destination, opts = {}) {
  const coordVal = validateRouteCoordinates(origin, destination);
  if (!coordVal.valid) {
    return {
      success: false,
      error: coordVal.error,
      code: coordVal.code,
      confidence: { score: 0, source: 'validation_error' },
    };
  }

  const { from, to, isSamePoint, warnings } = coordVal;

  if (isSamePoint) {
    return {
      success: true,
      origin: { lat: from[0], lon: from[1], name: opts.originName || 'Origin' },
      destination: { lat: to[0], lon: to[1], name: opts.destName || 'Destination' },
      travelMode: opts.mode || 'driving',
      distance: { meters: 0, kilometers: 0, formatted: '0 km' },
      duration: { seconds: 0, minutes: 0, trafficAwareSeconds: 0, trafficAwareMinutes: 0, formatted: '0 mins' },
      traffic: { status: TRAFFIC_STATUS.LOW, congestionFactor: 1.0, delayMinutes: 0, provenance: TRAFFIC_PROVENANCE.ROUTE_ESTIMATE, freshness: new Date().toISOString(), label: 'Same location' },
      timestamps: { departure: opts.departureTime || new Date().toISOString(), projectedArrival: opts.departureTime || new Date().toISOString() },
      route: { geometry: [from, to], summary: 'At destination', steps: [], googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${to[0]},${to[1]}` },
      confidence: { score: 100, source: 'exact_point' },
    };
  }

  const departureDate = opts.departureTime ? new Date(opts.departureTime) : new Date();
  const departureMinute = departureDate.getHours() * 60 + departureDate.getMinutes();
  const mode = opts.mode || 'driving';
  const preference = opts.preference || 'balanced';

  // Cache Lookup
  const cacheKey = buildCacheKey({
    from,
    to,
    mode,
    departureMin: departureMinute,
    hasLive: !!process.env.GOOGLE_MAPS_API_KEY,
    preference,
  });

  if (!opts.bypassCache) {
    const cached = await getCachedRoute(cacheKey);
    if (cached) return { ...cached, success: true };
  }

  // Provider Resolution Chain
  let rawRoute = null;
  const isLiveDisabled = process.env.DISABLE_LIVE_ROUTING === '1';

  if (!isLiveDisabled) {
    // 1. Google Routes
    rawRoute = await fetchGoogleRoute(from, to, { ...opts, mode });
    // 2. OSRM Multi-Mirror
    if (!rawRoute) {
      rawRoute = await fetchOsrmRoute(from, to, { ...opts, mode });
    }
  }

  // 3. Fallback Heuristic
  if (!rawRoute) {
    rawRoute = calculateRoadNetworkFallback(from, to, { ...opts, mode });
  }

  // Traffic Enrichment
  const trafficMeta = normalizeTrafficMetadata({
    durationSec: rawRoute.durationSeconds,
    durationInTrafficSec: rawRoute.durationInTrafficSeconds,
    provider: rawRoute.provider,
    departureMinute,
    baseCongestion: opts.cityCongestion || 1.15,
    hasRealtimeSignal: rawRoute.hasRealtimeTraffic,
  });

  const durationSeconds = rawRoute.durationSeconds;
  const trafficAwareSeconds = rawRoute.durationInTrafficSeconds || Math.round(durationSeconds * trafficMeta.congestionFactor);
  const trafficAwareMinutes = Math.max(1, Math.round(trafficAwareSeconds / 60));

  const projectedArrival = new Date(departureDate.getTime() + (trafficAwareSeconds * 1000)).toISOString();
  const distanceKm = Math.round((rawRoute.distanceMeters / 1000) * 10) / 10;

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${from[0]},${from[1]}&destination=${to[0]},${to[1]}&travelmode=${mode === 'walking' ? 'walking' : mode === 'transit' ? 'transit' : 'driving'}`;

  const canonicalResponse = {
    success: true,
    origin: { lat: from[0], lon: from[1], name: opts.originName || 'Origin' },
    destination: { lat: to[0], lon: to[1], name: opts.destName || 'Destination' },
    travelMode: mode,
    distance: {
      meters: rawRoute.distanceMeters,
      kilometers: distanceKm,
      formatted: formatDistance(rawRoute.distanceMeters),
    },
    duration: {
      seconds: durationSeconds,
      minutes: Math.max(1, Math.round(durationSeconds / 60)),
      trafficAwareSeconds,
      trafficAwareMinutes,
      formatted: formatDuration(trafficAwareMinutes),
    },
    traffic: trafficMeta,
    timestamps: {
      departure: departureDate.toISOString(),
      projectedArrival,
    },
    route: {
      geometry: rawRoute.geometry || [from, to],
      summary: rawRoute.summary,
      steps: rawRoute.steps || [],
      googleMapsUrl,
    },
    confidence: {
      score: rawRoute.confidenceScore,
      source: rawRoute.provider,
      warnings,
    },
  };

  // Cache canonical result
  await setCachedRoute(cacheKey, canonicalResponse);

  return canonicalResponse;
}

/**
 * Multi-Stop Matrix Routing for Day Itineraries.
 * Computes authoritative routes for consecutive legs.
 *
 * @param {Array<Object>} stops - Array of stops with coords [lat, lon]
 * @param {Object} opts - Global options (departureTime, mode, preference)
 */
async function calculateRouteMatrix(stops = [], opts = {}) {
  if (!Array.isArray(stops) || stops.length < 2) {
    return { success: false, error: 'At least two stops required for matrix routing', legs: [] };
  }

  const baseDeparture = opts.departureTime ? new Date(opts.departureTime) : new Date();
  const legPromises = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const originStop = stops[i];
    const destStop = stops[i + 1];
    legPromises.push(
      calculateRoute(originStop.coords, destStop.coords, {
        ...opts,
        originName: originStop.name,
        destName: destStop.name,
        departureTime: baseDeparture.toISOString(),
      })
    );
  }

  const legs = await Promise.all(legPromises);

  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  let totalTrafficDelayMinutes = 0;

  legs.forEach(legResult => {
    if (legResult && legResult.success) {
      totalDistanceMeters += legResult.distance.meters;
      totalDurationSeconds += legResult.duration.trafficAwareSeconds;
      totalTrafficDelayMinutes += legResult.traffic.delayMinutes;
    }
  });

  return {
    success: true,
    legs,
    totalLegs: legs.length,
    totals: {
      distance: {
        meters: totalDistanceMeters,
        kilometers: Math.round((totalDistanceMeters / 1000) * 10) / 10,
        formatted: formatDistance(totalDistanceMeters),
      },
      duration: {
        trafficAwareSeconds: totalDurationSeconds,
        trafficAwareMinutes: Math.round(totalDurationSeconds / 60),
        formatted: formatDuration(Math.round(totalDurationSeconds / 60)),
      },
      totalTrafficDelayMinutes,
    },
  };
}

module.exports = {
  calculateRoute,
  calculateRouteMatrix,
  formatDistance,
  formatDuration,
  ROAD_NETWORK_FACTOR,
  ROUTING_TIMEOUT_MS,
};
