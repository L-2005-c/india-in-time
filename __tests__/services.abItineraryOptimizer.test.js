'use strict';

const {
  getExperimentVariant,
  optimizePlanWithAbCandidates,
} = require('../services/travelIntelligence/abItineraryOptimizer');

describe('A/B Itinerary Optimization (abItineraryOptimizer.js)', () => {
  const mockPlaces = [
    { id: '1', name: 'Kailasagiri', cat: 'scenic', coords: [17.7478, 83.3364], is_sunset_spot: true, rating: 4.7, vt: 60 },
    { id: '2', name: 'Submarine Museum', cat: 'museum', coords: [17.7165, 83.3323], rating: 4.6, vt: 45 },
    { id: '3', name: 'RK Beach', cat: 'beach', coords: [17.7126, 83.3235], rating: 4.5, vt: 60 },
    { id: '4', name: 'Sea View Cafe', cat: 'food', coords: [17.7200, 83.3300], rating: 4.5, vt: 45 },
  ];

  const options = {
    startMin: 9 * 60,
    endMin: 18 * 60,
    preferredCategories: ['scenic', 'museum', 'beach', 'food'],
  };

  test('assigns users to deterministic stable experiment variants', () => {
    const v1 = getExperimentVariant('user_alpha', 'test_exp');
    const v2 = getExperimentVariant('user_alpha', 'test_exp');
    expect(v1.variantId).toBe(v2.variantId);
    expect(['SCENIC_MAX', 'EFFICIENCY_MAX', 'BALANCED_HARMONY']).toContain(v1.variantId);
  });

  test('generates multiple candidate plans and returns the assigned variant with comparative stats', () => {
    const result = optimizePlanWithAbCandidates(mockPlaces, { ...options, userId: 'traveler_101' });
    expect(result).toHaveProperty('selectedPlan');
    expect(result.selectedPlan.status).toBe('FEASIBLE');
    expect(result.candidates.length).toBe(3);
    expect(result.candidates.every(c => Array.isArray(c.stopNames))).toBe(true);
    expect(result.experiment.assignedVariant).toBeDefined();
  });
});
