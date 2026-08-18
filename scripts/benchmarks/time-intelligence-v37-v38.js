'use strict';

const fs = require('fs');
const path = require('path');

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// v3.7 baseline: weighted experience/timing/route/confidence/diversity/opening.
function scoreV37(s) {
  const experience = clamp(s.experience);
  const temporalFit = clamp(s.temporalFit);
  const routeFit = clamp(s.routeFit);
  const confidence = clamp(s.confidence);
  const diversity = clamp(s.diversity);
  const opening = clamp(s.opening);
  return Math.round(
    experience * 0.52 +
    temporalFit * 0.24 +
    confidence * 0.10 +
    routeFit * 0.09 +
    diversity * 0.05 +
    opening * 0.00
  );
}

function scenarioRobustness(baseScore, uncertaintyBand) {
  const band = clamp(uncertaintyBand, 1, 45);
  const worst = clamp(baseScore - band);
  const expected = clamp(baseScore);
  const best = clamp(baseScore + band);
  return {
    worstCase: Math.round(worst),
    expected: Math.round(expected),
    bestCase: Math.round(best),
    robustness: Math.round(worst * 0.55 + expected * 0.35 + best * 0.10),
    uncertaintyBand: Math.round(band),
  };
}

function scoreV38(s) {
  const components = {
    experience: clamp(s.experience),
    temporalFit: clamp(s.temporalFit),
    routeFit: clamp(s.routeFit),
    robustness: clamp(s.robustness),
    preferenceFit: clamp(s.preferenceFit),
    diversity: clamp(s.diversity),
    openingFeasibility: clamp(s.opening),
  };
  return Math.round(
    components.experience * 0.33 +
    components.temporalFit * 0.20 +
    components.routeFit * 0.13 +
    components.robustness * 0.12 +
    components.preferenceFit * 0.09 +
    components.diversity * 0.05 +
    components.openingFeasibility * 0.08
  );
}

function seeded(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function avg(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function median(values) {
  const a = [...values].sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function pct(n, d) { return d ? (n / d) * 100 : 0; }

function runBenchmark({ scenarios = 1000, candidatesPerScenario = 8, seed = 20260816 } = {}) {
  const rand = seeded(seed);
  let v38Wins = 0;
  let v37Wins = 0;
  let ties = 0;
  const regret37 = [];
  const regret38 = [];
  const robustness37 = [];
  const robustness38 = [];
  const timing37 = [];
  const timing38 = [];
  const route37 = [];
  const route38 = [];
  const opportunityCases = [];
  let opportunityRecovered = 0;

  for (let i = 0; i < scenarios; i += 1) {
    const candidates = [];
    for (let j = 0; j < candidatesPerScenario; j += 1) {
      const experience = 45 + rand() * 55;
      const temporalFit = 20 + rand() * 80;
      const routeFit = 20 + rand() * 80;
      const confidence = 30 + rand() * 70;
      const preferenceFit = 20 + rand() * 80;
      const diversity = 30 + rand() * 70;
      const opening = 25 + rand() * 75;
      const uncertaintyBand = 4 + rand() * 35;
      const bestFutureScore = Math.min(100, experience + rand() * 30);
      const currentScore = Math.max(0, bestFutureScore - rand() * 45);
      const opportunity = Math.max(0, bestFutureScore - currentScore);
      const base37 = scoreV37({ experience, temporalFit, routeFit, confidence, diversity, opening });
      const robustness = scenarioRobustness(base37, uncertaintyBand).robustness;
      const score38 = scoreV38({ experience, temporalFit, routeFit, robustness, preferenceFit, diversity, opening });

      // Oracle = a synthetic ground-truth utility used only to compare ranking quality.
      // It intentionally values future timing, route effort, preferences and feasibility.
      const oracle = (
        experience * 0.40 +
        temporalFit * 0.22 +
        routeFit * 0.14 +
        preferenceFit * 0.10 +
        diversity * 0.08 +
        opening * 0.06
      );
      candidates.push({ experience, temporalFit, routeFit, confidence, preferenceFit, diversity, opening, uncertaintyBand, base37, score38, oracle, opportunity });
    }

    const pick37 = candidates.reduce((best, x) => (!best || x.base37 > best.base37 ? x : best), null);
    const pick38 = candidates.reduce((best, x) => (!best || x.score38 > best.score38 ? x : best), null);
    const oracle = candidates.reduce((best, x) => (!best || x.oracle > best.oracle ? x : best), null);

    const r37 = oracle.oracle - pick37.oracle;
    const r38 = oracle.oracle - pick38.oracle;
    regret37.push(r37);
    regret38.push(r38);
    robustness37.push(scenarioRobustness(pick37.base37, pick37.uncertaintyBand).robustness);
    robustness38.push(scenarioRobustness(pick38.score38, pick38.uncertaintyBand).robustness);
    timing37.push(100 - pick37.temporalFit);
    timing38.push(100 - pick38.temporalFit);
    route37.push(100 - pick37.routeFit);
    route38.push(100 - pick38.routeFit);

    if (r38 < r37) v38Wins += 1;
    else if (r37 < r38) v37Wins += 1;
    else ties += 1;

    if (candidates.some(c => c.opportunity >= 20) && pick38.opportunity >= 20) {
      opportunityRecovered += 1;
    }
    if (candidates.some(c => c.opportunity >= 20)) opportunityCases.push(i);
  }

  return {
    summary: {
      methodology: 'Deterministic synthetic candidate-selection benchmark. v3.7 and v3.8 receive identical seeded candidates; an independent oracle utility measures ranking regret. This is not field validation or real-user evidence.',
      scenarios,
      candidatesPerScenario,
      seed,
      lowerRegretWinRateV38Pct: pct(v38Wins, scenarios),
      lowerRegretWinRateV37Pct: pct(v37Wins, scenarios),
      tiesPct: pct(ties, scenarios),
      meanRegret: { v37: avg(regret37), v38: avg(regret38) },
      medianRegret: { v37: median(regret37), v38: median(regret38) },
      medianRobustness: { v37: median(robustness37), v38: median(robustness38) },
      meanTimingError: { v37: avg(timing37), v38: avg(timing38) },
      meanRouteCost: { v37: avg(route37), v38: avg(route38) },
      opportunityAwareCases: opportunityCases.length,
      opportunityRecoveredRatePct: pct(opportunityRecovered, opportunityCases.length),
    },
  };
}

if (require.main === module) {
  const out = runBenchmark({ scenarios: 1000, seed: 20260816 });
  const outDir = path.join(process.cwd(), 'artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'time-intelligence-v37-v38-benchmark.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.summary, null, 2));
}

module.exports = { runBenchmark };
