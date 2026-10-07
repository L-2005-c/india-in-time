'use strict';

const {
  DOMAIN_DEFAULTS,
  FRESHNESS_LEVELS,
  wrapDataFreshness,
  reevaluateFreshness,
  createSafeFallback,
  wrapTrafficData,
  wrapWeatherData,
  wrapAqiData,
  wrapAlertsData,
  wrapClosureData,
  wrapTransitData,
  wrapPoiData,
} = require('../services/dataFreshnessService');

describe('Data Freshness & Provenance Standard Service (Phase 6)', () => {
  test('wraps traffic data into unified contract with correct defaults', () => {
    const wrapped = wrapTrafficData({ congestionScore: 1.25 });
    expect(wrapped.domain).toBe('traffic');
    expect(wrapped.provider).toBe('google_osrm_hybrid');
    expect(wrapped.provenance).toBe('LIVE');
    expect(wrapped.freshness).toBe(FRESHNESS_LEVELS.FRESH);
    expect(wrapped.isStale).toBe(false);
    expect(wrapped.isExpired).toBe(false);
    expect(wrapped.value.congestionScore).toBe(1.25);
    expect(wrapped.expiresAt).toBeDefined();
  });

  test('marks data as EXPIRED and STALE when retrieved long ago', () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    const wrapped = wrapTrafficData({ speed: 40 }, { retrievedAt: twoHoursAgo });
    expect(wrapped.isExpired).toBe(true);
    expect(wrapped.isStale).toBe(true);
    expect(wrapped.freshness).toBe(FRESHNESS_LEVELS.EXPIRED);
  });

  test('reevaluates freshness dynamically over time', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const wrapped = wrapTrafficData({ speed: 40 }, { retrievedAt: thirtyMinAgo });
    const reevaluated = reevaluateFreshness(wrapped);
    expect(reevaluated.isExpired).toBe(true);
  });

  test('creates safe resilient fallback payload without throwing', () => {
    const fallback = createSafeFallback('weather', { tempC: 28, condition: 'Sunny' }, 'OPEN_METEO_TIMEOUT');
    expect(fallback.domain).toBe('weather');
    expect(fallback.provenance).toBe('ESTIMATED');
    expect(fallback.confidence).toBe(0.50);
    expect(fallback.metadata.fallback).toBe(true);
    expect(fallback.metadata.reason).toBe('OPEN_METEO_TIMEOUT');
    expect(fallback.value.tempC).toBe(28);
  });

  test('all domain helper wrappers produce valid contracts', () => {
    const testCases = [
      wrapWeatherData({ temp: 30 }),
      wrapAqiData({ aqi: 120 }),
      wrapAlertsData([{ id: 1, alert: 'High Wind' }]),
      wrapClosureData([{ road: 'NH44', closed: false }]),
      wrapTransitData({ nextBusMin: 12 }),
      wrapPoiData({ name: 'Charminar' }),
    ];

    for (const item of testCases) {
      expect(item).toHaveProperty('value');
      expect(item).toHaveProperty('domain');
      expect(item).toHaveProperty('provider');
      expect(item).toHaveProperty('provenance');
      expect(item).toHaveProperty('retrievedAt');
      expect(item).toHaveProperty('expiresAt');
      expect(item).toHaveProperty('freshness');
      expect(item).toHaveProperty('confidence');
      expect(item).toHaveProperty('isStale');
      expect(item).toHaveProperty('isExpired');
    }
  });
});
