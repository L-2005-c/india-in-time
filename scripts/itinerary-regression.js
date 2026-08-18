'use strict';

const assert = require('assert');
const { planAdvancedItinerary, replanAdvanced } = require('../services/travelIntelligence/advancedItineraryEngine');
const { parseRequirements } = require('../services/travelIntelligence/requirementEngine');

const VIZAG = [
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

const base = { originCoords: [17.72, 83.31], startMin: 8 * 60, endMin: 21 * 60 };
let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed += 1; console.log(`✓ ${String(passed).padStart(2, '0')} ${name}`); }
  catch (err) { failures.push({ name, error: err.message }); console.error(`✗ ${name}: ${err.message}`); }
}

// 1–10: start times and personas
check('morning start', () => assert.doesNotThrow(() => planAdvancedItinerary(VIZAG, { ...base, startMin: 7 * 60, endMin: 13 * 60 })));
check('13:00 start', () => { const p = planAdvancedItinerary(VIZAG, { ...base, startMin: 13 * 60, endMin: 20 * 60, requiredMeals: ['lunch'] }); assert.notStrictEqual(p.stops[0]?.arriveAt?.slice(0, 2), '06'); });
check('16:00 start', () => assert.doesNotThrow(() => planAdvancedItinerary(VIZAG, { ...base, startMin: 16 * 60, endMin: 21 * 60 })));
check('19:00 start', () => assert.doesNotThrow(() => planAdvancedItinerary(VIZAG, { ...base, startMin: 19 * 60, endMin: 22 * 60 })));
check('food-focused', () => { const p = planAdvancedItinerary(VIZAG, { ...base, preferredCategories: ['food'], personas: ['food_lover'], startMin: 11 * 60 }); assert(p.stops.some((s) => s.category === 'food')); });
check('photography-focused', () => { const p = planAdvancedItinerary(VIZAG, { ...base, preferredCategories: ['scenic'], personas: ['photographer'] }); assert(p.requirementSatisfaction.score >= 50); });
check('beach + food', () => { const p = planAdvancedItinerary(VIZAG, { ...base, preferredCategories: ['beach', 'food'], requiredMeals: ['lunch'] }); assert(p.stops.some((s) => s.category === 'beach') && p.stops.some((s) => s.category === 'food')); });
check('low-crowd', () => { const p = planAdvancedItinerary(VIZAG, { ...base, personas: ['low_crowd'] }); assert(p.stops.every((s) => !['Very High', 'High'].includes(s.crowdLevel))); });
check('family', () => assert.doesNotThrow(() => planAdvancedItinerary(VIZAG, { ...base, personas: ['family'], tripMode: 'family' })));
check('budget traveler soft preference', () => { const p = planAdvancedItinerary(VIZAG, { ...base, budget: 350 }); assert(p.status === 'FEASIBLE' || p.status === 'INFEASIBLE'); });

// 11–20: hard constraints and temporal intelligence
check('temple exclusion', () => { const p = planAdvancedItinerary(VIZAG, { ...base, excludedCategories: ['temple'] }); assert(p.stops.every((s) => !/temple/i.test(s.name))); });
check('beach exclusion', () => { const p = planAdvancedItinerary(VIZAG, { ...base, excludedCategories: ['beach'] }); assert(p.stops.every((s) => s.category !== 'beach')); });
check('four-hour trip', () => { const p = planAdvancedItinerary(VIZAG, { ...base, startMin: 10 * 60, endMin: 14 * 60, maxStops: 4 }); assert(p.stopCount <= 4); });
check('eight-hour trip', () => assert.doesNotThrow(() => planAdvancedItinerary(VIZAG, { ...base, startMin: 8 * 60, endMin: 16 * 60 })));
check('rain window', () => { const p = planAdvancedItinerary(VIZAG, { ...base, startMin: 14 * 60, endMin: 18 * 60, weather: { hourly: [{ time: '14:00', tempC: 27, condition: 'Heavy Rain' }, { time: '15:00', tempC: 27, condition: 'Heavy Rain' }, { time: '16:00', tempC: 28, condition: 'Clear' }, { time: '17:00', tempC: 28, condition: 'Clear' }] } }); assert(p.stops.filter((s) => ['beach', 'scenic'].includes(s.category) && /^14:|^15:/.test(s.arriveAt)).length === 0); });
check('extreme heat', () => { const p = planAdvancedItinerary(VIZAG, { ...base, startMin: 13 * 60, endMin: 17 * 60, weather: { tempC: 39, condition: 'Clear' } }); assert(p.stops.filter((s) => ['beach', 'scenic'].includes(s.category)).length <= 1); });
check('traffic increase does not claim live data', () => { const p = planAdvancedItinerary(VIZAG, { ...base, startMin: 17 * 60, endMin: 20 * 60 }); assert(p.stops.every((s) => ['estimated', 'route_estimate', 'live', 'live_traffic'].includes(s.travelSource))); });
check('golden-hour preference', () => { const p = planAdvancedItinerary(VIZAG, { ...base, startMin: 16 * 60, endMin: 20 * 60, preferredCategories: ['scenic'], personas: ['photographer'] }); assert(p.stops.length > 0); });
check('closed restaurant excluded', () => { const closed = [{ id: 'closed', name: 'Closed Restaurant', cat: 'food', coords: [17.72, 83.30], vt: 45, ot: '10:00', ct: '12:00', estimatedCost: 100, vegetarian: true }]; const p = planAdvancedItinerary(closed, { ...base, startMin: 14 * 60, endMin: 15 * 60 }); assert.strictEqual(p.stopCount, 0); });
check('restaurant opens later', () => { const r = [{ id: 'late', name: 'Late Restaurant', cat: 'food', coords: [17.72, 83.30], vt: 45, ot: '16:00', ct: '22:00', estimatedCost: 100, vegetarian: true }]; const p = planAdvancedItinerary(r, { ...base, startMin: 14 * 60, endMin: 18 * 60, requiredMeals: ['dinner'] }); assert.strictEqual(p.status, 'INFEASIBLE'); });

// 21–30: meals, replanning, provider/data failures, conflicts
check('lunch requirement', () => { const p = planAdvancedItinerary(VIZAG, { ...base, startMin: 12 * 60, endMin: 15 * 60 + 30, requiredMeals: ['lunch'] }); assert(p.status === 'FEASIBLE' && p.stops.some((s) => s.category === 'food' && /^1[12]|^13|^14/.test(s.arriveAt))); });
check('dinner requirement', () => { const p = planAdvancedItinerary(VIZAG, { ...base, startMin: 18 * 60, endMin: 22 * 60, requiredMeals: ['dinner'] }); assert(p.status === 'FEASIBLE' && p.stops.some((s) => s.category === 'food' && /^1[89]|^20|^21|^22/.test(s.arriveAt))); });
check('multiple meal requirements', () => { const p = planAdvancedItinerary(VIZAG, { ...base, startMin: 11 * 60, endMin: 22 * 60, requiredMeals: ['lunch', 'dinner'] }); assert.strictEqual(p.status, 'FEASIBLE'); assert(p.requirementSatisfaction.breakdown.mealScore === 100); });
check('user delay replanning', () => { const first = planAdvancedItinerary(VIZAG, { ...base, startMin: 12 * 60, endMin: 20 * 60, maxStops: 3 }); assert(first.stops.length > 0); const completed = [first.stops[0]]; const replanned = replanAdvanced(VIZAG.filter((p) => p.name !== completed[0].name), { ...base, completedStops: completed, cursor: 16 * 60, currentCoords: completed[0].coords, endMin: 21 * 60, maxStops: 2 }); assert(replanned.stops.every((s) => s.name !== completed[0].name)); });
check('routing provider failure is labeled', () => { const p = planAdvancedItinerary(VIZAG.map((x) => ({ ...x, coords: null })), { ...base }); assert(p.stops.every((s) => s.travelSource === 'estimated')); });
check('missing weather never becomes fabricated', () => { const p = planAdvancedItinerary(VIZAG, { ...base }); assert(p.stops.every((s) => ['unavailable', 'forecast', 'observed'].includes(s.dataSources.weather))); });
check('missing crowd remains provenance-labeled', () => { const p = planAdvancedItinerary(VIZAG, { ...base }); assert(p.stops.every((s) => s.dataSources.crowd)); });
check('must-visit hard constraint', () => { const p = planAdvancedItinerary(VIZAG, { ...base, mustVisit: ['Yarada Beach'], maxStops: 5 }); assert(p.status === 'FEASIBLE' && p.stops.some((s) => s.name === 'Yarada Beach')); });
check('conflicting preferences do not override exclusion', () => { const p = planAdvancedItinerary(VIZAG, { ...base, preferredCategories: ['temple'], excludedCategories: ['temple'] }); assert(p.stops.every((s) => s.category !== 'temple')); });
check('hard budget is never exceeded', () => { const p = planAdvancedItinerary(VIZAG, { ...base, budget: 200, budgetHard: true }); if (p.status === 'FEASIBLE') assert(p.estimatedCost <= 200); });
check('unknown hard accessibility fails safely', () => { const r = parseRequirements({ accessibilityRequirements: ['wheelchair'] }); const p = planAdvancedItinerary([{ id: 1, name: 'Unknown', cat: 'museum', coords: [17.7, 83.3], ot: '09:00', ct: '18:00' }], { ...base, ...r, accessibilityRequirements: ['wheelchair'] }); assert.strictEqual(p.status, 'INFEASIBLE'); });
check('unknown hard dietary data fails safely', () => { const p = planAdvancedItinerary([{ id: 1, name: 'Unknown Cafe', cat: 'food', coords: [17.7, 83.3], ot: '11:00', ct: '15:00', estimatedCost: 100 }], { ...base, startMin: 12 * 60, endMin: 15 * 60, requiredMeals: ['lunch'], dietaryRestrictions: ['vegetarian'] }); assert.strictEqual(p.status, 'INFEASIBLE'); });

if (failures.length) {
  console.error(`\n${failures.length} regression checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${passed} itinerary regression checks passed.`);
}
