const {
  computeDecisionScore,
  scenarioRobustness,
  uncertaintyFromSignals,
  temporalRegret,
} = require('../services/travelIntelligence/decisionEngine');

describe('decisionEngine', () => {
  test('combines time, geo, robustness and preference into a bounded decision score', () => {
    const result = computeDecisionScore({ experience: 92, temporalFit: 98, routeFit: 78, robustness: 84, preferenceFit: 90, diversity: 70, openingFeasibility: 95 });
    expect(result.score).toBeGreaterThan(80);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('models uncertainty instead of inventing certainty', () => {
    const result = uncertaintyFromSignals([
      { confidence: 90 }, { confidence: 65 }, { confidence: 45 }, { confidence: 80 },
    ]);
    expect(result.band).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  test('computes robustness across uncertainty scenarios', () => {
    const result = scenarioRobustness(90, 20);
    expect(result.worstCase).toBeLessThan(result.bestCase);
    expect(result.robustness).toBeGreaterThan(0);
  });

  test('exposes opportunity cost of visiting now instead of waiting', () => {
    const result = temporalRegret(58, 94);
    expect(result.regret).toBe(36);
    expect(result.label).toBe('HIGH_OPPORTUNITY_TO_WAIT');
  });
});
