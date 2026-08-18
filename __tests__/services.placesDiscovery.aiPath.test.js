// __tests__/services.placesDiscovery.aiPath.test.js
// Covers the previously-untested AI-orchestration path in
// services/placesDiscovery.js:
//   - getPlaces (Gemini prompt → JSON parse incl. malformed/truncated JSON
//     recovery → category/importance normalisation)
//   - geocodePlaceViaPhoton (reached indirectly through geocodePlaceNominatim
//     when Nominatim itself comes back empty)
//   - fixAiCoordsViaNominatim (bad-name pre-filter, dedup, batched geocoding)
//   - hydrateAiPlaces (exact-name grounding, fuzzy token-overlap grounding,
//     and the unmatched → geocode fallback path)
//
// Together with services.placesDiscovery.test.js and
// services.placesDiscovery.fallbacks.test.js, this closes out the AI path
// that routes/places.test.js only exercised indirectly.

jest.mock('node-fetch');
jest.mock('../services/gemini', () => ({ callGeminiText: jest.fn() }));

const fetch = require('node-fetch');
const { callGeminiText } = require('../services/gemini');
const {
  getPlaces,
  geocodePlaceNominatim,
  fixAiCoordsViaNominatim,
  hydrateAiPlaces,
} = require('../services/placesDiscovery');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

async function runWithFakeDelays(fn, maxRounds = 20) {
  const promise = fn();
  let settled = false;
  promise.then(() => { settled = true; }).catch(() => { settled = true; });
  for (let i = 0; i < maxRounds && !settled; i++) {
    await jest.advanceTimersByTimeAsync(1200);
  }
  return promise;
}

const VIZAG = { lat: 17.6868, lon: 83.2185 };

describe('getPlaces', () => {
  test('parses a clean JSON response and normalises category/importance/visit_minutes', async () => {
    callGeminiText.mockResolvedValue(JSON.stringify({
      places: [
        { name: 'Kailasagiri', category: 'scenic', importance: 'must_see', visit_minutes: 75, open_time: '06:00', close_time: '20:00', indoor_outdoor: 'outdoor' },
        { name: 'Sea Inn Raju Gari Dhaba', category: 'restaurant', importance: 'famous', visit_minutes: 9999, open_time: '11:00', close_time: '23:00', indoor_outdoor: 'indoor' },
        { name: 'Simhachalam Temple', category: 'mandir', importance: 'weird_value', visit_minutes: 5, open_time: '06:00', close_time: '20:00', indoor_outdoor: 'outdoor' },
      ],
    }));

    const result = await getPlaces('Visakhapatnam', VIZAG.lat, VIZAG.lon, 600);

    const kailasagiri = result.find(p => p.name === 'Kailasagiri');
    expect(kailasagiri).toMatchObject({ cat: 'scenic', importance: 'must_see', importanceScore: 100 });

    const dhaba = result.find(p => p.name === 'Sea Inn Raju Gari Dhaba');
    expect(dhaba.cat).toBe('food'); // "restaurant" maps to food
    expect(dhaba.vt).toBe(240); // clamped to the 240 max

    const temple = result.find(p => p.name === 'Simhachalam Temple');
    expect(temple.cat).toBe('temple'); // "mandir" maps to temple
    expect(temple.importance).toBe('famous'); // invalid importance defaults to "famous"
    expect(temple.vt).toBe(20); // clamped to the 20 min floor
  });

  test('strips markdown code fences before parsing', async () => {
    callGeminiText.mockResolvedValue('```json\n' + JSON.stringify({ places: [{ name: 'X', category: 'beach' }] }) + '\n```');
    const result = await getPlaces('Goa', 15.4, 73.8, 600);
    expect(result.map(p => p.name)).toContain('X');
  });

  test('recovers places from a truncated JSON array by closing at the last complete object', async () => {
    // Simulates Gemini output cut off mid-stream: valid array open, one full
    // object, then a second object cut off before its closing brace.
    const truncated = '{"places": [{"name": "Complete Place", "category": "scenic"}, {"name": "Cut off place", "categ';
    callGeminiText.mockResolvedValue(truncated);

    const result = await getPlaces('Visakhapatnam', VIZAG.lat, VIZAG.lon, 600);
    expect(result.map(p => p.name)).toContain('Complete Place');
    expect(result.map(p => p.name)).not.toContain('Cut off place');
  });

  test('repairs a well-formed array wrapped in an otherwise-invalid outer object (e.g. trailing comma)', async () => {
    // The outer object has a trailing comma (invalid JSON), but the "places"
    // array itself is well-formed — this exercises the array-match-and-close
    // repair path, distinct from the truncated-mid-object case above.
    const malformed = '{"places": [{"name":"Array Repair A","category":"scenic"},{"name":"Array Repair B","category":"beach"}],}';
    callGeminiText.mockResolvedValue(malformed);

    const result = await getPlaces('Visakhapatnam', VIZAG.lat, VIZAG.lon, 600);
    expect(result.map(p => p.name).sort()).toEqual(['Array Repair A', 'Array Repair B']);
  });

  test('falls back to extracting individual {"name": ...} objects via regex when array-repair also fails', async () => {
    // No matching `[...]` for the array-repair path (no closing bracket
    // anywhere), but two standalone flat objects mentioning "name" are
    // findable individually.
    const garbled = 'garbage before {"name": "First", "category": "temple"} some noise {"name": "Second", "category": "beach"} trailing junk';
    callGeminiText.mockResolvedValue(garbled);

    const result = await getPlaces('Visakhapatnam', VIZAG.lat, VIZAG.lon, 600);
    expect(result.map(p => p.name).sort()).toEqual(['First', 'Second']);
  });

  test('returns an empty array (not throw) when nothing parseable is found', async () => {
    callGeminiText.mockResolvedValue('Sorry, I cannot help with that.');
    const result = await getPlaces('Visakhapatnam', VIZAG.lat, VIZAG.lon, 600);
    expect(result).toEqual([]);
  });

  test('drops entries with no name after parsing', async () => {
    callGeminiText.mockResolvedValue(JSON.stringify({ places: [{ category: 'scenic' }, { name: '  ', category: 'scenic' }, { name: 'Valid', category: 'scenic' }] }));
    const result = await getPlaces('Visakhapatnam', VIZAG.lat, VIZAG.lon, 600);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid');
  });
});

describe('geocodePlaceNominatim — Photon fallback when Nominatim is empty', () => {
  test('falls through to Photon when Nominatim returns zero results', async () => {
    let call = 0;
    fetch.mockImplementation(async (url) => {
      call++;
      if (String(url).includes('nominatim.openstreetmap.org')) {
        return { ok: true, json: async () => [] }; // Nominatim: nothing
      }
      // Photon
      return {
        ok: true,
        json: async () => ({
          features: [{
            geometry: { coordinates: [83.31, 17.72] },
            properties: { name: 'Kailasagiri', city: 'Visakhapatnam' },
          }],
        }),
      };
    });

    const result = await geocodePlaceNominatim('Kailasagiri', 'Visakhapatnam', VIZAG.lat, VIZAG.lon, 'scenic');
    expect(result).toEqual({ lat: 17.72, lon: 83.31 });
    expect(call).toBe(2); // Nominatim attempted first, then Photon
  });

  test('Photon result too far from city is rejected, same as Nominatim', async () => {
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('nominatim.openstreetmap.org')) return { ok: true, json: async () => [] };
      return {
        ok: true,
        json: async () => ({ features: [{ geometry: { coordinates: [85.0, 20.0] }, properties: { name: 'Far Place' } }] }),
      };
    });
    const result = await geocodePlaceNominatim('Far Place', 'Visakhapatnam', VIZAG.lat, VIZAG.lon, 'scenic');
    expect(result).toBeNull();
  });

  test('Photon network failure is swallowed, returns null rather than throwing', async () => {
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('nominatim.openstreetmap.org')) return { ok: true, json: async () => [] };
      throw new Error('photon down');
    });
    const result = await geocodePlaceNominatim('Anything', 'Visakhapatnam', VIZAG.lat, VIZAG.lon, 'scenic');
    expect(result).toBeNull();
  });

  test('Photon non-ok response returns null', async () => {
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('nominatim.openstreetmap.org')) return { ok: true, json: async () => [] };
      return { ok: false, status: 500 };
    });
    const result = await geocodePlaceNominatim('Anything', 'Visakhapatnam', VIZAG.lat, VIZAG.lon, 'scenic');
    expect(result).toBeNull();
  });
});

describe('fixAiCoordsViaNominatim', () => {
  function nominatimHit(name, lat, lon) {
    return [{ lat: String(lat), lon: String(lon), display_name: `${name}, India`, name }];
  }

  test('geocodes each unique AI place and tags nominatimFixed: true', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => nominatimHit('Borra Caves', 17.75, 83.28) });
    const aiPlaces = [{ name: 'Borra Caves', cat: 'scenic' }];

    const result = await runWithFakeDelays(() => fixAiCoordsViaNominatim(aiPlaces, VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Borra Caves', nominatimFixed: true, coords: [17.75, 83.28] });
  });

  test('pre-filters names matching the bad-name blocklist before ever geocoding', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => nominatimHit('X', 17.75, 83.28) });
    const aiPlaces = [
      { name: 'MG Road', cat: 'scenic' },       // "Road" — blocked
      { name: 'Jubilee Colony', cat: 'scenic' }, // "Colony" — blocked
      { name: 'Real Landmark', cat: 'scenic' },
    ];
    const result = await runWithFakeDelays(() => fixAiCoordsViaNominatim(aiPlaces, VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result.map(p => p.name)).toEqual(['Real Landmark']);
    expect(fetch).toHaveBeenCalledTimes(1); // only the one allowed name was ever geocoded
  });

  test('deduplicates AI places with the same name (case-insensitive) before geocoding', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => nominatimHit('Dup', 17.75, 83.28) });
    const aiPlaces = [{ name: 'Dup Place', cat: 'scenic' }, { name: 'dup place', cat: 'scenic' }];
    await runWithFakeDelays(() => fixAiCoordsViaNominatim(aiPlaces, VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('a place that fails to geocode is dropped, not left with bad coords', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [] }); // Nominatim empty
    // Photon also gets hit as a fallback per place; mock it empty too via same mock.
    const aiPlaces = [{ name: 'Ghost Place', cat: 'scenic' }];
    const result = await runWithFakeDelays(() => fixAiCoordsViaNominatim(aiPlaces, VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result).toEqual([]);
  });

  test('returns an empty array immediately when given no places', async () => {
    const result = await fixAiCoordsViaNominatim([], VIZAG.lat, VIZAG.lon, 'Visakhapatnam');
    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('hydrateAiPlaces', () => {
  test('grounds an AI place onto a known place with an exact name match, preferring known coords', async () => {
    const aiPlaces = [{ name: 'Kailasagiri', importanceScore: 100, cat: 'scenic' }];
    const known = [{ name: 'Kailasagiri', coords: [17.73, 83.32], importanceScore: 55, fallbackSource: 'wikipedia', id: 'wiki_1' }];

    const result = await hydrateAiPlaces(aiPlaces, known, VIZAG.lat, VIZAG.lon, 'Visakhapatnam');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Kailasagiri',
      coords: [17.73, 83.32],
      groundedSource: 'wikipedia',
      aiRanked: true,
      importanceScore: 100, // max(ai=100, known=55)
    });
  });

  test('falls back to fuzzy token-overlap matching when no exact name match exists', async () => {
    const aiPlaces = [{ name: 'Kailasagiri Hill Park', importanceScore: 90, cat: 'scenic' }];
    const known = [{ name: 'Kailasagiri', coords: [17.73, 83.32], importanceScore: 55, id: 'nom_1', fallbackSource: 'nominatim_search' }];

    const result = await hydrateAiPlaces(aiPlaces, known, VIZAG.lat, VIZAG.lon, 'Visakhapatnam');
    expect(result).toHaveLength(1);
    expect(result[0].coords).toEqual([17.73, 83.32]);
    expect(result[0].groundedSource).toBe('nominatim_search');
  });

  test('when two fuzzy matches tie on token overlap, picks the one with the higher importanceScore', async () => {
    const aiPlaces = [{ name: 'Kailasagiri Park', importanceScore: 90, cat: 'scenic' }];
    const known = [
      { name: 'Kailasagiri Garden', coords: [17.70, 83.20], importanceScore: 30, id: 'nom_low' },
      { name: 'Kailasagiri Museum', coords: [17.71, 83.21], importanceScore: 60, id: 'nom_high' },
    ];
    // Both known places share exactly one overlapping token ("kailasagiri")
    // with the AI place, so the tiebreak must fall to importanceScore.
    const result = await hydrateAiPlaces(aiPlaces, known, VIZAG.lat, VIZAG.lon, 'Visakhapatnam');
    expect(result).toHaveLength(1);
    expect(result[0].coords).toEqual([17.71, 83.21]); // the higher-importanceScore known place won
  });

  test('an AI place with no grounding match at all falls through to Nominatim geocoding', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '17.75', lon: '83.28', display_name: 'Borra Caves, India', name: 'Borra Caves' }],
    });
    const aiPlaces = [{ name: 'Borra Caves', importanceScore: 80, cat: 'scenic' }];
    const known = []; // nothing to ground against

    const result = await runWithFakeDelays(() => hydrateAiPlaces(aiPlaces, known, VIZAG.lat, VIZAG.lon, 'Visakhapatnam'));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Borra Caves', nominatimFixed: true, aiRanked: true });
  });

  test('only considers the first 18 AI candidates', async () => {
    const aiPlaces = Array.from({ length: 25 }, (_, i) => ({ name: `Place ${i}`, importanceScore: 50, cat: 'scenic' }));
    const known = aiPlaces.map((p, i) => ({ name: p.name, coords: [17.7 + i * 0.001, 83.2], importanceScore: 40, id: `k_${i}` }));

    const result = await hydrateAiPlaces(aiPlaces, known, VIZAG.lat, VIZAG.lon, 'Visakhapatnam');
    expect(result.length).toBeLessThanOrEqual(18);
  });

  test('deduplicates the final grounded + geocoded list by name', async () => {
    const aiPlaces = [
      { name: 'Kailasagiri', importanceScore: 90, cat: 'scenic' },
      { name: 'kailasagiri', importanceScore: 85, cat: 'scenic' }, // same place, different casing
    ];
    const known = [{ name: 'Kailasagiri', coords: [17.73, 83.32], importanceScore: 55, id: 'wiki_1' }];

    const result = await hydrateAiPlaces(aiPlaces, known, VIZAG.lat, VIZAG.lon, 'Visakhapatnam');
    expect(result).toHaveLength(1);
  });
});
