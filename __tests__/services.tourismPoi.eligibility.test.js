'use strict';

/**
 * Tourism POI Eligibility Engine — regression suite
 *
 * CRITICAL: Marripalem and other locality-only results must NEVER
 * appear as tourist stops.
 */

const {
  evaluateCandidate,
  filterEligibleCandidates,
  isTourismEligible,
  isLocalityOnlyName,
  isBlacklistedEntity,
  classifyTourismCategory,
  computeTourismQualityScore,
  resolveWhitelist,
  TIERS,
  TOURISM_CLASSES,
} = require('../services/travelIntelligence/tourismPoi');

describe('Tourism POI Eligibility Engine', () => {
  describe('Hard reject: localities and non-tourist entities', () => {
    const localities = [
      'Marripalem',
      'Seethammadhara',
      'Dwaraka Nagar',
      'MVP Colony',
      'NAD Junction',
      'Gajuwaka',
      'Maddilapalem',
      'Jagadamba Junction',
      'RTC Complex',
      'Siripuram',
      'Kancharapalem',
      'Akkayyapalem',
    ];

    test.each(localities)('rejects locality "%s"', (name) => {
      const r = evaluateCandidate({ name, cat: 'scenic' });
      expect(r.eligible).toBe(false);
      expect(r.rejectReason).toBeTruthy();
    });

    test('rejects OSM residential type', () => {
      const r = evaluateCandidate({
        name: 'Some Place',
        osmType: 'residential',
        osmClass: 'place',
      });
      expect(r.eligible).toBe(false);
    });

    test('rejects highway / road', () => {
      const r = evaluateCandidate({
        name: 'Beach Road',
        osmClass: 'highway',
        osmType: 'primary',
      });
      expect(r.eligible).toBe(false);
    });

    test('rejects school / hospital / police', () => {
      expect(evaluateCandidate({ name: 'City Hospital', osmType: 'hospital' }).eligible).toBe(false);
      expect(evaluateCandidate({ name: 'Municipal School' }).eligible).toBe(false);
      expect(evaluateCandidate({ name: 'Police Station Gajuwaka' }).eligible).toBe(false);
    });

    test('rejects generic area prefixes', () => {
      expect(evaluateCandidate({ name: 'Central area of Marripalem' }).eligible).toBe(false);
      expect(evaluateCandidate({ name: 'near Seethammadhara' }).eligible).toBe(false);
    });

    test('isLocalityOnlyName detects pure localities', () => {
      expect(isLocalityOnlyName('Marripalem')).toBe(true);
      expect(isLocalityOnlyName('Ramakrishna Beach')).toBe(false);
      expect(isLocalityOnlyName('CMR Central')).toBe(false);
    });
  });

  describe('Accept genuine tourist attractions', () => {
    const attractions = [
      { name: 'Ramakrishna Beach', cat: 'beach' },
      { name: 'Kailasagiri', cat: 'scenic' },
      { name: 'INS Kursura Submarine Museum', cat: 'museum' },
      { name: 'Simhachalam Temple', cat: 'temple' },
      { name: 'Rushikonda Beach', cat: 'beach' },
      { name: 'Thotlakonda Buddhist Complex', cat: 'scenic' },
      { name: 'Indira Gandhi Zoological Park', cat: 'park' },
      { name: 'Dolphins Nose Lighthouse', cat: 'scenic' },
    ];

    test.each(attractions)('accepts $name', (place) => {
      const r = evaluateCandidate(place, { city: 'Visakhapatnam' });
      expect(r.eligible).toBe(true);
      expect(r.tourismTier).not.toBe(TIERS.REJECT);
      expect(r.tourismQualityScore).toBeGreaterThan(0);
    });
  });

  describe('Shopping destinations', () => {
    test('accepts CMR Central as shopping', () => {
      const r = evaluateCandidate(
        { name: 'CMR Central', cat: 'shopping' },
        { city: 'Vizag', allowShopping: true }
      );
      expect(r.eligible).toBe(true);
      expect(r.productCategory).toBe('shopping');
    });

    test('accepts Inorbit Mall', () => {
      const r = evaluateCandidate(
        { name: 'Inorbit Mall', cat: 'shopping' },
        { city: 'Visakhapatnam', allowShopping: true }
      );
      expect(r.eligible).toBe(true);
    });

    test('rejects shopping when allowShopping=false', () => {
      const r = evaluateCandidate(
        { name: 'CMR Central', cat: 'shopping' },
        { allowShopping: false }
      );
      expect(r.eligible).toBe(false);
      expect(r.rejectReason).toBe('shopping_not_requested');
    });
  });

  describe('Whitelist resolution', () => {
    test('resolves Ramakrishna Beach', () => {
      const wl = resolveWhitelist({ name: 'RK Beach' }, 'vizag');
      expect(wl).toBeTruthy();
      expect(wl.category).toBe('beach');
      expect(wl.tier).toBe('S');
    });

    test('resolves submarine museum by alias', () => {
      const wl = resolveWhitelist({ name: 'Kursura' }, 'visakhapatnam');
      expect(wl).toBeTruthy();
      expect(wl.name).toMatch(/Kursura/i);
    });
  });

  describe('Quality score respects volume', () => {
    test('high volume moderate rating beats tiny sample high rating', () => {
      const highVol = computeTourismQualityScore(
        {
          name: 'Popular Beach',
          rating: 4.6,
          reviewCount: 8000,
          importance: 'famous',
          source: 'curated',
        },
        { class: TOURISM_CLASSES.BEACH, isTourist: true, confidence: 0.9 }
      );
      const lowVol = computeTourismQualityScore(
        {
          name: 'Obscure Spot',
          rating: 4.9,
          reviewCount: 8,
          importance: 'local',
          source: 'nominatim',
        },
        { class: TOURISM_CLASSES.SCENIC_LOCATION, isTourist: true, confidence: 0.6 }
      );
      expect(highVol.score).toBeGreaterThan(lowVol.score);
    });
  });

  describe('filterEligibleCandidates batch', () => {
    test('filters mix of good and bad candidates', () => {
      const places = [
        { name: 'Marripalem', cat: 'scenic' },
        { name: 'Ramakrishna Beach', cat: 'beach' },
        { name: 'NAD Junction', cat: 'scenic' },
        { name: 'Kailasagiri', cat: 'scenic' },
        { name: 'Some Colony Phase 2', cat: 'park' },
        { name: 'CMR Central', cat: 'shopping' },
      ];
      const { eligible, rejected, stats } = filterEligibleCandidates(places, {
        city: 'Vizag',
        allowShopping: true,
        allowFood: true,
      });
      expect(stats.input).toBe(6);
      expect(eligible.map((p) => p.name)).toEqual(
        expect.arrayContaining(['Ramakrishna Beach', 'Kailasagiri', 'CMR Central'])
      );
      expect(eligible.every((p) => !/marripalem|nad junction|colony/i.test(p.name))).toBe(true);
      expect(rejected.length).toBeGreaterThanOrEqual(3);
      expect(rejected.some((r) => /marripalem/i.test(r.name))).toBe(true);
    });

    test('NEVER lets Marripalem through under any option combination', () => {
      const variants = [
        {},
        { allowFood: true, allowShopping: true },
        { requireTouristOnly: true },
        { discoveryMode: true },
        { minTier: 'D' },
        { city: 'Visakhapatnam' },
      ];
      for (const opts of variants) {
        const r = evaluateCandidate({ name: 'Marripalem', lat: 17.74, lon: 83.3 }, opts);
        expect(r.eligible).toBe(false);
      }
    });
  });

  describe('Category classifier', () => {
    test('classifies beach / temple / museum / mall', () => {
      expect(classifyTourismCategory({ name: 'Yarada Beach' }).class).toBe(TOURISM_CLASSES.BEACH);
      expect(classifyTourismCategory({ name: 'Simhachalam Temple' }).class).toBe(TOURISM_CLASSES.TEMPLE);
      expect(classifyTourismCategory({ name: 'City Museum', cat: 'museum' }).class).toBe(TOURISM_CLASSES.MUSEUM);
      expect(classifyTourismCategory({ name: 'Inorbit Mall' }).class).toBe(TOURISM_CLASSES.SHOPPING_MALL);
    });
  });
});

describe('Multi-city whitelist', () => {
  const { resolveWhitelist, listSupportedCities, getCityWhitelist } = require('../services/travelIntelligence/tourismPoi');

  test('supports major cities', () => {
    const cities = listSupportedCities();
    expect(cities).toEqual(expect.arrayContaining([
      'visakhapatnam', 'hyderabad', 'goa', 'jaipur', 'delhi',
      'mumbai', 'bengaluru', 'kochi', 'agra', 'varanasi', 'kolkata',
    ]));
  });

  test.each([
    ['Taj Mahal', 'agra', 'scenic'],
    ['Gateway of India', 'mumbai', 'scenic'],
    ['Charminar', 'hyderabad', 'scenic'],
    ['India Gate', 'delhi', 'scenic'],
    ['Baga Beach', 'goa', 'beach'],
    ['Amber Fort', 'jaipur', 'scenic'],
    ['Victoria Memorial', 'kolkata', 'scenic'],
    ['Lalbagh Botanical Garden', 'bengaluru', 'park'],
  ])('resolves %s in %s', (name, city, cat) => {
    const wl = resolveWhitelist({ name }, city);
    expect(wl).toBeTruthy();
    expect(wl.category).toBe(cat);
  });

  test('getCityWhitelist returns entries', () => {
    expect(getCityWhitelist('delhi').length).toBeGreaterThan(5);
    expect(getCityWhitelist('mumbai').length).toBeGreaterThan(5);
  });
});

describe('Exclusive categories hard mode', () => {
  const { filterEligibleCandidates, evaluateCandidate } = require('../services/travelIntelligence/tourismPoi');

  test('malls only rejects beaches', () => {
    const r = evaluateCandidate(
      { name: 'Ramakrishna Beach', cat: 'beach' },
      { city: 'Vizag', exclusiveCategories: ['shopping'], allowShopping: true }
    );
    expect(r.eligible).toBe(false);
    expect(r.rejectReason).toBe('exclusive_category_miss');
  });

  test('malls only accepts CMR Central', () => {
    const r = evaluateCandidate(
      { name: 'CMR Central', cat: 'shopping' },
      { city: 'Vizag', exclusiveCategories: ['shopping'], allowShopping: true }
    );
    expect(r.eligible).toBe(true);
  });

  test('beaches only batch', () => {
    const places = [
      { name: 'Ramakrishna Beach', cat: 'beach' },
      { name: 'Kailasagiri', cat: 'scenic' },
      { name: 'CMR Central', cat: 'shopping' },
      { name: 'Marripalem' },
    ];
    const { eligible, rejected } = filterEligibleCandidates(places, {
      city: 'Vizag',
      exclusiveCategories: ['beach'],
      allowShopping: true,
    });
    expect(eligible.every((p) => p.cat === 'beach')).toBe(true);
    expect(eligible.some((p) => p.name === 'Ramakrishna Beach')).toBe(true);
    expect(rejected.some((r) => /marripalem/i.test(r.name))).toBe(true);
  });
});
