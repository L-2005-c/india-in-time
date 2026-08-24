'use strict';

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sourceQuality(source) {
  switch (source) {
    case 'live_traffic':
    case 'observed': return 1.0;
    case 'forecast':
    case 'predicted': return 0.88;
    case 'historical-db': return 0.78;
    case 'route_estimate':
    case 'estimated': return 0.68;
    case 'astronomical_rules': return 0.82;
    case 'unavailable': return 0.25;
    default: return 0.55;
  }
}

function freshnessFactor(ageMinutes) {
  const age = Number(ageMinutes);
  if (!Number.isFinite(age)) return 0.7;
  if (age <= 15) return 1;
  if (age <= 60) return 0.95;
  if (age <= 180) return 0.85;
  if (age <= 720) return 0.7;
  return 0.55;
}

function signalConfidence({ source = 'unavailable', ageMinutes, samples = 0, calibration = null } = {}) {
  let score = 100 * sourceQuality(source) * freshnessFactor(ageMinutes);
  if (samples > 0) score += Math.min(12, Math.log10(samples + 1) * 7);
  // BUGFIX: `calibration` defaults to `null`, and `Number(null) === 0` is a
  // *finite* number — without the explicit `calibration != null` guard, every
  // call that omits calibration silently fell into this branch and had its
  // score multiplied by clamp(0, 0.5, 1.05) = 0.5, halving the result. Only
  // apply the calibration multiplier when a real calibration value was given.
  if (calibration != null && Number.isFinite(Number(calibration))) score *= clamp(Number(calibration), 0.5, 1.05);
  return clamp(Math.round(score), 0, 100);
}

function weightedMean(values) {
  const valid = values.filter(v => Number.isFinite(v.value) && Number.isFinite(v.weight) && v.weight > 0);
  if (!valid.length) return 0;
  const weight = valid.reduce((s, v) => s + v.weight, 0);
  return valid.reduce((s, v) => s + v.value * v.weight, 0) / weight;
}

function uncertaintyFromSignals(signals = []) {
  const confidences = signals.map(s => Number(s.confidence)).filter(Number.isFinite);
  if (!confidences.length) return { score: 70, band: 30 };
  const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const spread = confidences.length > 1
    ? Math.sqrt(confidences.reduce((s, c) => s + ((c - avg) ** 2), 0) / confidences.length)
    : 0;
  const band = clamp(Math.round((100 - avg) * 0.55 + spread * 0.25 + 4), 4, 45);
  return { score: clamp(Math.round(100 - band), 0, 100), band };
}

function computeDecisionScore({
  experience = 50,
  temporalFit = 50,
  routeFit = 50,
  robustness = 50,
  preferenceFit = 50,
  diversity = 50,
  openingFeasibility = 50,
} = {}) {
  const components = {
    experience: clamp(experience),
    temporalFit: clamp(temporalFit),
    routeFit: clamp(routeFit),
    robustness: clamp(robustness),
    preferenceFit: clamp(preferenceFit),
    diversity: clamp(diversity),
    openingFeasibility: clamp(openingFeasibility),
  };
  const weights = {
    experience: 0.33,
    temporalFit: 0.20,
    routeFit: 0.13,
    robustness: 0.12,
    preferenceFit: 0.09,
    diversity: 0.05,
    openingFeasibility: 0.08,
  };
  const score = Object.entries(weights).reduce((sum, [k, w]) => sum + components[k] * w, 0);
  return { score: clamp(Math.round(score)), components, weights };
}

function scenarioRobustness(baseScore, uncertaintyBand, scenarios = 5) {
  const base = clamp(baseScore);
  const band = clamp(uncertaintyBand, 1, 45);
  const n = Math.max(3, Math.min(9, scenarios));
  const values = [];
  for (let i = 0; i < n; i += 1) {
    const p = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    values.push(clamp(base + p * band));
  }
  const worst = Math.min(...values);
  const best = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    worstCase: Math.round(worst),
    expected: Math.round(mean),
    bestCase: Math.round(best),
    robustness: clamp(Math.round((worst * 0.55) + (mean * 0.35) + (best * 0.10))),
    uncertaintyBand: Math.round(band),
    scenarios: values.map(v => Math.round(v)),
  };
}

function temporalRegret(arrivalScore, bestFutureScore) {
  const a = clamp(arrivalScore);
  const b = clamp(bestFutureScore);
  return {
    regret: Math.max(0, Math.round(b - a)),
    opportunity: Math.max(0, Math.round(b - a)),
    label: b - a >= 20 ? 'HIGH_OPPORTUNITY_TO_WAIT' : b - a >= 10 ? 'MODERATE_OPPORTUNITY' : 'LOW_OPPORTUNITY',
  };
}

/**
 * Authoritative Unified Travel Value Score calculation.
 * Synthesizes all 5 intelligence systems with intent-adaptive weighting.
 */
function computeTravelValueScore({
  tourismQuality = 60,
  temporalSuitability = 60,
  scenicValue = 50,
  weatherFit = 75,
  crowdFit = 70,
  dnaMatch = 65,
  routeEfficiency = 70,
  openingAvailability = 90,
  intent = 'balanced',
  confidence = 85,
} = {}) {
  const components = {
    tourismQuality: clamp(tourismQuality),
    temporalSuitability: clamp(temporalSuitability),
    scenicValue: clamp(scenicValue),
    weatherFit: clamp(weatherFit),
    crowdFit: clamp(crowdFit),
    dnaMatch: clamp(dnaMatch),
    routeEfficiency: clamp(routeEfficiency),
    openingAvailability: clamp(openingAvailability),
  };

  const INTENT_WEIGHTS = {
    photography: {
      scenicValue: 0.28,
      temporalSuitability: 0.24,
      weatherFit: 0.16,
      tourismQuality: 0.12,
      dnaMatch: 0.10,
      routeEfficiency: 0.05,
      crowdFit: 0.05,
      openingAvailability: 0.00,
    },
    food: {
      tourismQuality: 0.32,
      temporalSuitability: 0.25,
      dnaMatch: 0.20,
      openingAvailability: 0.10,
      routeEfficiency: 0.08,
      weatherFit: 0.05,
      crowdFit: 0.00,
      scenicValue: 0.00,
    },
    family: {
      openingAvailability: 0.20,
      routeEfficiency: 0.22,
      tourismQuality: 0.20,
      crowdFit: 0.15,
      weatherFit: 0.12,
      temporalSuitability: 0.08,
      dnaMatch: 0.03,
      scenicValue: 0.00,
    },
    adventure: {
      scenicValue: 0.25,
      dnaMatch: 0.22,
      weatherFit: 0.20,
      temporalSuitability: 0.15,
      tourismQuality: 0.10,
      routeEfficiency: 0.08,
      crowdFit: 0.00,
      openingAvailability: 0.00,
    },
    balanced: {
      tourismQuality: 0.22,
      temporalSuitability: 0.20,
      scenicValue: 0.15,
      dnaMatch: 0.14,
      routeEfficiency: 0.11,
      weatherFit: 0.08,
      crowdFit: 0.05,
      openingAvailability: 0.05,
    },
  };

  const weights = INTENT_WEIGHTS[intent] || INTENT_WEIGHTS.balanced;
  const scoreRaw = Object.entries(weights).reduce((sum, [k, w]) => sum + components[k] * w, 0);
  const score = clamp(Math.round(scoreRaw));

  // Determine top contributing explainability reasons
  const reasons = [];
  if (components.temporalSuitability >= 80) reasons.push('Optimal time window & solar conditions');
  if (components.tourismQuality >= 80) reasons.push('Verified high-quality destination');
  if (components.dnaMatch >= 80) reasons.push('Strong alignment with your Travel DNA');
  if (components.scenicValue >= 80) reasons.push('Exceptional scenic / visual vantage');
  if (components.routeEfficiency >= 85) reasons.push('Minimizes travel time in current cluster');

  return {
    score,
    confidence: clamp(confidence),
    components,
    weights,
    intent,
    reasons: reasons.length ? reasons : ['Solid overall travel suitability fit'],
  };
}

module.exports = {
  clamp,
  sourceQuality,
  freshnessFactor,
  signalConfidence,
  weightedMean,
  uncertaintyFromSignals,
  computeDecisionScore,
  computeTravelValueScore,
  scenarioRobustness,
  temporalRegret,
};
