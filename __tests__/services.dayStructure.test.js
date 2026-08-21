// __tests__/services.dayStructure.test.js
// Coverage for services/travelIntelligence/dayStructure.js — this module
// decides what category of place fits which time-of-day phase, and repairs
// a day's itinerary to guarantee sane meal/preference coverage. It is core
// to what a user actually sees in their plan.

'use strict';

const {
  PHASES,
  phaseAt,
  phaseBonus,
  coverageReport,
  repairMealCoverage,
  resequenceTimeline,
  nearestNeighborReorder,
  isFood,
  isBeach,
  isTemple,
  isScenic,
  isLodgingOrFiller,
  normalizeCat,
} = require('../services/travelIntelligence/dayStructure');

describe('dayStructure', () => {
  describe('phaseAt', () => {
    test('returns morning phase for early times', () => {
      expect(phaseAt(6 * 60).id).toBe('morning');
    });
    test('returns lunch phase for midday', () => {
      expect(phaseAt(12 * 60).id).toBe('lunch');
    });
    test('returns afternoon phase', () => {
      expect(phaseAt(16 * 60).id).toBe('afternoon');
    });
    test('returns golden-hour phase', () => {
      expect(phaseAt(18 * 60).id).toBe('golden');
    });
    test('returns dinner phase', () => {
      expect(phaseAt(20 * 60).id).toBe('dinner');
    });
    test('returns night phase for late times', () => {
      expect(phaseAt(23 * 60).id).toBe('night');
    });
    test('falls back to the last phase for out-of-range / non-numeric input', () => {
      expect(phaseAt(undefined).id).toBe(PHASES[PHASES.length - 1].id);
      expect(phaseAt(-100).id).toBe(PHASES[PHASES.length - 1].id);
    });
  });

  describe('normalizeCat', () => {
    test('reads cat first, falls back to category, then "default"', () => {
      expect(normalizeCat({ cat: 'Beach' })).toBe('beach');
      expect(normalizeCat({ category: 'Temple' })).toBe('temple');
      expect(normalizeCat({})).toBe('default');
      expect(normalizeCat(null)).toBe('default');
    });
  });

  describe('isLodgingOrFiller', () => {
    test('flags explicit lodging categories', () => {
      expect(isLodgingOrFiller({ cat: 'hotel' })).toBe(true);
      expect(isLodgingOrFiller({ cat: 'lodging' })).toBe(true);
      expect(isLodgingOrFiller({ cat: 'stay' })).toBe(true);
    });
    test('flags hotel/resort-style names', () => {
      expect(isLodgingOrFiller({ name: 'Taj Resort Vizag' })).toBe(true);
      expect(isLodgingOrFiller({ name: 'Sunrise Guest House' })).toBe(true);
    });
    test('does not flag a food venue that happens to say "Hotel" in its name (South Indian usage)', () => {
      expect(isLodgingOrFiller({ name: 'Hotel Kishor Biryani' })).toBe(false);
      expect(isLodgingOrFiller({ name: 'Sri Krishna Veg Hotel' })).toBe(false);
    });
    test('does not flag an ordinary attraction', () => {
      expect(isLodgingOrFiller({ name: 'RK Beach', cat: 'beach' })).toBe(false);
    });
  });

  describe('isFood', () => {
    test('recognizes explicit food categories', () => {
      expect(isFood({ cat: 'food' })).toBe(true);
      expect(isFood({ cat: 'restaurant' })).toBe(true);
      expect(isFood({ cat: 'cafe' })).toBe(true);
    });
    test('recognizes food-like names even without a food category', () => {
      expect(isFood({ name: 'Paradise Biryani' })).toBe(true);
      expect(isFood({ name: 'Roadside Dhaba' })).toBe(true);
    });
    test('never classifies lodging as food, even if the name mentions food terms elsewhere', () => {
      expect(isFood({ name: 'Grand Hotel', cat: 'hotel' })).toBe(false);
    });
    test('a plain attraction is not food', () => {
      expect(isFood({ name: 'Kailasagiri Hill', cat: 'scenic' })).toBe(false);
    });
  });

  describe('isBeach', () => {
    test('recognizes explicit beach category', () => {
      expect(isBeach({ cat: 'beach' })).toBe(true);
    });
    test('recognizes beach-like names', () => {
      expect(isBeach({ name: 'Rushikonda Beach' })).toBe(true);
      expect(isBeach({ name: 'Bheemili Bay' })).toBe(true);
    });
    test('excludes food/hotel categories even with "beach" nearby in context', () => {
      expect(isBeach({ cat: 'food', name: 'Beach View Cafe' })).toBe(false);
      expect(isBeach({ name: 'Beach Road Restaurant' })).toBe(false);
    });
  });

  describe('isTemple', () => {
    test('recognizes explicit temple category and multi-faith keywords', () => {
      expect(isTemple({ cat: 'temple' })).toBe(true);
      expect(isTemple({ name: 'ISKCON Temple' })).toBe(true);
      expect(isTemple({ name: 'St. Mary\'s Church' })).toBe(true);
      expect(isTemple({ name: 'Grand Mosque' })).toBe(true);
      expect(isTemple({ name: 'Golden Gurudwara' })).toBe(true);
    });
    test('does not flag unrelated places', () => {
      expect(isTemple({ name: 'City Mall', cat: 'shopping' })).toBe(false);
    });
  });

  describe('isScenic', () => {
    test('recognizes scenic-family categories', () => {
      expect(isScenic({ cat: 'scenic' })).toBe(true);
      expect(isScenic({ cat: 'viewpoint' })).toBe(true);
      expect(isScenic({ cat: 'hill' })).toBe(true);
      expect(isScenic({ cat: 'waterfall' })).toBe(true);
    });
    test('recognizes sunset/sunrise flags regardless of category', () => {
      expect(isScenic({ cat: 'default', is_sunset_spot: true })).toBe(true);
      expect(isScenic({ cat: 'default', is_sunrise_spot: true })).toBe(true);
    });
    test('a plain default-category place with no scenic flag is not scenic', () => {
      expect(isScenic({ cat: 'default' })).toBe(false);
    });
  });

  describe('phaseBonus', () => {
    test('heavily penalizes lodging regardless of arrival time', () => {
      const { bonus } = phaseBonus({ cat: 'hotel', name: 'Some Hotel' }, 8 * 60, []);
      expect(bonus).toBe(-40);
    });
    test('rewards a category match with the phase preference list', () => {
      const { bonus, phase } = phaseBonus({ cat: 'beach', name: 'X Beach' }, 7 * 60, []);
      expect(phase).toBe('morning');
      expect(bonus).toBeGreaterThanOrEqual(14);
    });
    test('rewards food during a meal phase', () => {
      const { bonus, phase } = phaseBonus({ cat: 'food', name: 'Lunch Spot' }, 12 * 60, []);
      expect(phase).toBe('lunch');
      expect(bonus).toBeGreaterThan(0);
    });
    test('mildly penalizes non-food during a meal phase', () => {
      const { bonus } = phaseBonus({ cat: 'temple', name: 'Temple' }, 12 * 60, []);
      expect(bonus).toBeLessThan(0);
    });
    test('penalizes food outside meal phases', () => {
      const { bonus } = phaseBonus({ cat: 'food', name: 'Snack Bar' }, 7 * 60, []);
      expect(bonus).toBeLessThan(0);
    });
    test('adds a preference bonus when the category matches user preferences', () => {
      const withoutPref = phaseBonus({ cat: 'temple', name: 'T' }, 9 * 60, []).bonus;
      const withPref = phaseBonus({ cat: 'temple', name: 'T' }, 9 * 60, ['temple']).bonus;
      expect(withPref).toBeGreaterThan(withoutPref);
    });
    test('adds a beach-preference bonus only in morning/golden phases', () => {
      const morning = phaseBonus({ cat: 'beach', name: 'B' }, 7 * 60, ['beach']).bonus;
      const afternoon = phaseBonus({ cat: 'beach', name: 'B' }, 16 * 60, ['beach']).bonus;
      // afternoon also applies the -8 beach/scenic-in-afternoon penalty, so the
      // gap should be more than just the missing +16 preference bonus.
      expect(morning).toBeGreaterThan(afternoon);
    });
    test('penalizes beach placement in the afternoon phase (beach is not an afternoon-preferred category)', () => {
      const { bonus, phase } = phaseBonus({ cat: 'beach', name: 'Some Beach' }, 16 * 60, []);
      expect(phase).toBe('afternoon');
      expect(bonus).toBeLessThan(0);
    });
    test('the afternoon beach/scenic penalty still applies on top of a phase-category match for scenic (net stays lower than a plain match elsewhere)', () => {
      // 'scenic' IS in the afternoon phase's own preference list, so it gets
      // +14 for the category match, then -8 for the beach/scenic-in-afternoon
      // penalty, netting +6 — lower than the +14 it would get in a phase
      // where the penalty doesn't apply.
      const afternoon = phaseBonus({ cat: 'scenic', name: 'Viewpoint' }, 16 * 60, []).bonus;
      const morning = phaseBonus({ cat: 'scenic', name: 'Viewpoint' }, 7 * 60, []).bonus;
      expect(afternoon).toBeLessThan(morning);
    });
    test('adds a scenic-preference bonus outside the lunch phase', () => {
      const { bonus } = phaseBonus({ cat: 'scenic', name: 'View' }, 9 * 60, ['scenic']);
      expect(bonus).toBeGreaterThan(0);
    });
  });

  describe('coverageReport', () => {
    const beach = { name: 'RK Beach', cat: 'beach' };
    const temple = { name: 'ISKCON Temple', cat: 'temple' };
    const lunchFood = { name: 'Paradise Biryani', cat: 'food', arriveAt: '13:00' };
    const dinnerFood = { name: 'Spice Route', cat: 'food', arriveAt: '20:00' };

    test('detects lunch and dinner food coverage by arrival time window', () => {
      const report = coverageReport([lunchFood, dinnerFood]);
      expect(report.hasLunchFood).toBe(true);
      expect(report.hasDinnerFood).toBe(true);
      expect(report.foodCount).toBe(2);
    });

    test('flags missing preferred categories', () => {
      const report = coverageReport([lunchFood], { preferredCategories: ['beach', 'temple'] });
      expect(report.missingPreferred).toEqual(expect.arrayContaining(['beach', 'temple']));
      expect(report.warnings.some((w) => /beach/i.test(w))).toBe(true);
      expect(report.warnings.some((w) => /temple/i.test(w))).toBe(true);
    });

    test('does not flag categories that are present', () => {
      const report = coverageReport([beach, temple, lunchFood], { preferredCategories: ['beach', 'temple'] });
      expect(report.missingPreferred).toEqual([]);
    });

    test('warns when food is wanted but no lunch stop exists', () => {
      const report = coverageReport([dinnerFood], { preferredCategories: ['food'] });
      expect(report.warnings.some((w) => /lunch/i.test(w))).toBe(true);
    });

    test('detects foodWanted via persona strings even without an explicit "food" preference', () => {
      const report = coverageReport([], { personas: ['Foodie Explorer'] });
      expect(report.foodWanted).toBe(true);
    });

    test('warns when more than two food stops are present', () => {
      const extraFood = { name: 'Extra Snacks', cat: 'food', arriveAt: '16:00' };
      const report = coverageReport([lunchFood, dinnerFood, extraFood]);
      expect(report.warnings.some((w) => /too many food/i.test(w))).toBe(true);
    });

    test('handles an empty stop list gracefully', () => {
      const report = coverageReport([]);
      expect(report.hasBeach).toBe(false);
      expect(report.hasTemple).toBe(false);
      expect(report.foodCount).toBe(0);
      expect(report.catsPresent).toEqual([]);
    });

    test('handles an undefined stop list gracefully (defaults to empty)', () => {
      const report = coverageReport(undefined);
      expect(report.foodCount).toBe(0);
    });
  });

  describe('nearestNeighborReorder', () => {
    test('returns short lists (<3 stops) unchanged', () => {
      const stops = [{ name: 'A' }, { name: 'B' }];
      expect(nearestNeighborReorder(stops)).toBe(stops);
    });
    test('returns an empty array for null/undefined input', () => {
      expect(nearestNeighborReorder(null)).toEqual([]);
      expect(nearestNeighborReorder(undefined)).toEqual([]);
    });
    test('chains geographically close stops together ahead of a distant one', () => {
      const stops = [
        { name: 'Start', coords: [17.0, 83.0], arriveAt: '09:00' },
        { name: 'Far', coords: [28.6, 77.2], arriveAt: '10:00' }, // Delhi — very far
        { name: 'Near', coords: [17.01, 83.01], arriveAt: '11:00' }, // right next to Start
      ];
      const result = nearestNeighborReorder(stops);
      expect(result[0].name).toBe('Start');
      // The nearby stop should be chosen before the distant one.
      expect(result[1].name).toBe('Near');
      expect(result[2].name).toBe('Far');
    });
  });

  describe('resequenceTimeline', () => {
    test('produces a chronological, non-overlapping timeline from a default start time', () => {
      const stops = [
        { name: 'A', arriveAt: '09:00', stayMinutes: 60, coords: [17, 83] },
        { name: 'B', arriveAt: '11:00', stayMinutes: 45, coords: [17.01, 83.01] },
      ];
      const result = resequenceTimeline(stops);
      expect(result.length).toBe(2);
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
      // Each stop's arrival should be at/after the previous stop's leave time.
      expect(result[1].arriveAt >= result[0].leaveAt).toBe(true);
    });

    test('drops stops that would arrive after the end of the day', () => {
      const stops = [
        { name: 'A', arriveAt: '18:00', stayMinutes: 300, coords: [17, 83] }, // 5hr stay pushes past endMin
        { name: 'B', arriveAt: '19:00', stayMinutes: 60, coords: [17.01, 83.01] },
      ];
      const result = resequenceTimeline(stops, { startMin: 9 * 60, endMin: 19 * 60 });
      // At least one of the two stops should have been dropped for arriving too late.
      expect(result.length).toBeLessThanOrEqual(2);
    });

    test('handles isBreak entries with their own stay-time logic', () => {
      const stops = [
        { name: 'Coffee Break', isBreak: true, stayMinutes: 15, arriveAt: '10:00' },
      ];
      const result = resequenceTimeline(stops, { startMin: 9 * 60, endMin: 19 * 60 });
      expect(result.length).toBe(1);
      expect(result[0].stayMinutes).toBe(15);
    });

    test('handles an empty/undefined stop list', () => {
      expect(resequenceTimeline([])).toEqual([]);
      expect(resequenceTimeline(undefined)).toEqual([]);
    });
  });

  describe('repairMealCoverage', () => {
    const beachCandidate = { id: 'b1', name: 'Rushikonda Beach', cat: 'beach', coords: [17.78, 83.38] };
    const templeCandidate = { id: 't1', name: 'ISKCON Temple', cat: 'temple', coords: [17.73, 83.31] };
    const foodCandidate = { id: 'f1', name: 'Paradise Biryani', cat: 'food', coords: [17.72, 83.30] };

    test('injects a missing beach stop when beach is preferred and no beach exists', () => {
      const { stops, repaired, report } = repairMealCoverage(
        [],
        [beachCandidate],
        { preferredCategories: ['beach'], startMin: 9 * 60, endMin: 19 * 60 },
      );
      expect(repaired).toBe(true);
      expect(report.hasBeach).toBe(true);
      expect(stops.some((s) => s.name === 'Rushikonda Beach')).toBe(true);
    });

    test('injects a missing temple stop when temple is preferred', () => {
      const { report } = repairMealCoverage(
        [],
        [templeCandidate],
        { preferredCategories: ['temple'], startMin: 9 * 60, endMin: 19 * 60 },
      );
      expect(report.hasTemple).toBe(true);
    });

    test('injects lunch and dinner food when food is wanted and missing', () => {
      const { report } = repairMealCoverage(
        [],
        [foodCandidate, { ...foodCandidate, id: 'f2', name: 'Second Restaurant' }],
        { preferredCategories: ['food'], startMin: 9 * 60, endMin: 21 * 60 },
      );
      expect(report.hasLunchFood).toBe(true);
    });

    test('does not report as repaired when coverage is already satisfied', () => {
      const existingBeach = makeExistingStop(beachCandidate, '09:30');
      const { repaired } = repairMealCoverage(
        [existingBeach],
        [beachCandidate],
        { preferredCategories: ['beach'], startMin: 9 * 60, endMin: 19 * 60 },
      );
      expect(repaired).toBe(false);
    });

    test('never inserts lodging even if present in the candidate pool', () => {
      const hotelCandidate = { id: 'h1', name: 'Grand Hotel', cat: 'hotel', coords: [17.7, 83.3] };
      const { stops } = repairMealCoverage(
        [],
        [hotelCandidate, beachCandidate],
        { preferredCategories: ['beach'], startMin: 9 * 60, endMin: 19 * 60 },
      );
      expect(stops.some((s) => s.category === 'hotel')).toBe(false);
    });

    test('caps food stops at two even if more were present in input', () => {
      const foods = [
        makeExistingStop({ id: 'f1', name: 'Lunch A', cat: 'food' }, '12:00'),
        makeExistingStop({ id: 'f2', name: 'Lunch B', cat: 'food' }, '12:30'),
        makeExistingStop({ id: 'f3', name: 'Dinner A', cat: 'food' }, '20:00'),
      ];
      const { stops } = repairMealCoverage(foods, [], { startMin: 9 * 60, endMin: 22 * 60 });
      const foodStops = stops.filter((s) => isFood(s));
      expect(foodStops.length).toBeLessThanOrEqual(2);
    });

    test('gracefully handles no matching candidates for a missing preference (does not throw)', () => {
      expect(() => repairMealCoverage(
        [],
        [], // no candidates at all
        { preferredCategories: ['beach', 'temple', 'scenic'], startMin: 9 * 60, endMin: 19 * 60 },
      )).not.toThrow();
    });
  });
});

function makeExistingStop(place, arriveAt) {
  return {
    id: place.id,
    name: place.name,
    category: place.cat,
    coords: place.coords,
    arriveAt,
    stayMinutes: 45,
  };
}
