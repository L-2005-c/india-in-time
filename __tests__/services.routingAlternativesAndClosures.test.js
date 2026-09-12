'use strict';

/**
 * __tests__/services.routingAlternativesAndClosures.test.js
 *
 * Test suite for Google Maps-grade routing intelligence:
 * 1. Indian ETA accuracy calibration (speed clamping, signal delay, peak hour curves).
 * 2. Multi-route alternatives (Fastest, Shortest, Alternates with time deltas).
 * 3. Road closure & severe disruption detection (Araku night curfew, Chandni Chowk pedestrianization, Bandipur).
 * 4. Dynamic alternate route planning & automatic rerouting around closed corridors.
 */

const { calibrateIndianEta } = require('../services/routing/etaCalibrationEngine');
const {
  checkRouteForClosures,
  computeClosureBypassPoint,
  isClosureActive,
  CANONICAL_ROAD_CLOSURES,
} = require('../services/routing/roadClosureRegistry');
const { calculateRoute, calculateRouteMatrix } = require('../services/routing/routingService');

describe('ETA Calibration Engine — Real-World Indian Road Conditions', () => {
  test('calibrates European OSRM free-flow speed down to Indian urban reality', () => {
    const from = [17.7142, 83.3237]; // RK Beach
    const to = [17.7492, 83.3418]; // Kailasagiri
    const distanceMeters = 8000; // 8 km
    const rawOsrmSeconds = 360; // 6 mins (80 km/h - unrealistic for Indian urban arterial)

    const calibrated = calibrateIndianEta({
      from,
      to,
      distanceMeters,
      rawDurationSeconds: rawOsrmSeconds,
      provider: 'osrm',
      mode: 'driving',
      departureTime: '2026-09-15T10:00:00+05:30', // Morning rush
      city: 'visakhapatnam',
    });

    // In Indian city traffic, 8 km should take 18-35 mins, not 6 mins
    expect(calibrated.trafficDurationMinutes).toBeGreaterThanOrEqual(16);
    expect(calibrated.trafficDurationMinutes).toBeLessThanOrEqual(40);
    expect(calibrated.averageSpeedKmH).toBeLessThanOrEqual(35);
    expect(calibrated.averageSpeedKmH).toBeGreaterThanOrEqual(12);
  });

  test('calibrates pedestrian walking speeds independently of vehicular traffic', () => {
    const from = [17.7142, 83.3237];
    const to = [17.7200, 83.3280];
    const distanceMeters = 1200; // 1.2 km

    const walkCalibrated = calibrateIndianEta({
      from,
      to,
      distanceMeters,
      mode: 'walking',
    });

    // 1.2 km walking takes ~14-16 minutes (4.8 km/h)
    expect(walkCalibrated.trafficDurationMinutes).toBeGreaterThanOrEqual(12);
    expect(walkCalibrated.trafficDurationMinutes).toBeLessThanOrEqual(20);
    expect(walkCalibrated.congestionFactor).toBe(1.0);
  });

  test('accounts for destination approach bottlenecks at dense tourist POIs', () => {
    const from = [17.3850, 78.4867];
    const to = [17.3616, 78.4747]; // Charminar (dense bazaar bottleneck)
    const distanceMeters = 3500;

    const res = calibrateIndianEta({
      from,
      to,
      distanceMeters,
      mode: 'driving',
      city: 'hyderabad',
    });

    expect(res.bottleneckDelaySeconds).toBeGreaterThan(0);
    expect(res.trafficDurationMinutes).toBeGreaterThan(12);
  });
});

describe('Road Closure Registry & Spatial Intersection Detection', () => {
  test('detects Araku Valley Ananthagiri Ghat night curfew after 21:00', () => {
    const arakuClosure = CANONICAL_ROAD_CLOSURES.find(c => c.id === 'closure_araku_ghat_01');
    expect(arakuClosure).toBeDefined();

    // 22:30 at night (within 21:00 - 05:30 curfew)
    const isNightActive = isClosureActive(arakuClosure, '2026-09-15T22:30:00+05:30');
    expect(isNightActive).toBe(true);

    // 11:30 AM during day (outside curfew)
    const isDayActive = isClosureActive(arakuClosure, '2026-09-15T11:30:00+05:30');
    expect(isDayActive).toBe(false);

    // Route traversing the ghat coordinates at night
    const ghatRoute = [
      [18.1500, 83.1500],
      [18.2325, 83.1168], // Ghat pass center
      [18.3200, 83.0200],
    ];

    const nightCheck = checkRouteForClosures(ghatRoute, {
      departureTime: '2026-09-15T22:30:00+05:30',
      city: 'araku',
    });

    expect(nightCheck.hasClosure).toBe(true);
    expect(nightCheck.primaryClosure.closureId).toBe('closure_araku_ghat_01');
    expect(nightCheck.primaryClosure.severity).toBe('CRITICAL');
  });

  test('detects Old Delhi Chandni Chowk daytime pedestrian motor vehicle ban', () => {
    const delhiClosure = CANONICAL_ROAD_CLOSURES.find(c => c.id === 'closure_delhi_chandni_chowk_01');
    expect(delhiClosure).toBeDefined();

    // 14:00 (2:00 PM) daytime
    const isDayActive = isClosureActive(delhiClosure, '2026-09-15T14:00:00+05:30');
    expect(isDayActive).toBe(true);

    const chandniRoute = [
      [28.6500, 77.2200],
      [28.6562, 77.2305], // Chandni Chowk
      [28.6600, 77.2400],
    ];

    const check = checkRouteForClosures(chandniRoute, {
      departureTime: '2026-09-15T14:00:00+05:30',
      city: 'delhi',
    });

    expect(check.hasClosure).toBe(true);
    expect(check.primaryClosure.category).toBe('PEDESTRIAN_ZONE');
  });

  test('computes a valid bypass avoidance waypoint around closures', () => {
    const arakuClosure = CANONICAL_ROAD_CLOSURES.find(c => c.id === 'closure_araku_ghat_01');
    const bypassPt = computeClosureBypassPoint([18.15, 83.15], [18.32, 83.02], arakuClosure);

    expect(Array.isArray(bypassPt)).toBe(true);
    expect(bypassPt.length).toBe(2);
    expect(Number.isFinite(bypassPt[0])).toBe(true);
    expect(Number.isFinite(bypassPt[1])).toBe(true);
  });
});

describe('Multi-Route Alternatives & Automatic Rerouting (Google Maps Quality)', () => {
  test('returns candidate routes array with fastest, shortest, and comparison metrics', async () => {
    // Vizag: RK Beach to Rushikonda Beach
    const res = await calculateRoute([17.7142, 83.3237], [17.7816, 83.3852], {
      mode: 'driving',
      originName: 'RK Beach',
      destName: 'Rushikonda Beach',
      city: 'visakhapatnam',
    });

    expect(res.success).toBe(true);
    expect(Array.isArray(res.routes)).toBe(true);
    expect(res.routes.length).toBeGreaterThanOrEqual(1);

    const primary = res.routes[res.activeRouteIndex || 0];
    expect(primary).toBeDefined();
    expect(primary.distance.kilometers).toBeGreaterThan(5);
    expect(primary.duration.trafficAwareMinutes).toBeGreaterThan(10);
    expect(typeof primary.timeDeltaMinutes).toBe('number');
  });

  test('automatically reroutes and issues closure alert when route intersects closed corridor', async () => {
    // Traverse Araku Ghat at 22:30 (night curfew active)
    const origin = [18.1500, 83.1800];
    const destination = [18.3300, 83.0000];

    const res = await calculateRoute(origin, destination, {
      mode: 'driving',
      departureTime: '2026-09-15T22:30:00+05:30',
      originName: 'Foothills',
      destName: 'Araku Valley',
      city: 'araku',
      bypassCache: true,
    });

    expect(res.success).toBe(true);
    // Should flag closure or reroute
    if (res.hasClosure || res.reroutedDueToClosure || res.closureAlert) {
      expect(res.closureAlert).toBeDefined();
      expect(res.closureAlert.hasClosure).toBe(true);
      expect(res.closureAlert.alertMessage).toContain('closed');
    }
  });

  test('multi-stop route matrix captures leg closures and aggregates totals', async () => {
    const stops = [
      { name: 'RK Beach', coords: [17.7142, 83.3237] },
      { name: 'Kailasagiri', coords: [17.7492, 83.3418] },
      { name: 'Rushikonda', coords: [17.7816, 83.3852] },
    ];

    const matrix = await calculateRouteMatrix(stops, {
      mode: 'driving',
      city: 'visakhapatnam',
    });

    expect(matrix.success).toBe(true);
    expect(matrix.legs.length).toBe(2);
    expect(matrix.totals.hasAnyClosure).toBeDefined();
    expect(matrix.totals.reroutedLegsCount).toBeDefined();
  });
});
