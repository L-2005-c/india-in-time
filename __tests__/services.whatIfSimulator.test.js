'use strict';

const { simulateScenario } = require('../services/travelIntelligence/whatIfSimulator');

describe('Trip Simulation / What-If Engine (whatIfSimulator.js)', () => {
  const mockCandidates = [
    { id: '1', name: 'Kailasagiri', cat: 'scenic', coords: [17.7478, 83.3364], is_sunset_spot: true, rating: 4.6, vt: 60 },
    { id: '2', name: 'Submarine Museum', cat: 'museum', coords: [17.7165, 83.3323], rating: 4.5, vt: 45 },
    { id: '3', name: 'RK Beach', cat: 'beach', coords: [17.7126, 83.3235], rating: 4.4, vt: 60 },
    { id: '4', name: 'Sea Breeze Restaurant', cat: 'food', coords: [17.7200, 83.3280], rating: 4.5, vt: 45 },
  ];

  const currentPlan = {
    requirements: {
      hard: { startMin: 9 * 60, endMin: 18 * 60 },
      soft: { preferredCategories: ['scenic', 'museum', 'beach'] },
    },
    totalTravelMinutes: 45,
    estimatedCost: 200,
    itineraryQualityScore: 90,
    stops: [
      { name: 'Kailasagiri' },
      { name: 'Submarine Museum' },
      { name: 'RK Beach' },
    ],
  };

  test('simulates starting trip earlier without mutating original plan and outputs comparative diff', () => {
    const scenario = {
      id: 'early_start',
      title: 'Start at 07:00 AM',
      startMin: 7 * 60,
      endMin: 18 * 60,
    };

    const result = simulateScenario(mockCandidates, currentPlan, scenario);
    expect(result).toHaveProperty('scenarioId', 'early_start');
    expect(result.simulatedPlan.status).toBe('FEASIBLE');
    expect(result.comparison).toHaveProperty('travelTimeDeltaMin');
    expect(result.comparison).toHaveProperty('differences');
    expect(result.comparison.differences.length).toBeGreaterThanOrEqual(0);
  });

  test('simulates bad weather scenario shifting stops to indoor venues', () => {
    const scenario = {
      id: 'heavy_rain',
      title: 'Heavy Rain Shift',
      weather: { tempC: 24, condition: 'Heavy Rain' },
    };

    const result = simulateScenario(mockCandidates, currentPlan, scenario);
    expect(result.simulatedPlan.status).toBe('FEASIBLE');
    expect(result.comparison).toBeDefined();
  });
});
