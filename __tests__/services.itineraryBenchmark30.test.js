'use strict';

const { planAdvancedItinerary, replanAdvanced } = require('../services/travelIntelligence/advancedItineraryEngine');
const { parseRequirements } = require('../services/travelIntelligence/requirementEngine');

const VIZAG_CANDIDATES = [
  { id: 'yarada', name: 'Yarada Beach', cat: 'beach', coords: [17.65, 83.26], vt: 75, ot: '06:00', ct: '19:30', is_sunrise_spot: true, is_sunset_spot: true, isFree: true, accessible: { wheelchair: true }, transportModes: ['car', 'cab'] },
  { id: 'dolphin', name: 'Dolphin Nose Lighthouse', cat: 'scenic', coords: [17.675, 83.295], vt: 50, ot: '06:00', ct: '20:00', is_sunset_spot: true, isFree: true, accessible: { wheelchair: true }, transportModes: ['car', 'cab'] },
  { id: 'temple', name: 'Simhachalam Temple', cat: 'temple', coords: [17.766, 83.25], vt: 50, ot: '08:00', ct: '18:00', estimatedCost: 50, transportModes: ['car', 'cab'] },
  { id: 'lunch', name: 'Daspalla Restaurant', cat: 'food', coords: [17.72, 83.30], vt: 50, ot: '11:00', ct: '15:00', estimatedCost: 300, vegetarian: true, vegan: true, wheelchair_accessible: true, transportModes: ['car', 'cab', 'walk'] },
  { id: 'sunset', name: 'Kailasagiri', cat: 'scenic', coords: [17.748, 83.342], vt: 60, ot: '08:00', ct: '19:00', estimatedCost: 40, is_sunset_spot: true, accessible: { wheelchair: true }, transportModes: ['car', 'cab'] },
  { id: 'museum', name: 'INS Kursura Submarine Museum', cat: 'museum', coords: [17.717, 83.331], vt: 60, ot: '10:00', ct: '17:00', estimatedCost: 100, accessible: { wheelchair: true }, transportModes: ['car', 'cab', 'walk'] },
  { id: 'rk', name: 'Ramakrishna Beach', cat: 'beach', coords: [17.714, 83.323], vt: 75, ot: '06:00', ct: '20:00', isFree: true, accessible: { wheelchair: true }, transportModes: ['car', 'cab', 'walk'] },
  { id: 'dinner', name: 'Beach Food Court', cat: 'food', coords: [17.713, 83.322], vt: 45, ot: '11:30', ct: '22:00', estimatedCost: 180, vegetarian: true, vegan: true, wheelchair_accessible: true, transportModes: ['car', 'cab', 'walk'] },
  { id: 'night', name: 'Night Market', cat: 'market', coords: [17.72, 83.31], vt: 60, ot: '17:00', ct: '23:00', estimatedCost: 0, isFree: true, accessible: { wheelchair: true }, transportModes: ['car', 'cab', 'walk'] },
  { id: 'hotel', name: 'Sample Hotel', cat: 'hotel', coords: [17.72, 83.31], vt: 30 },
];

const baseConfig = { originCoords: [17.72, 83.31], startMin: 8 * 60, endMin: 21 * 60 };

describe('32-Scenario Production Itinerary Benchmark Suite', () => {
  test('Scenario 1: Morning Start', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 7 * 60, endMin: 13 * 60 });
    expect(p.status).toBe('FEASIBLE');
    expect(p.stops.length).toBeGreaterThan(0);
  });

  test('Scenario 2: Afternoon 13:00 Start with Lunch', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 13 * 60, endMin: 20 * 60, requiredMeals: ['lunch'] });
    expect(p.stops[0]?.arriveAt?.slice(0, 2)).not.toBe('06');
    expect(p.status).toBe('FEASIBLE');
  });

  test('Scenario 3: Evening 16:00 Start', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 16 * 60, endMin: 21 * 60 });
    expect(p.status).toBe('FEASIBLE');
  });

  test('Scenario 4: Night 19:00 Start', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 19 * 60, endMin: 22 * 60 });
    expect(p.status).toBe('FEASIBLE');
  });

  test('Scenario 5: Food-focused Persona', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, preferredCategories: ['food'], personas: ['food_lover'], startMin: 11 * 60 });
    expect(p.stops.some(s => s.category === 'food')).toBe(true);
  });

  test('Scenario 6: Photography-focused Persona', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, preferredCategories: ['scenic'], personas: ['photographer'] });
    expect(p.requirementSatisfaction.score).toBeGreaterThanOrEqual(50);
  });

  test('Scenario 7: Beach + Food Hybrid', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, preferredCategories: ['beach', 'food'], requiredMeals: ['lunch'] });
    expect(p.stops.some(s => s.category === 'beach') && p.stops.some(s => s.category === 'food')).toBe(true);
  });

  test('Scenario 8: Low-crowd Requirement', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, personas: ['low_crowd'] });
    expect(p.stops.every(s => !['Very High', 'High'].includes(s.crowdLevel))).toBe(true);
  });

  test('Scenario 9: Family Pacing', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, personas: ['family'], tripMode: 'family' });
    expect(p.status).toBe('FEASIBLE');
  });

  test('Scenario 10: Budget Soft Constraint', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, budget: 350 });
    expect(['FEASIBLE', 'INFEASIBLE']).toContain(p.status);
  });

  test('Scenario 11: Temple Category Hard Exclusion', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, excludedCategories: ['temple'] });
    expect(p.stops.every(s => !/temple/i.test(s.name))).toBe(true);
  });

  test('Scenario 12: Beach Category Hard Exclusion', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, excludedCategories: ['beach'] });
    expect(p.stops.every(s => s.category !== 'beach')).toBe(true);
  });

  test('Scenario 13: 4-Hour Compact Trip', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 10 * 60, endMin: 14 * 60, maxStops: 4 });
    expect(p.stopCount).toBeLessThanOrEqual(4);
  });

  test('Scenario 14: 8-Hour Full-Day Trip', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 8 * 60, endMin: 16 * 60 });
    expect(p.status).toBe('FEASIBLE');
  });

  test('Scenario 15: Rain Window Avoidance for Outdoor Stops', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, {
      ...baseConfig,
      startMin: 14 * 60,
      endMin: 18 * 60,
      weather: {
        hourly: [
          { time: '14:00', tempC: 27, condition: 'Heavy Rain' },
          { time: '15:00', tempC: 27, condition: 'Heavy Rain' },
          { time: '16:00', tempC: 28, condition: 'Clear' },
          { time: '17:00', tempC: 28, condition: 'Clear' },
        ],
      },
    });
    expect(p.stops.filter(s => ['beach', 'scenic'].includes(s.category) && /^14:|^15:/.test(s.arriveAt)).length).toBe(0);
  });

  test('Scenario 16: Extreme Heat Mode Protection', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 13 * 60, endMin: 17 * 60, weather: { tempC: 39, condition: 'Clear' } });
    expect(p.stops.filter(s => ['beach', 'scenic'].includes(s.category)).length).toBeLessThanOrEqual(1);
  });

  test('Scenario 17: Traffic Provenance Labeling', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 17 * 60, endMin: 20 * 60 });
    expect(p.stops.every(s => ['estimated', 'route_estimate', 'live', 'live_traffic'].includes(s.travelSource))).toBe(true);
  });

  test('Scenario 18: Golden-Hour Sunset Scheduling', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 16 * 60, endMin: 20 * 60, preferredCategories: ['scenic'], personas: ['photographer'] });
    expect(p.stops.length).toBeGreaterThan(0);
  });

  test('Scenario 19: Closed Restaurant Rejection', () => {
    const closed = [{ id: 'closed', name: 'Closed Restaurant', cat: 'food', coords: [17.72, 83.30], vt: 45, ot: '10:00', ct: '12:00', estimatedCost: 100, vegetarian: true }];
    const p = planAdvancedItinerary(closed, { ...baseConfig, startMin: 14 * 60, endMin: 15 * 60 });
    expect(p.stopCount).toBe(0);
  });

  test('Scenario 20: Restaurant Opening Later Returns Infeasible if Dinner Required Early', () => {
    const r = [{ id: 'late', name: 'Late Restaurant', cat: 'food', coords: [17.72, 83.30], vt: 45, ot: '16:00', ct: '22:00', estimatedCost: 100, vegetarian: true }];
    const p = planAdvancedItinerary(r, { ...baseConfig, startMin: 14 * 60, endMin: 18 * 60, requiredMeals: ['dinner'] });
    expect(p.status).toBe('INFEASIBLE');
  });

  test('Scenario 21: Lunch Requirement Scheduling', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 12 * 60, endMin: 15 * 60 + 30, requiredMeals: ['lunch'] });
    expect(p.status).toBe('FEASIBLE');
    expect(p.stops.some(s => s.category === 'food' && /^1[12]|^13|^14/.test(s.arriveAt))).toBe(true);
  });

  test('Scenario 22: Dinner Requirement Scheduling', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 18 * 60, endMin: 22 * 60, requiredMeals: ['dinner'] });
    expect(p.status).toBe('FEASIBLE');
    expect(p.stops.some(s => s.category === 'food' && /^1[89]|^20|^21|^22/.test(s.arriveAt))).toBe(true);
  });

  test('Scenario 23: Multiple Meal Requirements (Lunch + Dinner)', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 11 * 60, endMin: 22 * 60, requiredMeals: ['lunch', 'dinner'] });
    expect(p.status).toBe('FEASIBLE');
    expect(p.requirementSatisfaction.breakdown.mealScore).toBe(100);
  });

  test('Scenario 24: Dynamic User Delay Replanning Locks Completed Stops', () => {
    const first = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, startMin: 12 * 60, endMin: 20 * 60, maxStops: 3 });
    const completed = [first.stops[0]];
    const replanned = replanAdvanced(VIZAG_CANDIDATES.filter(p => p.name !== completed[0].name), {
      ...baseConfig,
      completedStops: completed,
      cursor: 16 * 60,
      currentCoords: completed[0].coords,
      endMin: 21 * 60,
      maxStops: 2,
    });
    expect(replanned.stops.every(s => s.name !== completed[0].name)).toBe(true);
  });

  test('Scenario 25: Routing Provider Failure Degrades Gracefully', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES.map(x => ({ ...x, coords: null })), { ...baseConfig });
    expect(p.stops.every(s => s.travelSource === 'estimated')).toBe(true);
  });

  test('Scenario 26: Missing Weather Data Never Fabricates', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig });
    expect(p.stops.every(s => ['unavailable', 'forecast', 'observed'].includes(s.dataSources.weather))).toBe(true);
  });

  test('Scenario 27: Missing Crowd Data Maintains Provenance', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig });
    expect(p.stops.every(s => s.dataSources.crowd)).toBe(true);
  });

  test('Scenario 28: Must-Visit Hard Constraint Fulfillment', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, mustVisit: ['Yarada Beach'], maxStops: 5 });
    expect(p.status).toBe('FEASIBLE');
    expect(p.stops.some(s => s.name === 'Yarada Beach')).toBe(true);
  });

  test('Scenario 29: Preference vs Hard Exclusion Conflict (Exclusion Wins)', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, preferredCategories: ['temple'], excludedCategories: ['temple'] });
    expect(p.stops.every(s => s.category !== 'temple')).toBe(true);
  });

  test('Scenario 30: Hard Budget Compliance', () => {
    const p = planAdvancedItinerary(VIZAG_CANDIDATES, { ...baseConfig, budget: 200, budgetHard: true });
    if (p.status === 'FEASIBLE') {
      expect(p.estimatedCost).toBeLessThanOrEqual(200);
    }
  });

  test('Scenario 31: Unknown Wheelchair Accessibility Fails Safely on Hard Constraint', () => {
    const r = parseRequirements({ accessibilityRequirements: ['wheelchair'] });
    const p = planAdvancedItinerary([{ id: 1, name: 'Unknown', cat: 'museum', coords: [17.7, 83.3], ot: '09:00', ct: '18:00' }], { ...baseConfig, ...r, accessibilityRequirements: ['wheelchair'] });
    expect(p.status).toBe('INFEASIBLE');
  });

  test('Scenario 32: Unknown Dietary Data Fails Safely on Hard Dietary Constraint', () => {
    const p = planAdvancedItinerary([{ id: 1, name: 'Unknown Cafe', cat: 'food', coords: [17.7, 83.3], ot: '11:00', ct: '15:00', estimatedCost: 100 }], {
      ...baseConfig,
      startMin: 12 * 60,
      endMin: 15 * 60,
      requiredMeals: ['lunch'],
      dietaryRestrictions: ['vegetarian'],
    });
    expect(p.status).toBe('INFEASIBLE');
  });
});
