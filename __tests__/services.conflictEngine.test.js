'use strict';

const { detectConflictingRequirements } = require('../services/travelIntelligence/requirementEngine');

describe('Constraint Solver & Conflict Detection (requirementEngine.js)', () => {
  test('detects infeasible schedule when mandatory places exceed available trip time', () => {
    const tightRequirements = {
      startTimeMinutes: 9 * 60, // 09:00
      endTimeMinutes: 10 * 60 + 30, // 10:30 (Only 90 mins)
      maxTripMinutes: 90,
      mustIncludePlaces: ['Kailasagiri', 'Submarine Museum', 'Rushikonda Beach', 'Simhachalam Temple'],
    };

    const places = [
      { id: '1', name: 'Kailasagiri', vt: 60, coords: [17.7478, 83.3364] },
      { id: '2', name: 'Submarine Museum', vt: 50, coords: [17.7165, 83.3323] },
      { id: '3', name: 'Rushikonda Beach', vt: 60, coords: [17.7816, 83.3857] },
      { id: '4', name: 'Simhachalam Temple', vt: 60, coords: [17.7664, 83.2505] },
    ];

    const result = detectConflictingRequirements(tightRequirements, places);
    expect(result.isConflicting).toBe(true);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.alternatives.length).toBe(3);
    expect(result.alternatives.map(a => a.id)).toEqual(['A', 'B', 'C']);
  });

  test('passes valid non-conflicting requirements', () => {
    const validRequirements = {
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 18 * 60, // 9 hours
      maxTripMinutes: 540,
      mustIncludePlaces: ['Kailasagiri', 'Submarine Museum'],
    };

    const places = [
      { id: '1', name: 'Kailasagiri', vt: 60, coords: [17.7478, 83.3364] },
      { id: '2', name: 'Submarine Museum', vt: 50, coords: [17.7165, 83.3323] },
    ];

    const result = detectConflictingRequirements(validRequirements, places);
    expect(result.isConflicting).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });
});
