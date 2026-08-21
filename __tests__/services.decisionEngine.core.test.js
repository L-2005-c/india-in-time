// __tests__/services.decisionEngine.core.test.js
// Branch-level coverage for services/travelIntelligence/decisionEngine.js.
// This module computes the final recommendation score shown to users, so
// every branch of its weighting/uncertainty math is exercised here with
// concrete expected values, not just "does it run".

'use strict';

const {
  clamp,
  sourceQuality,
  freshnessFactor,
  signalConfidence,
  weightedMean,
  uncertaintyFromSignals,
  computeDecisionScore,
  scenarioRobustness,
  temporalRegret,
} = require('../services/travelIntelligence/decisionEngine');

describe('decisionEngine', () => {
  describe('clamp', () => {
    test('passes through values within range', () => {
      expect(clamp(50)).toBe(50);
    });
    test('clamps values above max', () => {
      expect(clamp(150)).toBe(100);
    });
    test('clamps values below min', () => {
      expect(clamp(-20)).toBe(0);
    });
    test('respects custom min/max', () => {
      expect(clamp(0.9, 0.5, 1.05)).toBe(0.9);
      expect(clamp(2, 0.5, 1.05)).toBe(1.05);
      expect(clamp(0.1, 0.5, 1.05)).toBe(0.5);
    });
    test('returns min for non-finite input (NaN, undefined, string)', () => {
      expect(clamp(NaN)).toBe(0);
      expect(clamp(undefined)).toBe(0);
      expect(clamp('not-a-number')).toBe(0);
      expect(clamp(Infinity, 5, 10)).toBe(5);
    });
  });

  describe('sourceQuality', () => {
    test.each([
      ['live_traffic', 1.0],
      ['observed', 1.0],
      ['forecast', 0.88],
      ['predicted', 0.88],
      ['historical-db', 0.78],
      ['route_estimate', 0.68],
      ['estimated', 0.68],
      ['astronomical_rules', 0.82],
      ['unavailable', 0.25],
      ['totally-unknown-source', 0.55],
      [undefined, 0.55],
    ])('%s -> %f', (source, expected) => {
      expect(sourceQuality(source)).toBe(expected);
    });
  });

  describe('freshnessFactor', () => {
    test.each([
      [0, 1],
      [15, 1],
      [16, 0.95],
      [60, 0.95],
      [61, 0.85],
      [180, 0.85],
      [181, 0.7],
      [720, 0.7],
      [721, 0.55],
      [100000, 0.55],
    ])('age %dmin -> %f', (age, expected) => {
      expect(freshnessFactor(age)).toBe(expected);
    });
    test('non-finite age defaults to 0.7', () => {
      expect(freshnessFactor(NaN)).toBe(0.7);
      expect(freshnessFactor(undefined)).toBe(0.7);
    });
  });

  describe('signalConfidence', () => {
    test('defaults to the "unavailable" source with no age (freshness 0.7)', () => {
      // 100 * 0.25 * 0.7 = 17.5 -> rounds to 18 (no samples; calibration
      // omitted, so the calibration multiplier does not apply)
      expect(signalConfidence()).toBe(18);
    });

    test('high-quality, fresh, observed signal scores near the top', () => {
      // 100 * 1.0 * 1.0 = 100, clamped to 100 (calibration omitted -> no multiplier)
      expect(signalConfidence({ source: 'observed', ageMinutes: 5 })).toBe(100);
    });

    test('sample-count bonus increases the score but is capped at +12', () => {
      const withoutSamples = signalConfidence({ source: 'forecast', ageMinutes: 30 });
      const withSamples = signalConfidence({ source: 'forecast', ageMinutes: 30, samples: 500 });
      expect(withSamples).toBeGreaterThan(withoutSamples);
      // With a huge sample count the bonus should be clamped near +12, not unbounded.
      const hugeSamples = signalConfidence({ source: 'forecast', ageMinutes: 30, samples: 1e9 });
      expect(hugeSamples - withoutSamples).toBeLessThanOrEqual(12);
    });

    test('calibration multiplier adjusts the score within its clamp band', () => {
      const base = signalConfidence({ source: 'observed', ageMinutes: 5, calibration: 1.0 });
      const boosted = signalConfidence({ source: 'observed', ageMinutes: 5, calibration: 1.05 });
      const reduced = signalConfidence({ source: 'observed', ageMinutes: 5, calibration: 0.5 });
      expect(boosted).toBeGreaterThanOrEqual(base);
      expect(reduced).toBeLessThan(base);
    });

    test('non-finite calibration (e.g. a garbage string) is ignored (no multiplier applied)', () => {
      const withoutCal = signalConfidence({ source: 'observed', ageMinutes: 5 });
      const withBadCal = signalConfidence({ source: 'observed', ageMinutes: 5, calibration: 'nonsense' });
      expect(withBadCal).toBe(withoutCal);
    });

    test('an explicit null calibration is also ignored, not treated as 0 (regression test)', () => {
      // Regression guard for the bug fixed in decisionEngine.js: Number(null) === 0
      // is finite, so without the `calibration != null` guard this used to
      // silently multiply the score by clamp(0, 0.5, 1.05) = 0.5.
      const withoutCal = signalConfidence({ source: 'observed', ageMinutes: 5 });
      const withNullCal = signalConfidence({ source: 'observed', ageMinutes: 5, calibration: null });
      expect(withNullCal).toBe(withoutCal);
    });

    test('result is always clamped to [0, 100]', () => {
      const result = signalConfidence({ source: 'observed', ageMinutes: 1, samples: 1e12, calibration: 10 });
      expect(result).toBeLessThanOrEqual(100);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('weightedMean', () => {
    test('returns 0 for an empty array', () => {
      expect(weightedMean([])).toBe(0);
    });
    test('returns 0 when no entries are valid', () => {
      expect(weightedMean([{ value: NaN, weight: 1 }, { value: 5, weight: 0 }])).toBe(0);
    });
    test('computes a correct weighted average, ignoring invalid entries', () => {
      const result = weightedMean([
        { value: 10, weight: 1 },
        { value: 20, weight: 3 },
        { value: NaN, weight: 5 }, // ignored: invalid value
        { value: 100, weight: -1 }, // ignored: non-positive weight
      ]);
      // (10*1 + 20*3) / (1+3) = 70/4 = 17.5
      expect(result).toBeCloseTo(17.5);
    });
  });

  describe('uncertaintyFromSignals', () => {
    test('returns a default fallback band when there are no signals', () => {
      expect(uncertaintyFromSignals([])).toEqual({ score: 70, band: 30 });
      expect(uncertaintyFromSignals()).toEqual({ score: 70, band: 30 });
    });

    test('a single high-confidence signal yields a small uncertainty band', () => {
      const { score, band } = uncertaintyFromSignals([{ confidence: 95 }]);
      expect(band).toBeLessThan(30);
      expect(score).toBeGreaterThan(70);
    });

    test('spread across multiple disagreeing signals increases the band', () => {
      const tight = uncertaintyFromSignals([{ confidence: 80 }, { confidence: 82 }]);
      const spread = uncertaintyFromSignals([{ confidence: 20 }, { confidence: 95 }]);
      expect(spread.band).toBeGreaterThan(tight.band);
    });

    test('band is always clamped to [4, 45] and score to [0, 100]', () => {
      const allZero = uncertaintyFromSignals([{ confidence: 0 }, { confidence: 0 }]);
      expect(allZero.band).toBeLessThanOrEqual(45);
      expect(allZero.band).toBeGreaterThanOrEqual(4);
      expect(allZero.score).toBeGreaterThanOrEqual(0);

      const allPerfect = uncertaintyFromSignals([{ confidence: 100 }, { confidence: 100 }]);
      expect(allPerfect.band).toBeGreaterThanOrEqual(4);
    });

    test('non-finite confidences are filtered out before averaging', () => {
      const result = uncertaintyFromSignals([{ confidence: NaN }, { confidence: 90 }]);
      expect(result.score).toBeGreaterThan(70);
    });
  });

  describe('computeDecisionScore', () => {
    test('all-default (50) inputs produce a score of 50', () => {
      const { score, components, weights } = computeDecisionScore();
      expect(score).toBe(50);
      expect(components.experience).toBe(50);
      // Weights must sum to 1 (within floating point tolerance) so the
      // score is a true weighted average, not silently scaled.
      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    test('perfect inputs across the board produce a score of 100', () => {
      const { score } = computeDecisionScore({
        experience: 100, temporalFit: 100, routeFit: 100, robustness: 100,
        preferenceFit: 100, diversity: 100, openingFeasibility: 100,
      });
      expect(score).toBe(100);
    });

    test('experience carries the most weight (0.33) — raising it alone moves the score the most', () => {
      const base = computeDecisionScore().score;
      const experienceUp = computeDecisionScore({ experience: 100 }).score;
      const diversityUp = computeDecisionScore({ diversity: 100 }).score; // weight 0.05
      expect(experienceUp - base).toBeGreaterThan(diversityUp - base);
    });

    test('out-of-range inputs are clamped before weighting', () => {
      const { components } = computeDecisionScore({ experience: 500, temporalFit: -50 });
      expect(components.experience).toBe(100);
      expect(components.temporalFit).toBe(0);
    });
  });

  describe('scenarioRobustness', () => {
    test('a near-zero uncertainty band keeps scenarios tightly clustered around the base score', () => {
      // uncertaintyBand is clamped to a minimum of 1 (never truly zero), so
      // passing 0 still produces a band of 1 and a small spread around 70.
      const result = scenarioRobustness(70, 0);
      expect(result.expected).toBe(70);
      expect(result.worstCase).toBe(69);
      expect(result.bestCase).toBe(71);
      expect(Math.abs(result.robustness - 70)).toBeLessThanOrEqual(1);
    });

    test('a wide uncertainty band spreads worst/best cases apart', () => {
      const result = scenarioRobustness(50, 40);
      expect(result.worstCase).toBeLessThan(result.expected);
      expect(result.bestCase).toBeGreaterThan(result.expected);
      expect(result.worstCase).toBeGreaterThanOrEqual(0);
      expect(result.bestCase).toBeLessThanOrEqual(100);
    });

    test('scenario count is clamped between 3 and 9', () => {
      const tooFew = scenarioRobustness(50, 10, 1);
      expect(tooFew.scenarios.length).toBe(3);
      const tooMany = scenarioRobustness(50, 10, 50);
      expect(tooMany.scenarios.length).toBe(9);
    });

    test('robustness composite weights worst-case most heavily (0.55)', () => {
      // With a large band, robustness should sit closer to the worst case
      // than a simple mean of worst/expected/best would suggest.
      const result = scenarioRobustness(50, 40);
      const simpleMean = (result.worstCase + result.expected + result.bestCase) / 3;
      expect(result.robustness).toBeLessThanOrEqual(simpleMean + 1);
    });
  });

  describe('temporalRegret', () => {
    test('no regret when arrival score already matches the best future score', () => {
      const result = temporalRegret(80, 80);
      expect(result.regret).toBe(0);
      expect(result.label).toBe('LOW_OPPORTUNITY');
    });

    test('regret is floored at 0 even if arrival beats the future score', () => {
      const result = temporalRegret(90, 60);
      expect(result.regret).toBe(0);
      expect(result.opportunity).toBe(0);
    });

    test('classifies a large gap as HIGH_OPPORTUNITY_TO_WAIT (>= 20)', () => {
      const result = temporalRegret(50, 75);
      expect(result.regret).toBe(25);
      expect(result.label).toBe('HIGH_OPPORTUNITY_TO_WAIT');
    });

    test('classifies a mid-size gap as MODERATE_OPPORTUNITY (10-19)', () => {
      const result = temporalRegret(50, 62);
      expect(result.regret).toBe(12);
      expect(result.label).toBe('MODERATE_OPPORTUNITY');
    });

    test('classifies a small gap as LOW_OPPORTUNITY (< 10)', () => {
      const result = temporalRegret(50, 55);
      expect(result.regret).toBe(5);
      expect(result.label).toBe('LOW_OPPORTUNITY');
    });

    test('inputs are clamped to [0, 100] before comparison', () => {
      const result = temporalRegret(-50, 500);
      expect(result.regret).toBe(100); // clamp(0) vs clamp(100)
    });
  });
});
