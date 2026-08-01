const {
  filterPlacesByPrefs,
  normalizeTokens,
  tokenOverlap,
  isConfidentWikiMatch,
  dedupePlacesByName,
  fallbackCategoryForQuery,
  inferFallbackCategory,
  visitMinutesForCat,
} = require('../utils/placesMerge');

describe('filterPlacesByPrefs', () => {
  const places = [
    { name: 'A', cat: 'food' },
    { name: 'B', cat: 'temple' },
    { name: 'C', cat: 'beach' },
  ];

  test('returns all places when prefs is empty', () => {
    expect(filterPlacesByPrefs(places, [])).toEqual(places);
  });

  test('filters to only matching categories', () => {
    expect(filterPlacesByPrefs(places, ['food', 'beach'])).toEqual([
      { name: 'A', cat: 'food' },
      { name: 'C', cat: 'beach' },
    ]);
  });

  test('handles non-array places input', () => {
    expect(filterPlacesByPrefs(null, ['food'])).toEqual([]);
  });
});

describe('normalizeTokens', () => {
  test('lowercases and strips punctuation', () => {
    // "fort" is a known stop-word (see STOP set), so it's correctly dropped.
    expect(normalizeTokens('Red Fort, Delhi!')).toEqual(['red', 'delhi']);
  });

  test('drops known stop-words like "temple", "beach"', () => {
    expect(normalizeTokens('Golden Temple')).toEqual(['golden']);
  });

  test('drops tokens shorter than 3 characters', () => {
    expect(normalizeTokens('MG Rd')).toEqual([]);
  });

  test('keeps short-but-important tokens exactly 3 chars long', () => {
    expect(normalizeTokens('Ram Mandir Area')).toContain('ram');
  });

  test('handles non-string / empty input', () => {
    expect(normalizeTokens(undefined)).toEqual([]);
    expect(normalizeTokens('')).toEqual([]);
  });
});

describe('tokenOverlap', () => {
  test('counts shared tokens between two names', () => {
    expect(tokenOverlap('India Gate Lawns', 'India Gate')).toBe(2);
  });

  test('returns 0 when there is no overlap', () => {
    expect(tokenOverlap('Red Fort', 'Marine Drive')).toBe(0);
  });

  test('returns 0 for empty inputs', () => {
    expect(tokenOverlap('', '')).toBe(0);
  });
});

describe('isConfidentWikiMatch', () => {
  test('accepts a strong single-token match', () => {
    const ai = { name: 'Charminar' };
    const wiki = { name: 'Charminar' };
    expect(isConfidentWikiMatch(ai, wiki)).toBe(true);
  });

  test('rejects a weak/no-overlap match', () => {
    const ai = { name: 'Red Fort Delhi' };
    const wiki = { name: 'Marine Drive Mumbai' };
    expect(isConfidentWikiMatch(ai, wiki)).toBe(false);
  });

  test('requires at least 2 overlapping tokens for multi-token AI names', () => {
    const ai = { name: 'India Gate Lawns' };
    const wikiPartial = { name: 'India Museum' }; // only 1 overlapping token
    expect(isConfidentWikiMatch(ai, wikiPartial)).toBe(false);
  });
});

describe('dedupePlacesByName', () => {
  test('removes duplicate names (case/punctuation-insensitive)', () => {
    const list = [
      { name: 'Red Fort', coords: [1, 2] },
      { name: 'red-fort', coords: [1, 2] },
      { name: 'India Gate', coords: [3, 4] },
    ];
    expect(dedupePlacesByName(list)).toHaveLength(2);
  });

  test('drops entries with missing/short coords', () => {
    const list = [
      { name: 'NoCoords' },
      { name: 'ShortCoords', coords: [1] },
      { name: 'Valid', coords: [1, 2] },
    ];
    expect(dedupePlacesByName(list)).toEqual([{ name: 'Valid', coords: [1, 2] }]);
  });

  test('handles empty/null input', () => {
    expect(dedupePlacesByName(null)).toEqual([]);
    expect(dedupePlacesByName([])).toEqual([]);
  });
});

describe('fallbackCategoryForQuery', () => {
  test('maps known food-related queries to "food"', () => {
    expect(fallbackCategoryForQuery('restaurant')).toBe('food');
    expect(fallbackCategoryForQuery('cafe')).toBe('food');
  });

  test('maps "temple" and "beach" directly', () => {
    expect(fallbackCategoryForQuery('temple')).toBe('temple');
    expect(fallbackCategoryForQuery('beach')).toBe('beach');
  });

  test('defaults to "scenic" for unknown queries', () => {
    expect(fallbackCategoryForQuery('something-unknown')).toBe('scenic');
  });
});

describe('inferFallbackCategory', () => {
  test('classifies a restaurant-like row as food', () => {
    const row = { class: 'amenity', type: 'restaurant', name: 'Tasty Bites' };
    expect(inferFallbackCategory(row, 'scenic')).toBe('food');
  });

  test('classifies a place-of-worship row as temple', () => {
    const row = { type: 'place_of_worship', name: 'Shiva Mandir' };
    expect(inferFallbackCategory(row, 'scenic')).toBe('temple');
  });

  test('falls back to query-based category when nothing matches', () => {
    const row = { class: 'natural', type: 'peak', name: 'Nilgiri Hills' };
    expect(inferFallbackCategory(row, 'beach')).toBe('beach');
  });
});

describe('visitMinutesForCat', () => {
  test('returns expected durations per category', () => {
    expect(visitMinutesForCat('food')).toBe(45);
    expect(visitMinutesForCat('beach')).toBe(90);
    expect(visitMinutesForCat('temple')).toBe(60);
  });

  test('defaults to 60 minutes for unknown categories', () => {
    expect(visitMinutesForCat('unknown-category')).toBe(60);
  });
});
