'use strict';

/**
 * __tests__/services.routeBenchmark.test.js
 * Integration test suite executing the 50-Scenario Indian Route & ETA Benchmark.
 */

const { run50RouteBenchmarks } = require('../scripts/benchmarks/route-eta-benchmark');
const { evaluateEtaAccuracy } = require('../services/routing/etaCalibration');

describe('50-Scenario Indian Route & ETA Benchmark', () => {
  // Allow up to 60 seconds for 50 benchmark calculations
  jest.setTimeout(60000);

  test('executes 50 diverse Indian test corridors with high consistency and low ETA MAE', async () => {
    const report = await run50RouteBenchmarks();

    expect(report.total).toBe(50);
    expect(report.passedCount).toBeGreaterThanOrEqual(45); // At least 90% pass rate
    expect(report.accuracyReport.maeSeconds).toBeLessThan(500); // MAE under 8 minutes across national corridors
    expect(report.accuracyReport.medianErrorSeconds).toBeLessThan(400);
  });

  test('evaluateEtaAccuracy computes statistical metrics accurately on known inputs', () => {
    const samples = [
      { predictedSeconds: 600, observedSeconds: 600, city: 'Visakhapatnam' },
      { predictedSeconds: 900, observedSeconds: 840, city: 'Visakhapatnam' }, // +60s error
      { predictedSeconds: 1200, observedSeconds: 1320, city: 'Hyderabad' },   // +120s error
    ];

    const result = evaluateEtaAccuracy(samples);
    expect(result.sampleCount).toBe(3);
    expect(result.maeSeconds).toBe(60); // (0 + 60 + 120) / 3 = 60
    expect(result.medianErrorSeconds).toBe(60);
    expect(result.breakdowns.byCity.Visakhapatnam.count).toBe(2);
  });
});
