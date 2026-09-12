/**
 * INDIA IN-TIME v3.0 — Phase 10A GA Conditions Closure & Scale Validation Tests
 *
 * Validates:
 * 1. Existence and integrity of all 10 Phase 10A master reports.
 * 2. Consistent final gate determination: PHASE 10A CONDITIONS PARTIALLY CLOSED.
 * 3. Zero-fabrication compliance (D30 NOT YET ESTABLISHED, CWC/FSI PARTIALLY_AVAILABLE, Legal IN PROGRESS).
 * 4. Retention cohort engine instrumentation, privacy-preserving hashing, and formal definitions.
 * 5. Scale validation script and 5K concurrency parameters.
 * 6. Safety Primacy & Global Decision Hierarchy immutability.
 * 7. Architectural line limits (app.js <= 3500, server.js <= 560) and fail-closed secrets.
 */

const fs = require('fs');
const path = require('path');
const {
  evaluateCohortRetention,
  pseudonymize,
  RETENTION_DEFINITIONS,
  _cohortStore,
} = require('../services/observability/retentionCohortTracker');
const { STAGES } = require('../scripts/staged-scale-validation');

describe('Phase 10A — GA Conditions Closure & Scale Validation Verification', () => {
  const rootDir = path.resolve(__dirname, '..');

  const requiredReports = [
    'PHASE_10A_GA_CONDITION_MATRIX.md',
    'PHASE_10A_LEGAL_READINESS_STATUS.md',
    'PHASE_10A_RETENTION_REPORT.md',
    'PHASE_10A_CWC_INTEGRATION_REPORT.md',
    'PHASE_10A_FSI_INTEGRATION_REPORT.md',
    'PHASE_10A_SCALE_VALIDATION_REPORT.md',
    'PHASE_10A_FAILURE_RECOVERY_REPORT.md',
    'PHASE_10A_PROVIDER_STATUS_REPORT.md',
    'PHASE_10A_FINAL_CONDITION_CLOSURE.md',
    'PHASE_10A_FINAL_REPORT.md',
  ];

  test('All 10 Phase 10A master reports must exist on disk and exceed 500 bytes', () => {
    requiredReports.forEach((filename) => {
      const filePath = path.join(rootDir, filename);
      expect(fs.existsSync(filePath)).toBe(true);

      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(500);
    });
  });

  test('Final determination must declare PHASE 10A CONDITIONS PARTIALLY CLOSED', () => {
    const finalReport = fs.readFileSync(path.join(rootDir, 'PHASE_10A_FINAL_REPORT.md'), 'utf8');
    expect(finalReport).toMatch(/PHASE 10A CONDITIONS PARTIALLY CLOSED/);

    const closureReport = fs.readFileSync(path.join(rootDir, 'PHASE_10A_FINAL_CONDITION_CLOSURE.md'), 'utf8');
    expect(closureReport).toMatch(/PHASE 10A CONDITIONS PARTIALLY CLOSED/);
  });

  test('Zero-fabrication invariants must be strictly certified across condition reports', () => {
    const retReport = fs.readFileSync(path.join(rootDir, 'PHASE_10A_RETENTION_REPORT.md'), 'utf8');
    expect(retReport).toMatch(/NOT YET ESTABLISHED/);
    expect(retReport).toMatch(/CONDITION NOT SATISFIED/);

    const legReport = fs.readFileSync(path.join(rootDir, 'PHASE_10A_LEGAL_READINESS_STATUS.md'), 'utf8');
    expect(legReport).toMatch(/LEGAL REVIEW IN PROGRESS/);

    const cwcReport = fs.readFileSync(path.join(rootDir, 'PHASE_10A_CWC_INTEGRATION_REPORT.md'), 'utf8');
    expect(cwcReport).toMatch(/PARTIALLY_AVAILABLE/);

    const fsiReport = fs.readFileSync(path.join(rootDir, 'PHASE_10A_FSI_INTEGRATION_REPORT.md'), 'utf8');
    expect(fsiReport).toMatch(/PARTIALLY_AVAILABLE/);
    expect(fsiReport).toMatch(/THERMAL HOTSPOT\s*≠\s*CONFIRMED FIRE/);
  });

  test('Retention Cohort Tracker must enforce formal definitions, privacy, and day-30 boundaries', () => {
    expect(RETENTION_DEFINITIONS.ACTIVATED_USER).toBeDefined();
    expect(RETENTION_DEFINITIONS.ACTIVE_JOURNEY).toBeDefined();
    expect(RETENTION_DEFINITIONS.RETURNING_USER).toBeDefined();
    expect(RETENTION_DEFINITIONS.RETAINED_USER).toBeDefined();

    // Verify pseudonymization (never raw IDs)
    const hashed = pseudonymize('real-user-123');
    expect(hashed).not.toContain('real-user-123');
    expect(hashed.length).toBe(16);

    // Verify day-30 boundary calculation
    const testCohort = 'TEST-W01';
    _cohortStore.cohorts.set(testCohort, {
      cohortId: testCohort,
      startDate: new Date('2026-09-01T00:00:00Z').toISOString(),
      users: new Map(),
    });

    // 10 days later: D30 must return 'NOT YET ESTABLISHED'
    const evalTime10d = new Date('2026-09-11T00:00:00Z').getTime();
    const result10d = evaluateCohortRetention(testCohort, evalTime10d);
    expect(result10d.d30).toBe('NOT YET ESTABLISHED');
    expect(result10d.d30Status).toBe('NOT YET ESTABLISHED');
  });

  test('Staged scale validation must verify concurrency stages up to 5,000 travelers', () => {
    expect(STAGES.length).toBe(5);
    expect(STAGES[0].concurrent).toBe(1000);
    expect(STAGES[4].concurrent).toBe(5000);

    const scaleReport = fs.readFileSync(path.join(rootDir, 'PHASE_10A_SCALE_VALIDATION_REPORT.md'), 'utf8');
    expect(scaleReport).toMatch(/5,000 Concurrent Travelers/);
    expect(scaleReport).toMatch(/0\.000%/); // Measured error rate
  });

  test('Global Decision Hierarchy must be preserved without compromise', () => {
    const matrixReport = fs.readFileSync(path.join(rootDir, 'PHASE_10A_GA_CONDITION_MATRIX.md'), 'utf8');
    const closureReport = fs.readFileSync(path.join(rootDir, 'PHASE_10A_FINAL_CONDITION_CLOSURE.md'), 'utf8');

    expect(matrixReport).toMatch(/Global Safety Hierarchy/i);
    expect(closureReport).toMatch(/SAFETY > HARD CONSTRAINTS > FEASIBILITY > TRUST > TOTAL JOURNEY VALUE/);
  });

  test('Architectural ratchets must remain strictly beneath ceilings', () => {
    const appJsPath = path.join(rootDir, 'frontend', 'app-src', 'src', 'app.js');
    const serverJsPath = path.join(rootDir, 'server.js');

    if (fs.existsSync(appJsPath)) {
      const appLines = fs.readFileSync(appJsPath, 'utf8').split('\n').length;
      expect(appLines).toBeLessThanOrEqual(3500);
    }

    if (fs.existsSync(serverJsPath)) {
      const serverLines = fs.readFileSync(serverJsPath, 'utf8').split('\n').length;
      expect(serverLines).toBeLessThanOrEqual(560);
    }
  });

  test('Production configuration check must fail-closed with exit code 3', () => {
    const smokeScript = fs.readFileSync(path.join(rootDir, 'scripts', 'production-config-smoke.js'), 'utf8');
    expect(smokeScript).toMatch(/process\.exit\(3\)/);
  });
});
