'use strict';

/**
 * services/routing/routingService.js
 * Authoritative, production-grade routing and travel-time engine.
 * Single source of truth for distances, durations, ETAs, traffic intelligence,
 * and route quality across Indian road corridors.
 */

const { distKm } = require('../../utils/geo');
const { validateRouteCoordinates } = require('./coordinateValidator');
const { normalizeTrafficMetadata, TRAFFIC_STATUS } = require('./trafficClassifier');
const { buildCacheKey, getCachedRoute, setCachedRoute } = require('./routeCache');
const { computeCalibratedCorridorMetrics, classifyCorridor } = require('./corridorSpeedModel');
const { raceOsrmMirrors } = require('./mirrorRacer');
const { evaluateScenicQuality, enrichTurnByTurnSteps, evaluateComfortRating } = require('./routeQualityEngine');

const ROUTING_TIMEOUT_MS = Number(process.env.ROUTING_TIMEOUT_MS) || 4000;

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
 * Calibrated Terrain & Corridor Physics Fallback Engine.
 * Explicitly labeled as a heuristic fallback (NOT a road-network truth).
 */
function calculateHeuristicEstimateFallback(fromCoords, toCoords, opts = {}) {
  const metrics = computeCalibratedCorridorMetrics(fromCoords, toCoords, opts);

  return {
    provider: 'geodesic_heuristic',
    isRoadNetworkTruth: false,
    distanceMeters: metrics.distanceMeters,
    durationSeconds: metrics.totalEstimatedSec,
    durationInTrafficSeconds: null,
    hasRealtimeTraffic: false,
    provenance: 'GEODESIC_HEURISTIC_ESTIMATE',
    geometry: [fromCoords, toCoords],
    summary: `Estimated travel time (${metrics.corridor.description})`,
    steps: [{
      instruction: `Direct route estimate via ${metrics.corridor.corridorType.toLowerCase().replace(/_/g, ' ')}`,
      distanceM: metrics.distanceMeters,
      durationSec: metrics.totalEstimatedSec,
      maneuver: 'depart',
    }],
    confidenceScore: 72,
    corridorType: metrics.corridor.corridorType,
    bottleneckDelayMinutes: metrics.bottleneck.delayMinutes,
    limitations: 'Calculated using terrain-calibrated road winding factor without road-network topology verification.',
  };
}

/**
 * Authoritative Route Calculator (Point-to-Point).
 *
 * @param {Array|Object} origin - [lat, lon] or {lat, lon}
 * @param {Array|Object} destination - [lat, lon] or {lat, lon}
 * @param {Object} opts - Routing options (mode, departureTime, preference, bypassCache, city)
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
      distanceMeters: 0,
      durationSeconds: 0,
      trafficDurationSeconds: 0,
      distance: { meters: 0, kilometers: 0, formatted: '0 km' },
      duration: { seconds: 0, minutes: 0, trafficAwareSeconds: 0, trafficAwareMinutes: 0, formatted: '0 mins' },
      traffic: { status: TRAFFIC_STATUS.LOW, congestionFactor: 1.0, delayMinutes: 0, provenance: 'route_estimate', freshness: new Date().toISOString(), label: 'Same location' },
      timestamps: { departure: opts.departureTime || new Date().toISOString(), projectedArrival: opts.departureTime || new Date().toISOString() },
      route: { geometry: [from, to], summary: 'At destination', steps: [], googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${to[0]},${to[1]}` },
      confidence: { score: 100, source: 'exact_point' },
    };
  }

  const departureDate = opts.departureTime ? new Date(opts.departureTime) : new Date();
  const departureMinute = departureDate.getHours() * 60 + departureDate.getMinutes();
  const dayOfWeek = departureDate.getDay();
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
    // 2. High-Concurrency OSRM Mirror Racing
    if (!rawRoute) {
      rawRoute = await raceOsrmMirrors(from, to, { ...opts, mode });
    }
  }

  // 3. Calibrated Terrain Fallback
  if (!rawRoute) {
    rawRoute = calculateHeuristicEstimateFallback(from, to, { ...opts, mode });
  }

  // Corridor & Quality Assessment
  const corridorMeta = classifyCorridor(from, to, { mode });
  const scenicMeta = evaluateScenicQuality(from, to, rawRoute.steps || [], corridorMeta.corridorType);
  const comfortMeta = evaluateComfortRating(corridorMeta.corridorType, mode);
  const enrichedSteps = enrichTurnByTurnSteps(rawRoute.steps || [], rawRoute.geometry);

  // Traffic Enrichment
  const trafficMeta = normalizeTrafficMetadata({
    durationSec: rawRoute.durationSeconds,
    durationInTrafficSec: rawRoute.durationInTrafficSeconds,
    provider: rawRoute.provider,
    departureMinute,
    dayOfWeek,
    city: opts.city || '',
    weatherRainMm: opts.weatherRainMm || 0,
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
    origin: { lat: from[0], lon: from[1], name: opts.originName || 'Origin', id: opts.originId || null },
    destination: { lat: to[0], lon: to[1], name: opts.destName || 'Destination', id: opts.destId || null },
    distanceMeters: rawRoute.distanceMeters,
    durationSeconds,
    trafficDurationSeconds: trafficAwareSeconds,
    departureAt: departureDate.toISOString(),
    arrivalAt: projectedArrival,
    travelMode: mode,
    provider: rawRoute.provider,
    trafficStatus: trafficMeta.status,
    provenance: rawRoute.provenance || 'PROVIDER_DERIVED',
    fallback: rawRoute.provider === 'geodesic_heuristic',
    timestamp: new Date().toISOString(),
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
      steps: enrichedSteps,
      googleMapsUrl,
      corridorType: corridorMeta.corridorType,
      isScenicRoute: scenicMeta.isScenic,
      scenicScore: scenicMeta.score,
      comfortTier: comfortMeta.tier,
    },
    confidence: {
      score: rawRoute.confidenceScore,
      level: rawRoute.confidenceScore >= 85 ? 'HIGH' : (rawRoute.confidenceScore >= 70 ? 'MEDIUM' : 'LOW'),
      source: rawRoute.provider,
      isRoadNetworkTruth: rawRoute.isRoadNetworkTruth !== false,
      provenance: rawRoute.provenance || 'PROVIDER_DERIVED',
      limitations: rawRoute.limitations || null,
      warnings,
    },
  };

  // Cache canonical result
  await setCachedRoute(cacheKey, canonicalResponse);

  return canonicalResponse;
}

/**
 * Multi-Stop Matrix Routing for Day Itineraries.
 * Parallelized calculation with chronological timestamp propagation.
 *
 * @param {Array<Object>} stops - Array of stops with coords [lat, lon]
 * @param {Object} opts - Global options (departureTime, mode, preference, city)
 */
async function calculateRouteMatrix(stops = [], opts = {}) {
  if (!Array.isArray(stops) || stops.length < 2) {
    return { success: false, error: 'At least two stops required for matrix routing', legs: [] };
  }

  const departureBase = opts.departureTime ? new Date(opts.departureTime) : new Date();

  // Phase 1: Fast Parallel Evaluation of Leg Geometry & Base Metrics
  const legPairs = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const originStop = stops[i];
    const destStop = stops[i + 1];
    const originCoords = originStop.coords || [originStop.lat, originStop.lon];
    const destCoords = destStop.coords || [destStop.lat, destStop.lon];

    legPairs.push({
      originStop,
      destStop,
      originCoords,
      destCoords,
      legIndex: i,
    });
  }

  const rawLegs = await Promise.all(
    legPairs.map(pair =>
      calculateRoute(pair.originCoords, pair.destCoords, {
        ...opts,
        originName: pair.originStop.name,
        destName: pair.destStop.name,
        departureTime: departureBase.toISOString(),
      })
    )
  );

  // Phase 2: Chronological Timestamp & Visit Propagation
  let currentDeparture = new Date(departureBase.getTime());
  const finalLegs = [];
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  let totalTrafficDelayMinutes = 0;

  for (let i = 0; i < rawLegs.length; i++) {
    const legResult = rawLegs[i];
    const destStop = legPairs[i].destStop;

    if (legResult && legResult.success) {
      const legDurationSec = legResult.duration.trafficAwareSeconds || legResult.duration.seconds || 600;
      const legArrival = new Date(currentDeparture.getTime() + (legDurationSec * 1000));
      const visitMinutes = Number(destStop.vt || destStop.durationMin || destStop.visitMinutes || 45);
      const nextDeparture = new Date(legArrival.getTime() + (visitMinutes * 60 * 1000));

      const updatedLeg = {
        ...legResult,
        departureAt: currentDeparture.toISOString(),
        arrivalAt: legArrival.toISOString(),
        timestamps: {
          departure: currentDeparture.toISOString(),
          projectedArrival: legArrival.toISOString(),
        },
      };

      finalLegs.push(updatedLeg);
      totalDistanceMeters += legResult.distance.meters;
      totalDurationSeconds += legDurationSec;
      totalTrafficDelayMinutes += (legResult.traffic?.delayMinutes || 0);

      currentDeparture = nextDeparture;
    } else {
      finalLegs.push(legResult);
    }
  }

  return {
    success: true,
    legs: finalLegs,
    totalLegs: finalLegs.length,
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
  ROUTING_TIMEOUT_MS,
};
