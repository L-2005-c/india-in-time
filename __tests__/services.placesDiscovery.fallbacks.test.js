// __tests__/services.placesDiscovery.fallbacks.test.js
// Covers fetchCuratedCityFallback, fetchCuratedFoodFallback, and
// fetchNominatimFallback — services/placesDiscovery.js's three biggest
// untested functions, previously skipped (see services.placesDiscovery.test.js's
// header comment) because they loop with a real, hardcoded 1.1s delay per
// item/query to respect Nominatim's rate limit. That's real production
// behavior worth keeping, so instead of removing it, this uses Jest's
// modern fake timers to fast-forward through the delays while still
// exercising the actual filtering/dedup/quality-gate logic against a
// mocked node-fetch.

jest.mock('node-fetch');
jest.mock('../services/gemini', () => ({ callGeminiText: jest.fn() }));

const fetch = require('node-fetch');
const {
  fetchCuratedCityFallback,
  fetchCuratedFoodFallback,
  fetchNominatimFallback,
} = require('../services/placesDiscovery');

const VIZAG = { lat: 17.6868, lon: 83.2185 };

function nominatimHit(name, lat, lon) {
  return [{ lat: String(lat), lon: String(lon), display_name: `${name}, India`, name }];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

// Runs `fn(...)`, then repeatedly advances fake timers until the returned
// promise settles — needed because these functions create a NEW setTimeout
// only after the previous iteration's async work (a fetch call) resolves,
// so a single advanceTimersByTimeAsync call up front can't see timers that
// don't exist yet.
async function runWithFakeDelays(fn, maxRounds = 20) {
  const promise = fn();
  let settled = false;
  promise.then(() => { settled = true; }).catch(() => { settled = true; });
  for (let i = 0; i < maxRounds && !settled; i++) {
    await jest.advanceTimersByTimeAsync(1200);
  }
  return promise;
}

describe('fetchCuratedCityFallback', () => {
  test('returns curated places (geocoded) for a known city, respecting the delay between each', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => nominatimHit('Ramakrishna Beach', 17.7142, 83.3237) });

    const result = await runWithFakeDelays(() => fetchCuratedCityFallback(VIZAG.lat, VIZAG.lon, 'visakhapatnam'));

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toMatchObject({ fallbackSource: 'curated_city_seed', importance: 'must_see' });
    expect(result.some(p => p.name === 'Ramakrishna Beach')).toBe(true);
  });

  test('returns an empty array immediately (no delay loop entered) for an unknown city', async () => {
    const result = await fetchCuratedCityFallback(0, 0, 'Some City With No Seeds');
    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('skips a seed whose geocoding fails, without aborting the rest of the list', async () => {
    let call = 0;
    fetch.mockImplementation(async () => {
      call++;
      // First seed's geocode fails (empty results); rest succeed.
      if (call === 1) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => nominatimHit('Somewhere', 17.7, 83.3) };
    });

    const result = await runWithFakeDelays(() => fetchCuratedCityFallback(VIZAG.lat, VIZAG.lon, 'visakhapatnam'));
    // 10 seeds total for visakhapatnam; first one should be missing from output
    expect(result.some(p => p.name === 'Ramakrishna Beach')).toBe(false);
    expect(result.length).toBeGreaterThan(0);
  });

  test('city name matching is case-insensitive and trims whitespace', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => nominatimHit('X', 17.7, 83.3) });
    const result = await runWithFakeDelays(() => fetchCuratedCityFallback(VIZAG.lat, VIZAG.lon, '  ViZAG  '));
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('fetchCuratedFoodFallback', () => {
  test('returns curated food places for a known city, all tagged as food category', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => nominatimHit('Bawarchi Restaurant', 17.4, 78.5) });
    const result = await runWithFakeDelays(() => fetchCuratedFoodFallback(17.4, 78.5, 'hyderabad'));
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(p => p.cat === 'food')).toBe(true);
    expect(result.every(p => p.fallbackSource === 'curated_food_seed')).toBe(true);
  });

  test('returns an empty array for an unknown city', async () => {
    const result = await fetchCuratedFoodFallback(0, 0, 'Nowhereville');
    expect(result).toEqual([]);
  });
});

describe('fetchNominatimFallback — quality gate filtering', () => {
  function osmRow(overrides = {}) {
    return {
      lat: String(VIZAG.lat), lon: String(VIZAG.lon),
      display_name: 'Test Place, India', name: 'Test Place',
      class: 'tourism', type: 'attraction',
      ...overrides,
    };
  }

  test('accepts a place matching an allowed class+type combination', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [osmRow({ name: 'Kailasagiri Viewpoint', type: 'viewpoint' })] });
    const result = await runWithFakeDelays(() => fetchNominatimFallback(VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result.some(p => p.name === 'Kailasagiri Viewpoint')).toBe(true);
  });

  test('rejects a place with a disallowed OSM class (e.g. "highway")', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [osmRow({ name: 'Main Road', class: 'highway', type: 'residential' })] });
    const result = await runWithFakeDelays(() => fetchNominatimFallback(VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result.some(p => p.name === 'Main Road')).toBe(false);
  });

  test('rejects a place whose name matches the road/locality blocklist even with an allowed class', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [osmRow({ name: 'Jubilee Nagar', class: 'tourism', type: 'attraction' })] });
    const result = await runWithFakeDelays(() => fetchNominatimFallback(VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result.some(p => p.name === 'Jubilee Nagar')).toBe(false);
  });

  test('rejects a result farther than 35km away (non-food)', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [osmRow({ name: 'Distant Fort', lat: '20.0', lon: '85.0' })] });
    const result = await runWithFakeDelays(() => fetchNominatimFallback(VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result.some(p => p.name === 'Distant Fort')).toBe(false);
  });

  test('dedupes the same place returned by two different search queries', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [osmRow({ name: 'Kailasagiri Viewpoint', type: 'viewpoint' })] });
    const result = await runWithFakeDelays(() => fetchNominatimFallback(VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    const matches = result.filter(p => p.name === 'Kailasagiri Viewpoint');
    expect(matches).toHaveLength(1); // not once per query even though every query "found" it
  });

  test('rejects a purely numeric name', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [osmRow({ name: '12345' })] });
    const result = await runWithFakeDelays(() => fetchNominatimFallback(VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result).toEqual([]);
  });

  test('a single failed query does not abort the remaining queries', async () => {
    let call = 0;
    fetch.mockImplementation(async () => {
      call++;
      if (call === 1) throw new Error('network blip');
      return { ok: true, json: async () => [osmRow({ name: `Place ${call}` })] };
    });
    const result = await runWithFakeDelays(() => fetchNominatimFallback(VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result.length).toBeGreaterThan(0);
  });
});
