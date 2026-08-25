'use strict';

const { normalizeAndValidateCoords, validateRouteCoordinates, isValidCoordPair } = require('../services/routing/coordinateValidator');
const { classifyTrafficStatus, getPredictiveTraffic, normalizeTrafficMetadata, TRAFFIC_STATUS, TRAFFIC_PROVENANCE } = require('../services/routing/trafficClassifier');
const { buildCacheKey, getCachedRoute, setCachedRoute, clearL1 } = require('../services/routing/routeCache');
const { calculateRoute, calculateRouteMatrix, formatDistance, formatDuration } = require('../services/routing/routingService');

describe('Production Routing — Coordinate Validation', () => {
  test('validates standard coordinates inside India', () => {
    const res = normalizeAndValidateCoords([17.6868, 83.2185]);
    expect(res.valid).toBe(true);
    expect(res.wasSwapped).toBe(false);
    expect(res.lat).toBe(17.6868);
    expect(res.lon).toBe(83.2185);
    expect(res.isWithinIndia).toBe(true);
  });

  test('detects and auto-corrects inverted/swapped lat-lon in India', () => {
    // Latitude 83.2185 and Longitude 17.6868 is swapped (83 is lon, 17 is lat in India)
    const res = normalizeAndValidateCoords([83.2185, 17.6868]);
    expect(res.valid).toBe(true);
    expect(res.wasSwapped).toBe(true);
    expect(res.lat).toBe(17.6868);
    expect(res.lon).toBe(83.2185);
  });

  test('rejects Null Island (0, 0)', () => {
    expect(isValidCoordPair(0, 0)).toBe(false);
    const res = normalizeAndValidateCoords([0, 0]);
    expect(res.valid).toBe(false);
  });

  test('rejects non-finite and out-of-bounds coordinates', () => {
    expect(normalizeAndValidateCoords([NaN, 83.2]).valid).toBe(false);
    expect(normalizeAndValidateCoords([95.0, 83.2]).valid).toBe(false);
    expect(normalizeAndValidateCoords([17.6, 200.0]).valid).toBe(false);
    expect(normalizeAndValidateCoords(null).valid).toBe(false);
  });

  test('validates route pair with warnings on swapped input', () => {
    const pair = validateRouteCoordinates([83.2185, 17.6868], [17.7816, 83.3852]);
    expect(pair.valid).toBe(true);
    expect(pair.from).toEqual([17.6868, 83.2185]);
    expect(pair.to).toEqual([17.7816, 83.3852]);
    expect(pair.warnings.length).toBeGreaterThan(0);
  });
});

describe('Production Routing — Traffic Classification & Modeling', () => {
  test('classifies congestion factors into standardized states', () => {
    expect(classifyTrafficStatus(1.05)).toBe(TRAFFIC_STATUS.LOW);
    expect(classifyTrafficStatus(1.25)).toBe(TRAFFIC_STATUS.MODERATE);
    expect(classifyTrafficStatus(1.55)).toBe(TRAFFIC_STATUS.HEAVY);
    expect(classifyTrafficStatus(1.90)).toBe(TRAFFIC_STATUS.SEVERE);
    expect(classifyTrafficStatus(null)).toBe(TRAFFIC_STATUS.UNKNOWN);
  });

  test('computes morning and evening rush hour multipliers for India', () => {
    // 9:30 AM = 570 mins
    const morning = getPredictiveTraffic(570);
    expect(morning.factor).toBeGreaterThanOrEqual(1.40);
    expect(morning.status).toBe(TRAFFIC_STATUS.HEAVY);

    // 7:00 PM = 1140 mins
    const evening = getPredictiveTraffic(1140);
    expect(evening.factor).toBeGreaterThanOrEqual(1.50);
    expect(evening.status).toBe(TRAFFIC_STATUS.HEAVY);

    // 2:00 AM = 120 mins
    const night = getPredictiveTraffic(120);
    expect(night.factor).toBeLessThan(1.0);
    expect(night.status).toBe(TRAFFIC_STATUS.LOW);
  });

  test('normalizes traffic metadata with transparent provenance', () => {
    const liveMeta = normalizeTrafficMetadata({
      durationSec: 1000,
      durationInTrafficSec: 1550,
      hasRealtimeSignal: true,
      provider: 'google',
    });
    expect(liveMeta.provenance).toBe(TRAFFIC_PROVENANCE.LIVE_TRAFFIC);
    expect(liveMeta.status).toBe(TRAFFIC_STATUS.HEAVY);
    expect(liveMeta.delayMinutes).toBe(9);

    const predMeta = normalizeTrafficMetadata({
      durationSec: 1000,
      hasRealtimeSignal: false,
      provider: 'osrm',
      departureMinute: 570,
    });
    expect(predMeta.provenance).toBe(TRAFFIC_PROVENANCE.PREDICTED_TRAFFIC);
    expect(predMeta.delayMinutes).toBeGreaterThan(0);
  });
});

describe('Production Routing — Tiered Caching', () => {
  beforeEach(() => clearL1());

  test('stores and retrieves route from memory L1 cache', async () => {
    const key = buildCacheKey({ from: [17.68, 83.21], to: [17.78, 83.38], mode: 'driving', departureMin: 600 });
    const mockData = { id: 'route-test-123', traffic: { provenance: 'predicted_traffic' } };

    await setCachedRoute(key, mockData);
    const retrieved = await getCachedRoute(key);

    expect(retrieved).not.toBeNull();
    expect(retrieved.id).toBe('route-test-123');
    expect(retrieved.fromCache).toBe('L1');
  });
});

describe('Production Routing — Authoritative Routing Engine & India Corridors', () => {
  test('handles identical origin and destination (0 distance, 0 duration)', async () => {
    const res = await calculateRoute([17.6868, 83.2185], [17.6868, 83.2185]);
    expect(res.success).toBe(true);
    expect(res.distance.meters).toBe(0);
    expect(res.duration.seconds).toBe(0);
    expect(res.confidence.score).toBe(100);
  });

  test('calculates road distance with road network tortuosity factor', async () => {
    // Vizag: RK Beach to Kailasagiri (~9 km road distance)
    const res = await calculateRoute([17.7126, 83.3235], [17.7492, 83.3424], { mode: 'driving' });
    expect(res.success).toBe(true);
    expect(res.distance.kilometers).toBeGreaterThan(3.5);
    expect(res.duration.minutes).toBeGreaterThan(5);
    expect(res.timestamps.projectedArrival).toBeDefined();
    expect(res.route.googleMapsUrl).toContain('google.com/maps/dir');
  });

  test('calculates multi-stop matrix route with cumulative metrics and arrival times', async () => {
    const stops = [
      { coords: [17.7126, 83.3235], name: 'RK Beach', duration: 60 },
      { coords: [17.7492, 83.3424], name: 'Kailasagiri', duration: 90 },
      { coords: [17.7816, 83.3852], name: 'Rushikonda Beach', duration: 60 },
    ];

    const matrix = await calculateRouteMatrix(stops, { mode: 'driving', departureTime: '2026-08-25T09:00:00+05:30' });
    expect(matrix.success).toBe(true);
    expect(matrix.totalLegs).toBe(2);
    expect(matrix.totals.distance.kilometers).toBeGreaterThan(10);
    expect(matrix.totals.duration.trafficAwareMinutes).toBeGreaterThan(15);
    expect(matrix.legs[0].destination.name).toBe('Kailasagiri');
    expect(matrix.legs[1].destination.name).toBe('Rushikonda Beach');
  });

  test('benchmarks real-world Indian test corridors', async () => {
    const corridors = [
      { city: 'Hyderabad', from: [17.3616, 78.4747], to: [17.3833, 78.4011], minKm: 8, maxKm: 25 }, // Charminar to Golconda
      { city: 'Bengaluru', from: [12.9716, 77.5946], to: [12.9172, 77.6228], minKm: 6, maxKm: 20 }, // MG Road to Silk Board
      { city: 'Mumbai', from: [18.9220, 72.8347], to: [19.0434, 72.8193], minKm: 12, maxKm: 30 }, // Gateway of India to Bandra Fort
      { city: 'Delhi', from: [28.6129, 77.2295], to: [28.6562, 77.2410], minKm: 4, maxKm: 18 }, // India Gate to Red Fort
      { city: 'Chennai', from: [13.0499, 80.2824], to: [12.6167, 80.1928], minKm: 40, maxKm: 75 }, // Marina Beach to Mahabalipuram
    ];

    for (const c of corridors) {
      const res = await calculateRoute(c.from, c.to, { mode: 'driving' });
      expect(res.success).toBe(true);
      expect(res.distance.kilometers).toBeGreaterThanOrEqual(c.minKm);
      expect(res.distance.kilometers).toBeLessThanOrEqual(c.maxKm);
      expect(res.duration.trafficAwareMinutes).toBeGreaterThan(5);
    }
  });

  test('formats user-facing distance and duration cleanly', () => {
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDistance(14820)).toBe('14.8 km');
    expect(formatDuration(25)).toBe('25 mins');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(85)).toBe('1 hr 25 mins');
  });
});
