// __tests__/routes.places.test.js
// routes/places.js previously had 0% test coverage despite being the
// central orchestration point for the product's core feature — merging
// AI, Wikipedia, curated-seed, and Nominatim place sources, deduplicating
// them, and enforcing a per-cache-key refresh cooldown to cap cost. This
// mocks the discovery services (services/placesDiscovery, services/cache)
// but uses the real utils/placesMerge and data/city-seeds modules, since
// those are simple/pure and already independently tested.

jest.mock('../services/placesDiscovery', () => ({
  getPlaces: jest.fn(),
  fetchWiki: jest.fn(),
  fetchCuratedCityFallback: jest.fn(),
  fetchCuratedFoodFallback: jest.fn(),
  fetchNominatimFallback: jest.fn(),
  hydrateAiPlaces: jest.fn(),
}));

jest.mock('../services/cache', () => {
  const store = new Map();
  return {
    placesCache: {
      get: jest.fn((key) => store.get(key) || null),
      set: jest.fn((key, val) => store.set(key, val)),
      delete: jest.fn((key) => store.delete(key)),
      __store: store, // test-only escape hatch
    },
  };
});

const express = require('express');
const request = require('supertest');
const placesRouter = require('../routes/places');
const discovery = require('../services/placesDiscovery');
const { placesCache } = require('../services/cache');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/places', placesRouter);
  return app;
}

function place(name, cat, lat, lon) {
  return { id: name, name, cat, coords: [lat, lon], vt: 45, ot: '06:00', ct: '20:00' };
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  placesCache.__store.clear();
  discovery.getPlaces.mockResolvedValue([]);
  discovery.fetchWiki.mockResolvedValue([]);
  discovery.fetchCuratedCityFallback.mockResolvedValue([]);
  discovery.fetchCuratedFoodFallback.mockResolvedValue([]);
  discovery.fetchNominatimFallback.mockResolvedValue([]);
  discovery.hydrateAiPlaces.mockImplementation(async (aiPlaces) => aiPlaces);
  app = buildApp();
});

describe('POST /api/places — validation', () => {
  test('rejects a request missing lat/lon', async () => {
    const res = await request(app).post('/api/places').send({ cityName: 'Jaipur' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/places — merging from multiple sources', () => {
  test('merges AI, wiki, curated, and nominatim results and dedupes exact-name overlaps', async () => {
    discovery.hydrateAiPlaces.mockResolvedValue([place('Hawa Mahal', 'scenic', 26.92, 75.82)]);
    discovery.fetchWiki.mockResolvedValue([place('City Palace', 'scenic', 26.92, 75.82)]);
    discovery.fetchCuratedCityFallback.mockResolvedValue([place('Hawa Mahal', 'scenic', 26.92, 75.82)]); // exact-name dup of AI result
    discovery.fetchNominatimFallback.mockResolvedValue([place('Amer Fort', 'scenic', 26.98, 75.86)]);

    const res = await request(app).post('/api/places').send({ lat: 26.9, lon: 75.8, cityName: 'Jaipur' });

    expect(res.status).toBe(200);
    const names = res.body.places.map(p => p.name);
    expect(names).toContain('Hawa Mahal');
    expect(names).toContain('City Palace');
    expect(names).toContain('Amer Fort');
    // Exact-name dup from curated source should not appear twice
    expect(names.filter(n => n === 'Hawa Mahal')).toHaveLength(1);
  });

  test('proximity-dedups two very close places sharing a significant name word, even with different exact names', async () => {
    discovery.hydrateAiPlaces.mockResolvedValue([
      place('Sri Kanaka Mahalakshmi Temple', 'temple', 11.11, 88.88),
    ]);
    discovery.fetchWiki.mockResolvedValue([
      // ~50m away (well within the 180m proximity threshold), shares "Mahalakshmi"
      place('Sri Kanaka Mahalakshmi Ammavari Temple', 'temple', 11.1105, 88.8805),
    ]);

    // "Testville" deliberately has no entry in data/city-seeds.js's static
    // seed list, so this exercises only the mocked sources above — a real
    // city name here (e.g. Visakhapatnam) would pull in ~10 unrelated
    // static-seed places and make the dedup assertion meaningless.
    const res = await request(app).post('/api/places').send({ lat: 11.11, lon: 88.88, cityName: 'Testville' });
    expect(res.status).toBe(200);
    // Only the higher-priority (AI) source's name should survive
    expect(res.body.places).toHaveLength(1);
    expect(res.body.places[0].name).toBe('Sri Kanaka Mahalakshmi Temple');
  });

  test('falls back to "last_resort" (unfiltered) when fewer than 3 places are found after merging', async () => {
    discovery.hydrateAiPlaces.mockResolvedValue([place('Only Place', 'scenic', 26.9, 75.8)]);
    const res = await request(app).post('/api/places').send({ lat: 26.9, lon: 75.8, cityName: 'Nowhere' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('last_resort');
  });

  test('returns "ranked_sources" and caches the payload when 3+ places are found', async () => {
    discovery.hydrateAiPlaces.mockResolvedValue([
      place('Place A', 'scenic', 26.9, 75.8),
      place('Place B', 'scenic', 26.91, 75.81),
      place('Place C', 'scenic', 26.92, 75.82),
    ]);
    const res = await request(app).post('/api/places').send({ lat: 26.9, lon: 75.8, cityName: 'Jaipur' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('ranked_sources');
    expect(placesCache.set).toHaveBeenCalled();
  });
});

describe('POST /api/places — caching', () => {
  test('serves from cache on a repeat request instead of calling discovery services again', async () => {
    discovery.hydrateAiPlaces.mockResolvedValue([
      place('Place A', 'scenic', 26.9, 75.8),
      place('Place B', 'scenic', 26.91, 75.81),
      place('Place C', 'scenic', 26.92, 75.82),
    ]);
    const body = { lat: 26.9, lon: 75.8, cityName: 'Jaipur' };

    const first = await request(app).post('/api/places').send(body);
    expect(first.status).toBe(200);
    expect(discovery.hydrateAiPlaces).toHaveBeenCalledTimes(1);

    const second = await request(app).post('/api/places').send(body);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(discovery.hydrateAiPlaces).toHaveBeenCalledTimes(1); // not called again
  });

  test('refresh:true bypasses the cache and re-fetches', async () => {
    discovery.hydrateAiPlaces.mockResolvedValue([
      place('Place A', 'scenic', 26.9, 75.8),
      place('Place B', 'scenic', 26.91, 75.81),
      place('Place C', 'scenic', 26.92, 75.82),
    ]);
    const body = { lat: 26.9, lon: 75.8, cityName: 'Jaipur' };
    await request(app).post('/api/places').send(body);
    await request(app).post('/api/places').send({ ...body, refresh: true });
    expect(discovery.hydrateAiPlaces).toHaveBeenCalledTimes(2);
  });

  test('a second refresh:true within the 60s cooldown is throttled and serves cache instead', async () => {
    discovery.hydrateAiPlaces.mockResolvedValue([
      place('Place A', 'scenic', 26.9, 75.8),
      place('Place B', 'scenic', 26.91, 75.81),
      place('Place C', 'scenic', 26.92, 75.82),
    ]);
    // Distinct coordinates from the other tests in this describe block —
    // lastRefreshAt (routes/places.js) is a module-level Map that isn't
    // reset between tests, so reusing another test's cache key here would
    // inherit its refresh-cooldown state and throttle immediately.
    const body = { lat: 44.4, lon: 55.5, cityName: 'Cooldowntestcity' };
    await request(app).post('/api/places').send(body);
    await request(app).post('/api/places').send({ ...body, refresh: true });   // 1st refresh: allowed
    await request(app).post('/api/places').send({ ...body, refresh: true });   // 2nd refresh: throttled
    expect(discovery.hydrateAiPlaces).toHaveBeenCalledTimes(2); // not 3
  });
});

describe('POST /api/places — error fallback', () => {
  test('falls back to a best-effort payload (not a 500) when a discovery source throws', async () => {
    discovery.hydrateAiPlaces.mockRejectedValue(new Error('AI hydration exploded'));
    discovery.fetchWiki.mockResolvedValue([place('City Palace', 'scenic', 26.92, 75.82)]);

    const res = await request(app).post('/api/places').send({ lat: 26.9, lon: 75.8, cityName: 'Jaipur' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('error_fallback');
  });
});

describe('POST /api/places — food-only preference', () => {
  test('skips Wikipedia/AI discovery entirely when prefs is exactly ["food"]', async () => {
    discovery.fetchCuratedFoodFallback.mockResolvedValue([place('Some Dhaba', 'food', 26.9, 75.8)]);
    await request(app).post('/api/places').send({ lat: 26.9, lon: 75.8, cityName: 'Jaipur', prefs: ['food'] });

    expect(discovery.fetchWiki).not.toHaveBeenCalled();
    expect(discovery.getPlaces).not.toHaveBeenCalled();
    expect(discovery.fetchCuratedFoodFallback).toHaveBeenCalled();
  });
});
