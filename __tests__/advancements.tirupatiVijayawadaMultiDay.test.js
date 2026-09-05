'use strict';

/**
 * __tests__/advancements.tirupatiVijayawadaMultiDay.test.js
 * Comprehensive verification of:
 * 1. Tirupati and Vijayawada POI expansions, golden datasets, and whitelists.
 * 2. Tirumala Ghat road curfew and Kanaka Durga temple darshan sevas.
 * 3. Multi-Day Paderu/Alluri and Tirupati Regional Circuit Planner.
 * 4. Travel-Time ghat corridor physics and switchback speeds (backend + frontend parity).
 * 5. Frontend UI stop card rendering with Why Now bullets and Time Intelligence chips.
 */

const fs = require('fs');
const path = require('path');
const { getCitySeeds, resolveCityKey } = require('../data/city-seeds');
const { findGoldenPoi } = require('../data/goldenPoiDataset');
const { isWhitelistedTourismPoi } = require('../services/travelIntelligence/tourismPoi/tourismWhitelist');
const { getCulturalRitualIntel } = require('../services/travelIntelligence/culturalRitualEngine');
const { planMultiDayCircuit } = require('../services/travelIntelligence/advancedItineraryEngine');
const { isGhatRoadCorridor } = require('../services/travelIntelligence/trafficEngine');
const { getSignatureDish } = require('../services/travelIntelligence/signatureDishEngine');

const ITINERARY_UI_PATH = path.join(__dirname, '../frontend/app-src/src/modules/itineraryUiEngine.js');
const TRAVEL_TIME_PATH = path.join(__dirname, '../frontend/app-src/src/utils/travel-time.js');
const TIME_BADGES_PATH = path.join(__dirname, '../frontend/app-src/src/utils/time-badges.js');
const STYLES_CSS_PATH = path.join(__dirname, '../frontend/app-src/styles.css');

describe('Tirupati & Vijayawada District Benchmark Coverage', () => {
  test('Tirupati seeds contain 25+ verified POIs with iconic landmarks', () => {
    const seeds = getCitySeeds('tirupati');
    expect(seeds.length).toBeGreaterThanOrEqual(25);
    const names = seeds.map(s => s.name);
    expect(names).toEqual(expect.arrayContaining([
      'Tirumala Venkateswara Temple',
      'Sri Padmavathi Ammavari Temple (Tiruchanur)',
      'Chandragiri Fort & Raja Mahal Sound Light Show',
      'Alipiri Footpath 3550 Steps Sacred Trek',
      'Srivari Mettu 2388 Steps Ancient Trek',
      'Silathoranam Natural Rock Arch Tirumala',
      'Talakona Waterfalls & Bio-Reserve',
      'Tirupati Laddu Complex Prasadam Counter',
    ]));
  });

  test('Vijayawada seeds contain 25+ verified POIs with Krishna riverfront attractions', () => {
    const seeds = getCitySeeds('vijayawada');
    expect(seeds.length).toBeGreaterThanOrEqual(25);
    const names = seeds.map(s => s.name);
    expect(names).toEqual(expect.arrayContaining([
      'Sri Durga Malleswara Swamy Varla Devasthanam (Kanaka Durga)',
      'Prakasam Barrage & Riverfront Promenade',
      'Bhavani Island & Water Sports Park',
      'Undavalli Caves Rock-Cut Architecture',
      'Kondapalli Fort & Heritage Ramparts',
      'Kondapalli Toy Village Crafts Center',
      'Babai Hotel Heritage Ghee Idli',
    ]));
  });

  test('Regional aliases resolve tirumala -> tirupati and bezawada -> vijayawada', () => {
    expect(resolveCityKey('tirumala')).toBe('tirupati');
    expect(resolveCityKey('bezawada')).toBe('vijayawada');
  });

  test('Golden dataset contains verified POIs for Tirupati and Vijayawada', () => {
    const tpt = findGoldenPoi('Tirumala Venkateswara Temple', 'tirupati');
    expect(tpt).not.toBeNull();
    expect(tpt.city).toBe('Tirupati');

    const vja = findGoldenPoi('Kanaka Durga Temple', 'vijayawada');
    expect(vja).not.toBeNull();
    expect(vja.city).toBe('Vijayawada');
  });

  test('Tourism whitelist permits authentic attractions in Tirupati and Vijayawada', () => {
    expect(isWhitelistedTourismPoi('Tirumala Venkateswara Temple', 'tirupati')).toBe(true);
    expect(isWhitelistedTourismPoi('Kanaka Durga Temple', 'vijayawada')).toBe(true);
    expect(isWhitelistedTourismPoi('Undavalli Caves', 'vijayawada')).toBe(true);
  });
});

describe('Cultural Intelligence: Tirumala Curfew & Temple Sevas', () => {
  test('Detects Tirumala night curfew between 23:45 and 03:00', () => {
    const tirumalaPlace = { name: 'Tirumala Venkateswara Temple', cat: 'temple' };
    const midnightTime = new Date('2026-09-05T01:30:00+05:30');
    const intel = getCulturalRitualIntel(tirumalaPlace, midnightTime);

    expect(intel.activeRitual).not.toBeNull();
    expect(intel.activeRitual.type).toBe('curfew');
    expect(intel.culturalBadge).toContain('Curfew');
  });

  test('Detects Kanaka Durga dawn Suprabhata Seva', () => {
    const durgaPlace = { name: 'Sri Durga Malleswara Swamy Varla Devasthanam (Kanaka Durga)', cat: 'temple' };
    const dawnTime = new Date('2026-09-05T04:30:00+05:30');
    const intel = getCulturalRitualIntel(durgaPlace, dawnTime);

    expect(intel.activeRitual).not.toBeNull();
    expect(intel.activeRitual.name).toContain('Suprabhata Seva');
  });
});

describe('Multi-Day Regional Circuit Itinerary Planning', () => {
  test('Generates optimal 3-day Paderu / Alluri circuit decomposing into Araku, Vanjangi, and Lambasingi', async () => {
    const seeds = getCitySeeds('paderu');
    const circuit = await planMultiDayCircuit(seeds, {
      numDays: 3,
      region: 'paderu',
      city: 'paderu',
      originCoords: [18.0833, 82.6667],
    });

    expect(circuit.totalDays).toBe(3);
    expect(circuit.dayPlans.length).toBe(3);
    expect(circuit.circuitName).toContain('Alluri Agency');

    // Day 1: Araku Valley & Borra
    expect(circuit.dayPlans[0].theme).toContain('Araku Valley');
    expect(circuit.dayPlans[0].recommendedHub).toContain('Araku');
    expect(circuit.dayPlans[0].stops.length).toBeGreaterThanOrEqual(3);

    // Day 2: Vanjangi Sunrise & Paderu Heritage
    expect(circuit.dayPlans[1].theme).toContain('Vanjangi');
    expect(circuit.dayPlans[1].recommendedHub).toContain('Paderu');
    expect(circuit.dayPlans[1].startTime).toBe('04:30'); // Early sunrise
    expect(circuit.dayPlans[1].stops.length).toBeGreaterThanOrEqual(3);

    // Day 3: Lambasingi Mist & Waterfalls
    expect(circuit.dayPlans[2].theme).toContain('Lambasingi');
    expect(circuit.dayPlans[2].recommendedHub).toContain('Lambasingi');
    expect(circuit.dayPlans[2].stops.length).toBeGreaterThanOrEqual(3);
  });

  test('Generates 2-day Tirupati sacred pilgrimage circuit with Tirumala and Heritage days', async () => {
    const seeds = getCitySeeds('tirupati');
    const circuit = await planMultiDayCircuit(seeds, {
      numDays: 2,
      region: 'tirupati',
      city: 'tirupati',
      originCoords: [13.6288, 79.4192],
    });

    expect(circuit.totalDays).toBe(2);
    expect(circuit.dayPlans[0].theme).toContain('Tirumala Sacred Darshan');
    expect(circuit.dayPlans[1].theme).toContain('Chandragiri');
  });
});

describe('Ghat Corridor Physics & Routing Parity', () => {
  test('Backend detects ghat corridor for Paderu and Tirumala routes', () => {
    expect(isGhatRoadCorridor(null, null, 'paderu')).toBe(true);
    expect(isGhatRoadCorridor([18.08, 82.66], [18.28, 83.04])).toBe(true); // Paderu to Borra
    expect(isGhatRoadCorridor([13.65, 79.38], [13.68, 79.34])).toBe(true); // Alipiri to Tirumala
    expect(isGhatRoadCorridor([13.08, 80.27], [13.05, 80.28], 'chennai')).toBe(false); // Urban Chennai
  });

  test('Frontend travel-time.js contains identical ghat factors and winding speeds', () => {
    const travelTimeSource = fs.readFileSync(TRAVEL_TIME_PATH, 'utf8');
    expect(travelTimeSource).toContain('GHAT_ROAD_NETWORK_FACTOR = 1.68');
    expect(travelTimeSource).toContain('isGhatRoadCorridor(');
    expect(travelTimeSource).toContain('13.2 km/h crawl on ghat switchbacks');
    expect(travelTimeSource).toContain('isGhat ? 0.22 : 0.32');
  });
});

describe('Frontend Stop Card Visual Intelligence & CSS Parity', () => {
  test('itineraryUiEngine.js supports Why-Now bullets, cloud inversion badges, and mountain advisories', () => {
    const uiEngineSource = fs.readFileSync(ITINERARY_UI_PATH, 'utf8');
    expect(uiEngineSource).toContain('chip-cloud-inversion');
    expect(uiEngineSource).toContain('chip-sanctum-closure');
    expect(uiEngineSource).toContain('why-now-card');
    expect(uiEngineSource).toContain('why-now-title');
    expect(uiEngineSource).toContain('why-now-list');
    expect(uiEngineSource).toContain('chip-ghat-road');
    expect(uiEngineSource).toContain('chip-4x4-cab');
    expect(uiEngineSource).toContain('chip-fog-warning');
  });

  test('time-badges.js includes cloud inversion window and midday sanctum closure', () => {
    const timeBadgesSource = fs.readFileSync(TIME_BADGES_PATH, 'utf8');
    expect(timeBadgesSource).toContain('Cloud Inversion Window');
    expect(timeBadgesSource).toContain('Midday Sanctum Closure');
    expect(timeBadgesSource).toContain('Tirumala Ghat Road Curfew');
  });

  test('styles.css contains styling rules for visual time intelligence elements', () => {
    const stylesCss = fs.readFileSync(STYLES_CSS_PATH, 'utf8');
    expect(stylesCss).toContain('.chip-cloud-inversion');
    expect(stylesCss).toContain('.chip-sanctum-closure');
    expect(stylesCss).toContain('.why-now-card');
    expect(stylesCss).toContain('.why-now-list');
    expect(stylesCss).toContain('.transit-mountain-advisory');
  });

  test('Resolves signature dish for new districts in signatureDishEngine', () => {
    const paderuDish = getSignatureDish({ name: 'Vanjangi Sunrise Point', city: 'paderu' });
    expect(paderuDish.dishName).toContain('Bamboo Chicken');

    const tirupatiDish = getSignatureDish({ name: 'Tirumala Venkateswara Temple', city: 'tirupati' });
    expect(tirupatiDish.dishName).toContain('Laddu');

    const vjaDish = getSignatureDish({ name: 'Kanaka Durga Temple', city: 'vijayawada' });
    expect(vjaDish.dishName).toContain('Babai Hotel');
  });
});
