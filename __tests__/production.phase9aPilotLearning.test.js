/**
 * __tests__/production.phase9aPilotLearning.test.js
 *
 * Phase 9A: Controlled Pilot Expansion & Production Learning Validation Suite
 *
 * Asserts:
 * 1. Section 7: Structured Decision Outcome Model Schema & Ingestion
 * 2. Section 8: 10 Separate Decision Quality Metrics Calculation
 * 3. Section 12: Multi-Stage Alert Timeliness Latency Tracking
 * 4. Section 14: Longitudinal Source Disagreement Preservation
 * 5. Section 4 & 23: Pilot Cohort Governance & Partitioning (Stages A-D)
 * 6. Section 9 & 33: Non-Negotiable Safety Primacy & Anti-Drift Invariant
 * 7. Section 38: Required Phase 9A Documentation Presence on Disk
 */

const fs = require('fs');
const path = require('path');
const productionLearningEngine = require('../services/travelIntelligence/decision/productionLearningEngine');
const {
  recordDecisionOutcome,
  getDecisionQualityMetrics,
  recordAlertTimeliness,
  recordSourceDisagreement,
  assertNoAutomaticDrift,
  resetLearningMetrics,
  COHORT_STAGES,
} = productionLearningEngine;

describe('Phase 9A: Controlled Pilot Expansion & Production Learning', () => {
  const rootDir = path.resolve(__dirname, '..');

  beforeEach(() => {
    resetLearningMetrics();
  });

  // ── 1. Structured Decision Outcome Model (Section 7) ─────────────────────
  describe('1. Section 7: Structured Decision Outcome Model', () => {
    test('records complete Section 7 schema with privacy-safe identifiers', () => {
      const outcomePayload = {
        decisionId: 'dec_test_9a_001',
        tripId: 'trip_blr_goa_0912',
        legId: 'leg_chorla_ghat',
        cohortId: COHORT_STAGES.STAGE_B,
        decisionType: 'REROUTE',
        decisionState: 'REROUTE',
        recommendation: { bypassCorridor: 'Chorla Ghat', savedMinutes: 25 },
        travelerAction: 'ACCEPTED',
        outcome: 'SUCCESS',
        feedback: { useful: true, category: 'recommendation_feedback', notes: 'Bypass was clear and scenic' },
        dataState: 'LIVE',
        providerContext: { weather: 'IMD_MAUSAM', traffic: 'OSRM_REALTIME' },
        latencyMs: 38,
      };

      const result = recordDecisionOutcome(outcomePayload);
      expect(result.success).toBe(true);
      expect(result.record).toBeDefined();

      const r = result.record;
      expect(r.decisionId).toBe('dec_test_9a_001');
      expect(r.tripId).toBe('trip_blr_goa_0912');
      expect(r.legId).toBe('leg_chorla_ghat');
      expect(r.cohortId).toBe('STAGE_B');
      expect(r.decisionType).toBe('REROUTE');
      expect(r.decisionState).toBe('REROUTE');
      expect(r.travelerAction).toBe('ACCEPTED');
      expect(r.outcome).toBe('SUCCESS');
      expect(r.feedback.useful).toBe(true);
      expect(r.dataState).toBe('LIVE');
      expect(r.providerContext.weather).toBe('IMD_MAUSAM');
      expect(r.latencyMs).toBe(38);
    });

    test('rejects outcome record missing mandatory decisionId', () => {
      expect(() => {
        recordDecisionOutcome({ tripId: 'trip_123' });
      }).toThrow('decisionId is required');
    });
  });

  // ── 2. 10 Separate Decision Quality Metrics (Section 8) ───────────────────
  describe('2. Section 8: 10 Separate Decision Quality Metrics', () => {
    test('computes all 10 metrics independently without collapsing into one generic score', () => {
      // Decision 1: Accepted & Useful
      recordDecisionOutcome({
        decisionId: 'dec_001',
        travelerAction: 'ACCEPTED',
        outcome: 'SUCCESS',
        feedback: { useful: true },
        latencyMs: 40,
      });

      // Decision 2: Accepted & Useful
      recordDecisionOutcome({
        decisionId: 'dec_002',
        travelerAction: 'ACCEPTED',
        outcome: 'SUCCESS',
        feedback: { useful: true },
        latencyMs: 50,
      });

      // Decision 3: Rejected / Override & Not Useful
      recordDecisionOutcome({
        decisionId: 'dec_003',
        travelerAction: 'REJECTED',
        outcome: 'PARTIAL',
        isOverride: true,
        feedback: { useful: false },
        latencyMs: 60,
      });

      // Decision 4: Reversal
      recordDecisionOutcome({
        decisionId: 'dec_004',
        travelerAction: 'MODIFIED',
        outcome: 'REVERSED',
        isReversal: true,
        latencyMs: 70,
      });

      // Decision 5: False Positive (over-sensitive threshold)
      recordDecisionOutcome({
        decisionId: 'dec_005',
        travelerAction: 'ACCEPTED',
        isFalsePositive: true,
        falsePositiveCause: 'over_sensitive_threshold',
        latencyMs: 35,
      });

      // Decision 6: False Negative (provider unavailable)
      recordDecisionOutcome({
        decisionId: 'dec_006',
        travelerAction: 'IGNORED',
        isFalseNegative: true,
        falseNegativeCause: 'provider_unavailable',
        latencyMs: 45,
      });

      // Decision 7: Stale Information
      recordDecisionOutcome({
        decisionId: 'dec_007',
        dataState: 'STALE',
        travelerAction: 'ACCEPTED',
        latencyMs: 30,
      });

      // Decision 8: Safety Escalation
      recordDecisionOutcome({
        decisionId: 'dec_008',
        travelerAction: 'ACCEPTED',
        isSafetyEscalation: true,
        latencyMs: 55,
      });

      const m = getDecisionQualityMetrics();
      expect(m.sampleSize).toBe(8);

      // 1. Recommendation Acceptance Rate
      expect(m.recommendationAcceptanceRate.n).toBe(6); // 5 accepted + 1 rejected
      expect(m.recommendationAcceptanceRate.accepted).toBe(5);
      expect(m.recommendationAcceptanceRate.rejected).toBe(1);
      expect(m.recommendationAcceptanceRate.ratePercent).toBe(83.3);

      // 2. Recommendation Usefulness
      expect(m.recommendationUsefulness.n).toBe(3); // 2 useful + 1 not useful
      expect(m.recommendationUsefulness.useful).toBe(2);
      expect(m.recommendationUsefulness.usefulPercent).toBe(66.7);

      // 3. Traveler Override Rate
      expect(m.travelerOverrideRate.overrides).toBe(1);
      expect(m.travelerOverrideRate.ratePercent).toBe(12.5);

      // 4. Traveler Reversal Rate
      expect(m.travelerReversalRate.reversals).toBe(1);
      expect(m.travelerReversalRate.ratePercent).toBe(12.5);

      // 5. False Positive Rate
      expect(m.falsePositiveRate.count).toBe(1);
      expect(m.falsePositiveRate.causes.over_sensitive_threshold).toBe(1);

      // 6. False Negative Rate
      expect(m.falseNegativeRate.count).toBe(1);
      expect(m.falseNegativeRate.causes.provider_unavailable).toBe(1);

      // 7. Stale Information Rate
      expect(m.staleInformationRate.staleDecisions).toBe(1);
      expect(m.staleInformationRate.ratePercent).toBe(12.5);

      // 8. Decision Latency
      expect(m.decisionLatency.n).toBe(8);
      expect(m.decisionLatency.avgMs).toBeGreaterThan(30);

      // 9. Outcome Success Rate
      expect(m.outcomeSuccessRate.successes).toBeGreaterThanOrEqual(2);

      // 10. Safety Escalation Rate
      expect(m.safetyEscalationRate.escalations).toBe(1);
    });
  });

  // ── 3. Multi-Stage Alert Timeliness (Section 12) ──────────────────────────
  describe('3. Section 12: Alert Timeliness Tracking', () => {
    test('measures latency at every link of the detection-to-action chain', () => {
      const now = Date.now();
      const conditionObservedAt = new Date(now).toISOString();
      const systemDetectedAt = new Date(now + 120).toISOString(); // +120ms
      const decisionGeneratedAt = new Date(now + 165).toISOString(); // +45ms
      const notificationSentAt = new Date(now + 210).toISOString(); // +45ms
      const travelerSeenAt = new Date(now + 1400).toISOString(); // +1190ms
      const travelerActedAt = new Date(now + 2600).toISOString(); // +1200ms

      const latencies = recordAlertTimeliness({
        alertId: 'alt_ghat_rain_001',
        tripId: 'trip_1001',
        conditionObservedAt,
        systemDetectedAt,
        decisionGeneratedAt,
        notificationSentAt,
        travelerSeenAt,
        travelerActedAt,
      });

      expect(latencies.detectionLatencyMs).toBe(120);
      expect(latencies.generationLatencyMs).toBe(45);
      expect(latencies.deliveryLatencyMs).toBe(45);
      expect(latencies.viewLatencyMs).toBe(1190);
      expect(latencies.actionLatencyMs).toBe(1200);
      expect(latencies.totalPipelineLatencyMs).toBe(2600);
    });
  });

  // ── 4. Longitudinal Source Disagreement Logging (Section 14) ─────────────
  describe('4. Section 14: Source Disagreement Preservation', () => {
    test('preserves source disagreements without lossy averaging', () => {
      const record = recordSourceDisagreement({
        corridorId: 'corridor_nh66_amboli',
        officialSource: 'IMD_MAUSAM_CAP',
        commercialSource: 'OPEN_METEO_FORECAST',
        officialState: 'ORANGE_ALERT_HEAVY_RAIN',
        commercialState: 'LIGHT_SCATTERED_DRIZZLE',
        decisionMade: 'REROUTE_VIA_CHORLA',
        observedOutcome: 'SEVERE_WATERLOGGING_OBSERVED',
      });

      expect(record.disagreementId).toBeDefined();
      expect(record.corridorId).toBe('corridor_nh66_amboli');
      expect(record.officialState).toBe('ORANGE_ALERT_HEAVY_RAIN');
      expect(record.commercialState).toBe('LIGHT_SCATTERED_DRIZZLE');
      expect(record.decisionMade).toBe('REROUTE_VIA_CHORLA');
      expect(record.observedOutcome).toBe('SEVERE_WATERLOGGING_OBSERVED');
    });
  });

  // ── 5. Pilot Cohort Governance & Partitioning (Section 3, 4, 23) ──────────
  describe('5. Section 4 & 23: Pilot Cohort Governance', () => {
    test('partitions decisions and metrics across Stage A and Stage B cohorts', () => {
      recordDecisionOutcome({
        decisionId: 'dec_stage_a',
        cohortId: COHORT_STAGES.STAGE_A,
        travelerAction: 'ACCEPTED',
        feedback: { useful: true },
      });

      recordDecisionOutcome({
        decisionId: 'dec_stage_b',
        cohortId: COHORT_STAGES.STAGE_B,
        travelerAction: 'REJECTED',
        feedback: { useful: false },
      });

      const metrics = getDecisionQualityMetrics();
      const b = metrics.cohortBreakdowns;

      expect(b.STAGE_A.decisions).toBe(1);
      expect(b.STAGE_A.accepted).toBe(1);
      expect(b.STAGE_A.useful).toBe(1);

      expect(b.STAGE_B.decisions).toBe(1);
      expect(b.STAGE_B.accepted).toBe(0);
      expect(b.STAGE_B.useful).toBe(0);
    });
  });

  // ── 6. Safety Primacy & Anti-Drift Governance (Section 9 & 33) ────────────
  describe('6. Section 9 & 33: Safety Primacy & Anti-Drift Guard', () => {
    test('rejects automated modification of safety thresholds from user feedback', () => {
      expect(() => {
        assertNoAutomaticDrift({
          proposedThresholdModification: { RAIN_PROB_SEVERE_THRESHOLD: 40 },
          userFeedbackCount: 150,
        });
      }).toThrow(/Automatic drift rejected/);
    });

    test('permits read-only analytics inspection', () => {
      expect(assertNoAutomaticDrift({ userFeedbackCount: 150 })).toBe(true);
    });
  });

  // ── 7. Required Phase 9A Documentation Presence (Section 38 & 32) ────────
  describe('7. Section 38: Required Phase 9A Governance Reports', () => {
    const requiredReports = [
      'PHASE_9A_PILOT_EXPANSION_REPORT.md',
      'PHASE_9A_DECISION_QUALITY_REPORT.md',
      'PHASE_9A_SAFETY_QUALITY_REPORT.md',
      'PHASE_9A_PROVIDER_RELIABILITY_REPORT.md',
      'PHASE_9A_ASSISTANT_QUALITY_REPORT.md',
      'PHASE_9A_USER_FEEDBACK_REPORT.md',
      'PHASE_9A_INCIDENT_REVIEW.md',
      'PHASE_9A_ROLLOUT_STATUS.md',
      'PHASE_9A_PRODUCTION_LEARNING_REPORT.md',
      'PHASE_9A_WEEKLY_LEARNING_REPORT.md',
    ];

    test.each(requiredReports)('documentation file %s exists on disk and is non-empty', (docName) => {
      const docPath = path.join(rootDir, docName);
      expect(fs.existsSync(docPath)).toBe(true);
      const stat = fs.statSync(docPath);
      expect(stat.size).toBeGreaterThan(500);
    });
  });
});
