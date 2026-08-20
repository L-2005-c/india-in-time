'use strict';

/**
 * routingEngine — live OSRM/Google routing with cache + heuristic fallbacks.
 * Mock global fetch; never hit the network in CI.
 */

const routing = require('../services/travelIntelligence/routingEngine');

describe('routingEngine', () => {
  const from = [17.6868, 83.2185]; // Vizag
  const to = [17.7231, 83.3015];

  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_DIRECTIONS_API_KEY;
    delete process.env.ROUTING_PROVIDER;
    delete process.env.DISABLE_LIVE_ROUTING;
  });

  test('fetchOsrmRoute returns null for missing/invalid coords', async () => {
    expect(await routing.fetchOsrmRoute(null, to)).toBeNull();
    expect(await routing.fetchOsrmRoute(from, null)).toBeNull();
    expect(await routing.fetchOsrmRoute([NaN, 1], to)).toBeNull();
  });

  test('fetchOsrmRoute maps OSRM Ok payload to duration/distance', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ duration: 912.4, distance: 8450.2 }],
      }),
    });
    const r = await routing.fetchOsrmRoute(from, to, { timeoutMs: 500 });
    expect(r).toMatchObject({
      durationSec: 912,
      distanceM: 8450,
      source: 'route_estimate',
      provider: 'osrm',
    });
    expect(r.freshness).toBeTruthy();
  });

  test('fetchOsrmRoute returns null on non-Ok / network failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'NoRoute', routes: [] }),
    });
    expect(await routing.fetchOsrmRoute(from, to, { timeoutMs: 200 })).toBeNull();

    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    expect(await routing.fetchOsrmRoute(from, to, { timeoutMs: 200 })).toBeNull();
  });

  test('fetchOsrmRoute serves cache on second identical call', async () => {
    const uniqueFrom = [17.11, 83.11];
    const uniqueTo = [17.22, 83.22];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ duration: 100, distance: 1000 }],
      }),
    });
    const a = await routing.fetchOsrmRoute(uniqueFrom, uniqueTo, { timeoutMs: 300 });
    const b = await routing.fetchOsrmRoute(uniqueFrom, uniqueTo, { timeoutMs: 300 });
    expect(a.durationSec).toBe(100);
    expect(b.fromCache).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('fetchGoogleRoute returns null without API key', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_DIRECTIONS_API_KEY;
    expect(await routing.fetchGoogleRoute(from, to)).toBeNull();
  });

  test('fetchGoogleRoute maps Directions OK payload including congestion', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        routes: [{
          legs: [{
            duration: { value: 600 },
            duration_in_traffic: { value: 900 },
            distance: { value: 5000 },
          }],
        }],
      }),
    });
    const r = await routing.fetchGoogleRoute(from, to, { timeoutMs: 300 });
    expect(r).toMatchObject({
      durationSec: 900,
      distanceM: 5000,
      source: 'live_traffic',
      provider: 'google',
    });
    expect(r.congestion).toBeCloseTo(1.5, 5);
  });

  test('resolveLiveTravel prefers explicit liveTraffic payload', async () => {
    const r = await routing.resolveLiveTravel({
      fromCoords: from,
      toCoords: to,
      liveTraffic: { durationSec: 420, distanceM: 3000, congestion: 1.2, provider: 'client' },
    });
    expect(r).toMatchObject({
      durationSec: 420,
      distanceM: 3000,
      source: 'live',
      provider: 'client',
      congestion: 1.2,
    });
  });

  test('resolveLiveTravel returns null when live routing disabled', async () => {
    process.env.DISABLE_LIVE_ROUTING = '1';
    const r = await routing.resolveLiveTravel({ fromCoords: from, toCoords: to });
    expect(r).toBeNull();
  });

  test('resolveLiveTravel skips OSRM for very long hauls (>120km)', async () => {
    global.fetch = jest.fn();
    const r = await routing.resolveLiveTravel({
      fromCoords: [28.6139, 77.2090], // Delhi
      toCoords: [12.9716, 77.5946], // Bangalore
      enableLiveRouting: true,
    });
    expect(r).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('resolveLiveTravel falls back to OSRM when Google unavailable', async () => {
    process.env.ROUTING_PROVIDER = 'osrm';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ duration: 333, distance: 2222 }],
      }),
    });
    const r = await routing.resolveLiveTravel({
      fromCoords: [17.68, 83.21],
      toCoords: [17.70, 83.25],
    });
    expect(r.provider).toBe('osrm');
    expect(r.durationSec).toBe(333);
  });
});
