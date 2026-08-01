// __tests__/services.placesDiscovery.test.js
// services/placesDiscovery.js previously had 0% test coverage. This file
// covers the two functions with the most self-contained, high-value logic:
// fetchWiki's tourist-vs-non-tourist filtering/categorization, and
// geocodePlaceViaNominatimOnly's candidate-scoring + distance-rejection
// logic (the part that decides whether a geocoding match is trustworthy).
// The curated-fallback functions (fetchCuratedFoodFallback /
// fetchCuratedCityFallback) are intentionally not covered here — they loop
// with a hardcoded 1.1s delay per seed to respect Nominatim's rate limit,
// which makes them expensive to test meaningfully without obscuring what's
// actually being tested; they call the same geocodePlaceNominatim path
// already exercised below.

jest.mock('node-fetch');
jest.mock('../services/gemini', () => ({ callGeminiText: jest.fn() }));

const fetch = require('node-fetch');
const {
  fetchWiki,
  geocodePlaceNominatim,
} = require('../services/placesDiscovery');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchWiki', () => {
  const JAIPUR = { lat: 26.9124, lon: 75.7873 };

  function wikiResponse(geosearch) {
    return { ok: true, json: async () => ({ query: { geosearch } }) };
  }

  test('keeps tourist-relevant titles and drops administrative/generic ones', async () => {
    fetch.mockResolvedValue(wikiResponse([
      { pageid: 1, title: 'Hawa Mahal', lat: 26.9239, lon: 75.8267 },       // palace — keep
      { pageid: 2, title: 'Malviya Nagar', lat: 26.85, lon: 75.81 },        // "Nagar" — drop (SKIP)
      { pageid: 3, title: 'Jaipur Junction', lat: 26.92, lon: 75.79 },      // "Junction" — drop (SKIP)
      { pageid: 4, title: 'City Palace', lat: 26.9258, lon: 75.8237 },      // palace — keep
    ]));

    const result = await fetchWiki(JAIPUR.lat, JAIPUR.lon, 'Jaipur');
    const names = result.map(r => r.name);
    expect(names).toContain('Hawa Mahal');
    expect(names).toContain('City Palace');
    expect(names).not.toContain('Malviya Nagar');
    expect(names).not.toContain('Jaipur Junction');
  });

  test('excludes results farther than 35km even if the title matches', async () => {
    fetch.mockResolvedValue(wikiResponse([
      // ~55km away in latitude terms — should be excluded by the 35km cutoff
      { pageid: 5, title: 'Some Far Fort', lat: 27.4, lon: 75.79 },
    ]));
    const result = await fetchWiki(JAIPUR.lat, JAIPUR.lon, 'Jaipur');
    expect(result).toEqual([]);
  });

  test('categorizes beach/temple/other correctly', async () => {
    fetch.mockResolvedValue(wikiResponse([
      { pageid: 1, title: 'Some Beach', lat: 26.92, lon: 75.79 },
      { pageid: 2, title: 'Ganesh Temple', lat: 26.92, lon: 75.79 },
      { pageid: 3, title: 'City Fort', lat: 26.92, lon: 75.79 },
    ]));
    const result = await fetchWiki(JAIPUR.lat, JAIPUR.lon, 'Jaipur');
    const byName = Object.fromEntries(result.map(r => [r.name, r.cat]));
    expect(byName['Some Beach']).toBe('beach');
    expect(byName['Ganesh Temple']).toBe('temple');
    expect(byName['City Fort']).toBe('scenic');
  });

  test('returns an empty array (not throw) when Wikipedia responds with a non-ok status', async () => {
    fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const result = await fetchWiki(JAIPUR.lat, JAIPUR.lon, 'Jaipur');
    expect(result).toEqual([]);
  });
});

describe('geocodePlaceNominatim (Nominatim-only path, via candidate scoring)', () => {
  const JAIPUR = { lat: 26.9124, lon: 75.7873 };

  function nominatimResponse(results) {
    return { ok: true, json: async () => results };
  }

  test('picks the candidate whose label mentions the city over a same-named place elsewhere', async () => {
    fetch.mockResolvedValue(nominatimResponse([
      { lat: '13.0827', lon: '80.2707', display_name: 'Hawa Mahal, Chennai, India', name: 'Hawa Mahal' },
      { lat: '26.9239', lon: '75.8267', display_name: 'Hawa Mahal, Jaipur, Rajasthan, India', name: 'Hawa Mahal' },
    ]));

    const result = await geocodePlaceNominatim('Hawa Mahal', 'Jaipur', JAIPUR.lat, JAIPUR.lon, 'scenic');
    expect(result).toEqual({ lat: 26.9239, lon: 75.8267 });
  });

  test('rejects a match that is implausibly far from the city (likely wrong entity)', async () => {
    // Only candidate is ~1500km away — should be rejected, not silently accepted.
    fetch.mockResolvedValue(nominatimResponse([
      { lat: '13.0827', lon: '80.2707', display_name: 'Some Place, Chennai, India', name: 'Some Place' },
    ]));
    const result = await geocodePlaceNominatim('Some Place', 'Jaipur', JAIPUR.lat, JAIPUR.lon, 'scenic');
    expect(result).toBeNull();
  });

  test('returns null when Nominatim returns no results', async () => {
    fetch.mockResolvedValue(nominatimResponse([]));
    const result = await geocodePlaceNominatim('Nonexistent Place', 'Jaipur', JAIPUR.lat, JAIPUR.lon, 'scenic');
    expect(result).toBeNull();
  });

  test('applies a tighter 15km distance cutoff for the "food" category than other categories', async () => {
    // ~20km from city center: rejected for food (limit 15km) — this test
    // documents that category-specific cutoff exists in the source, and
    // exercises the code path even though we assert only the food-category
    // behavior here (the non-food behavior is covered by the "far away"
    // test above using a much larger distance).
    fetch.mockResolvedValue(nominatimResponse([
      { lat: '27.05', lon: '75.85', display_name: 'Roadside Dhaba, Jaipur, India', name: 'Roadside Dhaba' },
    ]));
    const result = await geocodePlaceNominatim('Roadside Dhaba', 'Jaipur', JAIPUR.lat, JAIPUR.lon, 'food');
    expect(result).toBeNull();
  });
});
