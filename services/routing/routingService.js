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
const { calibrateIndianEta } = require('./etaCalibrationEngine');
const { checkRouteForClosures, computeClosureBypassPoint } = require('./roadClosureRegistry');

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
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromCoords[0]},${fromCoords[1]}&destination=${toCoords[0]},${toCoords[1]}&mode=${mode}&traffic_model=best_guess${departure}&alternatives=true&key=${key}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || ROUTING_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.status !== 'OK' || !body.routes?.[0]?.legs?.[0]) return null;

    const candidateRoutes = body.routes.slice(0, 3).map((r, rIdx) => {
      const leg = r.legs[0];
      const durationSec = leg.duration?.value || Math.round((leg.distance?.value || 1000) / 7.5);
      const durationInTrafficSec = leg.duration_in_traffic?.value || durationSec;
      const distanceM = leg.distance?.value || Math.round(distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]) * 1420);

      const steps = (leg.steps || []).map(s => ({
        instruction: (s.html_instructions || '').replace(/<[^>]*>?/gm, ''),
        distanceM: s.distance?.value || 0,
        durationSec: s.duration?.value || 0,
        maneuver: s.maneuver || 'continue',
      }));

      const hasLive = Boolean(leg.duration_in_traffic?.value);
      return {
        routeIndex: rIdx,
        provider: 'google',
        routeType: hasLive ? 'LIVE_TRAFFIC_ROUTE' : 'ROAD_NETWORK_ESTIMATE',
        provenance: hasLive ? 'LIVE_TRAFFIC' : 'ROAD_NETWORK_ESTIMATE',
        distanceMeters: distanceM,
        durationSeconds: durationSec,
        durationInTrafficSeconds: durationInTrafficSec,
        hasRealtimeTraffic: hasLive,
        summary: r.summary || (rIdx === 0 ? 'Fastest route' : `Alternate route ${rIdx}`),
        steps,
        confidenceLevel: 'HIGH',
        confidenceScore: 92,
      };
    });

    const primary = candidateRoutes[0];
    return {
      ...primary,
      routes: candidateRoutes,
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

  const primary = {
    routeIndex: 0,
    provider: 'geodesic_heuristic',
    routeType: 'GEODESIC_HEURISTIC_ESTIMATE',
    provenance: 'GEODESIC_HEURISTIC_ESTIMATE',
    isRoadNetworkTruth: false,
    distanceMeters: metrics.distanceMeters,
    durationSeconds: metrics.totalEstimatedSec,
    durationInTrafficSeconds: null,
    hasRealtimeTraffic: false,
    geometry: [fromCoords, toCoords],
    summary: `Primary route (${metrics.corridor.description})`,
    steps: [{
      instruction: `Direct route estimate via ${metrics.corridor.corridorType.toLowerCase().replace(/_/g, ' ')}`,
      distanceM: metrics.distanceMeters,
      durationSec: metrics.totalEstimatedSec,
      maneuver: 'depart',
    }],
    confidenceLevel: 'LOW',
    confidenceScore: 65,
    corridorType: metrics.corridor.corridorType,
    bottleneckDelayMinutes: metrics.bottleneck.delayMinutes,
    limitations: 'Calculated using terrain-calibrated road winding factor without road-network topology verification.',
  };

  // Alternate route via outer bypass perimeter
  const altDist = Math.round(metrics.distanceMeters * 1.14);
  const altDur = Math.round(metrics.totalEstimatedSec * 1.10);
  const midLat = (fromCoords[0] + toCoords[0]) / 2 + 0.015;
  const midLon = (fromCoords[1] + toCoords[1]) / 2 + 0.015;
  const alternate = {
    routeIndex: 1,
    provider: 'geodesic_heuristic',
    routeType: 'GEODESIC_HEURISTIC_ESTIMATE',
    provenance: 'GEODESIC_HEURISTIC_ESTIMATE',
    isRoadNetworkTruth: false,
    distanceMeters: altDist,
    durationSeconds: altDur,
    durationInTrafficSeconds: null,
    hasRealtimeTraffic: false,
    geometry: [fromCoords, [midLat, midLon], toCoords],
    summary: 'Alternate bypass corridor',
    steps: [{
      instruction: 'Alternate route via outer ring perimeter',
      distanceM: altDist,
      durationSec: altDur,
      maneuver: 'depart',
    }],
    confidenceLevel: 'LOW',
    confidenceScore: 60,
    corridorType: metrics.corridor.corridorType,
  };

  return {
    ...primary,
    routes: [primary, alternate],
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

  // Multi-route Candidates List
  let candidateList = Array.isArray(rawRoute.routes) && rawRoute.routes.length > 0
    ? rawRoute.routes
    : [rawRoute];

  // Corridor & Quality Assessment
  const corridorMeta = classifyCorridor(from, to, { mode });

  // Process all candidate routes with ETA calibration and closure checks
  const evaluatedRoutes = candidateList.map((cand, idx) => {
    const calibrated = calibrateIndianEta({
      from,
      to,
      distanceMeters: cand.distanceMeters,
      rawDurationSeconds: cand.durationSeconds,
      durationInTrafficSeconds: cand.durationInTrafficSeconds,
      provider: cand.provider,
      mode,
      departureTime: departureDate,
      city: opts.city,
      weatherRainMm: opts.weatherRainMm,
    });

    const candSteps = cand.steps || [];
    const enriched = enrichTurnByTurnSteps(candSteps, cand.geometry);
    const scenic = evaluateScenicQuality(from, to, candSteps, corridorMeta.corridorType);
    const comfort = evaluateComfortRating(corridorMeta.corridorType, mode);
    const closureCheck = checkRouteForClosures(cand.geometry || [from, to], {
      departureTime: departureDate,
      city: opts.city,
    });

    return {
      index: idx,
      id: `route_option_${idx + 1}`,
      provider: cand.provider,
      summary: cand.summary || (idx === 0 ? 'Fastest route' : `Alternate route ${idx}`),
      distanceMeters: cand.distanceMeters,
      distanceKm: Math.round((cand.distanceMeters / 1000) * 10) / 10,
      durationSeconds: calibrated.durationSeconds,
      trafficDurationSeconds: calibrated.trafficDurationSeconds,
      durationMinutes: calibrated.baseDurationMinutes || Math.max(1, Math.round(calibrated.durationSeconds / 60)),
      trafficDurationMinutes: calibrated.trafficDurationMinutes,
      geometry: cand.geometry || [from, to],
      steps: enriched,
      hasRealtimeTraffic: cand.hasRealtimeTraffic || calibrated.isAuthoritativeLive,
      trafficStatus: calibrated.trafficStatus || TRAFFIC_STATUS.LOW,
      congestionFactor: calibrated.congestionFactor || 1.0,
      hasClosure: closureCheck.hasClosure,
      closureDetails: closureCheck.primaryClosure,
      allClosures: closureCheck.closures,
      status: closureCheck.hasClosure ? 'ROAD_CLOSED' : 'OPEN',
      corridorType: corridorMeta.corridorType,
      isScenicRoute: scenic.isScenic,
      scenicScore: scenic.score,
      comfortTier: comfort.tier,
      confidenceScore: cand.confidenceScore || 80,
      confidenceLevel: cand.confidenceLevel || 'MEDIUM',
    };
  });

  // Road Closure Detection & Automatic Alternate Rerouting
  let activeIndex = 0;
  let reroutedDueToClosure = false;
  let closureAlert = null;

  if (evaluatedRoutes[0].hasClosure) {
    const primaryClosure = evaluatedRoutes[0].closureDetails;
    closureAlert = {
      hasClosure: true,
      severity: primaryClosure?.severity || 'CRITICAL',
      closureName: primaryClosure?.name || 'Road Closed',
      corridorName: primaryClosure?.corridorName || 'Transit corridor',
      reason: primaryClosure?.reason || 'Corridor closed to transit',
      diversionAdvice: primaryClosure?.diversionAdvice || 'Use recommended alternate route',
      alertMessage: `Route via ${primaryClosure?.corridorName || 'primary corridor'} is closed (${primaryClosure?.reason || 'road blocked'}). Automatically rerouted via alternate route.`,
    };

    // Find the first open route
    const openIdx = evaluatedRoutes.findIndex(r => !r.hasClosure);
    if (openIdx > 0) {
      activeIndex = openIdx;
      reroutedDueToClosure = true;
    } else {
      // All candidates hit the closure; synthesize a dynamic bypass route
      const bypassPt = computeClosureBypassPoint(from, to, primaryClosure);
      try {
        const leg1 = await raceOsrmMirrors(from, bypassPt, { mode, timeoutMs: 2000 });
        const leg2 = await raceOsrmMirrors(bypassPt, to, { mode, timeoutMs: 2000 });
        if (leg1 && leg2 && Array.isArray(leg1.geometry) && Array.isArray(leg2.geometry)) {
          const bypassGeom = [...leg1.geometry, ...leg2.geometry];
          const bypassDist = (leg1.distanceMeters || 0) + (leg2.distanceMeters || 0);
          const bypassCal = calibrateIndianEta({
            from,
            to,
            distanceMeters: bypassDist,
            provider: 'osrm',
            mode,
            departureTime: departureDate,
            city: opts.city,
          });

          const bypassRoute = {
            index: evaluatedRoutes.length,
            id: 'route_option_bypass',
            provider: 'osrm_bypass',
            summary: `Bypass via ${primaryClosure.corridorName} detour`,
            distanceMeters: bypassDist,
            distanceKm: Math.round((bypassDist / 1000) * 10) / 10,
            durationSeconds: bypassCal.durationSeconds,
            trafficDurationSeconds: bypassCal.trafficDurationSeconds,
            durationMinutes: Math.max(1, Math.round(bypassCal.durationSeconds / 60)),
            trafficDurationMinutes: bypassCal.trafficDurationMinutes,
            geometry: bypassGeom,
            steps: [...(leg1.steps || []), ...(leg2.steps || [])],
            hasRealtimeTraffic: false,
            trafficStatus: bypassCal.trafficStatus || TRAFFIC_STATUS.LOW,
            congestionFactor: bypassCal.congestionFactor || 1.1,
            hasClosure: false,
            closureDetails: null,
            allClosures: [],
            status: 'OPEN',
            corridorType: corridorMeta.corridorType,
            isScenicRoute: false,
            scenicScore: 50,
            comfortTier: 'GOOD',
            confidenceScore: 78,
            confidenceLevel: 'MEDIUM',
          };
          evaluatedRoutes.push(bypassRoute);
          activeIndex = evaluatedRoutes.length - 1;
          reroutedDueToClosure = true;
        }
      } catch (_bypassErr) {
        // Fall back to primary route with warning
      }
    }
  }

  // Calculate fastest/shortest metrics among viable routes (or all)
  const viableRoutes = evaluatedRoutes.filter(r => !r.hasClosure);
  const benchmarkSet = viableRoutes.length > 0 ? viableRoutes : evaluatedRoutes;
  const fastestDuration = Math.min(...benchmarkSet.map(r => r.trafficDurationSeconds));
  const shortestDistance = Math.min(...benchmarkSet.map(r => r.distanceMeters));

  const candidateDtos = evaluatedRoutes.map((r) => {
    const isFastest = r.trafficDurationSeconds === fastestDuration && !r.hasClosure;
    const isShortest = r.distanceMeters === shortestDistance;
    const timeDeltaMinutes = Math.max(0, Math.round((r.trafficDurationSeconds - fastestDuration) / 60));
    const isRecommended = (r.index === activeIndex);

    let summaryLabel = r.summary;
    if (r.hasClosure) {
      summaryLabel = `⛔ Closed: ${r.summary}`;
    } else if (isFastest) {
      summaryLabel = `${r.summary} (Fastest route)`;
    } else if (timeDeltaMinutes > 0) {
      summaryLabel = `${r.summary} (+${timeDeltaMinutes} mins)`;
    }

    return {
      index: r.index,
      id: r.id,
      summary: summaryLabel,
      baseSummary: r.summary,
      distance: {
        meters: r.distanceMeters,
        kilometers: r.distanceKm,
        formatted: formatDistance(r.distanceMeters),
      },
      duration: {
        seconds: r.durationSeconds,
        minutes: r.durationMinutes,
        trafficAwareSeconds: r.trafficDurationSeconds,
        trafficAwareMinutes: r.trafficDurationMinutes,
        formatted: formatDuration(r.trafficDurationMinutes),
      },
      timeDeltaMinutes,
      timeDeltaFormatted: timeDeltaMinutes > 0 ? `+${timeDeltaMinutes} min` : 'Fastest',
      isFastest,
      isShortest,
      isRecommended,
      hasClosure: r.hasClosure,
      closureDetails: r.closureDetails,
      status: r.status,
      geometry: r.geometry,
      steps: r.steps,
      trafficStatus: r.trafficStatus,
      congestionFactor: r.congestionFactor,
    };
  });

  const selectedRoute = evaluatedRoutes[activeIndex] || evaluatedRoutes[0];
  const projectedArrival = new Date(departureDate.getTime() + (selectedRoute.trafficDurationSeconds * 1000)).toISOString();
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${from[0]},${from[1]}&destination=${to[0]},${to[1]}&travelmode=${mode === 'walking' ? 'walking' : mode === 'transit' ? 'transit' : 'driving'}`;

  const isFallback = selectedRoute.provider === 'geodesic_heuristic';
  const routeType = selectedRoute.routeType || (
    selectedRoute.provider === 'google' && selectedRoute.hasRealtimeTraffic
      ? 'LIVE_TRAFFIC_ROUTE'
      : (selectedRoute.provider === 'osrm' ? 'ROAD_NETWORK_ESTIMATE' : 'GEODESIC_HEURISTIC_ESTIMATE')
  );
  const fallbackReason = isFallback
    ? (isLiveDisabled ? 'Live routing explicitly disabled by configuration' : 'Live and road-network providers (Google, OSRM) unavailable or timed out')
    : null;

  const canonicalResponse = {
    success: true,
    origin: { lat: from[0], lon: from[1], name: opts.originName || 'Origin', id: opts.originId || null },
    destination: { lat: to[0], lon: to[1], name: opts.destName || 'Destination', id: opts.destId || null },
    distanceMeters: selectedRoute.distanceMeters,
    durationSeconds: selectedRoute.durationSeconds,
    trafficDurationSeconds: selectedRoute.trafficDurationSeconds,
    departureAt: departureDate.toISOString(),
    arrivalAt: projectedArrival,
    travelMode: mode,
    provider: selectedRoute.provider,
    routeType,
    fallbackReason,
    dataFreshness: new Date().toISOString(),
    trafficStatus: selectedRoute.trafficStatus,
    provenance: rawRoute.provenance || 'PROVIDER_DERIVED',
    fallback: isFallback,
    timestamp: new Date().toISOString(),
    distance: {
      meters: selectedRoute.distanceMeters,
      kilometers: selectedRoute.distanceKm,
      formatted: formatDistance(selectedRoute.distanceMeters),
    },
    duration: {
      seconds: selectedRoute.durationSeconds,
      minutes: selectedRoute.durationMinutes,
      trafficAwareSeconds: selectedRoute.trafficDurationSeconds,
      trafficAwareMinutes: selectedRoute.trafficDurationMinutes,
      formatted: formatDuration(selectedRoute.trafficDurationMinutes),
    },
    traffic: {
      status: selectedRoute.trafficStatus,
      congestionFactor: selectedRoute.congestionFactor,
      delayMinutes: Math.max(0, Math.round((selectedRoute.trafficDurationSeconds - selectedRoute.durationSeconds) / 60)),
      provenance: selectedRoute.hasRealtimeTraffic ? 'live_traffic' : 'predicted_traffic',
      freshness: new Date().toISOString(),
      label: `${selectedRoute.trafficStatus} traffic`,
    },
    timestamps: {
      departure: departureDate.toISOString(),
      projectedArrival,
    },
    route: {
      geometry: selectedRoute.geometry || [from, to],
      summary: selectedRoute.summary,
      steps: selectedRoute.steps,
      googleMapsUrl,
      corridorType: selectedRoute.corridorType,
      isScenicRoute: selectedRoute.isScenicRoute,
      scenicScore: selectedRoute.scenicScore,
      comfortTier: selectedRoute.comfortTier,
    },
    // Multi-Route Google Maps Extensions
    routes: candidateDtos,
    activeRouteIndex: activeIndex,
    hasClosure: selectedRoute.hasClosure,
    closureDetails: selectedRoute.closureDetails,
    reroutedDueToClosure,
    closureAlert,
    confidence: {
      score: selectedRoute.confidenceScore,
      level: selectedRoute.confidenceLevel || (selectedRoute.confidenceScore >= 85 ? 'HIGH' : (selectedRoute.confidenceScore >= 70 ? 'MEDIUM' : 'LOW')),
      source: selectedRoute.provider,
      routeType,
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
      hasAnyClosure: finalLegs.some(l => l?.hasClosure || l?.closureAlert),
      reroutedLegsCount: finalLegs.filter(l => l?.reroutedDueToClosure).length,
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
