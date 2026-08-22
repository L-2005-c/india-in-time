'use strict';
/**
 * SLO / error-budget tracking (FAANG-style reliability).
 * In-process ring buffer; scrape via /api/metrics or /api/slo.
 * Targets (defaults):
 *  - availability: 99.9% success (non-5xx) over rolling window
 *  - latency: p99 < 2000ms for API routes
 */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour rolling
const MAX_SAMPLES = 5000;

const samples = []; // { t, ok, ms, route }

function recordRequest({ ok, ms, route }) {
  const t = Date.now();
  samples.push({ t, ok: !!ok, ms: Number(ms) || 0, route: route || 'unknown' });
  while (samples.length > MAX_SAMPLES) samples.shift();
  const cutoff = t - WINDOW_MS;
  while (samples.length && samples[0].t < cutoff) samples.shift();
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function getSloReport(targets = {}) {
  const availabilityTarget = targets.availability ?? 0.999;
  const latencyP99TargetMs = targets.latencyP99Ms ?? 2000;
  const now = Date.now();
  const window = samples.filter((s) => s.t >= now - WINDOW_MS);
  const total = window.length;
  const successes = window.filter((s) => s.ok).length;
  const availability = total ? successes / total : 1;
  const latencies = window.map((s) => s.ms).sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  // Error budget remaining roughly: how far above target we are
  const budgetRemaining = availability >= availabilityTarget
    ? 1
    : Math.max(0, 1 - ((availabilityTarget - availability) / (1 - availabilityTarget)));

  return {
    windowMs: WINDOW_MS,
    sampleCount: total,
    availability: Math.round(availability * 100000) / 100000,
    availabilityTarget,
    availabilityMet: availability >= availabilityTarget,
    latency: { p50, p95, p99, targetP99: latencyP99TargetMs, p99Met: p99 <= latencyP99TargetMs },
    errorBudgetRemaining: Math.round(budgetRemaining * 1000) / 1000,
    healthy: availability >= availabilityTarget && p99 <= latencyP99TargetMs,
  };
}

function sloMiddleware() {
  return function sloTracker(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const ok = res.statusCode < 500;
      recordRequest({ ok, ms, route: req.route?.path || req.path });
    });
    next();
  };
}

module.exports = { recordRequest, getSloReport, sloMiddleware, WINDOW_MS };
