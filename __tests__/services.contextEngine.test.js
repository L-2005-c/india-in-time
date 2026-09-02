'use strict';

const {
  createIntelligenceContext,
  evaluateContextExperience,
  PROVENANCE_SOURCES,
} = require('../services/travelIntelligence/contextEngine');

describe('Context Engine & Canonical Intelligence Context Evaluator', () => {
  test('creates a well-formed canonical intelligence context object', () => {
    const context = createIntelligenceContext({
      traveler: {
        dna: { photography: 90, scenic: 85 },
        personas: ['photographer'],
      },
      destination: {
        id: 'kailasagiri',
        name: 'Kailasagiri',
        cat: 'viewpoint',
        coords: [17.7492, 83.3422],
        is_sunset_spot: true,
      },
      originCoords: [17.7126, 83.3235],
      projectedArrival: {
        minuteOfDay: 17 * 60 + 30,
        timeString: '17:30',
        daypart: 'evening',
        isGoldenHour: true,
      },
      weather: {
        condition: 'Clear',
        tempC: 28,
        apparentTempC: 29,
        status: 'GOOD',
      },
      traffic: {
        travelMinutes: 18,
        freeFlowMinutes: 14,
        trafficDelayMinutes: 4,
        trafficLevel: 'Moderate',
        trafficTransition: '🟢 Low ➔ 🟡 Moderate',
      },
      crowd: {
        level: 'Low',
        score: 30,
        estimatedQueueMinutes: 5,
      },
      scenic: {
        scenicScore: 95,
        goldenHourRating: 90,
      },
    });

    expect(context).toHaveProperty('traveler');
    expect(context).toHaveProperty('destination');
    expect(context).toHaveProperty('projectedArrival');
    expect(context).toHaveProperty('weather');
    expect(context).toHaveProperty('crowd');
    expect(context).toHaveProperty('traffic');
    expect(context).toHaveProperty('scenic');
    expect(context).toHaveProperty('comfort');
    expect(context).toHaveProperty('provenance');

    expect(context.traffic.geodesicDistanceKm).toBeGreaterThan(0);
    expect(context.traffic.source).toBe(PROVENANCE_SOURCES.STATIC_ROUTE_ESTIMATE);
  });

  test('evaluates holistic context experience with high score for aligned conditions', () => {
    const context = createIntelligenceContext({
      traveler: {
        dna: { photography: 92, scenic: 90 },
      },
      destination: {
        id: 'kailasagiri',
        name: 'Kailasagiri',
        cat: 'viewpoint',
        coords: [17.7492, 83.3422],
        is_sunset_spot: true,
      },
      scenic: { score: 95 },
      crowd: { level: 'Low', score: 25 },
      weather: { status: 'GOOD', tempC: 27 },
      traffic: { trafficLevel: 'Low' },
    });

    const evalResult = evaluateContextExperience(context);
    expect(evalResult.experienceScore).toBeGreaterThanOrEqual(80);
    expect(evalResult.fitClassification).toBe('EXCELLENT');
    expect(evalResult.reasons.length).toBeGreaterThan(0);
  });

  test('returns INVALID fitClassification when destination is closed', () => {
    const context = createIntelligenceContext({
      destination: { name: 'Closed Museum', cat: 'museum' },
      openingHours: { isOpenNow: false, isOpen: false },
    });

    const evalResult = evaluateContextExperience(context);
    expect(evalResult.experienceScore).toBe(0);
    expect(evalResult.fitClassification).toBe('INVALID');
    expect(evalResult.reasons[0]).toContain('closed');
  });
});
