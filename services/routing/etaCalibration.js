'use strict';

/**
 * services/routing/etaCalibration.js
 *
 * Provides statistical ETA calibration, error tracking, and accuracy benchmarks
 * across predicted vs observed/ground-truth corridor travel times.
 */

/**
 * Evaluates ETA prediction accuracy against an array of ground-truth observations.
 *
 * @param {Array<{ predictedSeconds: number, observedSeconds: number, city?: string, provider?: string, isRushHour?: boolean }>} samples
 * @returns {EtaEvaluationReport}
 */
function evaluateEtaAccuracy(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      sampleCount: 0,
      maeSeconds: null,
      medianErrorSeconds: null,
      p90ErrorSeconds: null,
      mapePercent: null,
      accuracyTier: 'INSUFFICIENT_DATA',
      breakdowns: {},
    };
  }

  const validSamples = samples.filter(s =>
    Number.isFinite(s.predictedSeconds) && s.predictedSeconds > 0 &&
    Number.isFinite(s.observedSeconds) && s.observedSeconds > 0
  );

  if (validSamples.length === 0) {
    return {
      sampleCount: 0,
      maeSeconds: null,
      medianErrorSeconds: null,
      p90ErrorSeconds: null,
      mapePercent: null,
      accuracyTier: 'INSUFFICIENT_DATA',
      breakdowns: {},
    };
  }

  const absErrors = [];
  const pctErrors = [];

  for (const s of validSamples) {
    const absDiff = Math.abs(s.predictedSeconds - s.observedSeconds);
    const pctDiff = (absDiff / s.observedSeconds) * 100;
    absErrors.push(absDiff);
    pctErrors.push(pctDiff);
  }

  absErrors.sort((a, b) => a - b);
  pctErrors.sort((a, b) => a - b);

  const n = absErrors.length;
  const maeSeconds = Math.round(absErrors.reduce((sum, e) => sum + e, 0) / n);
  const medianErrorSeconds = Math.round(n % 2 === 0 ? (absErrors[n / 2 - 1] + absErrors[n / 2]) / 2 : absErrors[Math.floor(n / 2)]);
  const p90Idx = Math.min(n - 1, Math.floor(n * 0.9));
  const p90ErrorSeconds = Math.round(absErrors[p90Idx]);
  const mapePercent = Math.round((pctErrors.reduce((sum, p) => sum + p, 0) / n) * 10) / 10;

  let accuracyTier = 'HIGH_PRECISION';
  if (mapePercent > 25 || p90ErrorSeconds > 900) {
    accuracyTier = 'LOW_PRECISION';
  } else if (mapePercent > 15 || p90ErrorSeconds > 450) {
    accuracyTier = 'MODERATE_PRECISION';
  }

  // City breakdown
  const cityGroups = new Map();
  for (const s of validSamples) {
    const c = s.city || 'general';
    if (!cityGroups.has(c)) cityGroups.set(c, []);
    cityGroups.get(c).push(s);
  }

  const cityBreakdown = {};
  for (const [c, group] of cityGroups) {
    const groupAbs = group.map(x => Math.abs(x.predictedSeconds - x.observedSeconds));
    const groupMae = Math.round(groupAbs.reduce((sum, e) => sum + e, 0) / group.length);
    cityBreakdown[c] = { count: group.length, maeSeconds: groupMae };
  }

  return {
    sampleCount: n,
    maeSeconds,
    medianErrorSeconds,
    p90ErrorSeconds,
    mapePercent,
    accuracyTier,
    breakdowns: {
      byCity: cityBreakdown,
    },
  };
}

module.exports = {
  evaluateEtaAccuracy,
};
