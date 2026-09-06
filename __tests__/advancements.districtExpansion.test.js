'use strict';

const { staticCityPlaces, resolveCityKey, ALIAS_MAP } = require('../data/city-seeds');
const { GOLDEN_POIS, GOLDEN_POIS_BY_CITY, findGoldenPoi } = require('../data/goldenPoiDataset');
const { resolveWhitelist, isWhitelistedTourismPoi, CITY_WHITELISTS } = require('../services/travelIntelligence/tourismPoi/tourismWhitelist');
const advisoryEngine = require('../services/travelIntelligence/advisoryEngine');

describe('Multi-District POI Expansion & Accuracy Verification', () => {
  test('Mumbai staticCityPlaces has at least 30 verified POIs and no duplicate stomping', () => {
    const mumbaiPlaces = staticCityPlaces('mumbai');
    expect(mumbaiPlaces.length).toBeGreaterThanOrEqual(30);

    // Verify key places exist and were not stomped
    const names = mumbaiPlaces.map(p => p.name);
    expect(names).toContain('Gateway of India');
    expect(names).toContain('Marine Drive');
    expect(names).toContain('Elephanta Caves');
    expect(names).toContain('Siddhivinayak Temple');
    expect(names).toContain('Global Vipassana Pagoda');
    expect(names).toContain('Bandra Fort (Castella de Aguada)');
  });

  test('Bengaluru, Delhi, Kolkata, Goa have verified benchmark POIs', () => {
    const blrPlaces = staticCityPlaces('bengaluru');
    expect(blrPlaces.length).toBeGreaterThanOrEqual(20);
    expect(blrPlaces.map(p => p.name)).toContain('Bangalore Palace');

    const delPlaces = staticCityPlaces('delhi');
    expect(delPlaces.length).toBeGreaterThanOrEqual(20);
    expect(delPlaces.some(p => p.name.includes('Red Fort'))).toBe(true);
    expect(delPlaces.some(p => p.name.includes('Qutub Minar'))).toBe(true);

    const kolPlaces = staticCityPlaces('kolkata');
    expect(kolPlaces.length).toBeGreaterThanOrEqual(20);
    expect(kolPlaces.some(p => p.name.includes('Victoria Memorial'))).toBe(true);

    const goaPlaces = staticCityPlaces('goa');
    expect(goaPlaces.length).toBeGreaterThanOrEqual(20);
    expect(goaPlaces.some(p => p.name.includes('Baga Beach'))).toBe(true);
    expect(goaPlaces.some(p => p.name.includes('Fort Aguada'))).toBe(true);
  });

  test('Mysuru / Mysore static seeds exist with verified landmarks', () => {
    const mysorePlaces = staticCityPlaces('mysore');
    expect(mysorePlaces.length).toBeGreaterThanOrEqual(20);

    const names = mysorePlaces.map(p => p.name);
    expect(names).toContain('Mysore Palace (Amba Vilas Palace)');
    expect(names).toContain('Chamundi Hill & Sri Chamundeshwari Temple');
    expect(names).toContain('Brindavan Gardens & Musical Dancing Fountain');
    expect(names).toContain('Sri Chamarajendra Zoological Gardens (Mysore Zoo)');

    // Alias verification
    expect(resolveCityKey('mysuru')).toBe('mysore');
    const mysuruPlaces = staticCityPlaces('mysuru');
    expect(mysuruPlaces.length).toBe(mysorePlaces.length);
  });

  test('Munnar static seeds exist with verified Western Ghats tea and ridge landmarks', () => {
    const munnarPlaces = staticCityPlaces('munnar');
    expect(munnarPlaces.length).toBeGreaterThanOrEqual(20);

    const names = munnarPlaces.map(p => p.name);
    expect(names).toContain('Eravikulam National Park (Nilgiri Tahr)');
    expect(names).toContain('Mattupetty Dam & Lake Speed Boating');
    expect(names).toContain('Top Station Cloud Viewpoint');
    expect(names).toContain('Tata Tea Museum Nallathanni Estate');
    expect(names).toContain('Kolukkumalai Highest Organic Tea Estate');
  });

  test('Golden POI dataset includes benchmark POIs for Mysuru and Munnar', () => {
    expect(GOLDEN_POIS.length).toBeGreaterThan(100);
    expect(GOLDEN_POIS_BY_CITY.has('mysore')).toBe(true);
    expect(GOLDEN_POIS_BY_CITY.has('munnar')).toBe(true);

    const mysoreGolden = findGoldenPoi('Mysore Palace', 'mysore');
    expect(mysoreGolden).toBeDefined();
    expect(mysoreGolden.canonicalName).toContain('Mysore Palace');

    const chamundiGolden = findGoldenPoi('Chamundeshwari', 'mysore');
    expect(chamundiGolden).toBeDefined();

    const munnarGolden = findGoldenPoi('Top Station', 'munnar');
    expect(munnarGolden).toBeDefined();

    const eravikulamGolden = findGoldenPoi('Eravikulam', 'munnar');
    expect(eravikulamGolden).toBeDefined();
  });

  test('Tourism whitelist resolves POIs in Mysuru and Munnar', () => {
    expect(CITY_WHITELISTS.mysore.length).toBeGreaterThan(5);
    expect(CITY_WHITELISTS.munnar.length).toBeGreaterThan(5);
    expect(resolveWhitelist({ name: 'Mysore Palace' }, 'mysore')).toBeDefined();

    expect(isWhitelistedTourismPoi('Mysore Palace (Amba Vilas Palace)', 'mysore')).toBe(true);
    expect(isWhitelistedTourismPoi('Chamundi Hill & Sri Chamundeshwari Temple', 'mysore')).toBe(true);
    expect(isWhitelistedTourismPoi('Top Station Cloud Viewpoint', 'munnar')).toBe(true);
    expect(isWhitelistedTourismPoi('Kolukkumalai Highest Organic Tea Estate', 'munnar')).toBe(true);
  });

  test('ALIAS_MAP covers New Delhi, Mysuru, and regional aliases', () => {
    expect(ALIAS_MAP['new delhi']).toBe('delhi');
    expect(ALIAS_MAP['mysuru']).toBe('mysore');
    expect(ALIAS_MAP['munnar']).toBe('munnar');
  });
});

describe('Advanced Time Intelligence: Midday Sun Harshness & Darshan Queue Engine', () => {
  test('getMiddaySunExposureAdvisory detects harsh sun and low shade on unshaded monuments during peak midday hours', () => {
    const advisory = advisoryEngine.getMiddaySunExposureAdvisory(
      { name: 'Red Fort', category: 'scenic' },
      { temp: 36, uvIndex: 8 },
      780 // 13:00 (1:00 PM)
    );

    expect(advisory.isHarshSun).toBe(true);
    expect(advisory.shadeIndex).toBe('LOW');
    expect(advisory.alert).toMatch(/Peak Sun Harshness|Midday Heat Danger/i);
    expect(advisory.guidance).toMatch(/UV-blocking|indoor/i);
  });

  test('getMiddaySunExposureAdvisory detects EXTREME_HEAT when temperatures exceed 38°C', () => {
    const advisory = advisoryEngine.getMiddaySunExposureAdvisory(
      { name: 'Ramakrishna Beach', category: 'beach' },
      { temp: 40, uvIndex: 10 },
      750 // 12:30 PM
    );

    expect(advisory.isHarshSun).toBe(true);
    expect(advisory.level).toBe('EXTREME_HEAT');
    expect(advisory.alert).toMatch(/Midday Heat Danger/i);
  });

  test('getMiddaySunExposureAdvisory safely suppresses warnings for indoor museums and cool/morning hours', () => {
    // Indoor museum during midday
    const museumAdvisory = advisoryEngine.getMiddaySunExposureAdvisory(
      { name: 'Salar Jung Museum', category: 'museum' },
      { temp: 35, uvIndex: 8 },
      750
    );
    expect(museumAdvisory.isHarshSun).toBe(false);

    // Beach in early morning (cool hours)
    const morningAdvisory = advisoryEngine.getMiddaySunExposureAdvisory(
      { name: 'Rushikonda Beach', category: 'beach' },
      { temp: 26, uvIndex: 3 },
      420 // 7:00 AM
    );
    expect(morningAdvisory.isHarshSun).toBe(false);
  });

  test('getDarshanQueueEstimate predicts realistic queue wait times for Tirumala Venkateswara Temple', () => {
    // Weekend peak afternoon darshan
    const weekendQueue = advisoryEngine.getDarshanQueueEstimate(
      'Tirumala Venkateswara Temple',
      660, // 11:00 AM
      0 // Sunday
    );

    expect(weekendQueue.isSacredDarshan).toBe(true);
    expect(weekendQueue.estimatedWaitMinutes).toBeGreaterThanOrEqual(300);
    expect(weekendQueue.crowdFactor).toBe('EXTREME');
    expect(weekendQueue.tip).toMatch(/Divya Darshan|Alipiri/i);

    // Early dawn Suprabhatam slot
    const dawnQueue = advisoryEngine.getDarshanQueueEstimate(
      'Tirumala Venkateswara Temple',
      300, // 5:00 AM
      2 // Tuesday
    );
    expect(dawnQueue.estimatedWaitMinutes).toBeLessThanOrEqual(100);
  });

  test('getDarshanQueueEstimate predicts darshan queues for Kanaka Durga, Simhachalam, and Siddhivinayak', () => {
    const kdQueue = advisoryEngine.getDarshanQueueEstimate('Kanaka Durga Temple Vijayawada', 600, 5); // Friday
    expect(kdQueue.isSacredDarshan).toBe(true);
    expect(kdQueue.estimatedWaitMinutes).toBeGreaterThanOrEqual(100);

    const simhaQueue = advisoryEngine.getDarshanQueueEstimate('Simhachalam Temple', 600, 6); // Saturday
    expect(simhaQueue.isSacredDarshan).toBe(true);
    expect(simhaQueue.estimatedWaitMinutes).toBeGreaterThanOrEqual(80);

    const siddhiQueue = advisoryEngine.getDarshanQueueEstimate('Siddhivinayak Temple Mumbai', 600, 2); // Tuesday
    expect(siddhiQueue.isSacredDarshan).toBe(true);
    expect(siddhiQueue.estimatedWaitMinutes).toBeGreaterThanOrEqual(150);
  });

  test('dynamicAdvice enriches stop intel with sunExposure and darshanQueue payloads', () => {
    const intel = {
      name: 'Tirumala Venkateswara Temple',
      category: 'temple',
      isOpenNow: true,
      visitScore: 82,
      weather: { temp: 33, uvIndex: 7 },
      minuteOfDay: 720, // 12:00 PM
      dayOfWeek: 0, // Sunday
    };

    const advice = advisoryEngine.dynamicAdvice(intel);
    expect(advice.sunExposure).toBeDefined();
    expect(advice.sunExposure.isHarshSun).toBe(true);
    expect(advice.darshanQueue).toBeDefined();
    expect(advice.darshanQueue.isSacredDarshan).toBe(true);
    expect(advice.actions.some(a => a.includes('Darshan Queue'))).toBe(true);
    expect(advice.actions.some(a => a === advice.sunExposure.alert)).toBe(true);
  });
});
