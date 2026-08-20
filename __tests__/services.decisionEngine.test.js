'use strict';

const {
  clamp,
  sourceQuality,
  freshnessFactor,
  signalConfidence,
  weightedMean,
  computeDecisionScore,
  scenarioRobustness,
  uncertaintyFromSignals,
  temporalRegret,
} = require('../services/travelIntelligence/decisionEngine');

describe('decisionEngine', () => {
  test('clamp bounds and coerces non-finite values', () => {
    expect(clamp(150)).toBe(100);
    expect(clamp(-10)).toBe(0);
    expect(clamp(NaN)).toBe(0);
    expect(clamp(5, 1, 4)).toBe(4);
  });

  test('sourceQuality ranks live above estimate and unavailable', () => {
    expect(sourceQuality('live_traffic')).toBeGreaterThan(sourceQuality('route_estimate'));
    expect(sourceQuality('observed')).toBeGreaterThan(sourceQuality('historical-db'));
    expect(sourceQuality('unavailable')).toBeLessThan(sourceQuality('estimated'));
    expect(sourceQuality('unknown-source')).toBe(0.55);
  });

  test('freshnessFactor decays with age', () => {
    expect(freshnessFactor(5)).toBe(1);
    expect(freshnessFactor(30)).toBe(0.95);
    expect(freshnessFactor(120)).toBe(0.85);
    expect(freshnessFactor(400)).toBe(0.7);
    expect(freshnessFactor(2000)).toBe(0.55);
    expect(freshnessFactor(NaN)).toBe(0.7);
  });

  test('signalConfidence blends source, age, samples, calibration', () => {
    const freshLive = signalConfidence({ source: 'live_traffic', ageMinutes: 5, samples: 100 });
    const staleUnknown = signalConfidence({ source: 'unavailable', ageMinutes: 2000 });
    expect(freshLive).toBeGreaterThan(staleUnknown);
    expect(freshLive).toBeLessThanOrEqual(100);
    const calibrated = signalConfidence({ source: 'forecast', ageMinutes: 20, calibration: 0.5 });
    const uncal = signalConfidence({ source: 'forecast', ageMinutes: 20 });
    expect(calibrated).toBeLessThanOrEqual(uncal);
  });

  test('weightedMean ignores invalid weights', () => {
    expect(weightedMean([])).toBe(0);
    expect(weightedMean([
      { value: 10, weight: 1 },
      { value: 30, weight: 1 },
      { value: 999, weight: 0 },
      { value: NaN, weight: 5 },
    ])).toBe(20);
  });

  test('combines time, geo, robustness and preference into a bounded decision score', () => {
    const result = computeDecisionScore({
      experience: 92, temporalFit: 98, routeFit: 78,
      robustness: 84, preferenceFit: 90, diversity: 70, openingFeasibility: 95,
    });
    expect(result.score).toBeGreaterThan(80);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components.experience).toBe(92);
    expect(result.weights.experience).toBeCloseTo(0.33);
  });

  test('computeDecisionScore clamps bad component inputs', () => {
    const result = computeDecisionScore({
      experience: 200, temporalFit: -50, routeFit: 'x',
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.components.experience).toBe(100);
    expect(result.components.temporalFit).toBe(0);
  });

  test('models uncertainty instead of inventing certainty', () => {
    const result = uncertaintyFromSignals([
      { confidence: 90 }, { confidence: 65 }, { confidence: 45 }, { confidence: 80 },
    ]);
    expect(result.band).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
    expect(uncertaintyFromSignals([]).score).toBe(70);
  });

  test('computes robustness across uncertainty scenarios', () => {
    const result = scenarioRobustness(90, 20);
    expect(result.worstCase).toBeLessThan(result.bestCase);
    expect(result.robustness).toBeGreaterThan(0);
    expect(result.scenarios.length).toBeGreaterThanOrEqual(3);
  });

  test('exposes opportunity cost of visiting now instead of waiting', () => {
    const high = temporalRegret(58, 94);
    expect(high.regret).toBe(36);
    expect(high.label).toBe('HIGH_OPPORTUNITY_TO_WAIT');
    const low = temporalRegret(90, 92);
    expect(low.label).toBe('LOW_OPPORTUNITY');
    const mid = temporalRegret(70, 82);
    expect(mid.label).toBe('MODERATE_OPPORTUNITY');
  });
});
