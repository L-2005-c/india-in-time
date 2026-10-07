'use strict';

const {
  TrafficProvider,
  PrimaryTrafficProvider,
  SecondaryTrafficProvider,
  FallbackTrafficProvider,
  TrafficQualityEngine,
  trafficQualityEngine,
  computeTrafficFreshness,
  evaluateRerouteHysteresis,
  FRESHNESS_WINDOWS,
} = require('../services/routing/trafficProvider');
const { validateRouteSanity } = require('../services/routing/routingService');

describe('Traffic Intelligence & Provider Hardening (Phase 4 & 5)', () => {
  describe('computeTrafficFreshness', () => {
    test('classifies traffic retrieved just now as FRESH', () => {
      const now = new Date();
      const freshness = computeTrafficFreshness(now);
      expect(freshness.window).toBe(FRESHNESS_WINDOWS.FRESH);
      expect(freshness.isLive).toBe(true);
      expect(freshness.confidenceMultiplier).toBe(1.0);
    });

    test('classifies traffic 3 minutes old as RECENT', () => {
      const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
      const freshness = computeTrafficFreshness(threeMinAgo);
      expect(freshness.window).toBe(FRESHNESS_WINDOWS.RECENT);
      expect(freshness.isLive).toBe(true);
    });

    test('classifies traffic 7 minutes old as AGING', () => {
      const sevenMinAgo = new Date(Date.now() - 7 * 60 * 1000);
      const freshness = computeTrafficFreshness(sevenMinAgo);
      expect(freshness.window).toBe(FRESHNESS_WINDOWS.AGING);
      expect(freshness.isLive).toBe(true);
    });

    test('classifies traffic 18 minutes old as STALE', () => {
      const eighteenMinAgo = new Date(Date.now() - 18 * 60 * 1000);
      const freshness = computeTrafficFreshness(eighteenMinAgo);
      expect(freshness.window).toBe(FRESHNESS_WINDOWS.STALE);
      expect(freshness.isLive).toBe(false);
    });

    test('classifies traffic 35 minutes old as EXPIRED', () => {
      const thirtyFiveMinAgo = new Date(Date.now() - 35 * 60 * 1000);
      const freshness = computeTrafficFreshness(thirtyFiveMinAgo);
      expect(freshness.window).toBe(FRESHNESS_WINDOWS.EXPIRED);
      expect(freshness.isLive).toBe(false);
    });
  });

  describe('evaluateRerouteHysteresis', () => {
    test('rejects reroute if time savings is below threshold (avoids ping-pong flip)', () => {
      const result = evaluateRerouteHysteresis(1800, 1680, { minTimeSavingsSeconds: 300 }); // saves only 120s
      expect(result.shouldReroute).toBe(false);
      expect(result.savingsSeconds).toBe(120);
      expect(result.reason).toContain('below hysteresis threshold');
    });

    test('accepts reroute if time savings exceeds threshold and relative threshold', () => {
      const result = evaluateRerouteHysteresis(1800, 1400, { minTimeSavingsSeconds: 300, minRelativeSavings: 0.10 }); // saves 400s (22%)
      expect(result.shouldReroute).toBe(true);
      expect(result.savingsSeconds).toBe(400);
      expect(result.savingsPercentage).toBeGreaterThan(20);
    });
  });

  describe('FallbackTrafficProvider', () => {
    test('computes historical corridor estimate with transparent provenance', async () => {
      const provider = new FallbackTrafficProvider();
      const corridor = {
        distanceMeters: 25000,
        freeFlowSeconds: 1500,
        corridorType: 'URBAN_ARTERIAL',
        city: 'Hyderabad',
      };
      const result = await provider.getTrafficData([17.385, 78.486], [17.440, 78.348], corridor);
      expect(result.provenance).toBe('HISTORICAL');
      expect(result.freshnessWindow).toBe(FRESHNESS_WINDOWS.FRESH);
      expect(result.trafficDurationSeconds).toBeGreaterThanOrEqual(corridor.freeFlowSeconds);
      expect(result.confidenceScore).toBeLessThanOrEqual(75);
    });
  });

  describe('TrafficQualityEngine', () => {
    test('falls back gracefully through provider chain to historical profile when live keys missing', async () => {
      const engine = new TrafficQualityEngine();
      const corridor = {
        distanceMeters: 10000,
        freeFlowSeconds: 800,
        corridorType: 'INTERCITY_HIGHWAY',
      };
      const result = await engine.resolveTraffic([12.971, 77.594], [12.295, 76.639], corridor);
      expect(result).toBeDefined();
      expect(result.trafficDurationSeconds).toBeGreaterThan(0);
      expect(['HISTORICAL', 'PREDICTED', 'LIVE', 'ESTIMATED']).toContain(result.provenance);
    });
  });

  describe('validateRouteSanity', () => {
    test('passes sanity check for realistic driving speeds', () => {
      const route = {
        distanceMeters: 50000,
        durationSeconds: 3600,
        trafficDurationSeconds: 4000,
      };
      const check = validateRouteSanity(route);
      expect(check.sane).toBe(true);
      expect(check.warnings).toHaveLength(0);
      expect(check.speedKmH).toBeCloseTo(45, 0);
    });

    test('flags impossible transit speeds (> 160 km/h)', () => {
      const route = {
        distanceMeters: 200000, // 200 km
        durationSeconds: 1800,   // 30 mins -> 400 km/h
        trafficDurationSeconds: 1800,
      };
      const check = validateRouteSanity(route);
      expect(check.sane).toBe(false);
      expect(check.warnings[0]).toContain('Impossible transit speed');
    });

    test('flags abnormally slow speed (< 2 km/h over substantial distance)', () => {
      const route = {
        distanceMeters: 10000,   // 10 km
        durationSeconds: 36000,  // 10 hours -> 1 km/h
        trafficDurationSeconds: 36000,
      };
      const check = validateRouteSanity(route);
      expect(check.sane).toBe(false);
      expect(check.warnings[0]).toContain('Abnormally slow transit speed');
    });
  });
});
