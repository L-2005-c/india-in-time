'use strict';

const { detectConflictingRequirements } = require('../services/travelIntelligence/requirementEngine');
const { replanAdvanced } = require('../services/travelIntelligence/advancedItineraryEngine');
const { computeTravelValueScore } = require('../services/travelIntelligence/decisionEngine');

describe('Adaptive Itinerary & Conflict Resolution Engine', () => {
  const samplePlaces = [
    {
      id: 'rushikonda',
      name: 'Rushikonda Beach',
      cat: 'beach',
      coords: [17.7812, 83.3855],
      vt: 60,
      baseScore: 90,
      is_sunset_spot: true,
    },
    {
      id: 'kailasagiri',
      name: 'Kailasagiri Hilltop',
      cat: 'scenic',
      coords: [17.7489, 83.3424],
      vt: 60,
      baseScore: 88,
    },
    {
      id: 'simhachalam',
      name: 'Simhachalam Temple',
      cat: 'temple',
      coords: [17.7667, 83.2500],
      vt: 75,
      baseScore: 85,
    },
    {
      id: 'diner',
      name: 'Sea Inn Dining',
      cat: 'food',
      coords: [17.7800, 83.3800],
      vt: 50,
      baseScore: 82,
    },
  ];

  test('detects conflict when mandatory places exceed available trip duration', () => {
    const requirements = {
      hard: {
        startTimeMinutes: 540,
        endTimeMinutes: 600, // Only 60 min total
        maxTripMinutes: 60,
        mustIncludePlaces: ['Rushikonda Beach', 'Simhachalam Temple'],
      },
    };

    const conflictResult = detectConflictingRequirements(requirements, samplePlaces);
    expect(conflictResult.isConflicting).toBe(true);
    expect(conflictResult.conflicts.length).toBeGreaterThan(0);
    expect(conflictResult.alternatives.length).toBe(3);
    expect(conflictResult.alternatives.map(a => a.id)).toEqual(['A', 'B', 'C']);
  });

  test('detects conflict for short duration asking for sunset view and dinner', () => {
    const requirements = {
      hard: {
        startTimeMinutes: 1020,
        endTimeMinutes: 1110, // 90 min total
        maxTripMinutes: 90,
        mealPreference: 'dinner',
      },
      soft: {
        preferredCategories: ['scenic'],
      },
    };

    const conflictResult = detectConflictingRequirements(requirements, samplePlaces);
    expect(conflictResult.isConflicting).toBe(true);
    expect(conflictResult.conflicts[0]).toMatch(/sunset|dinner/i);
  });

  test('returns isConflicting false when constraints are realistic', () => {
    const requirements = {
      hard: {
        startTimeMinutes: 540,
        endTimeMinutes: 1080, // 9 hours
        maxTripMinutes: 540,
        mustIncludePlaces: ['Rushikonda Beach'],
      },
    };

    const conflictResult = detectConflictingRequirements(requirements, samplePlaces);
    expect(conflictResult.isConflicting).toBe(false);
    expect(conflictResult.alternatives).toEqual([]);
  });

  test('computes Travel Value Score with intent-adaptive weighting', () => {
    const photoScore = computeTravelValueScore({
      scenicValue: 95,
      temporalSuitability: 90,
      tourismQuality: 70,
      intent: 'photography',
    });

    const foodScore = computeTravelValueScore({
      scenicValue: 40,
      tourismQuality: 95,
      dnaMatch: 90,
      intent: 'food',
    });

    expect(photoScore.score).toBeGreaterThan(75);
    expect(photoScore.weights.scenicValue).toBe(0.28);
    expect(foodScore.weights.tourismQuality).toBe(0.32);
    expect(photoScore.reasons.length).toBeGreaterThan(0);
  });

  test('replanAdvanced outputs replanning diff comparison', () => {
    const previousPlan = {
      stops: [
        { name: 'Rushikonda Beach', coords: [17.7812, 83.3855] },
        { name: 'Simhachalam Temple', coords: [17.7667, 83.2500] },
      ],
    };

    const replanned = replanAdvanced(samplePlaces, {
      startMin: 600,
      endMin: 900,
      originCoords: [17.7812, 83.3855],
      previousPlan,
      replanReason: 'Traffic surge on central corridor',
    });

    expect(replanned).toBeDefined();
    expect(replanned.replanningDiff).toBeDefined();
    expect(replanned.replanningDiff.reason).toContain('Traffic surge');
  });
});
