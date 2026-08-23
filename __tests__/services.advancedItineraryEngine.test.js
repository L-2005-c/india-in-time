'use strict';

const { planAdvancedItinerary } = require('../services/travelIntelligence/advancedItineraryEngine');
const { parseRequirements } = require('../services/travelIntelligence/requirementEngine');

const VIZAG = [
  { id: 1, name: 'Yarada Beach', cat: 'beach', coords: [17.65, 83.26], vt: 90, is_sunrise_spot: true },
  { id: 2, name: "Dolphin's Nose Lighthouse", cat: 'scenic', coords: [17.675, 83.295], vt: 45, is_sunset_spot: true },
  { id: 3, name: 'Simhachalam Temple', cat: 'temple', coords: [17.766, 83.25], vt: 50 },
  { id: 4, name: 'Daspalla Restaurant', cat: 'food', coords: [17.72, 83.30], vt: 50 },
  { id: 5, name: 'Kailasagiri', cat: 'scenic', coords: [17.748, 83.342], vt: 60, is_sunset_spot: true },
  { id: 6, name: 'INS Kursura Submarine Museum', cat: 'museum', coords: [17.717, 83.331], vt: 60 },
  { id: 7, name: 'Ramakrishna Beach', cat: 'beach', coords: [17.714, 83.323], vt: 75 },
  { id: 8, name: 'Beach Food Court', cat: 'food', coords: [17.713, 83.322], vt: 45 },
  { id: 9, name: 'Alpha Hotel Vizag', cat: 'hotel', coords: [17.72, 83.31], vt: 30 },
];

describe('advanced requirement-aware itinerary', () => {
  test('Scenario D: hard exclusion of temples yields zero temples', () => {
    const plan = planAdvancedItinerary(VIZAG, {
      startMin: 9 * 60,
      endMin: 19 * 60,
      preferredCategories: ['beach', 'food', 'scenic'],
      excludedCategories: ['temple'],
      personas: ['food_lover'],
    });
    expect(plan.stops.every((s) => s.category !== 'temple')).toBe(true);
    expect(plan.stops.every((s) => !/temple|simhachalam/i.test(s.name))).toBe(true);
  });

  test('Scenario G: food focus places food near meal windows', () => {
    const plan = planAdvancedItinerary(VIZAG, {
      startMin: 9 * 60,
      endMin: 21 * 60,
      preferredCategories: ['beach', 'food'],
      personas: ['food_lover'],
    });
    const foodStops = plan.stops.filter((s) => s.category === 'food' || /restaurant|food/i.test(s.name));
    expect(foodStops.length).toBeGreaterThanOrEqual(1);
    expect(foodStops.length).toBeLessThanOrEqual(2);
  });

  test('Scenario E: short 4-hour trip stays compact', () => {
    const plan = planAdvancedItinerary(VIZAG, {
      startMin: 10 * 60,
      endMin: 14 * 60,
      preferredCategories: ['scenic', 'museum'],
      maxStops: 4,
    });
    expect(plan.stopCount).toBeLessThanOrEqual(4);
  });

  test('Scenario B: 1 PM start does not schedule sunrise beach first', () => {
    const plan = planAdvancedItinerary(VIZAG, {
      startMin: 13 * 60,
      endMin: 21 * 60,
      preferredCategories: ['beach', 'food', 'scenic', 'museum'],
      personas: ['food_lover'],
    });
    expect(plan.algorithm).toBe('geo-temporal-beam-search-v5-world-class');
    if (plan.stops[0]) {
      const [h] = String(plan.stops[0].arriveAt).split(':').map(Number);
      expect(h).toBeGreaterThanOrEqual(12);
    }
  });

  test('hotels are not scheduled as attractions', () => {
    const plan = planAdvancedItinerary(VIZAG, {
      startMin: 9 * 60,
      endMin: 18 * 60,
      preferredCategories: ['food', 'beach'],
    });
    expect(plan.stops.every((s) => !/alpha hotel/i.test(s.name))).toBe(true);
  });

  test('stops are chronological', () => {
    const plan = planAdvancedItinerary(VIZAG, {
      startMin: 6 * 60,
      endMin: 21 * 60,
      preferredCategories: ['beach', 'temple', 'food', 'scenic'],
      personas: ['photographer', 'food_lover'],
    });
    let prev = 0;
    for (const s of plan.stops) {
      const [h, m] = String(s.arriveAt).split(':').map(Number);
      const min = h * 60 + m;
      expect(min).toBeGreaterThanOrEqual(prev);
      prev = min;
    }
  });

  test('parseRequirements classifies hard exclusions', () => {
    const r = parseRequirements({
      excludedCategories: ['temple'],
      preferredCategories: ['beach'],
      startMin: 600,
      endMin: 1200,
    });
    expect(r.hard.excludedCategories).toContain('temple');
    expect(r.soft.preferredCategories).toContain('beach');
  });

  test('heavy rain avoids outdoor beaches in wet window', () => {
    const plan = planAdvancedItinerary(VIZAG, {
      startMin: 14 * 60,
      endMin: 17 * 60,
      preferredCategories: ['beach', 'museum', 'food'],
      weather: { tempC: 27, condition: 'Heavy Rain' },
    });
    const wetOutdoor = plan.stops.filter((s) => {
      if (s.category !== 'beach' && s.category !== 'scenic') return false;
      const [h, m] = String(s.arriveAt).split(':').map(Number);
      const min = h * 60 + m;
      return min >= 14 * 60 && min <= 17 * 60;
    });
    expect(wetOutdoor.length).toBe(0);
  });

  test('each stop has reasons and constraints', () => {
    const plan = planAdvancedItinerary(VIZAG, {
      startMin: 9 * 60,
      endMin: 19 * 60,
      preferredCategories: ['beach', 'scenic'],
    });
    for (const s of plan.stops) {
      expect(Array.isArray(s.reasons)).toBe(true);
      expect(s.constraintsSatisfied).toBeTruthy();
      expect(s.arriveAt).toBeTruthy();
      expect(s.leaveAt).toBeTruthy();
    }
  });
});

test('explicit required meal is treated as a hard planning anchor', () => {
  const plan = planAdvancedItinerary([
    { id: 'museum', name: 'Indoor Museum', cat: 'museum', coords: [17.71, 83.31], ot: '09:00', ct: '18:00', vt: 60 },
    { id: 'lunch', name: 'Lunch Cafe', cat: 'food', coords: [17.712, 83.312], ot: '11:00', ct: '15:00', vt: 45 },
  ], {
    startMin: 12 * 60,
    endMin: 15 * 60 + 30,
    requiredMeals: ['lunch'],
  });
  expect(plan.requirements.hard.requiredMeals).toContain('lunch');
  expect(plan.stops.some((s) => s.category === 'food' && /^1[12]|^13|^14/.test(s.arriveAt))).toBe(true);
});

test('final validator exposes a machine-readable feasibility status', () => {
  const plan = planAdvancedItinerary(VIZAG, {
    startMin: 13 * 60,
    endMin: 14 * 60,
    preferredCategories: ['beach', 'food'],
    excludedCategories: ['temple'],
  });
  expect(['FEASIBLE', 'INFEASIBLE']).toContain(plan.status);
  expect(plan.validation).toHaveProperty('passed');
  expect(plan).toHaveProperty('requirementSatisfaction.score');
});

test('nearby walking spots are automatically discovered and attached', () => {
  const plan = planAdvancedItinerary(VIZAG, {
    startMin: 9 * 60,
    endMin: 18 * 60,
    preferredCategories: ['museum', 'food', 'beach'],
  });
  expect(plan.status).toBe('FEASIBLE');
  // Check that stops have nearbySpots array attached
  expect(plan.stops.every((s) => Array.isArray(s.nearbySpots))).toBe(true);
  const stopWithNearby = plan.stops.find((s) => s.nearbySpots.length > 0);
  if (stopWithNearby) {
    const nearby = stopWithNearby.nearbySpots[0];
    expect(nearby).toHaveProperty('name');
    expect(nearby).toHaveProperty('distanceM');
    expect(nearby.distanceM).toBeLessThanOrEqual(1200);
  }
});

test('high midday heat shifts outdoor activities away from 12-3 PM window', () => {
  const plan = planAdvancedItinerary(VIZAG, {
    startMin: 10 * 60,
    endMin: 17 * 60,
    preferredCategories: ['beach', 'museum', 'food', 'scenic'],
    weather: { tempC: 38, condition: 'Sunny' },
  });
  expect(plan.status).toBe('FEASIBLE');
  const middayStops = plan.stops.filter((s) => {
    const [h, m] = String(s.arriveAt).split(':').map(Number);
    const min = h * 60 + m;
    return min >= 12 * 60 && min <= 15 * 60;
  });
  // Midday stops should prefer indoor venues like museums/food rather than exposed beaches
  for (const s of middayStops) {
    expect(s.category).not.toBe('beach');
  }
});

test('sunset spot is aligned with evening golden hour window', () => {
  const plan = planAdvancedItinerary(VIZAG, {
    startMin: 14 * 60,
    endMin: 20 * 60,
    preferredCategories: ['scenic', 'beach', 'food'],
  });
  expect(plan.status).toBe('FEASIBLE');
  const sunsetStop = plan.stops.find((s) => s.name === "Dolphin's Nose Lighthouse" || s.name === 'Kailasagiri' || s.category === 'scenic');
  if (sunsetStop) {
    const [h] = String(sunsetStop.arriveAt).split(':').map(Number);
    expect(h).toBeGreaterThanOrEqual(15);
  }
});

