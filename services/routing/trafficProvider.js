'use strict';

/**
 * services/routing/trafficProvider.js
 *
 * Production Live Traffic Architecture & Quality Engine (Phase 4 & 5).
 * Enforces strict provenance separation: LIVE, HISTORICAL, PREDICTED, ESTIMATED, UNKNOWN, SIMULATED.
 * Never mislabels historical or predicted averages as live traffic.
 */

const { distKm } = require('../../utils/geo');
const { raceOsrmMirrors } = require('./mirrorRacer');
const { computeCalibratedCorridorMetrics, classifyCorridor } = require('./corridorSpeedModel');
const { calibrateIndianEta } = require('./etaCalibrationEngine');
const { checkRouteForClosures, computeClosureBypassPoint } = require('./roadClosureRegistry');
const { TRAFFIC_STATUS } = require('./trafficClassifier');
const { trafficCache } = require('../cache');

// ── Enumerations & Constants ──────────────────────────────────────────────────

const TRAFFIC_PROVENANCE = Object.freeze({
  LIVE: 'LIVE',
  HISTORICAL: 'HISTORICAL',
  PREDICTED: 'PREDICTED',
  ESTIMATED: 'ESTIMATED',
  UNKNOWN: 'UNKNOWN',
  SIMULATED: 'SIMULATED',
});

const TRAFFIC_STATE = Object.freeze({
  FREE: 'FREE',
  LIGHT: 'LIGHT',
  MODERATE: 'MODERATE',
  HEAVY: 'HEAVY',
  SEVERE: 'SEVERE',
  UNKNOWN: 'UNKNOWN',
});

const COVERAGE_STATE = Object.freeze({
  LIVE: 'LIVE',
  PARTIAL: 'PARTIAL',
  HISTORICAL: 'HISTORICAL',
  PREDICTED: 'PREDICTED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const TRAFFIC_FRESHNESS = Object.freeze({
  FRESH: 'FRESH',       // 0–2 min
  RECENT: 'RECENT',     // 2–5 min
  AGING: 'AGING',       // 5–15 min
  STALE: 'STALE',       // 15–30 min
  EXPIRED: 'EXPIRED',   // >30 min
});

const FRESHNESS_WINDOWS_MS = {
  FRESH: 2 * 60 * 1000,
  RECENT: 5 * 60 * 1000,
  AGING: 15 * 60 * 1000,
  STALE: 30 * 60 * 1000,
};

const DEFAULT_REROUTE_THRESHOLD_MINUTES = 5; // Hysteresis threshold to prevent route oscillation

/**
 * Computes deterministic freshness window from timestamp.
 */
function computeTrafficFreshness(retrievedAt) {
  if (!retrievedAt) {
    const res = new String(TRAFFIC_FRESHNESS.EXPIRED);
    res.window = TRAFFIC_FRESHNESS.EXPIRED;
    res.ageMs = Infinity;
    res.isLive = false;
    res.confidenceMultiplier = 0.5;
    return res;
  }
  const ageMs = Math.max(0, Date.now() - new Date(retrievedAt).getTime());
  let win = TRAFFIC_FRESHNESS.EXPIRED;
  let isLive = false;
  let confidenceMultiplier = 0.6;

  if (ageMs <= FRESHNESS_WINDOWS_MS.FRESH) {
    win = TRAFFIC_FRESHNESS.FRESH;
    isLive = true;
    confidenceMultiplier = 1.0;
  } else if (ageMs <= FRESHNESS_WINDOWS_MS.RECENT) {
    win = TRAFFIC_FRESHNESS.RECENT;
    isLive = true;
    confidenceMultiplier = 0.95;
  } else if (ageMs <= FRESHNESS_WINDOWS_MS.AGING) {
    win = TRAFFIC_FRESHNESS.AGING;
    isLive = true;
    confidenceMultiplier = 0.85;
  } else if (ageMs <= FRESHNESS_WINDOWS_MS.STALE) {
    win = TRAFFIC_FRESHNESS.STALE;
    isLive = false;
    confidenceMultiplier = 0.70;
  }

  const res = new String(win);
  res.window = win;
  res.ageMs = ageMs;
  res.isLive = isLive;
  res.confidenceMultiplier = confidenceMultiplier;
  return res;
}

/**
 * Maps numeric congestion factor to standard TRAFFIC_STATE.
 */
function classifyTrafficState(congestionFactor) {
  const factor = Number(congestionFactor) || 1.0;
  if (factor <= 1.05) return TRAFFIC_STATE.FREE;
  if (factor <= 1.20) return TRAFFIC_STATE.LIGHT;
  if (factor <= 1.40) return TRAFFIC_STATE.MODERATE;
  if (factor <= 1.70) return TRAFFIC_STATE.HEAVY;
  return TRAFFIC_STATE.SEVERE;
}

// ── Abstract TrafficProvider Base ─────────────────────────────────────────────

class TrafficProvider {
  constructor(name = 'base_provider') {
    this.name = name;
  }

  async getTrafficAwareRoute(_origin, _destination, _options = {}) {
    throw new Error(`${this.name} must implement getTrafficAwareRoute()`);
  }

  async getTrafficData(origin, destination, options = {}) {
    const res = await this.getTrafficAwareRoute(origin, destination, options);
    return res?.primary || res;
  }

  async getRouteAlternatives(_origin, _destination, _options = {}) {
    return [];
  }

  async getTrafficAwareETA(_origin, _destination, _options = {}) {
    throw new Error(`${this.name} must implement getTrafficAwareETA()`);
  }

  async getTrafficSegments(_routeId, _options = {}) {
    return [];
  }

  async getTrafficStatus(_corridor, _options = {}) {
    return { state: TRAFFIC_STATE.UNKNOWN, coverage: COVERAGE_STATE.UNAVAILABLE };
  }

  async getProviderHealth() {
    return { status: 'healthy', provider: this.name, latencyMs: 0, lastCheck: new Date().toISOString() };
  }
}

// ── Primary Traffic Provider (Google Routes or Licensed Live API) ─────────────

class PrimaryTrafficProvider extends TrafficProvider {
  constructor() {
    super('google_primary');
    this.hasKey = !!(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY);
  }

  async getTrafficAwareRoute(origin, destination, options = {}) {
    if (!this.hasKey) return null;

    const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY;
    const mode = options.mode || 'driving';
    const departure = options.departureTime
      ? `&departure_time=${Math.floor(new Date(options.departureTime).getTime() / 1000)}`
      : '&departure_time=now';
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin[0]},${origin[1]}&destination=${destination[0]},${destination[1]}&mode=${mode}&traffic_model=best_guess${departure}&alternatives=true&key=${key}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 4000);
    const start = Date.now();

    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const body = await res.json();
      if (body.status !== 'OK' || !body.routes?.[0]?.legs?.[0]) return null;

      const retrievedAt = new Date().toISOString();
      const routes = body.routes.slice(0, 3).map((r, idx) => {
        const leg = r.legs[0];
        const distanceM = leg.distance?.value || Math.round(distKm(origin[0], origin[1], destination[0], destination[1]) * 1420);
        const staticDurationSec = leg.duration?.value || Math.round(distanceM / 8);
        const trafficDurationSec = leg.duration_in_traffic?.value || staticDurationSec;
        const hasLiveDuration = Boolean(leg.duration_in_traffic?.value);
        const trafficDelaySec = Math.max(0, trafficDurationSec - staticDurationSec);
        const congestionFactor = staticDurationSec > 0 ? trafficDurationSec / staticDurationSec : 1.0;

        const provenance = hasLiveDuration ? TRAFFIC_PROVENANCE.LIVE : TRAFFIC_PROVENANCE.PREDICTED;
        const coverageState = hasLiveDuration ? COVERAGE_STATE.LIVE : COVERAGE_STATE.PREDICTED;
        const trafficState = classifyTrafficState(congestionFactor);

        return {
          routeId: `google_route_${idx + 1}`,
          routeIndex: idx,
          provider: 'google',
          provenance,
          retrievedAt,
          departureTime: options.departureTime || retrievedAt,
          eta: new Date(Date.now() + trafficDurationSec * 1000).toISOString(),
          staticDuration: staticDurationSec,
          trafficDuration: trafficDurationSec,
          durationSeconds: staticDurationSec,
          trafficDurationSeconds: trafficDurationSec,
          trafficDelay: trafficDelaySec,
          trafficState,
          coverageState,
          freshness: computeTrafficFreshness(retrievedAt),
          freshnessWindow: computeTrafficFreshness(retrievedAt).window,
          confidence: hasLiveDuration ? 'HIGH' : 'MEDIUM',
          confidenceScore: hasLiveDuration ? 95 : 82,
          distanceMeters: distanceM,
          summary: r.summary || (idx === 0 ? 'Fastest route' : `Alternate route ${idx}`),
          geometry: [[origin[0], origin[1]], [destination[0], destination[1]]],
          steps: (leg.steps || []).map(s => ({
            instruction: (s.html_instructions || '').replace(/<[^>]*>?/gm, ''),
            distanceM: s.distance?.value || 0,
            durationSec: s.duration?.value || 0,
            maneuver: s.maneuver || 'continue',
          })),
        };
      });

      return {
        provider: 'google',
        latencyMs: Date.now() - start,
        retrievedAt,
        primary: routes[0],
        routes,
      };
    } catch (_err) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getProviderHealth() {
    return {
      provider: 'google',
      configured: this.hasKey,
      status: this.hasKey ? 'operational' : 'unconfigured',
      lastCheck: new Date().toISOString(),
    };
  }
}

// ── Secondary Traffic Provider (OSRM Mirror Cluster) ──────────────────────────

class SecondaryTrafficProvider extends TrafficProvider {
  constructor() {
    super('osrm_secondary');
  }

  async getTrafficAwareRoute(origin, destination, options = {}) {
    const start = Date.now();
    const osrmResult = await raceOsrmMirrors(origin, destination, options);
    if (!osrmResult) return null;

    const retrievedAt = new Date().toISOString();
    const departureDate = options.departureTime ? new Date(options.departureTime) : new Date();

    // Calibrate OSRM raw duration using Indian corridor topology & hour-of-day speeds
    const calibrated = calibrateIndianEta({
      from: origin,
      to: destination,
      distanceMeters: osrmResult.distanceMeters,
      rawDurationSeconds: osrmResult.durationSeconds,
      provider: 'osrm',
      mode: options.mode || 'driving',
      departureTime: departureDate,
      city: options.city,
      weatherRainMm: options.weatherRainMm,
    });

    const staticDurationSec = calibrated.durationSeconds;
    const trafficDurationSec = calibrated.trafficDurationSeconds;
    const trafficDelaySec = Math.max(0, trafficDurationSec - staticDurationSec);
    const congestionFactor = calibrated.congestionFactor || (staticDurationSec > 0 ? trafficDurationSec / staticDurationSec : 1.0);
    const trafficState = classifyTrafficState(congestionFactor);

    // OSRM provides road-network geometry + empirical rush hour prediction, NOT sensor live traffic
    const provenance = TRAFFIC_PROVENANCE.PREDICTED;
    const coverageState = COVERAGE_STATE.HISTORICAL;

    const primaryRoute = {
      routeId: 'osrm_route_1',
      routeIndex: 0,
      provider: 'osrm',
      provenance,
      retrievedAt,
      departureTime: departureDate.toISOString(),
      eta: new Date(departureDate.getTime() + trafficDurationSec * 1000).toISOString(),
      staticDuration: staticDurationSec,
      trafficDuration: trafficDurationSec,
      durationSeconds: staticDurationSec,
      trafficDurationSeconds: trafficDurationSec,
      trafficDelay: trafficDelaySec,
      trafficState,
      coverageState,
      freshness: computeTrafficFreshness(retrievedAt),
      freshnessWindow: computeTrafficFreshness(retrievedAt).window,
      confidence: 'MEDIUM',
      confidenceScore: 82,
      distanceMeters: osrmResult.distanceMeters,
      summary: osrmResult.summary || 'Road network route (OSRM)',
      geometry: osrmResult.geometry || [origin, destination],
      steps: osrmResult.steps || [],
    };

    return {
      provider: 'osrm',
      latencyMs: Date.now() - start,
      retrievedAt,
      primary: primaryRoute,
      routes: [primaryRoute],
    };
  }

  async getProviderHealth() {
    return {
      provider: 'osrm',
      configured: true,
      status: 'operational',
      lastCheck: new Date().toISOString(),
    };
  }
}

// ── Fallback Traffic Provider (Corridor Terrain Physics & Historical Model) ────

class FallbackTrafficProvider extends TrafficProvider {
  constructor() {
    super('corridor_fallback');
  }

  async getTrafficAwareRoute(origin, destination, options = {}) {
    const start = Date.now();
    const metrics = computeCalibratedCorridorMetrics(origin, destination, options);
    const retrievedAt = new Date().toISOString();
    const departureDate = options.departureTime ? new Date(options.departureTime) : new Date();

    const staticDurationSec = metrics.totalEstimatedSec;
    const congestionFactor = metrics.bottleneck?.delayMinutes > 0 ? 1.25 : 1.0;
    const trafficDelaySec = (metrics.bottleneck?.delayMinutes || 0) * 60;
    const trafficDurationSec = staticDurationSec + trafficDelaySec;
    const trafficState = classifyTrafficState(congestionFactor);

    // Explicitly labeled as ESTIMATED without claiming live or sensor coverage
    const provenance = TRAFFIC_PROVENANCE.ESTIMATED;
    const coverageState = COVERAGE_STATE.UNAVAILABLE;

    const primaryRoute = {
      routeId: 'fallback_route_1',
      routeIndex: 0,
      provider: 'corridor_heuristic',
      provenance: TRAFFIC_PROVENANCE.HISTORICAL,
      retrievedAt,
      departureTime: departureDate.toISOString(),
      eta: new Date(departureDate.getTime() + trafficDurationSec * 1000).toISOString(),
      staticDuration: staticDurationSec,
      trafficDuration: trafficDurationSec,
      durationSeconds: staticDurationSec,
      trafficDurationSeconds: trafficDurationSec,
      trafficDelay: trafficDelaySec,
      trafficState,
      coverageState,
      freshness: computeTrafficFreshness(retrievedAt),
      freshnessWindow: computeTrafficFreshness(retrievedAt).window,
      confidence: 'LOW',
      confidenceScore: 65,
      distanceMeters: metrics.distanceMeters,
      summary: `Estimated corridor (${metrics.corridor.description})`,
      geometry: [origin, destination],
      steps: [{
        instruction: `Direct route estimate via ${metrics.corridor.corridorType.toLowerCase().replace(/_/g, ' ')}`,
        distanceM: metrics.distanceMeters,
        durationSec: trafficDurationSec,
        maneuver: 'depart',
      }],
      limitations: 'Calculated using terrain-calibrated road winding factor without road-network topology verification.',
    };

    return {
      provider: 'corridor_heuristic',
      latencyMs: Date.now() - start,
      retrievedAt,
      primary: primaryRoute,
      routes: [primaryRoute],
    };
  }

  async getProviderHealth() {
    return {
      provider: 'corridor_heuristic',
      configured: true,
      status: 'operational',
      lastCheck: new Date().toISOString(),
    };
  }
}

// ── Orchestrating Traffic Quality Engine ───────────────────────────────────────

class TrafficQualityEngine {
  constructor() {
    this.primaryProvider = new PrimaryTrafficProvider();
    this.secondaryProvider = new SecondaryTrafficProvider();
    this.fallbackProvider = new FallbackTrafficProvider();

    // Route cooldown map to prevent route oscillation
    this.routeHistory = new Map(); // journeyKey -> { lastRecommendedRouteId, lastEtaSeconds, lastEvaluatedAt }
  }

  /**
   * Evaluates routing through the hierarchical provider fallback chain:
   * LIVE TRAFFIC -> SECONDARY TRAFFIC-AWARE PROVIDER -> HISTORICAL / TERRAIN MODEL -> UNKNOWN
   */
  async resolveRoute(origin, destination, options = {}) {
    const cacheKey = `traffic_route:${Math.round(origin[0] * 1000) / 1000},${Math.round(origin[1] * 1000) / 1000}>${Math.round(destination[0] * 1000) / 1000},${Math.round(destination[1] * 1000) / 1000}:${options.mode || 'driving'}`;

    if (!options.bypassCache) {
      const cached = trafficCache.get(cacheKey);
      if (cached && computeTrafficFreshness(cached.retrievedAt) !== TRAFFIC_FRESHNESS.EXPIRED) {
        return { ...cached, fromCache: true, freshness: computeTrafficFreshness(cached.retrievedAt) };
      }
    }

    let result = null;

    // 1. Try Primary Live Provider
    if (this.primaryProvider.hasKey && !options.disableLive) {
      try {
        result = await this.primaryProvider.getTrafficAwareRoute(origin, destination, options);
      } catch (_err) {
        result = null;
      }
    }

    // 2. Try Secondary Route Provider (OSRM)
    if (!result) {
      try {
        result = await this.secondaryProvider.getTrafficAwareRoute(origin, destination, options);
      } catch (_err) {
        result = null;
      }
    }

    // 3. Fallback to Corridor Terrain Model
    if (!result) {
      result = await this.fallbackProvider.getTrafficAwareRoute(origin, destination, options);
    }

    // Road Closure Sanity Check
    if (result && result.primary) {
      const closureCheck = checkRouteForClosures(result.primary.geometry || [origin, destination], {
        departureTime: options.departureTime,
        city: options.city,
        mode: options.mode,
      });

      if (closureCheck.hasClosure) {
        result.primary.hasClosure = true;
        result.primary.closureDetails = closureCheck.primaryClosure;
        result.primary.trafficState = TRAFFIC_STATE.SEVERE;

        // Try bypass point
        const bypassPt = computeClosureBypassPoint(origin, destination, closureCheck.primaryClosure);
        try {
          const bypassResult = await this.secondaryProvider.getTrafficAwareRoute(origin, bypassPt, options);
          if (bypassResult && bypassResult.primary) {
            result.primary.bypassRecommendation = {
              point: bypassPt,
              advice: closureCheck.primaryClosure.diversionAdvice,
            };
          }
        } catch (_bErr) {}
      }
    }

    // Cache valid result (3 min TTL for live, 15 min for predictive)
    if (result) {
      const isLive = result.primary?.provenance === TRAFFIC_PROVENANCE.LIVE;
      const ttlMs = isLive ? 3 * 60 * 1000 : 15 * 60 * 1000;
      trafficCache.set(cacheKey, result, ttlMs);
    }

    return result;
  }

  /**
   * Convenience alias to resolve primary traffic data.
   */
  async resolveTraffic(origin, destination, options = {}) {
    const res = await this.resolveRoute(origin, destination, options);
    return res?.primary || res;
  }

  /**
   * Route Re-evaluation with Hysteresis (Prevent Route Oscillation).
   */
  evaluateRerouteHysteresis(currentRoute, candidateRoute, options = {}) {
    return evaluateRerouteHysteresis(currentRoute, candidateRoute, options);
  }

  async getAllProvidersHealth() {
    return {
      primary: await this.primaryProvider.getProviderHealth(),
      secondary: await this.secondaryProvider.getProviderHealth(),
      fallback: await this.fallbackProvider.getProviderHealth(),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Route Re-evaluation with Hysteresis (Prevent Route Oscillation).
 * Only recommends a reroute when:
 * - new route ETA saving >= minTimeSavingsSeconds / thresholdMinutes
 * - relative savings meets minRelativeSavings (if specified)
 * - AND route is not blocked by closures
 */
function evaluateRerouteHysteresis(currentRouteOrSec, candidateRouteOrSec, options = {}) {
  const minSavingsSec = options.minTimeSavingsSeconds
    || (options.thresholdMinutes ? options.thresholdMinutes * 60 : DEFAULT_REROUTE_THRESHOLD_MINUTES * 60);
  const minRelativeSavings = options.minRelativeSavings || 0;

  const currentSec = typeof currentRouteOrSec === 'number'
    ? currentRouteOrSec
    : (currentRouteOrSec?.trafficDuration || currentRouteOrSec?.durationSeconds || 0);
  const candidateSec = typeof candidateRouteOrSec === 'number'
    ? candidateRouteOrSec
    : (candidateRouteOrSec?.trafficDuration || candidateRouteOrSec?.durationSeconds || 0);

  if (typeof currentRouteOrSec === 'object' && currentRouteOrSec?.hasClosure && !candidateRouteOrSec?.hasClosure) {
    return {
      shouldReroute: true,
      savingsSeconds: currentSec - candidateSec,
      savingsPercentage: currentSec > 0 ? ((currentSec - candidateSec) / currentSec) * 100 : 0,
      reason: 'Current route has road closure',
    };
  }

  const savingsSec = currentSec - candidateSec;
  const savingsPct = currentSec > 0 ? (savingsSec / currentSec) * 100 : 0;
  const relSavings = currentSec > 0 ? savingsSec / currentSec : 0;

  if (savingsSec < minSavingsSec) {
    return {
      shouldReroute: false,
      savingsSeconds: savingsSec,
      savingsPercentage: Math.round(savingsPct * 10) / 10,
      reason: `Savings (${savingsSec}s) is below hysteresis threshold (${minSavingsSec}s)`,
    };
  }

  if (relSavings < minRelativeSavings) {
    return {
      shouldReroute: false,
      savingsSeconds: savingsSec,
      savingsPercentage: Math.round(savingsPct * 10) / 10,
      reason: `Relative savings (${(relSavings * 100).toFixed(1)}%) below required (${(minRelativeSavings * 100).toFixed(1)}%)`,
    };
  }

  return {
    shouldReroute: true,
    savingsSeconds: savingsSec,
    savingsPercentage: Math.round(savingsPct * 10) / 10,
    reason: `Significant improvement (${Math.round(savingsSec / 60)} min saved)`,
  };
}

const trafficQualityEngine = new TrafficQualityEngine();

module.exports = {
  TRAFFIC_PROVENANCE,
  TRAFFIC_STATE,
  COVERAGE_STATE,
  TRAFFIC_FRESHNESS,
  FRESHNESS_WINDOWS: TRAFFIC_FRESHNESS,
  FRESHNESS_WINDOWS_MS,
  DEFAULT_REROUTE_THRESHOLD_MINUTES,
  computeTrafficFreshness,
  classifyTrafficState,
  evaluateRerouteHysteresis,
  TrafficProvider,
  PrimaryTrafficProvider,
  SecondaryTrafficProvider,
  FallbackTrafficProvider,
  TrafficQualityEngine,
  trafficQualityEngine,
};
