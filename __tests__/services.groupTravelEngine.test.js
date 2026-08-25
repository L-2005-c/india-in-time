'use strict';

const {
  createGroupProfile,
  evaluateGroupSatisfaction,
  resolveGroupConflicts,
} = require('../services/travelIntelligence/groupTravelEngine');

describe('Group Travel Optimization (groupTravelEngine.js)', () => {
  const travelerA = {
    id: 't_1',
    name: 'Asha (Photographer)',
    travelDna: { scenic: 95, photography: 95, food: 60, culture: 50, crowdTolerance: 30, walkingTolerance: 80 },
    mustVisit: ['Kailasagiri'],
  };

  const travelerB = {
    id: 't_2',
    name: 'Bhanu (Foodie & Shopper)',
    travelDna: { scenic: 60, photography: 50, food: 95, shopping: 90, culture: 40, crowdTolerance: 70, walkingTolerance: 60 },
  };

  const travelerC = {
    id: 't_3',
    name: 'Charan (Heritage Lover)',
    travelDna: { scenic: 70, photography: 60, food: 70, culture: 95, crowdTolerance: 50, walkingTolerance: 70 },
  };

  test('consolidates diverse traveler DNA vectors into balanced group profile', () => {
    const group = createGroupProfile([travelerA, travelerB, travelerC], { groupMode: 'MIXED_GROUP' });
    expect(group.memberCount).toBe(3);
    expect(group.consolidatedDna.scenic).toBeGreaterThanOrEqual(70);
    expect(group.consolidatedDna.food).toBeGreaterThanOrEqual(70);
    expect(group.consolidatedDna.culture).toBeGreaterThanOrEqual(60);
    expect(group.conflictingPreferences.length).toBeGreaterThan(0);
  });

  test('calculates individual satisfaction scores and group fairness index', () => {
    const group = createGroupProfile([travelerA, travelerB, travelerC]);
    const mockStops = [
      { name: 'Kailasagiri', cat: 'scenic', coords: [17.7478, 83.3364], is_sunset_spot: true },
      { name: 'Sea View Restaurant', cat: 'food', coords: [17.7200, 83.3300] },
      { name: 'Submarine Museum', cat: 'museum', coords: [17.7165, 83.3323] },
    ];

    const evalResult = evaluateGroupSatisfaction(mockStops, group);
    expect(evalResult.averageSatisfaction).toBeGreaterThanOrEqual(60);
    expect(evalResult.fairnessIndex).toBeGreaterThanOrEqual(0.80);
    expect(evalResult.memberSatisfactions.length).toBe(3);
    expect(evalResult.lowestSatisfactionMember).toBeDefined();
  });

  test('detects direct place conflicts and generates resolution options with split/rejoin option', () => {
    const conflictingGroup = {
      members: [
        { id: 'm1', name: 'Asha', mustVisit: ['Simhachalam Temple'] },
        { id: 'm2', name: 'Bhanu', mustAvoid: ['Simhachalam Temple'] },
      ],
    };

    const conflictResult = resolveGroupConflicts(conflictingGroup);
    expect(conflictResult.hasConflicts).toBe(true);
    expect(conflictResult.resolutions.length).toBeGreaterThan(0);
    expect(conflictResult.resolutions[0].options.some(o => o.id === 'C')).toBe(true);
  });
});
