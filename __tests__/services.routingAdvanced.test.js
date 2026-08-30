'use strict';

/**
 * __tests__/services.routingAdvanced.test.js
 * Unit test suite for advanced routing, corridor physics, mirror racing,
 * route quality, and multi-city traffic intelligence.
 */

const { CORRIDOR_TYPE, classifyCorridor, evaluateDestinationBottleneck, computeCalibratedCorridorMetrics } = require('../services/routing/corridorSpeedModel');
const { mirrorState, recordMirrorSuccess, recordMirrorFailure, getActiveMirrors } = require('../services/routing/mirrorRacer');
const { evaluateScenicQuality, enrichTurnByTurnSteps, evaluateComfortRating } = require('../services/routing/routeQualityEngine');
const { TRAFFIC_STATUS, classifyTrafficStatus, getPredictiveTraffic, normalizeTrafficMetadata } = require('../services/routing/trafficClassifier');
const { buildCacheKey, quantizeCoord } = require('../services/routing/routeCache');
const { calculateRoute, calculateRouteMatrix } = require('../services/routing/routingService');

describe('services/routing/corridorSpeedModel', () => {
  test('classifies short distance or walking mode as PEDESTRIAN_WALK', () => {
    const from = [17.7142, 83.3237];
    const to = [17.7172, 83.3301];
    const walk = classifyCorridor(from, to, { mode: 'walking' });
    expect(walk.corridorType).toBe(CORRIDOR_TYPE.PEDESTRIAN_WALK);
    expect(walk.windingFactor).toBe(1.15);
  });

  test('classifies hill ghat coordinates as HILL_GHAT with winding factor 1.72', () => {
    const from = [17.7492, 83.3418]; // Kailasagiri hill
    const to = [17.7142, 83.3237];
    const ghat = classifyCorridor(from, to, { mode: 'driving' });
    expect(ghat.corridorType).toBe(CORRIDOR_TYPE.HILL_GHAT);
    expect(ghat.windingFactor).toBe(1.72);
  });

  test('classifies dense walled bazaar zones as WALLED_BAZAAR with low base speed', () => {
    const from = [17.3616, 78.4747]; // Charminar
    const to = [17.3713, 78.4804];
    const bazaar = classifyCorridor(from, to, { mode: 'driving' });
    expect(bazaar.corridorType).toBe(CORRIDOR_TYPE.WALLED_BAZAAR);
    expect(bazaar.baseSpeedKmH).toBeLessThan(15);
  });

  test('detects tourist hotspot approach bottlenecks and returns delay minutes', () => {
    const charminar = [17.3616, 78.4747];
    const bottleneck = evaluateDestinationBottleneck(charminar);
    expect(bottleneck.hasBottleneck).toBe(true);
    expect(bottleneck.delayMinutes).toBeGreaterThanOrEqual(4);

    const normal = [17.8000, 83.3000];
    const noBottleneck = evaluateDestinationBottleneck(normal);
    expect(noBottleneck.hasBottleneck).toBe(false);
    expect(noBottleneck.delayMinutes).toBe(0);
  });

  test('computes calibrated corridor metrics including signal and bottleneck delays', () => {
    const from = [17.7142, 83.3237];
    const to = [17.7492, 83.3418];
    const metrics = computeCalibratedCorridorMetrics(from, to, { mode: 'driving' });
    expect(metrics.distanceMeters).toBeGreaterThan(0);
    expect(metrics.totalEstimatedSec).toBeGreaterThan(0);
    expect(metrics.corridor).toBeDefined();
  });
});

describe('services/routing/mirrorRacer', () => {
  test('tracks mirror health and updates latency metrics', () => {
    const mirror = 'https://router.project-osrm.org';
    recordMirrorSuccess(mirror, 180);
    const state = mirrorState.get(mirror);
    expect(state.successes).toBeGreaterThan(0);
    expect(state.status).toBe('HEALTHY');

    const active = getActiveMirrors();
    expect(active.length).toBeGreaterThan(0);
  });

  test('trips circuit breaker after multiple consecutive failures', () => {
    const testMirror = 'https://test-fail-mirror.org';
    recordMirrorFailure(testMirror);
    recordMirrorFailure(testMirror);
    recordMirrorFailure(testMirror);
    const state = mirrorState.get(testMirror);
    expect(state.status).toBe('CIRCUIT_OPEN');
  });
});

describe('services/routing/routeQualityEngine', () => {
  test('evaluates scenic appeal on coastal and ghat routes', () => {
    const from = [17.7142, 83.3237];
    const to = [17.7492, 83.3418];
    const steps = [
      { instruction: 'Continue on Beach Road', streetName: 'Beach Road', distanceM: 2000, durationSec: 300 },
      { instruction: 'Turn right toward Viewpoint', streetName: 'Hill Ghat Road', distanceM: 1000, durationSec: 180 },
    ];
    const scenic = evaluateScenicQuality(from, to, steps, 'COASTAL_DRIVE');
    expect(scenic.score).toBeGreaterThanOrEqual(65);
    expect(scenic.isScenic).toBe(true);
    expect(scenic.features.length).toBeGreaterThan(0);
  });

  test('enriches turn-by-turn maneuvers with cumulative distance and duration', () => {
    const rawSteps = [
      { instruction: 'via Beach Road', distanceM: 1500, durationSec: 180, maneuver: 'turn-right' },
      { instruction: 'via Main Arterial', distanceM: 2500, durationSec: 320, maneuver: 'continue' },
    ];
    const enriched = enrichTurnByTurnSteps(rawSteps);
    expect(enriched.length).toBe(2);
    expect(enriched[0].instruction).toBe('Continue on Beach Road');
    expect(enriched[1].cumulativeDistanceMeters).toBe(4000);
    expect(enriched[1].cumulativeDurationSeconds).toBe(500);
  });

  test('rates road comfort correctly across corridor types', () => {
    expect(evaluateComfortRating('HIGHWAY_EXPRESSWAY').tier).toBe('EXCELLENT');
    expect(evaluateComfortRating('HILL_GHAT').tier).toBe('WINDING_GHAT');
    expect(evaluateComfortRating('WALLED_BAZAAR').tier).toBe('FAIR');
    expect(evaluateComfortRating('URBAN_ARTERIAL', 'walking').tier).toBe('PEDESTRIAN_PATH');
  });
});

describe('services/routing/trafficClassifier', () => {
  test('classifies congestion factor into standard traffic status', () => {
    expect(classifyTrafficStatus(0.85)).toBe(TRAFFIC_STATUS.FREE_FLOW);
    expect(classifyTrafficStatus(1.05)).toBe(TRAFFIC_STATUS.LOW);
    expect(classifyTrafficStatus(1.25)).toBe(TRAFFIC_STATUS.MODERATE);
    expect(classifyTrafficStatus(1.55)).toBe(TRAFFIC_STATUS.HEAVY);
    expect(classifyTrafficStatus(1.90)).toBe(TRAFFIC_STATUS.SEVERE);
    expect(classifyTrafficStatus(2.40)).toBe(TRAFFIC_STATUS.GRIDLOCK);
  });

  test('multi-city model scales congestion by city, weekend, and rain', () => {
    const blrMorning = getPredictiveTraffic(9 * 60, { city: 'bengaluru', dayOfWeek: 2 });
    expect(blrMorning.factor).toBeGreaterThanOrEqual(1.50);

    const blrRain = getPredictiveTraffic(9 * 60, { city: 'bengaluru', dayOfWeek: 2, weatherRainMm: 20.0 });
    expect(blrRain.factor).toBeGreaterThan(blrMorning.factor);

    const weekendEve = getPredictiveTraffic(19 * 60, { city: 'goa', dayOfWeek: 6 });
    expect(weekendEve.factor).toBeGreaterThan(1.20);
  });

  test('normalizes traffic metadata with live telemetry vs predictive fallback', () => {
    const live = normalizeTrafficMetadata({ durationSec: 600, durationInTrafficSec: 900, hasRealtimeSignal: true });
    expect(live.provenance).toBe('live_traffic');
    expect(live.delayMinutes).toBe(5);

    const pred = normalizeTrafficMetadata({ durationSec: 600, departureMinute: 540, city: 'delhi' });
    expect(pred.provenance).toBe('historical_estimate');
    expect(pred.status).toBeDefined();
  });
});

describe('services/routing/routeCache', () => {
  test('quantizes coordinates to 3 decimal places for spatial cache sharing', () => {
    expect(quantizeCoord(17.714234)).toBe('17.714');
    expect(quantizeCoord(83.323789)).toBe('83.324');

    const key1 = buildCacheKey({ from: [17.7141, 83.3236], to: [17.7491, 83.3416], mode: 'driving', departureMin: 600 });
    const key2 = buildCacheKey({ from: [17.7144, 83.3238], to: [17.7493, 83.3418], mode: 'driving', departureMin: 600 });
    expect(key1).toBe(key2); // Nearby coordinates within 100m share the cache key!
  });
});

describe('services/routing/routingService Integration', () => {
  test('calculates point-to-point route with canonical contract, route quality, and traffic metadata', async () => {
    const origin = [17.7142, 83.3237];
    const destination = [17.7492, 83.3418];

    const result = await calculateRoute(origin, destination, {
      originName: 'RK Beach',
      destName: 'Kailasagiri',
      city: 'Visakhapatnam',
    });

    expect(result.success).toBe(true);
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.durationSeconds).toBeGreaterThan(0);
    expect(result.trafficDurationSeconds).toBeGreaterThan(0);
    expect(result.route.steps.length).toBeGreaterThan(0);
    expect(result.route.corridorType).toBeDefined();
    expect(result.route.scenicScore).toBeGreaterThanOrEqual(0);
    expect(result.confidence.level).toMatch(/HIGH|MEDIUM|LOW/);
  });

  test('calculates multi-stop route matrix with chronological timestamp propagation', async () => {
    const stops = [
      { name: 'RK Beach', coords: [17.7142, 83.3237], visitMinutes: 60 },
      { name: 'Kailasagiri', coords: [17.7492, 83.3418], visitMinutes: 90 },
      { name: 'Rushikonda Beach', coords: [17.7825, 83.3851], visitMinutes: 45 },
    ];

    const departureTime = '2026-08-30T09:00:00.000Z';
    const matrix = await calculateRouteMatrix(stops, { departureTime, city: 'Visakhapatnam' });

    expect(matrix.success).toBe(true);
    expect(matrix.legs.length).toBe(2);
    expect(matrix.totals.distance.meters).toBeGreaterThan(0);
    expect(matrix.totals.duration.trafficAwareSeconds).toBeGreaterThan(0);

    // Verify chronological timestamp propagation
    const leg1 = matrix.legs[0];
    const leg2 = matrix.legs[1];
    expect(new Date(leg2.departureAt).getTime()).toBeGreaterThan(new Date(leg1.arrivalAt).getTime());
  });
});
