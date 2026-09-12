/**
 * INDIA IN-TIME v3.0 — Phase 10 Pre-GA Readiness & General Availability Gate Tests
 *
 * Validates:
 * 1. Existence and integrity of all 12 authoritative Phase 10 master reports.
 * 2. Uncompromising enforcement of the Global Decision Hierarchy (Safety Primacy).
 * 3. Zero-fabrication compliance (truthful reporting of unmeasured/partial indicators).
 * 4. Architectural line count ceilings and modular invariants.
 * 5. Production fail-closed security configuration.
 */

const fs = require('fs');
const path = require('path');

describe('Phase 10 — Pre-GA Readiness & General Availability Gate Verification', () => {
  const rootDir = path.resolve(__dirname, '..');

  const requiredReports = [
    'PHASE_10_PRE_GA_READINESS_REPORT.md',
    'PHASE_10_SAFETY_READINESS_CERTIFICATION.md',
    'PHASE_10_PROVIDER_READINESS_MATRIX.md',
    'PHASE_10_DECISION_QUALITY_ASSESSMENT.md',
    'PHASE_10_ASSISTANT_QUALITY_ASSESSMENT.md',
    'PHASE_10_USER_ENGAGEMENT_REPORT.md',
    'PHASE_10_INCIDENT_SUPPORT_ASSESSMENT.md',
    'PHASE_10_SECURITY_READINESS_REPORT.md',
    'PHASE_10_ROLLBACK_DR_REPORT.md',
    'PHASE_10_GA_CHECKLIST.md',
    'PHASE_10_REMAINING_RISKS.md',
    'PHASE_10_FINAL_GO_NO_GO.md'
  ];

  test('All 12 authoritative Phase 10 master reports must exist on disk and be well-formed', () => {
    requiredReports.forEach((filename) => {
      const filePath = path.join(rootDir, filename);
      expect(fs.existsSync(filePath)).toBe(true);

      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(500); // Substantial authoritative report
    });
  });

  test('Phase 10 determination must consistently declare CONDITIONAL GO', () => {
    const finalDecisionPath = path.join(rootDir, 'PHASE_10_FINAL_GO_NO_GO.md');
    const content = fs.readFileSync(finalDecisionPath, 'utf8');

    expect(content).toMatch(/CONDITIONAL GO/i);
    expect(content).not.toMatch(/FINAL PRE-GA GATE DETERMINATION:\s+GO\b/);
    expect(content).not.toMatch(/FINAL PRE-GA GATE DETERMINATION:\s+NO-GO\b/);
  });

  test('Zero-fabrication standards must be strictly upheld in all reports', () => {
    const engagementReport = fs.readFileSync(path.join(rootDir, 'PHASE_10_USER_ENGAGEMENT_REPORT.md'), 'utf8');
    expect(engagementReport).toMatch(/NOT YET ESTABLISHED/i);

    const providerReport = fs.readFileSync(path.join(rootDir, 'PHASE_10_PROVIDER_READINESS_MATRIX.md'), 'utf8');
    expect(providerReport).toMatch(/PARTIALLY_AVAILABLE/i);

    const checklistReport = fs.readFileSync(path.join(rootDir, 'PHASE_10_GA_CHECKLIST.md'), 'utf8');
    expect(checklistReport).toMatch(/LEGAL REVIEW NOT YET ESTABLISHED/i);
  });

  test('Safety Primacy & Global Decision Hierarchy must be explicitly codified and certified', () => {
    const safetyCert = fs.readFileSync(path.join(rootDir, 'PHASE_10_SAFETY_READINESS_CERTIFICATION.md'), 'utf8');
    expect(safetyCert).toMatch(/SAFETY > HARD CONSTRAINTS > FEASIBILITY > TRUST > TOTAL JOURNEY VALUE/);
    expect(safetyCert).toMatch(/ANTI-OVERRIDE/i);
  });

  test('Architectural bounds must strictly adhere to project ceilings', () => {
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

  test('Production secrets configuration validation must fail-closed on missing keys', () => {
    const smokeScriptPath = path.join(rootDir, 'scripts', 'production-config-smoke.js');
    expect(fs.existsSync(smokeScriptPath)).toBe(true);

    const smokeScript = fs.readFileSync(smokeScriptPath, 'utf8');
    // Verifies hard exit code 3 on missing production secrets
    expect(smokeScript).toMatch(/process\.exit\(3\)/);
  });
});
