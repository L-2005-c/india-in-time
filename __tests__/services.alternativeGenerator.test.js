'use strict';

/**
 * __tests__/services.alternativeGenerator.test.js
 *
 * Comprehensive tests for Next-Gen Contextual Alternative Destination Generator:
 * - Multi-circuit Pan-India haven matching (Delhi, Mumbai, Bengaluru, Araku, Kochi)
 * - Multi-factor ranking (DNA match, proximity, weather shelter, operating hours)
 * - Heat wave air-conditioned haven selection
 * - Top-N alternatives ranking
 * - Zero-Failure contextual haven synthesis
 */

const {
  findAlternativeStop,
  findTopAlternatives,
  REGIONAL_ALTERNATIVE_HAVENS,
  GLOBAL_HAVEN_POOL,
} = require('../services/travelIntelligence/decision/alternativeGenerator');

describe('Alternative Haven Generator (v3.0)', () => {
  test('has rich Pan-India regional haven database covering major circuits', () => {
    expect(REGIONAL_ALTERNATIVE_HAVENS.length).toBeGreaterThanOrEqual(25);
    expect(GLOBAL_HAVEN_POOL.length).toBeGreaterThan(REGIONAL_ALTERNATIVE_HAVENS.length);

    const cities = new Set(REGIONAL_ALTERNATIVE_HAVENS.map(h => h.city));
    expect(cities.has('Delhi')).toBe(true);
    expect(cities.has('Bengaluru')).toBe(true);
    expect(cities.has('Hyderabad')).toBe(true);
    expect(cities.has('Visakhapatnam')).toBe(true);
    expect(cities.has('Mumbai')).toBe(true);
    expect(cities.has('Kochi')).toBe(true);
  });

  test('substitutes outdoor stop in Delhi with indoor museum during rain', () => {
    const disruptedOutdoorStop = {
      id: 'delhi_lodhi_gardens',
      name: 'Lodhi Gardens',
      cat: 'nature',
      lat: 28.5933,
      lon: 77.2197,
    };

    const alt = findAlternativeStop(disruptedOutdoorStop, {
      reason: 'WEATHER_RAIN',
      travelerDna: { museum: 90, heritage: 80 },
      currentMinute: 660, // 11:00 AM
    });

    expect(alt).toBeDefined();
    expect(alt.indoorOutdoor === 'indoor' || alt.indoorOutdoor === 'covered').toBe(true);
    expect(alt.city).toMatch(/Delhi/i);
    expect(alt.substituteScore).toBeGreaterThan(70);
    expect(alt.substitutionReason).toContain('adverse weather');
  });

  test('substitutes outdoor stop in Mumbai with CSMVS / planetarium during coastal downpour', () => {
    const disruptedStop = {
      id: 'marine_drive',
      name: 'Marine Drive Promenade',
      cat: 'beach',
      lat: 18.9438,
      lon: 72.8232,
    };

    const alt = findAlternativeStop(disruptedStop, {
      reason: 'WEATHER_RAIN',
      travelerDna: { artCulture: 90 },
      currentMinute: 660,
    });

    expect(alt).toBeDefined();
    expect(alt.city).toMatch(/Mumbai/i);
    expect(alt.indoorOutdoor).toBe('indoor');
  });

  test('prioritizes air-conditioned indoor haven during extreme Indian summer heat wave', () => {
    const disruptedStop = {
      id: 'hyderabad_fort',
      name: 'Golconda Outer Ramparts',
      cat: 'viewpoint',
      lat: 17.3833,
      lon: 78.4011,
    };

    const alt = findAlternativeStop(disruptedStop, {
      reason: 'HEAT_SURGE',
      travelerDna: { heritage: 85 },
      currentMinute: 780, // 13:00 PM (peak afternoon heat)
    });

    expect(alt).toBeDefined();
    expect(alt.airConditioned || alt.indoorOutdoor === 'indoor').toBe(true);
    expect(alt.city).toMatch(/Hyderabad/i);
  });

  test('findTopAlternatives returns ranked top-3 choices with score breakdowns', () => {
    const disruptedStop = {
      id: 'galikonda_viewpoint',
      name: 'Galikonda View Point',
      cat: 'viewpoint',
      lat: 18.25,
      lon: 82.95,
    };

    const topAlts = findTopAlternatives(disruptedStop, {
      reason: 'GHAT_ROAD_RISK',
      travelerDna: { photography: 80, food: 85 },
      limit: 3,
    });

    expect(topAlts.length).toBeGreaterThanOrEqual(1);
    expect(topAlts.length).toBeLessThanOrEqual(3);
    expect(topAlts[0].substituteScore).toBeGreaterThanOrEqual(topAlts[topAlts.length - 1].substituteScore);
    expect(topAlts[0]).toHaveProperty('dnaMatchScore');
    expect(topAlts[0]).toHaveProperty('distanceFromOriginalKm');
  });

  test('ZERO-FAILURE GUARANTEE: synthesizes high-integrity local haven in remote location', () => {
    const remoteStop = {
      id: 'remote_desert_dune',
      name: 'Thar Remote Outer Dunes',
      cat: 'nature',
      lat: 27.15,
      lon: 69.80, // Far border with no cataloged POIs within 65 km
    };

    const alt = findAlternativeStop(remoteStop, {
      reason: 'WEATHER_RAIN',
      travelerDna: { nature: 50 },
    });

    expect(alt).toBeDefined();
    expect(alt.name).toContain('Thar Remote Outer Dunes');
    expect(alt.indoorOutdoor).toBe('indoor');
    expect(alt.isSynthesized).toBe(true);
    expect(alt.substituteScore).toBeGreaterThan(60);
  });
});
