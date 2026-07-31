const { personalizeScore, TRIP_MODES } = require('../services/timeIntelligence');

describe('personalizeScore — trip mode (solo/duo/trio/family/group)', () => {
  test('TRIP_MODES exposes exactly the five supported values', () => {
    expect(TRIP_MODES.sort()).toEqual(['duo', 'family', 'group', 'solo', 'trio'].sort());
  });

  test('family mode heavily discounts nightlife spots', () => {
    const nightlifeSpot = { cat: 'bar', has_nightlife: true };
    const base = 10;
    const scored = personalizeScore(base, nightlifeSpot, [], 'family');
    expect(scored).toBeLessThan(base);
    expect(scored).toBeCloseTo(base * 0.5, 5);
  });

  test('duo mode boosts sunset spots', () => {
    const sunsetSpot = { cat: 'scenic', is_sunset_spot: true };
    const base = 10;
    const scored = personalizeScore(base, sunsetSpot, [], 'duo');
    // sunset (1.6) * scenic (1.4) both apply multiplicatively
    expect(scored).toBeCloseTo(base * 1.6 * 1.4, 5);
  });

  test('solo mode boosts cafes/museums and discounts nightlife', () => {
    const cafe = { cat: 'cafe' };
    expect(personalizeScore(10, cafe, [], 'solo')).toBeCloseTo(13, 5);

    const bar = { cat: 'bar', has_nightlife: true };
    expect(personalizeScore(10, bar, [], 'solo')).toBeCloseTo(8.5, 5);
  });

  test('group mode boosts markets, food, and nightlife venues', () => {
    const market = { cat: 'market' };
    expect(personalizeScore(10, market, [], 'group')).toBeCloseTo(13, 5);
  });

  test('an unknown/invalid tripMode is ignored rather than throwing', () => {
    const place = { cat: 'market' };
    expect(() => personalizeScore(10, place, [], 'not-a-real-mode')).not.toThrow();
    expect(personalizeScore(10, place, [], 'not-a-real-mode')).toBe(10);
  });

  test('no tripMode (null/undefined) leaves score untouched', () => {
    const place = { cat: 'market', is_sunset_spot: true };
    expect(personalizeScore(10, place)).toBe(10);
    expect(personalizeScore(10, place, [], null)).toBe(10);
  });

  test('personas and tripMode stack multiplicatively', () => {
    const place = { cat: 'food' };
    // food_lover persona: food x1.8. trio tripMode: food x1.4.
    const scored = personalizeScore(10, place, ['food_lover'], 'trio');
    expect(scored).toBeCloseTo(10 * 1.8 * 1.4, 5);
  });
});
