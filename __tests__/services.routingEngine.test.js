// __tests__/services.routingEngine.test.js
// Coverage for services/travelIntelligence/routingEngine.js — this module
// drives live routing for the itinerary engine, so its fallback branches
// (timeout, malformed response, distance-too-far, provider selection) are
// exactly the paths that must not silently misbehave in production.

'use strict';

describe('routingEngine', () => {
  let routingEngine;
  const realFetch = global.fetch;
  const realEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...realEnv };
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_DIRECTIONS_API_KEY;
    delete process.env.ROUTING_PROVIDER;
    delete process.env.DISABLE_LIVE_ROUTING;
    routingEngine = require('../services/travelIntelligence/routingEngine');
  });

  afterEach(() => {
    global.fetch = realFetch;
    process.env = { ...realEnv };
  });

  const FROM = [28.6139, 77.2090]; // Delhi
  const TO = [28.5665, 77.2100]; // ~5km south

  describe('fetchOsrmRoute', () => {
    test('returns null when either coordinate pair is missing', async () => {
      await expect(routingEngine.fetchOsrmRoute(null, TO)).resolves.toBeNull();
      await expect(routingEngine.fetchOsrmRoute(FROM, null)).resolves.toBeNull();
    });

    test('returns null when coordinates are not finite numbers', async () => {
      await expect(routingEngine.fetchOsrmRoute([NaN, 77], TO)).resolves.toBeNull();
    });

    test('returns a normalized route on a successful OSRM response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [{ duration: 620.4, distance: 5400.9 }],
        }),
      });

      const result = await routingEngine.fetchOsrmRoute(FROM, TO);
      expect(result).toMatchObject({
        durationSec: 620,
        distanceM: 5401,
        source: 'route_estimate',
        provider: 'osrm',
        congestion: 1.0,
      });
      expect(result.freshness).toEqual(expect.any(String));
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain('/route/v1/driving/');
      // OSRM expects lon,lat ordering — the second coordinate value in the URL
      // should be the *latitude*'s counterpart, i.e. longitude comes first.
      expect(calledUrl).toContain(`${FROM[1]},${FROM[0]}`);
    });

    test('serves a cached result (fromCache: true) on a repeated call within TTL', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'Ok', routes: [{ duration: 100, distance: 900 }] }),
      });

      const first = await routingEngine.fetchOsrmRoute(FROM, TO);
      expect(first.fromCache).toBeUndefined();

      const second = await routingEngine.fetchOsrmRoute(FROM, TO);
      expect(second.fromCache).toBe(true);
      expect(second.durationSec).toBe(100);
      // Cache hit must not re-invoke the network.
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('returns null when the HTTP response is not ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
      await expect(routingEngine.fetchOsrmRoute(FROM, TO)).resolves.toBeNull();
    });

    test('returns null when OSRM reports a non-Ok code', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'NoRoute', routes: [] }),
      });
      await expect(routingEngine.fetchOsrmRoute(FROM, TO)).resolves.toBeNull();
    });

    test('returns null when routes array is empty/missing', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'Ok', routes: [] }),
      });
      await expect(routingEngine.fetchOsrmRoute(FROM, TO)).resolves.toBeNull();
    });

    test('returns null and does not throw when fetch rejects (network error)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
      await expect(routingEngine.fetchOsrmRoute(FROM, TO)).resolves.toBeNull();
    });

    test('returns null when fetch is aborted via the timeout', async () => {
      global.fetch = jest.fn().mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('AbortError')));
      }));
      const result = await routingEngine.fetchOsrmRoute(FROM, TO, { timeoutMs: 5 });
      expect(result).toBeNull();
    });

    test('evicts the oldest cache entry once the cache exceeds 500 entries', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'Ok', routes: [{ duration: 60, distance: 500 }] }),
      });
      // Eviction is checked *before* each insert (cache.size > 500), so the
      // very first entry only gets evicted once a 502nd distinct entry is
      // inserted (size reaches 501 on the check before that insert).
      for (let i = 0; i < 502; i++) {
        const from = [28 + i * 0.0001, 77];
        const to = [29 + i * 0.0001, 78];
        // eslint-disable-next-line no-await-in-loop
        await routingEngine.fetchOsrmRoute(from, to);
      }
      // The very first pair should now have been evicted, so requesting it
      // again must re-hit the network rather than serve a stale cache entry.
      const callsBefore = global.fetch.mock.calls.length;
      await routingEngine.fetchOsrmRoute([28, 77], [29, 78]);
      expect(global.fetch.mock.calls.length).toBe(callsBefore + 1);
    });
  });

  describe('fetchGoogleRoute', () => {
    test('returns null when no Google API key is configured', async () => {
      await expect(routingEngine.fetchGoogleRoute(FROM, TO)).resolves.toBeNull();
    });

    test('returns null when coordinates are missing, even with a key configured', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');
      await expect(routingEngine.fetchGoogleRoute(null, TO)).resolves.toBeNull();
    });

    test('returns a normalized route with computed congestion on success', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          routes: [{
            legs: [{
              duration: { value: 600 },
              duration_in_traffic: { value: 900 },
              distance: { value: 4200 },
            }],
          }],
        }),
      });

      const result = await routingEngine.fetchGoogleRoute(FROM, TO);
      expect(result).toMatchObject({
        durationSec: 900,
        distanceM: 4200,
        source: 'live_traffic',
        provider: 'google',
      });
      // congestion = 900/600 = 1.5, clamped to [0.7, 2.5]
      expect(result.congestion).toBeCloseTo(1.5);
    });

    test('clamps congestion to the [0.7, 2.5] band', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          routes: [{ legs: [{ duration: { value: 100 }, duration_in_traffic: { value: 1000 }, distance: { value: 1000 } }] }],
        }),
      });
      const result = await routingEngine.fetchGoogleRoute(FROM, TO);
      expect(result.congestion).toBe(2.5);
    });

    test('returns null when the API status is not OK', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ZERO_RESULTS' }) });
      await expect(routingEngine.fetchGoogleRoute(FROM, TO)).resolves.toBeNull();
    });

    test('returns null when duration is not a finite number', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'OK', routes: [{ legs: [{ duration: {}, distance: {} }] }] }),
      });
      await expect(routingEngine.fetchGoogleRoute(FROM, TO)).resolves.toBeNull();
    });

    test('returns null and does not throw on network failure', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');
      global.fetch = jest.fn().mockRejectedValue(new Error('boom'));
      await expect(routingEngine.fetchGoogleRoute(FROM, TO)).resolves.toBeNull();
    });
  });

  describe('resolveLiveTravel', () => {
    test('trusts explicit client-supplied liveTraffic without calling any provider', async () => {
      global.fetch = jest.fn();
      const result = await routingEngine.resolveLiveTravel({
        fromCoords: FROM,
        toCoords: TO,
        liveTraffic: { durationSec: 300, distanceM: 2000, congestion: 1.2, provider: 'client-sdk' },
      });
      expect(result).toEqual({
        durationSec: 300,
        distanceM: 2000,
        congestion: 1.2,
        source: 'live',
        provider: 'client-sdk',
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('defaults congestion/provider when liveTraffic omits them', async () => {
      const result = await routingEngine.resolveLiveTravel({
        fromCoords: FROM,
        toCoords: TO,
        liveTraffic: { durationSec: 300 },
      });
      expect(result.congestion).toBe(1.0);
      expect(result.provider).toBe('client');
      expect(result.distanceM).toBeNull();
    });

    test('returns null immediately when enableLiveRouting is false', async () => {
      global.fetch = jest.fn();
      const result = await routingEngine.resolveLiveTravel({
        fromCoords: FROM, toCoords: TO, enableLiveRouting: false,
      });
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('returns null when DISABLE_LIVE_ROUTING=1 even if routing would otherwise apply', async () => {
      process.env.DISABLE_LIVE_ROUTING = '1';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');
      global.fetch = jest.fn();
      const result = await routingEngine.resolveLiveTravel({ fromCoords: FROM, toCoords: TO });
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('skips live routing when the two points are more than 120km apart', async () => {
      global.fetch = jest.fn();
      const farAway = [19.0760, 72.8777]; // Mumbai — far from Delhi
      const result = await routingEngine.resolveLiveTravel({ fromCoords: FROM, toCoords: farAway });
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('defaults to OSRM when no provider/env is configured', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'Ok', routes: [{ duration: 200, distance: 1800 }] }),
      });
      const result = await routingEngine.resolveLiveTravel({ fromCoords: FROM, toCoords: TO });
      expect(result).toMatchObject({ provider: 'osrm', durationSec: 200 });
    });

    test('prefers Google when GOOGLE_MAPS_API_KEY is configured', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'OK',
          routes: [{ legs: [{ duration: { value: 300 }, distance: { value: 2500 } }] }],
        }),
      });
      const result = await routingEngine.resolveLiveTravel({ fromCoords: FROM, toCoords: TO });
      expect(result.provider).toBe('google');
      expect(global.fetch.mock.calls[0][0]).toContain('maps.googleapis.com');
    });

    test('falls back to OSRM when Google is configured but returns nothing (provider unset -> auto)', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ZERO_RESULTS' }) }) // google attempt fails
        .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 'Ok', routes: [{ duration: 150, distance: 1200 }] }) }); // osrm fallback

      const result = await routingEngine.resolveLiveTravel({ fromCoords: FROM, toCoords: TO });
      // ROUTING_PROVIDER is unset ('') which is in the OSRM-eligible set, so
      // a failed Google attempt still falls through to a working OSRM call.
      expect(result).toMatchObject({ provider: 'osrm', durationSec: 150 });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('honors an explicit ROUTING_PROVIDER=google even without a matching key resulting in null', async () => {
      process.env.ROUTING_PROVIDER = 'google';
      jest.resetModules();
      routingEngine = require('../services/travelIntelligence/routingEngine');
      global.fetch = jest.fn();
      const result = await routingEngine.resolveLiveTravel({ fromCoords: FROM, toCoords: TO });
      // No Google key configured -> fetchGoogleRoute short-circuits to null,
      // and provider === 'google' is not in the OSRM-eligible set, so overall null.
      expect(result).toBeNull();
    });

    test('returns null when fromCoords/toCoords are absent (no distance guard applies) and provider is unset', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'Ok', routes: [{ duration: 90, distance: 700 }] }),
      });
      const result = await routingEngine.resolveLiveTravel({});
      // fetchOsrmRoute itself returns null for missing coords.
      expect(result).toBeNull();
    });
  });

  test('exports ROUTING_TIMEOUT_MS as a finite number', () => {
    expect(Number.isFinite(routingEngine.ROUTING_TIMEOUT_MS)).toBe(true);
  });
});
