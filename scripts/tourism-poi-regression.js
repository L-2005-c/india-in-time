'use strict';

const assert = require('assert');
const { staticCityPlaces } = require('../data/city-seeds');
const { filterTourismCandidates, evaluateTourismCandidate } = require('../services/travelIntelligence/tourismPoi/tourismEligibilityEngine');
const { planAdvancedItinerary } = require('../services/travelIntelligence/advancedItineraryEngine');

const seed = staticCityPlaces('vizag');
const localityNoise = [
  { id: 'm1', name: 'Marripalem', cat: 'scenic', coords: [17.742, 83.249], type: 'locality' },
  { id: 's1', name: 'Seethammadhara', cat: 'scenic', coords: [17.74, 83.32], type: 'suburb' },
  { id: 'd1', name: 'Dwaraka Nagar', cat: 'scenic', coords: [17.72, 83.30], type: 'locality' },
  { id: 'b1', name: 'Marripalem Bus Stop', cat: 'scenic', coords: [17.74, 83.25], type: 'bus_stop' },
  { id: 'r1', name: 'Ordinary Residential Building', cat: 'scenic', coords: [17.74, 83.25], type: 'building' },
];

function names(plan) { return plan.stops.map((s) => s.name); }
function run(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (err) { console.error(`✗ ${name}: ${err.message}`); process.exitCode = 1; }
}

run('1. locality-only candidates are rejected', () => {
  const r = filterTourismCandidates(localityNoise);
  assert.strictEqual(r.eligible.length, 0);
  assert.strictEqual(r.rejected.length, localityNoise.length);
});

run('2. Marripalem can never be a tourist stop', () => {
  const p = planAdvancedItinerary([...localityNoise, ...seed], { startMin: 10 * 60, endMin: 18 * 60, preferredCategories: ['scenic'] });
  assert(!names(p).some((n) => /^marripalem$/i.test(n)));
});

run('3. only tourist places excludes generic entities', () => {
  const p = planAdvancedItinerary([...localityNoise, ...seed], { startMin: 10 * 60, endMin: 18 * 60, tourismOnly: true });
  assert(p.stops.every((s) => !['Marripalem', 'Seethammadhara', 'Dwaraka Nagar'].includes(s.name)));
});

run('4. temple exclusion remains hard', () => {
  const p = planAdvancedItinerary(seed, { startMin: 9 * 60, endMin: 18 * 60, excludedCategories: ['temple'], preferredCategories: ['beach', 'scenic'] });
  assert(p.stops.every((s) => s.category !== 'temple'));
});

run('5. food is only admitted when requested', () => {
  const r = filterTourismCandidates(seed.filter((p) => p.cat === 'food'), { foodRequested: false });
  assert.strictEqual(r.eligible.length, 0);
  const r2 = filterTourismCandidates(seed.filter((p) => p.cat === 'food'), { foodRequested: true });
  assert(r2.eligible.length > 0);
});

run('6. shopping becomes first-class when requested', () => {
  const r = filterTourismCandidates(seed.filter((p) => p.cat === 'shopping'), { shoppingRequested: true });
  assert(r.eligible.some((p) => /CMR Central|Inorbit Mall Visakhapatnam/i.test(p.name)));
});

run('7. shopping is not silently inserted when not requested', () => {
  const r = filterTourismCandidates(seed.filter((p) => p.cat === 'shopping'), { shoppingRequested: false });
  assert.strictEqual(r.eligible.length, 0);
});

run('8. tourism quality uses provenance', () => {
  const verified = evaluateTourismCandidate({ name: 'Verified Beach', cat: 'beach', coords: [17.7,83.3], officialTourism: true, rating: 4.6, reviewCount: 8000 });
  const weak = evaluateTourismCandidate({ name: 'Random Map Beach', cat: 'beach', coords: [17.7,83.3], rating: 4.8, reviewCount: 10 });
  assert(verified.tourismQualityScore > weak.tourismQualityScore);
});

run('9. curated mall receives tourism provenance', () => {
  const mall = seed.find((p) => p.name === 'Inorbit Mall Visakhapatnam');
  assert(mall && mall.curated === true);
  const r = evaluateTourismCandidate(mall, { shoppingRequested: true });
  assert(r.eligible && r.tourismQualityScore >= 70);
});

run('10. final itinerary exposes rejected-candidate diagnostics', () => {
  const p = planAdvancedItinerary([...localityNoise, ...seed], { startMin: 13 * 60, endMin: 20 * 60, preferredCategories: ['shopping'] });
  assert(p.diagnostics.rejectedCandidateCount >= localityNoise.length);
  assert(Array.isArray(p.diagnostics.rejectedCandidates));
});
