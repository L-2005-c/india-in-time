// Regression test for the "0 stops for every city except Vizag" bug.
//
// Root cause: Gemini's open_time/close_time isn't guaranteed to be strict
// "HH:MM". A truthy-but-malformed value (e.g. "9:00 AM") used to pass
// straight through `p.open_time || default` into the place object, and the
// frontend's t2m() parser silently turned anything it couldn't parse into 0
// (midnight) — making closeMin=0 and the place read as permanently closed.
// Cities that leaned on AI-sourced places (i.e. everywhere except Vizag,
// which has 33 hand-curated static seeds) could have their entire pool
// zeroed out by the itinerary builder's "hard reject if closed" check.
//
// getPlaces() must now validate ot/ct against a strict HH:MM shape and fall
// back to the category default whenever the AI's value doesn't match.

jest.mock('../services/gemini', () => ({
  callGeminiText: jest.fn(),
}));

const { callGeminiText } = require('../services/gemini');
const { getPlaces } = require('../services/placesDiscovery');

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function geminiResponse(places) {
  return JSON.stringify({ places });
}

describe('getPlaces — open_time/close_time validation', () => {
  afterEach(() => jest.clearAllMocks());

  test('malformed open_time/close_time from Gemini falls back to a valid HH:MM default', async () => {
    callGeminiText.mockResolvedValue(geminiResponse([
      {
        name: 'Example Fort',
        category: 'scenic',
        importance: 'must_see',
        visit_minutes: 60,
        open_time: '9:00 AM',       // malformed — not HH:MM
        close_time: 'Open 24 hours', // malformed — not HH:MM
        indoor_outdoor: 'outdoor',
      },
    ]));

    const places = await getPlaces('Testville', 12.34, 56.78, 600);
    expect(places).toHaveLength(1);
    expect(places[0].ot).toMatch(TIME_RE);
    expect(places[0].ct).toMatch(TIME_RE);
    // Specifically must NOT collapse to midnight-closed (the actual bug).
    expect(places[0].ct).not.toBe('00:00');
    expect(places[0].ot).toBe('06:00');
    expect(places[0].ct).toBe('20:00');
  });

  test('malformed times for a food place fall back to the food-specific default', async () => {
    callGeminiText.mockResolvedValue(geminiResponse([
      {
        name: 'Example Cafe',
        category: 'food',
        importance: 'famous',
        visit_minutes: 45,
        open_time: 'morning',
        close_time: 'late night',
        indoor_outdoor: 'indoor',
      },
    ]));

    const places = await getPlaces('Testville', 12.34, 56.78, 600);
    expect(places[0].ot).toBe('11:00');
    expect(places[0].ct).toBe('23:00');
  });

  test('well-formed HH:MM times from Gemini are preserved as-is', async () => {
    callGeminiText.mockResolvedValue(geminiResponse([
      {
        name: 'Example Temple',
        category: 'temple',
        importance: 'famous',
        visit_minutes: 45,
        open_time: '05:30',
        close_time: '21:15',
        indoor_outdoor: 'mixed',
      },
    ]));

    const places = await getPlaces('Testville', 12.34, 56.78, 600);
    expect(places[0].ot).toBe('05:30');
    expect(places[0].ct).toBe('21:15');
  });

  test('missing open_time/close_time still falls back to the category default', async () => {
    callGeminiText.mockResolvedValue(geminiResponse([
      {
        name: 'Example Beach',
        category: 'beach',
        importance: 'must_see',
        visit_minutes: 90,
        indoor_outdoor: 'outdoor',
      },
    ]));

    const places = await getPlaces('Testville', 12.34, 56.78, 600);
    expect(places[0].ot).toBe('06:00');
    expect(places[0].ct).toBe('20:00');
  });
});
