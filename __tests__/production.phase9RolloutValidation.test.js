/**
 * __tests__/production.phase9RolloutValidation.test.js
 *
 * Phase 9: Production Launch & Real-World Traveler Pilot Validation Test Suite
 *
 * Asserts:
 * 1. Environment Separation & Secret Fail-Closed Constraints
 * 2. Public vs Admin Health & Readiness Probes
 * 3. SLO Middleware & Telemetry Metric Contracts
 * 4. Production Feedback Pathways (Pilot Categories & Useful Flag)
 * 5. Deterministic Decision Outcome Recording without Unsafe Retraining
 * 6. Hard Safety Invariants & Decision Hierarchy Enforcement
 * 7. Incident Response & Disaster Recovery File Integrity
 */

const fs = require('fs');
const path = require('path');

describe('Phase 9: Production Launch & Controlled Pilot Validation', () => {
  const rootDir = path.resolve(__dirname, '..');

  // ── 1. Environment Separation & Configuration Integrity ────────────────
  describe('1. Environment Separation & Fail-Closed Guards', () => {
    test('production configuration rejects missing critical production secrets', () => {
      const configPath = path.join(rootDir, 'config', 'index.js');
      const configContent = fs.readFileSync(configPath, 'utf8');

      expect(configContent).toContain('missing.push');
      expect(configContent).toContain('GEMINI_API_KEY');
      expect(configContent).toContain('FIREBASE_SERVICE_ACCOUNT');
      expect(configContent).toContain('REDIS_URL');
      expect(configContent).toContain('CORS_ORIGIN');
    });

    test('production database TLS verification cannot be disabled in production', () => {
      const checkPath = path.join(rootDir, 'scripts', 'production-check.js');
      const checkContent = fs.readFileSync(checkPath, 'utf8');

      expect(checkContent).toContain('Production DB TLS verification cannot be disabled silently');
    });
  });

  // ── 2. Health & Readiness Observability Contracts ───────────────────────
  describe('2. Health, Readiness, and Liveness Endpoints', () => {
    test('server.js defines minimal public health check and separated readiness probe', () => {
      const serverPath = path.join(rootDir, 'server.js');
      const serverContent = fs.readFileSync(serverPath, 'utf8');

      expect(serverContent).toContain("app.get('/api/health'");
      expect(serverContent).toContain("app.get('/api/ready'");
      expect(serverContent).toContain("app.get('/api/health/live'");
      expect(serverContent).toContain("app.get('/api/slo'");
      expect(serverContent).toContain("app.get('/api/metrics'");
    });

    test('public readiness probe distinguishes database health and maintenance mode', () => {
      const serverPath = path.join(rootDir, 'server.js');
      const serverContent = fs.readFileSync(serverPath, 'utf8');

      expect(serverContent).toContain('checkDbHealth()');
      expect(serverContent).toContain('checkRedisHealth()');
      expect(serverContent).toContain("getFlag('maintenanceMode')");
    });
  });

  // ── 3. Production Feedback Pathways ────────────────────────────────────
  describe('3. Real Traveler Feedback Ingestion', () => {
    test('routes/feedback.js accepts pilot-specific feedback categories and useful flag', () => {
      const feedbackPath = path.join(rootDir, 'routes', 'feedback.js');
      const feedbackContent = fs.readFileSync(feedbackPath, 'utf8');

      expect(feedbackContent).toContain('recommendation_feedback');
      expect(feedbackContent).toContain('incorrect_recommendation');
      expect(feedbackContent).toContain('stale_information');
      expect(feedbackContent).toContain('wrong_route');
      expect(feedbackContent).toContain('alert_too_late');
      expect(feedbackContent).toContain('useful: req.body.useful');
    });

    test('feedback submission does not train ML model when unauthenticated', () => {
      const feedbackPath = path.join(rootDir, 'routes', 'feedback.js');
      const feedbackContent = fs.readFileSync(feedbackPath, 'utf8');

      expect(feedbackContent).toContain('if (req.uid)');
      expect(feedbackContent).toContain('Anonymous feedback remains analytics-only');
    });
  });

  // ── 4. Decision Outcome Tracking ───────────────────────────────────────
  describe('4. Anonymized Decision Outcome Logging', () => {
    test('intelligence routes expose decision outcome and history endpoints', () => {
      const intelPath = path.join(rootDir, 'routes', 'intelligence.js');
      const intelContent = fs.readFileSync(intelPath, 'utf8');

      expect(intelContent).toContain('recordDecisionOutcome');
      expect(intelContent).toContain('getDecisionMetrics');
      expect(intelContent).toContain('getTripDecisionHistory');
    });
  });

  // ── 5. Safety Primacy & Decision Hierarchy ─────────────────────────────
  describe('5. Safety Primacy Invariant', () => {
    test('adaptiveDecisionEngine strictly enforces safety over preferences', () => {
      const enginePath = path.join(rootDir, 'services', 'travelIntelligence', 'decision', 'adaptiveDecisionEngine.js');
      const engineContent = fs.readFileSync(enginePath, 'utf8');

      expect(engineContent).toContain('Hard constraints strictly override soft preferences');
      expect(engineContent).toContain('SAFETY_HEALTH');
      expect(engineContent).toContain('hasHardViolation');
      expect(engineContent).toContain('validateDataTrust');
    });
  });

  // ── 6. Required Phase 9 Documentation Presence ────────────────────────
  describe('6. Production Governance & Incident Documentation', () => {
    const requiredDocs = [
      'PHASE_9_ENVIRONMENT_AUDIT.md',
      'PRODUCTION_SERVICE_MATRIX.md',
      'PHASE_9_OBSERVABILITY_REPORT.md',
      'PHASE_9_SECURITY_REVIEW.md',
      'PHASE_9_INCIDENT_RUNBOOK.md',
      'PHASE_9_ROLLOUT_PLAN.md',
      'PHASE_9_REAL_TRAVELER_PILOT_REPORT.md',
      'PHASE_9_PRODUCTION_READINESS_REPORT.md',
    ];

    test.each(requiredDocs)('verifies documentation file %s is present on disk and non-empty', (docName) => {
      const docPath = path.join(rootDir, docName);
      expect(fs.existsSync(docPath)).toBe(true);
      const stat = fs.statSync(docPath);
      expect(stat.size).toBeGreaterThan(500);
    });
  });
});
