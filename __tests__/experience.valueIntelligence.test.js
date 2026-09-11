'use strict';

/**
 * __tests__/experience.valueIntelligence.test.js
 *
 * India In-Time v3.0 Phase 4 — Experience Value Intelligence Test Suite.
 * Validates contextual experience value optimization, usable time budgeting,
 * temporal windows, opportunity costs, safety hierarchy, anti-churn, and outcome learning.
 */

const express = require('express');
const request = require('supertest');

const {
  computeTimeBudget,
  evaluatePlaceExperienceWindow,
  generateCandidates,
  evaluateOpportunityCost,
  evaluateExperienceValue,
  generateExperienceExplanation,
  recordExperienceOutcome,
  computeExperienceAccuracyMetrics,
  ACTION_TYPES,
} = require('../services/travelIntelligence/experience');

const {
  createJourneyState,
  advanceJourneyProgress,
  STOP_STATUSES,
} = require('../services/travelIntelligence/journey/journeyStateEngine');

const intelligenceRouter = require('../routes/intelligence');

// Mock express app for API testing
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/intelligence', intelligenceRouter);
  return app;
}

describe('Phase 4: Experience Value Intelligence', () => {
  let sampleJourneyState;
  let testApp;

  beforeEach(() => {
    testApp = createTestApp();

    sampleJourneyState = createJourneyState({
      tripId: 'trip_vizag_phase4',
      travelerId: 'traveler_001',
      startTimeMinutes: 540, // 09:00 AM
      plan: {
        stops: [
          { id: 'rk_beach', name: 'Ramakrishna Beach', cat: 'beach', lat: 17.7142, lon: 83.3237, visitMinutes: 60, status: STOP_STATUSES.COMPLETED },
          { id: 'kursura_sub', name: 'INS Kursura Submarine Museum', cat: 'museum', lat: 17.7172, lon: 83.3301, visitMinutes: 60, status: STOP_STATUSES.ACTIVE },
          { id: 'kailasagiri', name: 'Kailasagiri Hilltop', cat: 'scenic', lat: 17.7492, lon: 83.3418, visitMinutes: 75, status: STOP_STATUSES.PLANNED, ct: '20:00' },
          { id: 'rushikonda', name: 'Rushikonda Beach', cat: 'beach', lat: 17.7825, lon: 83.3851, visitMinutes: 90, status: STOP_STATUSES.PLANNED, ct: '21:00', is_sunset_spot: true },
        ],
      },
      initialLocation: { lat: 17.7172, lon: 83.3301 },
    });
  });

  // ── 1. USABLE TIME BUDGETING ───────────────────────────────────────────────
  describe('1. Usable Time Budgeting', () => {
    test('computes surplus time budget when day remaining exceeds commitments', () => {
      const budget = computeTimeBudget({
        journeyState: sampleJourneyState,
        currentMinute: 660, // 11:00 AM
        dayEndMinute: 1320, // 22:00 (11 hours remaining = 660m)
        travelerDna: { pacePreference: 'balanced' },
      });

      expect(budget.grossRemainingMinutes).toBe(660);
      expect(budget.committedVisitMinutes).toBeGreaterThan(0);
      expect(budget.usableExperienceMinutes).toBeGreaterThan(60);
      expect(budget.budgetClassification).toBe('SURPLUS');
      expect(budget.isTimeBankrupt).toBe(false);
    });

    test('computes deficit / time bankruptcy when stops exceed remaining time', () => {
      const budget = computeTimeBudget({
        journeyState: sampleJourneyState,
        currentMinute: 1200, // 20:00 (only 120m until 22:00)
        dayEndMinute: 1320,
        travelerDna: { pacePreference: 'balanced' },
      });

      // Kailasagiri (75m) + Rushikonda (90m) + transits (~40m) + buffer (~30m) = ~235m > 120m
      expect(budget.budgetClassification).toBe('DEFICIT');
      expect(budget.isTimeBankrupt).toBe(true);
      expect(budget.feasibilityStatus).toBe('OVER_BUDGET');
    });

    test('adjusts safety & fatigue buffer according to pace preference', () => {
      const relaxedBudget = computeTimeBudget({
        journeyState: sampleJourneyState,
        currentMinute: 600,
        travelerDna: { pacePreference: 'relaxed' },
      });

      const packedBudget = computeTimeBudget({
        journeyState: sampleJourneyState,
        currentMinute: 600,
        travelerDna: { pacePreference: 'packed' },
      });

      expect(relaxedBudget.bufferMinutes).toBeGreaterThan(packedBudget.bufferMinutes);
    });

    test('preserves completed stops immutability — completed visits do not consume future time', () => {
      const budgetBefore = computeTimeBudget({
        journeyState: sampleJourneyState,
        currentMinute: 600,
      });

      // Complete kursura
      const advanced = advanceJourneyProgress(sampleJourneyState, {
        stopId: 'kursura_sub',
        action: 'COMPLETE',
        currentMinute: 660,
        actualVisitMinutes: 60,
      });

      const budgetAfter = computeTimeBudget({
        journeyState: advanced,
        currentMinute: 660,
      });

      // Both completed stops are now excluded from future commitments
      expect(budgetAfter.upcomingStopsCount).toBe(1); // only rushikonda planned (kailasagiri became active)
      expect(budgetAfter.committedVisitMinutes).toBeLessThan(budgetBefore.committedVisitMinutes);
    });
  });

  // ── 2. GROUNDED CANDIDATE GENERATION ───────────────────────────────────────
  describe('2. Grounded Candidate Generation', () => {
    test('sources candidates from planned stops, regional havens, and city seeds with transparent provenance', () => {
      const candidates = generateCandidates({
        journeyState: sampleJourneyState,
        cityName: 'visakhapatnam',
        maxRadiusKm: 50,
      });

      expect(candidates.length).toBeGreaterThan(0);
      const provenances = new Set(candidates.map(c => c.provenance));
      expect(provenances.has('PLANNED_STOP')).toBe(true);
      expect(provenances.has('CITY_SEED')).toBe(true);

      // Verify every candidate has valid coordinates and id
      for (const cand of candidates) {
        expect(Number.isFinite(cand.lat)).toBe(true);
        expect(Number.isFinite(cand.lon)).toBe(true);
        expect(cand.id).toBeTruthy();
        expect(cand.name).toBeTruthy();
      }
    });

    test('never recommends already completed stops', () => {
      const candidates = generateCandidates({
        journeyState: sampleJourneyState,
        cityName: 'visakhapatnam',
      });

      // rk_beach is marked COMPLETED in sampleJourneyState
      const rkBeachCand = candidates.find(c => c.id === 'rk_beach');
      expect(rkBeachCand).toBeUndefined();
    });

    test('prunes candidates under active CRITICAL safety hazards', () => {
      const activeHazards = [
        {
          id: 'hazard_kailasagiri_landslide',
          targetPlaceId: 'kailasagiri',
          status: 'ACTIVE',
          severity: 'CRITICAL',
        },
      ];

      const safeCandidates = generateCandidates({
        journeyState: sampleJourneyState,
        cityName: 'visakhapatnam',
        activeHazards,
      });

      const kailasagiriCand = safeCandidates.find(c => c.id === 'kailasagiri');
      expect(kailasagiriCand).toBeUndefined();
    });
  });

  // ── 3. TEMPORAL EXPERIENCE WINDOWS ─────────────────────────────────────────
  describe('3. Temporal Experience Windows', () => {
    test('evaluates open operational hours and detects closing risks', () => {
      const candidate = {
        id: 'museum_test',
        name: 'Test Museum',
        cat: 'museum',
        ot: '10:00',
        ct: '17:00',
        visitMinutes: 60,
      };

      // At 16:30, only 30m remain until 17:00 close (visit needs 60m)
      const windowEval = evaluatePlaceExperienceWindow(candidate, {
        currentMinute: 990, // 16:30
      });

      expect(windowEval.isWithinOpeningHours).toBe(false);
      expect(windowEval.windowViability).toBe('CLOSED');
      expect(windowEval.reasons.some(r => /insufficient time/i.test(r))).toBe(true);
    });

    test('rewards golden hour and sunset alignment for scenic spots', () => {
      const scenicSpot = {
        id: 'sunset_ridge',
        name: 'Sunset Ridge Point',
        cat: 'scenic',
        is_sunset_spot: true,
        visitMinutes: 45,
      };

      // 17:30 IST is during evening golden hour (approx 17:15 - 18:30)
      const windowEval = evaluatePlaceExperienceWindow(scenicSpot, {
        currentMinute: 1050, // 17:30
      });

      expect(windowEval.isGoldenHour).toBe(true);
      expect(windowEval.temporalScore).toBeGreaterThanOrEqual(70);
      expect(windowEval.reasons.some(r => /golden|sunset/i.test(r))).toBe(true);
    });

    test('truthfully preserves unknown opening hours without hallucination', () => {
      const openPlace = {
        id: 'hidden_cove',
        name: 'Hidden Cove',
        cat: 'beach',
      };

      const windowEval = evaluatePlaceExperienceWindow(openPlace, {
        currentMinute: 720,
      });

      expect(windowEval.openingDetails.hoursUnknown).toBe(true);
      expect(windowEval.openingDetails.status).toBe('UNKNOWN');
      expect(windowEval.openingDetails.closeTime).toBeNull();
    });

    test('boosts indoor havens and penalizes outdoor spots during rainfall', () => {
      const outdoorPlace = { id: 'park', name: 'Open Park', cat: 'scenic', indoorOutdoor: 'outdoor' };
      const indoorPlace = { id: 'gallery', name: 'Art Gallery', cat: 'museum', indoorOutdoor: 'indoor' };

      const rainWeather = { isRaining: true, rainfallMmPerHour: 8.5 };

      const outdoorEval = evaluatePlaceExperienceWindow(outdoorPlace, {
        currentMinute: 720,
        weather: rainWeather,
      });

      const indoorEval = evaluatePlaceExperienceWindow(indoorPlace, {
        currentMinute: 720,
        weather: rainWeather,
      });

      expect(indoorEval.temporalScore).toBeGreaterThan(outdoorEval.temporalScore);
    });
  });

  // ── 4. OPPORTUNITY COST & DOWNSIDE EVALUATION ──────────────────────────────
  describe('4. Opportunity Cost Engine', () => {
    test('detects when an action would force a planned stop past its closing time', () => {
      const longCandidate = {
        id: 'faraway_trek',
        name: 'Distant Forest Trek',
        lat: 18.25,
        lon: 83.10, // ~60 km away
        visitMinutes: 180, // 3 hours
      };

      const oppCost = evaluateOpportunityCost({
        candidate: longCandidate,
        journeyState: sampleJourneyState,
        currentMinute: 960, // 16:00 IST
        dayEndMinute: 1200, // 20:00
      });

      expect(oppCost.sacrificedStops.length).toBeGreaterThan(0);
      expect(oppCost.opportunityCostLevel).toMatch(/HIGH|PROHIBITIVE/);
      expect(oppCost.penaltyScore).toBeGreaterThan(20);
      expect(oppCost.tradeoffSummary).toContain('sacrificing');
    });

    test('reports zero opportunity cost when ample time bank exists for nearby candidate', () => {
      const quickNearCandidate = {
        id: 'quick_cafe',
        name: 'Adjacent Promenade Cafe',
        lat: 17.7180,
        lon: 83.3310,
        visitMinutes: 20,
      };

      const oppCost = evaluateOpportunityCost({
        candidate: quickNearCandidate,
        journeyState: sampleJourneyState,
        dayEndMinute: 1380, // 23:00
      });

      expect(oppCost.sacrificedStops.length).toBe(0);
      expect(oppCost.opportunityCostLevel).toBe('NONE');
      expect(oppCost.penaltyScore).toBe(0);
    });
  });

  // ── 5. COMPOSITE EXPERIENCE VALUE OPTIMIZATION ─────────────────────────────
  describe('5. Experience Value Engine & Hierarchy', () => {
    test('ranks candidates by composite score and provides action types', () => {
      const evalResult = evaluateExperienceValue({
        journeyState: sampleJourneyState,
        travelerDna: { photography: 90, nature: 85, pacePreference: 'balanced' },
        currentMinute: 1020, // 17:00
        cityName: 'visakhapatnam',
      });

      expect(evalResult.recommendations.length).toBeGreaterThan(0);
      expect(evalResult.primaryRecommendation).toBeTruthy();
      expect(evalResult.primaryRecommendation.compositeScore).toBeGreaterThan(0);
      expect(Object.values(ACTION_TYPES)).toContain(evalResult.primaryRecommendation.actionType);

      // Verify scores are in strictly descending order
      for (let i = 1; i < evalResult.recommendations.length; i++) {
        expect(evalResult.recommendations[i - 1].compositeScore)
          .toBeGreaterThanOrEqual(evalResult.recommendations[i].compositeScore);
      }
    });

    test('enforces SAFETY hierarchy: drops outdoor stops when safety decision is EMERGENCY or AVOID', () => {
      const evalResult = evaluateExperienceValue({
        journeyState: sampleJourneyState,
        safetyDecision: { decision: 'EMERGENCY', confidence: 'HIGH' },
        currentMinute: 720,
        cityName: 'visakhapatnam',
      });

      // Outdoor spots like beaches must be eliminated under EMERGENCY
      for (const rec of evalResult.recommendations) {
        expect(rec.candidate.indoorOutdoor).toBe('indoor');
      }
    });

    test('anti-churn mechanism prevents recommendation jitter when score delta < 5', () => {
      const initialEval = evaluateExperienceValue({
        journeyState: sampleJourneyState,
        currentMinute: 600,
        cityName: 'visakhapatnam',
      });

      const top1 = initialEval.primaryRecommendation;

      // Re-run with negligible minute change
      const reEval = evaluateExperienceValue({
        journeyState: sampleJourneyState,
        currentMinute: 602,
        cityName: 'visakhapatnam',
        previousRecommendations: initialEval.recommendations,
      });

      expect(reEval.primaryRecommendation.candidate.id).toBe(top1.candidate.id);
    });

    test('computes divergence analysis comparing recommended sequence against original planned stops', () => {
      const evalResult = evaluateExperienceValue({
        journeyState: sampleJourneyState,
        currentMinute: 600,
        cityName: 'visakhapatnam',
      });

      expect(evalResult.divergenceAnalysis).toBeTruthy();
      expect(evalResult.divergenceAnalysis.originalUpcomingCount).toBe(2);
      expect(Array.isArray(evalResult.divergenceAnalysis.preservedPlannedStops)).toBe(true);
    });
  });

  // ── 6. EXPLANATION ENGINE ──────────────────────────────────────────────────
  describe('6. Grounded Explanation Engine', () => {
    test('generates transparent, audit-friendly explanations with dimension breakdown', () => {
      const evalResult = evaluateExperienceValue({
        journeyState: sampleJourneyState,
        currentMinute: 1050, // 17:30
        cityName: 'visakhapatnam',
      });

      const topRec = evalResult.primaryRecommendation;
      const explanation = generateExperienceExplanation(topRec, {
        timeBudget: evalResult.timeBudget,
      });

      expect(explanation.headline).toBeTruthy();
      expect(explanation.primaryDriver).toBeTruthy();
      expect(explanation.factors.length).toBeGreaterThanOrEqual(3);
      expect(explanation.auditTrail).toBeTruthy();
      expect(explanation.confidence).toBeGreaterThanOrEqual(30);
      expect(explanation.confidence).toBeLessThanOrEqual(95);
    });
  });

  // ── 7. OUTCOME TRACKING & BEHAVIORAL LEARNING ──────────────────────────────
  describe('7. Outcome Tracking & Behavioral Learning', () => {
    test('records accepted experience and updates inferred DNA without mutating explicit preferences', () => {
      const initialDna = {
        nature: 50,
        photography: 60,
        culture: 70,
        sources: {
          nature: 'inferred',
          culture: 'explicit', // USER DECLARED - MUST REMAIN UNMUTATED
        },
      };

      const result = recordExperienceOutcome({
        tripId: 'trip_001',
        placeId: 'yarada_beach',
        placeCategory: 'beach',
        actionTaken: 'ACCEPTED',
        actualDwellMinutes: 75,
        predictedDwellMinutes: 60,
        travelerRating: 5,
        travelerDna: initialDna,
      });

      expect(result.success).toBe(true);
      expect(result.updatedTravelerDna.nature).toBeGreaterThan(50); // Inferred preference increased
      expect(result.updatedTravelerDna.culture).toBe(70); // Explicit preference preserved exactly
      expect(result.updatedTravelerDna.sources.culture).toBe('explicit');
    });

    test('computes accuracy and satisfaction metrics over trip outcome history', () => {
      const tripId = `trip_metrics_${Date.now()}`;

      recordExperienceOutcome({
        tripId,
        placeId: 'stop_1',
        actionTaken: 'ACCEPTED',
        actualDwellMinutes: 50,
        predictedDwellMinutes: 45,
        travelerRating: 5,
      });

      recordExperienceOutcome({
        tripId,
        placeId: 'stop_2',
        actionTaken: 'ACCEPTED',
        actualDwellMinutes: 40,
        predictedDwellMinutes: 45,
        travelerRating: 4,
      });

      recordExperienceOutcome({
        tripId,
        placeId: 'stop_3',
        actionTaken: 'REJECTED',
      });

      const metrics = computeExperienceAccuracyMetrics(tripId);
      expect(metrics.totalOutcomes).toBe(3);
      expect(metrics.acceptedCount).toBe(2);
      expect(metrics.acceptanceRate).toBe(67);
      expect(metrics.averageRating).toBe(4.5);
      expect(metrics.dwellTimeAccuracyPercentage).toBeGreaterThan(80);
    });
  });

  // ── 8. END-TO-END REST API VERIFICATION ────────────────────────────────────
  describe('8. End-to-End REST API Endpoints', () => {
    test('POST /api/intelligence/experience/evaluate returns recommendations', async () => {
      const res = await request(testApp)
        .post('/api/intelligence/experience/evaluate')
        .send({
          tripId: 'trip_api_test',
          stops: [
            { id: 'rk_beach', name: 'Ramakrishna Beach', lat: 17.7142, lon: 83.3237, visitMinutes: 60 },
            { id: 'kailasagiri', name: 'Kailasagiri', lat: 17.7492, lon: 83.3418, visitMinutes: 60 },
          ],
          cityName: 'visakhapatnam',
          currentMinute: 600,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.evaluation.recommendations.length).toBeGreaterThan(0);
      expect(res.body.evaluation.timeBudget).toBeTruthy();
    });

    test('GET /api/intelligence/experience/recommendations retrieves active recommendations', async () => {
      const res = await request(testApp)
        .get('/api/intelligence/experience/recommendations?tripId=trip_api_test');

      expect(res.status).toBe(200);
      expect(res.body.tripId).toBe('trip_api_test');
      expect(Array.isArray(res.body.recommendations)).toBe(true);
    });

    test('POST /api/intelligence/experience/decide logs traveler decision', async () => {
      const res = await request(testApp)
        .post('/api/intelligence/experience/decide')
        .send({
          tripId: 'trip_api_test',
          placeId: 'rk_beach',
          placeCategory: 'beach',
          actionTaken: 'ACCEPTED',
          actualDwellMinutes: 65,
          travelerRating: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome.actionTaken).toBe('ACCEPTED');
    });

    test('GET /api/intelligence/experience/opportunity-cost evaluates candidate tradeoff', async () => {
      const res = await request(testApp)
        .get('/api/intelligence/experience/opportunity-cost')
        .query({
          tripId: 'trip_api_test',
          placeId: 'rushikonda',
          lat: 17.7825,
          lon: 83.3851,
          visitMinutes: 60,
        });

      expect(res.status).toBe(200);
      expect(res.body.opportunityCost).toBeTruthy();
      expect(res.body.opportunityCost.opportunityCostLevel).toBeTruthy();
    });

    test('GET /api/intelligence/experience/windows evaluates temporal window', async () => {
      const res = await request(testApp)
        .get('/api/intelligence/experience/windows')
        .query({
          placeId: 'simhachalam',
          lat: 17.7666,
          lon: 83.2501,
          ot: '06:00',
          ct: '20:30',
          visitMinutes: 75,
        });

      expect(res.status).toBe(200);
      expect(res.body.temporalScore).toBeGreaterThanOrEqual(0);
      expect(res.body.windowViability).toBeTruthy();
    });

    test('POST /api/intelligence/experience/feedback logs post-visit feedback', async () => {
      const res = await request(testApp)
        .post('/api/intelligence/experience/feedback')
        .send({
          tripId: 'trip_api_test',
          placeId: 'simhachalam',
          placeCategory: 'culture',
          travelerRating: 5,
          actualDwellMinutes: 80,
          feedbackText: 'Peaceful temple visit with great architecture.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome.travelerRating).toBe(5);
    });

    test('GET /api/intelligence/experience/outcomes returns outcome history and accuracy metrics', async () => {
      const res = await request(testApp)
        .get('/api/intelligence/experience/outcomes?tripId=trip_api_test');

      expect(res.status).toBe(200);
      expect(res.body.outcomesCount).toBeGreaterThan(0);
      expect(res.body.metrics).toBeTruthy();
    });
  });
});
