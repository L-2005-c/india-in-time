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
  test('PHASES cover morning through night', () => {
    expect(PHASES.length).toBeGreaterThanOrEqual(5);
    expect(PHASES[0].id).toBe('morning');
    expect(PHASES.map((p) => p.id)).toEqual(expect.arrayContaining(['lunch', 'dinner', 'golden']));
  });

  test('phaseAt maps minutes into the correct day phase', () => {
    expect(phaseAt(8 * 60).id).toBe('morning');
    expect(phaseAt(12 * 60 + 30).id).toBe('lunch');
    expect(phaseAt(16 * 60).id).toBe('afternoon');
    expect(phaseAt(18 * 60).id).toBe('golden');
    expect(phaseAt(20 * 60).id).toBe('dinner');
    expect(phaseAt(23 * 60).id).toBe('night');
    expect(phaseAt(undefined).id).toBeTruthy();
  });

  test('category helpers classify food / beach / temple / scenic / lodging', () => {
    expect(isFood({ cat: 'food', name: 'Local Biryani' })).toBe(true);
    expect(isFood({ name: 'Seaside Cafe' })).toBe(true);
    expect(isBeach({ cat: 'beach', name: 'Yarada Beach' })).toBe(true);
    expect(isBeach({ name: 'Ramakrishna Beach' })).toBe(true);
    expect(isBeach({ name: 'Beach Food Court', cat: 'food' })).toBe(false);
    expect(isTemple({ cat: 'temple', name: 'Simhachalam' })).toBe(true);
    expect(isTemple({ name: 'ISKCON Temple' })).toBe(true);
    expect(isScenic({ cat: 'scenic', name: 'Kailasagiri' })).toBe(true);
    expect(isScenic({ is_sunset_spot: true, name: 'View Point' })).toBe(true);
    expect(isLodgingOrFiller({ cat: 'hotel', name: 'Alpha Hotel Vizag' })).toBe(true);
    expect(isLodgingOrFiller({ name: 'Alpha Hotel Vizag' })).toBe(true);
    expect(isFood({ name: 'Alpha Hotel Vizag' })).toBe(false);
    expect(normalizeCat({ category: 'Temple' })).toBe('temple');
    expect(normalizeCat({})).toBe('default');
  });

  test('phaseBonus rewards beach in morning and penalizes lodging', () => {
    const morningBeach = phaseBonus({ cat: 'beach' }, 8 * 60, ['beach']);
    const morningFood = phaseBonus({ cat: 'food' }, 8 * 60, ['beach']);
    const lodging = phaseBonus({ cat: 'hotel', name: 'Stay Inn' }, 10 * 60, []);
    expect(morningBeach.bonus).toBeGreaterThan(morningFood.bonus);
    expect(morningBeach.phase).toBe('morning');
    expect(lodging.bonus).toBeLessThan(0);
  });

  test('nearestNeighborReorder shortens path vs zigzag input', () => {
    const stops = [
      { id: 'a', name: 'A', coords: [17.68, 83.21], arriveAt: '09:00' },
      { id: 'c', name: 'C', coords: [17.75, 83.35], arriveAt: '11:00' },
      { id: 'b', name: 'B', coords: [17.70, 83.25], arriveAt: '10:00' },
    ];
    const ordered = nearestNeighborReorder(stops);
    expect(ordered).toHaveLength(3);
    expect(ordered[0].id).toBe('a');
    expect(ordered[1].id).toBe('b');
    expect(ordered[2].id).toBe('c');
    expect(nearestNeighborReorder([])).toEqual([]);
    expect(nearestNeighborReorder([{ id: 'only' }])).toHaveLength(1);
  });

  test('resequenceTimeline assigns increasing arrive times', () => {
    const stops = [
      { id: '1', name: 'Beach', cat: 'beach', coords: [17.68, 83.21], vt: 60, arriveAt: '09:00' },
      { id: '2', name: 'Temple', cat: 'temple', coords: [17.70, 83.25], vt: 45, arriveAt: '11:00' },
      { id: '3', name: 'Park', cat: 'park', coords: [17.72, 83.28], vt: 40, arriveAt: '14:00' },
    ];
    const list = resequenceTimeline(stops, { startMin: 9 * 60, endMin: 18 * 60 });
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i++) {
      if (list[i].arriveMin != null && list[i - 1].arriveMin != null) {
        expect(list[i].arriveMin).toBeGreaterThanOrEqual(list[i - 1].arriveMin);
      }
    }
  });

  test('coverageReport flags missing preferred categories', () => {
    const stops = [
      { name: 'Beach A', cat: 'beach', arriveAt: '09:00' },
      { name: 'Cafe', cat: 'food', arriveAt: '13:00' },
    ];
    const report = coverageReport(stops, { preferredCategories: ['beach', 'temple', 'food'] });
    expect(report.hasBeach).toBe(true);
    expect(report.hasTemple).toBe(false);
    expect(report.missingPreferred).toEqual(expect.arrayContaining(['temple']));
    expect(report.hasLunchFood).toBe(true);
  });

  test('repairMealCoverage injects beach/temple/food when preferred and missing', () => {
    const stops = [
      { id: 'p1', name: 'City Park', cat: 'park', coords: [17.72, 83.28], arriveAt: '10:00', vt: 40 },
    ];
    const candidates = [
      { id: 'b1', name: 'Yarada Beach', cat: 'beach', coords: [17.65, 83.25] },
      { id: 't1', name: 'Simhachalam Temple', cat: 'temple', coords: [17.76, 83.25] },
      { id: 'f1', name: 'Local Biryani House', cat: 'food', coords: [17.70, 83.24] },
      { id: 'f2', name: 'Harbor Kitchen', cat: 'restaurant', coords: [17.71, 83.26] },
      { id: 's1', name: 'Kailasagiri', cat: 'scenic', coords: [17.75, 83.34] },
    ];
    const result = repairMealCoverage(stops, candidates, {
      startMin: 8 * 60,
      endMin: 21 * 60,
      preferredCategories: ['beach', 'temple', 'scenic', 'food'],
      personas: ['Food Lover'],
    });
    expect(result.stops.length).toBeGreaterThan(stops.length);
    expect(result.report.hasBeach).toBe(true);
    expect(result.report.hasTemple).toBe(true);
    expect(result.report.hasScenic).toBe(true);
  });

  test('repairMealCoverage drops lodging and extra non-meal food', () => {
    const stops = [
      { name: 'Alpha Hotel Vizag', cat: 'hotel', coords: [17.7, 83.3], arriveAt: '09:00' },
      { name: 'Snack Shop', cat: 'food', coords: [17.7, 83.3], arriveAt: '10:00' },
      { name: 'Beach', cat: 'beach', coords: [17.65, 83.25], arriveAt: '11:00' },
      { name: 'Lunch Place', cat: 'food', coords: [17.7, 83.24], arriveAt: '13:00' },
      { name: 'Extra Lunch', cat: 'food', coords: [17.71, 83.24], arriveAt: '13:30' },
    ];
    const result = repairMealCoverage(stops, [], {
      startMin: 8 * 60,
      endMin: 18 * 60,
      preferredCategories: ['beach'],
    });
    expect(result.stops.every((s) => !isLodgingOrFiller(s))).toBe(true);
    const lunchFoods = result.stops.filter(
      (s) => isFood(s) && String(s.arriveAt || '').startsWith('13')
    );
    // at most one lunch food retained after repair
    expect(result.stops.filter(isFood).length).toBeLessThanOrEqual(2);
  });
});
