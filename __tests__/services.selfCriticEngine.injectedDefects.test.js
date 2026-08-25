'use strict';

const { critiqueItinerary } = require('../services/travelIntelligence/selfCriticEngine');

describe('Self-Critic Injected Defects & Error Detection Engine', () => {
  const baseRequirements = {
    hard: { startMin: 9 * 60, endMin: 18 * 60, excludedCategories: ['temple'], requiredMeals: ['lunch'] },
    soft: { preferredCategories: ['scenic', 'museum', 'food'] },
    weather: { tempC: 28, condition: 'Clear' },
  };

  test('detects closed destination during projected arrival time', () => {
    const defectivePlan = {
      stops: [
        { name: 'Kailasagiri', category: 'scenic', arriveAt: '10:00', arriveMin: 600, leaveMin: 660, open: false },
      ],
      totalTravelMinutes: 30,
    };

    const review = critiqueItinerary(defectivePlan, baseRequirements);
    expect(review.issues.some(i => /closed/i.test(i))).toBe(true);
  });

  test('detects unmet preferred categories in candidate plan', () => {
    const defectivePlan = {
      stops: [
        { name: 'Simhachalam Temple', category: 'temple', arriveAt: '10:00', arriveMin: 600, leaveMin: 660 },
      ],
      totalTravelMinutes: 30,
    };

    const review = critiqueItinerary(defectivePlan, baseRequirements);
    expect(review.issues.some(i => /unmet/i.test(i))).toBe(true);
  });

  test('detects severe backtracking loop in transit route', () => {
    const defectivePlan = {
      stops: [
        { name: 'Point A', coords: [17.70, 83.30], arriveMin: 540, leaveMin: 600 },
        { name: 'Point B (20km north)', coords: [17.90, 83.30], arriveMin: 640, leaveMin: 700 },
        { name: 'Point C (back south)', coords: [17.71, 83.31], arriveMin: 740, leaveMin: 800 },
      ],
      totalTravelMinutes: 120,
    };

    const review = critiqueItinerary(defectivePlan, baseRequirements);
    expect(review.issues.some(i => /backtracking/i.test(i))).toBe(true);
  });

  test('detects duplicate stops within the same itinerary', () => {
    const defectivePlan = {
      stops: [
        { id: '1', name: 'RK Beach', arriveMin: 540, leaveMin: 600 },
        { id: '2', name: 'Submarine Museum', arriveMin: 615, leaveMin: 675 },
        { id: '1', name: 'RK Beach', arriveMin: 700, leaveMin: 760 },
      ],
      totalTravelMinutes: 40,
    };

    const review = critiqueItinerary(defectivePlan, baseRequirements);
    expect(review.issues.some(i => /duplicate/i.test(i))).toBe(true);
  });
});
