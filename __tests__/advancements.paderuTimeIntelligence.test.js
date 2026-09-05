'use strict';

/**
 * __tests__/advancements.paderuTimeIntelligence.test.js
 * Verification of:
 * 1. Paderu & Alluri Agency circuit (Araku Valley, Borra Caves, Vanjangi Hills, Lambasingi, Katiki).
 * 2. District POI expansions for Hyderabad, Mumbai, Chennai, and Kochi.
 * 3. Advanced Time Intelligence (temple sanctum closure, cloud inversion, ghat transit, exertion pacing).
 */

const { getCitySeeds, resolveCityKey } = require('../data/city-seeds');
const { GOLDEN_BENCHMARK_POIS } = require('../data/goldenPoiDataset');
const { isWhitelistedTourismPoi } = require('../services/travelIntelligence/tourismPoi/tourismWhitelist');
const { getCityTrafficMultiplier, isGhatRoadCorridor, estimateTravel, recommendTransitMode } = require('../services/travelIntelligence/trafficEngine');
const { getCulturalRitualIntel } = require('../services/travelIntelligence/culturalRitualEngine');
const { getTravelIntelligence } = require('../services/travelIntelligence/decisionEngine');
const { planAdvancedItinerary } = require('../services/travelIntelligence/advancedItineraryEngine');

describe('District Expansions & Paderu Regional Circuit Data', () => {
  test('Paderu seeds cover Araku, Borra Caves, Vanjangi, Lambasingi, Katiki, and Chaparai', () => {
    const paderuSeeds = getCitySeeds('paderu');
    expect(paderuSeeds.length).toBeGreaterThanOrEqual(20);

    const names = paderuSeeds.map(s => s.name);
    expect(names).toEqual(expect.arrayContaining([
      expect.stringMatching(/Vanjangi/i),
      expect.stringMatching(/Borra Caves/i),
      expect.stringMatching(/Araku/i),
      expect.stringMatching(/Lambasingi/i),
      expect.stringMatching(/Katiki/i),
      expect.stringMatching(/Chaparai/i),
      expect.stringMatching(/Modakondamma/i),
    ]));
  });

  test('Aliases araku, lambasingi, vanjangi resolve to paderu', () => {
    expect(resolveCityKey('araku')).toBe('paderu');
    expect(resolveCityKey('lambasingi')).toBe('paderu');
    expect(resolveCityKey('vanjangi')).toBe('paderu');
    expect(resolveCityKey('chennai')).toBe('chennai');
  });

  test('Golden Benchmark POI dataset contains verified attractions for all districts', () => {
    const districts = ['paderu', 'chennai', 'hyderabad', 'mumbai', 'kochi'];
    for (const dist of districts) {
      const pois = GOLDEN_BENCHMARK_POIS.filter(p => p.city.toLowerCase() === dist);
      expect(pois.length).toBeGreaterThanOrEqual(6);
    }
  });

  test('Tourism Whitelist allows verified attractions for Paderu and Chennai', () => {
    expect(isWhitelistedTourismPoi('Borra Caves', 'paderu')).toBe(true);
    expect(isWhitelistedTourismPoi('Vanjangi Hills', 'paderu')).toBe(true);
    expect(isWhitelistedTourismPoi('Araku Tribal Museum', 'paderu')).toBe(true);
    expect(isWhitelistedTourismPoi('Kapaleeshwarar Temple', 'chennai')).toBe(true);
    expect(isWhitelistedTourismPoi('Marina Beach', 'chennai')).toBe(true);
  });
});

describe('Advanced Time Intelligence: Traffic & Mountain Ghat Corridor', () => {
  test('Identifies Paderu and Eastern Ghats highlands as Ghat Road corridors', () => {
    expect(isGhatRoadCorridor([18.0833, 82.6667], [18.2815, 83.0402], 'paderu')).toBe(true);
    expect(isGhatRoadCorridor([18.3330, 82.8680], [18.0062, 82.7230], 'araku')).toBe(true);
    // Plain urban city should not be flagged as ghat
    expect(isGhatRoadCorridor([13.0827, 80.2707], [13.0500, 80.2824], 'chennai')).toBe(false);
  });

  test('Calculates mountain ghat transit dynamics with winding factors and safe speeds', () => {
    const travel = estimateTravel({
      fromCoords: [18.0833, 82.6667], // Paderu
      toCoords: [18.0062, 82.7230],   // Vanjangi
      departMin: 330, // 05:30 AM
      cityKey: 'paderu',
    });

    expect(travel.isGhatRoad).toBe(true);
    expect(travel.transitRecommendation.mode).toBe('ghat_cab');
    expect(travel.transitRecommendation.label).toContain('Mountain Cab');
  });

  test('Night ghat travel triggers mountain fog and hairpin curve safety advisory', () => {
    const nightTravel = estimateTravel({
      fromCoords: [18.0833, 82.6667],
      toCoords: [18.2815, 83.0402],
      departMin: 1200, // 20:00 PM (night)
      cityKey: 'paderu',
    });

    expect(nightTravel.isGhatRoad).toBe(true);
    expect(nightTravel.ghatNightAdvisory).toMatch(/fog|hairpin|30 km\/h/i);
  });

  test('City congestion multipliers scale rush hour appropriately for Mumbai vs Vizag/Paderu', () => {
    const morningRushMin = 540; // 09:00 AM
    const mumbaiMult = getCityTrafficMultiplier('mumbai', morningRushMin);
    const vizagMult = getCityTrafficMultiplier('vizag', morningRushMin);
    const paderuMult = getCityTrafficMultiplier('paderu', morningRushMin);

    expect(mumbaiMult).toBeGreaterThan(vizagMult);
    expect(vizagMult).toBeGreaterThanOrEqual(paderuMult);
  });
});

describe('Advanced Time Intelligence: Temple Sanctum Closures & Cloud Inversion', () => {
  test('Detects midday sanctum closure (Naivedyam) for temples', () => {
    const modakondammaMidday = getCulturalRitualIntel({ name: 'Sri Modakondamma Temple Paderu', cat: 'temple' }, 800); // 13:20 PM
    expect(modakondammaMidday.isSanctumClosure).toBe(true);

    const modakondammaMorning = getCulturalRitualIntel({ name: 'Sri Modakondamma Temple Paderu', cat: 'temple' }, 420); // 07:00 AM
    expect(modakondammaMorning.isSanctumClosure).toBe(false);

    const kapaleeshwararMidday = getCulturalRitualIntel({ name: 'Kapaleeshwarar Temple', cat: 'temple' }, 810); // 13:30 PM
    expect(kapaleeshwararMidday.isSanctumClosure).toBe(true);
  });

  test('Decision engine heavily penalizes temple visit during sanctum closure', () => {
    const templePlace = {
      id: 'modakondamma_temple',
      name: 'Sri Modakondamma Temple Paderu',
      cat: 'temple',
      coords: [18.0833, 82.6667],
      vt: 45,
      ot: '06:00',
      ct: '20:00',
    };

    const middayDate = new Date('2026-09-05T13:30:00+05:30');
    const eveningDate = new Date('2026-09-05T18:30:00+05:30');

    const middayIntel = getTravelIntelligence(templePlace, middayDate);
    const eveningIntel = getTravelIntelligence(templePlace, eveningDate);

    expect(middayIntel.cultural?.isSanctumClosure).toBe(true);
    expect(middayIntel.explanation.cautions).toEqual(
      expect.arrayContaining([expect.stringMatching(/sanctum afternoon closure/i)])
    );
    expect(eveningIntel.visitScore).toBeGreaterThan(middayIntel.visitScore);
  });

  test('Cloud inversion window triggers high score and special badge for Vanjangi at sunrise', () => {
    const vanjangiPlace = {
      id: 'vanjangi_hills',
      name: 'Vanjangi Hills',
      cat: 'scenic',
      coords: [18.0062, 82.7230],
      vt: 90,
      ot: '04:30',
      ct: '17:30',
      is_sunrise_spot: true,
    };

    const sunriseDate = new Date('2026-09-05T05:45:00+05:30'); // 05:45 AM
    const afternoonDate = new Date('2026-09-05T14:00:00+05:30'); // 02:00 PM

    const sunriseIntel = getTravelIntelligence(vanjangiPlace, sunriseDate);
    const afternoonIntel = getTravelIntelligence(vanjangiPlace, afternoonDate);

    expect(sunriseIntel.cloudInversion).toBe(true);
    expect(sunriseIntel.badges).toContain('☁️ Cloud Inversion Window');
    expect(sunriseIntel.visitScore).toBeGreaterThan(afternoonIntel.visitScore);
  });
});

describe('Itinerary Generation: Paderu / Araku Circuit', () => {
  test('Generates complete, feasible multi-stop plan for Paderu circuit', async () => {
    const candidates = getCitySeeds('paderu');
    const result = await planAdvancedItinerary(candidates, {
      startTime: '05:00',
      endTime: '20:00',
      region: 'paderu',
      city: 'paderu',
      originCoords: [18.0833, 82.6667],
      soft: {
        photography: true,
      },
    });

    expect(result.stops.length).toBeGreaterThanOrEqual(4);
    expect(result.validation.passed).toBe(true);

    const stopNames = result.stops.map(s => s.name);
    // Should include iconic highlights from Paderu/Araku/Lambasingi
    expect(stopNames.some(n => /vanjangi|araku|borra|chaparai|modakondamma|lambasingi|coffee/i.test(n))).toBe(true);

    // Stops should be chronologically ordered
    for (let i = 1; i < result.stops.length; i++) {
      expect(result.stops[i].arriveAt >= result.stops[i - 1].leaveAt).toBe(true);
    }
  });
});
