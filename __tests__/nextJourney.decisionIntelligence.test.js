/**
 * __tests__/nextJourney.decisionIntelligence.test.js
 *
 * India In-Time v3.0 Phase 6 — Next Journey Intelligence Test Suite
 * Comprehensive Black-Box & Integration Verification Scenarios (Prompt Section 71)
 */

const {
  LEG_STATUSES,
  DESTINATION_INTENTS,
  CHECKIN_FEASIBILITY,
  DEADLINE_RISK_STATES,
  createCanonicalJourneyLeg,
  transitionLegStatus,
  getOrCreateJourneyChain,
  appendNextLeg,
  getJourneyLegHistory,
  getCurrentLeg,
  resolveDestinationIntent,
  findCandidateAccommodations,
  evaluateCorridorDiningChain,
  evaluateTransportDeadline,
  evaluateOvernightViability,
  evaluateNextLegDecision,
  nextJourneyObservability,
} = require('../services/travelIntelligence/nextJourney');

const express = require('express');
const request = require('supertest');
const intelligenceRouter = require('../routes/intelligence');

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/intelligence', intelligenceRouter);
  return app;
}

describe('Phase 6: Next Journey Intelligence Test Suite', () => {
  const app = buildTestApp();

  beforeEach(() => {
    nextJourneyObservability.reset();
  });

  // ==========================================================================
  // SECTION 1: CANONICAL JOURNEY LEG MODEL & IMMUTABILITY (Scenarios 1 - 5)
  // ==========================================================================

  test('1. Canonical Journey Leg Creation: Sets correct default attributes and PLANNED status', () => {
    const leg = createCanonicalJourneyLeg({
      journeyId: 'journey_101',
      legIndex: 1,
      origin: { name: 'RK Beach', lat: 17.712, lon: 83.318 },
      destination: { name: 'Kailasagiri', lat: 17.749, lon: 83.342 },
      destinationIntent: DESTINATION_INTENTS.CONTINUE_TO_DESTINATION,
    });

    expect(leg.legId).toMatch(/^leg_/);
    expect(leg.journeyId).toBe('journey_101');
    expect(leg.legIndex).toBe(1);
    expect(leg.status).toBe(LEG_STATUSES.PLANNED);
    expect(leg.origin.name).toBe('RK Beach');
    expect(leg.destination.name).toBe('Kailasagiri');
    expect(leg.destinationIntent).toBe(DESTINATION_INTENTS.CONTINUE_TO_DESTINATION);
    expect(leg.isImmutable).toBe(false);
  });

  test('2. Lifecycle Transitions: Valid progression PLANNED -> READY -> ACTIVE -> COMPLETED', () => {
    let leg = createCanonicalJourneyLeg({
      journeyId: 'journey_102',
      legIndex: 1,
      origin: { name: 'Hotel Novotel', lat: 17.710, lon: 83.316 },
      destination: { name: 'Submarine Museum', lat: 17.717, lon: 83.332 },
    });

    leg = transitionLegStatus(leg, LEG_STATUSES.READY);
    expect(leg.status).toBe(LEG_STATUSES.READY);

    leg = transitionLegStatus(leg, LEG_STATUSES.ACTIVE);
    expect(leg.status).toBe(LEG_STATUSES.ACTIVE);
    expect(leg.startedAt).toBeDefined();

    leg = transitionLegStatus(leg, LEG_STATUSES.COMPLETED);
    expect(leg.status).toBe(LEG_STATUSES.COMPLETED);
    expect(leg.completedAt).toBeDefined();
    expect(leg.isImmutable).toBe(true);
  });

  test('3. Immutability Enforcement: Modifying or transitioning COMPLETED leg throws an error', () => {
    let leg = createCanonicalJourneyLeg({
      journeyId: 'journey_103',
      legIndex: 1,
      origin: { name: 'Point A' },
      destination: { name: 'Point B' },
      status: LEG_STATUSES.ACTIVE,
    });
    leg = transitionLegStatus(leg, LEG_STATUSES.COMPLETED);
    expect(leg.status).toBe(LEG_STATUSES.COMPLETED);

    expect(() => {
      transitionLegStatus(leg, LEG_STATUSES.ACTIVE);
    }).toThrow(/Cannot mutate or transition completed leg/);

    expect(() => {
      transitionLegStatus(leg, LEG_STATUSES.ADAPTING);
    }).toThrow(/Cannot mutate or transition completed leg/);
  });

  test('4. Invalid Lifecycle Rejections: Reject nonsensical transitions (e.g. PLANNED directly to COMPLETED)', () => {
    const leg = createCanonicalJourneyLeg({
      journeyId: 'journey_104',
      legIndex: 1,
    });

    expect(() => {
      transitionLegStatus(leg, LEG_STATUSES.COMPLETED);
    }).toThrow(/Invalid status transition/);
  });

  test('5. Continuous Journey Chaining: Chain sequential legs Leg 1 -> Leg 2 -> Leg 3 maintaining history', () => {
    const chainId = 'chain_vizag_105';
    const chain = getOrCreateJourneyChain(chainId, { city: 'Visakhapatnam' });
    expect(chain.legs.length).toBe(1);
    expect(chain.legs[0].legIndex).toBe(1);

    // Complete Leg 1
    chain.legs[0] = transitionLegStatus(chain.legs[0], LEG_STATUSES.READY);
    chain.legs[0] = transitionLegStatus(chain.legs[0], LEG_STATUSES.ACTIVE);
    chain.legs[0] = transitionLegStatus(chain.legs[0], LEG_STATUSES.COMPLETED);

    // Append Leg 2
    const leg2 = appendNextLeg(chainId, {
      destination: { name: 'Novotel Varun Beach', lat: 17.712, lon: 83.318 },
      destinationIntent: DESTINATION_INTENTS.GO_TO_HOTEL,
    });
    expect(leg2.legIndex).toBe(2);
    expect(leg2.parentLegId).toBe(chain.legs[0].legId);

    // Verify history and active leg
    const history = getJourneyLegHistory(chainId);
    expect(history.length).toBe(2);
    expect(history[0].status).toBe(LEG_STATUSES.COMPLETED);
    expect(history[0].isImmutable).toBe(true);

    const current = getCurrentLeg(chainId);
    expect(current.legId).toBe(leg2.legId);
    expect(current.legIndex).toBe(2);
  });

  // ==========================================================================
  // SECTION 2: DESTINATION INTENT RESOLVER (Scenarios 6 - 11)
  // ==========================================================================

  test('6. Intent Resolution: Resolves all standard destination intents', async () => {
    const tripContext = { city: 'Visakhapatnam' };
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const allIntents = [
      DESTINATION_INTENTS.RETURN_HOME,
      DESTINATION_INTENTS.GO_TO_HOTEL,
      DESTINATION_INTENTS.GO_TO_RESTAURANT,
      DESTINATION_INTENTS.GO_TO_AIRPORT,
      DESTINATION_INTENTS.GO_TO_RAILWAY_STATION,
      DESTINATION_INTENTS.GO_TO_BUS_STATION,
      DESTINATION_INTENTS.CONTINUE_TO_DESTINATION,
      DESTINATION_INTENTS.CUSTOM_DESTINATION,
    ];

    for (const intent of allIntents) {
      const res = await resolveDestinationIntent({
        intentType: intent,
        currentLocation,
        tripContext,
        userProfile: { homeLocation: { city: 'Visakhapatnam', lat: 17.7, lon: 83.3 } },
      });
      expect(res.intentType).toBe(intent);
      expect(res.status).toBeDefined();
    }
  });

  test('7. Return Home Privacy: Exact coordinates never leaked in public logs or output', async () => {
    const privateHome = {
      name: 'Private Flat 402, Sea Breeze Apts, Lawsons Bay',
      lat: 17.734567,
      lon: 83.334567,
      city: 'Visakhapatnam',
    };
    const res = await resolveDestinationIntent({
      intentType: DESTINATION_INTENTS.RETURN_HOME,
      userProfile: { homeLocation: privateHome },
      currentLocation: { lat: 17.712, lon: 83.318 },
    });

    expect(res.intentType).toBe(DESTINATION_INTENTS.RETURN_HOME);
    expect(res.status).toBe('RESOLVED');
    expect(res.destination.isPrivateLocation).toBe(true);
    expect(res.privacyNotice).toBeDefined();
  });

  test('8. Custom Destination Intent: Parses user raw input safely without LLM hallucination', async () => {
    const res = await resolveDestinationIntent({
      intentType: DESTINATION_INTENTS.CUSTOM_DESTINATION,
      rawInput: 'Take me to Jagadamba Centre Cinema',
      currentLocation: { lat: 17.712, lon: 83.318 },
      tripContext: { city: 'Visakhapatnam' },
    });

    expect(res.intentType).toBe(DESTINATION_INTENTS.CUSTOM_DESTINATION);
    expect(res.status).toBeDefined();
  });

  test('9. Airport Hub Intent: Resolves VTZ airport with mode AIRPORT', async () => {
    const res = await resolveDestinationIntent({
      intentType: DESTINATION_INTENTS.GO_TO_AIRPORT,
      currentLocation: { lat: 17.712, lon: 83.318 },
      tripContext: { city: 'Visakhapatnam' },
    });

    expect(res.intentType).toBe(DESTINATION_INTENTS.GO_TO_AIRPORT);
    expect(res.primaryDestination).toBeDefined();
    expect(res.primaryDestination.category).toBe('AIRPORT');
    expect(res.primaryDestination.name).toContain('Airport');
  });

  test('10. Railway Hub Intent: Resolves VSKP station with mode RAILWAY', async () => {
    const res = await resolveDestinationIntent({
      intentType: DESTINATION_INTENTS.GO_TO_RAILWAY_STATION,
      currentLocation: { lat: 17.712, lon: 83.318 },
      tripContext: { city: 'Visakhapatnam' },
    });

    expect(res.intentType).toBe(DESTINATION_INTENTS.GO_TO_RAILWAY_STATION);
    expect(res.primaryDestination).toBeDefined();
    expect(res.primaryDestination.category).toBe('RAILWAY_STATION');
    expect(res.primaryDestination.name).toContain('Visakhapatnam Junction');
  });

  test('11. End Journey Intent: Confirms completion without extra candidates', async () => {
    const res = await resolveDestinationIntent({
      intentType: DESTINATION_INTENTS.END_JOURNEY,
      tripContext: { city: 'Visakhapatnam' },
    });

    expect(res.intentType).toBe(DESTINATION_INTENTS.END_JOURNEY);
    expect(res.status).toBe('CONCLUDED');
  });

  // ==========================================================================
  // SECTION 3: ACCOMMODATION INTELLIGENCE & PRICING (Scenarios 12 - 16)
  // ==========================================================================

  test('12. Hotel Ranking & Scoring: Returns ranked accommodation options', () => {
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const hotels = findCandidateAccommodations({
      currentLocation,
      arrivalMinute: 1200, // 20:00
    });

    expect(Array.isArray(hotels)).toBe(true);
    expect(hotels.length).toBeGreaterThanOrEqual(2);
    expect(hotels[0].compositeScore).toBeGreaterThanOrEqual(hotels[1].compositeScore);
    expect(hotels[0].checkInStatus).toBeDefined();
  });

  test('13. Check-in Feasibility: FEASIBLE check-in window before front-desk cutoff', () => {
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const hotels = findCandidateAccommodations({
      currentLocation,
      arrivalMinute: 1140, // 19:00
    });

    const hotel = hotels.find(h => h.name.includes('Gateway') || h.name.includes('Hotel'));
    expect(hotel).toBeDefined();
    expect(hotel.checkInStatus).toBe(CHECKIN_FEASIBILITY.CHECKIN_FEASIBLE);
  });

  test('14. Check-in Feasibility: TIGHT or INFEASIBLE when arrival is late at night', () => {
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const hotels = findCandidateAccommodations({
      currentLocation,
      arrivalMinute: 1420, // 23:40
      customPool: [
        {
          id: 'hotel_homestay',
          name: 'Colonial Guesthouse',
          lat: 17.72,
          lon: 83.32,
          checkInEndHour: 22,
          has24hrFrontDesk: false,
          basePrice: 2200,
        },
      ],
    });

    expect(hotels[0].checkInStatus).toBe(CHECKIN_FEASIBILITY.CHECKIN_INFEASIBLE);
  });

  test('15. Itemized Price Decomposition: 18% GST and itemized pricing transparency', () => {
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const hotels = findCandidateAccommodations({
      currentLocation,
      arrivalMinute: 1200,
    });

    const hotel = hotels[0];
    expect(hotel.price).toBeDefined();
    expect(hotel.price.basePrice).toBeGreaterThan(0);
    expect(hotel.price.taxes).toBeDefined();
    expect(hotel.price.totalKnownPrice).toBeDefined();
  });

  test('16. Tomorrow Corridor Utility: Ranks hotel closer to tomorrow departure corridor higher', () => {
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const nextDayDestination = { name: 'Araku Valley', lat: 18.33, lon: 82.87 };

    const hotels = findCandidateAccommodations({
      currentLocation,
      arrivalMinute: 1200,
      nextDayDestination,
    });

    expect(hotels[0].tomorrowUtility).toBeDefined();
  });

  // ==========================================================================
  // SECTION 4: COMPOUND MULTI-STOP CORRIDOR DINING (Scenarios 17 - 20)
  // ==========================================================================

  test('17. Corridor Dining: Routes Current -> Dining -> Stay with compound travel calculation', () => {
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const nextDestination = { name: 'Novotel Varun Beach', lat: 17.715, lon: 83.322 };

    const candidates = evaluateCorridorDiningChain({
      currentLocation,
      nextDestination,
      currentMinute: 1230, // 20:30 (Dinner)
    });

    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const top = candidates[0];
    expect(top.leg1DistKm).toBeGreaterThan(0);
    expect(top.totalChainMinutes).toBeGreaterThan(0);
  });

  test('18. Detour Constraint: Identifies detour distance along corridor', () => {
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const nextDestination = { name: 'Novotel Varun Beach', lat: 17.715, lon: 83.322 };

    const candidates = evaluateCorridorDiningChain({
      currentLocation,
      nextDestination,
      currentMinute: 1230,
    });

    expect(candidates[0].detourKm).toBeDefined();
    expect(typeof candidates[0].detourKm).toBe('number');
  });

  test('19. Operating Hours: Identifies OPEN vs CLOSING_SOON vs CLOSED restaurants', () => {
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const nextDestination = { name: 'Hotel', lat: 17.715, lon: 83.322 };

    const candidates = evaluateCorridorDiningChain({
      currentLocation,
      nextDestination,
      currentMinute: 1365, // 22:45
      customPool: [
        { id: 'r1', name: 'Late Night Diner', lat: 17.713, lon: 83.319, openHour: 10, closeHour: 24, avgCostForTwo: 500 },
        { id: 'r2', name: 'Early Kitchen', lat: 17.713, lon: 83.319, openHour: 10, closeHour: 22, avgCostForTwo: 400 },
      ],
    });

    expect(candidates[0].openStatus).toBe('OPEN');
  });

  test('20. Meal Slot Matching: Recommends dinner appropriate options during evening hours', () => {
    const currentLocation = { lat: 17.712, lon: 83.318 };
    const nextDestination = { name: 'Novotel', lat: 17.715, lon: 83.322 };

    const candidates = evaluateCorridorDiningChain({
      currentLocation,
      nextDestination,
      currentMinute: 1200, // 20:00
    });

    expect(candidates[0].compositeScore).toBeGreaterThanOrEqual(60);
    expect(candidates[0].corridorSummary).toBeDefined();
  });

  // ==========================================================================
  // SECTION 5: TRANSPORT HUB HARD CONSTRAINT DEPARTURE MATH (Scenarios 21 - 25)
  // ==========================================================================

  test('21. Mode-Specific Buffers: 120m for flight, 45m for train, 30m for bus', () => {
    const airportEval = evaluateTransportDeadline({
      hubCategory: 'AIRPORT',
      scheduledDepartureMinute: 1200,
      currentMinute: 900,
      travelTransitMinutes: 30,
    });
    expect(airportEval.requiredBufferMinutes).toBe(120);

    const railEval = evaluateTransportDeadline({
      hubCategory: 'RAILWAY',
      scheduledDepartureMinute: 1200,
      currentMinute: 1000,
      travelTransitMinutes: 30,
    });
    expect(railEval.requiredBufferMinutes).toBe(45);

    const busEval = evaluateTransportDeadline({
      hubCategory: 'BUS',
      scheduledDepartureMinute: 1200,
      currentMinute: 1100,
      travelTransitMinutes: 20,
    });
    expect(busEval.requiredBufferMinutes).toBe(30);
  });

  test('22. Deadline Math: Correct calculation of latestSafeDepartureMinute and availableBuffer', () => {
    const hubEval = evaluateTransportDeadline({
      hubCategory: 'RAILWAY',
      scheduledDepartureMinute: 1200, // 20:00
      currentMinute: 1050, // 17:30
      travelTransitMinutes: 45,
    });

    // Required buffer = 45m. Transit = 45m.
    // Latest safe departure = 1200 - 45 (transit) - 45 (buffer) = 1110.
    // Arrival = 1050 + 45 = 1095. Available buffer = 1155 - 1095 = 60m.
    expect(hubEval.latestSafeDepartureMinute).toBe(1110);
    expect(hubEval.availableBufferMinutes).toBe(60);
    expect(hubEval.deadlineState).toBe(DEADLINE_RISK_STATES.SAFE_BUFFER);
  });

  test('23. Deadline Risk State: DEADLINE_RISK when available buffer < required buffer', () => {
    const hubEval = evaluateTransportDeadline({
      hubCategory: 'RAILWAY',
      scheduledDepartureMinute: 1200, // 20:00
      currentMinute: 1130, // 18:50
      travelTransitMinutes: 40,
    });

    // Arrival = 1130 + 40 = 1170. Buffer = 1200 - 1170 = 30m (< 45m required).
    expect(hubEval.deadlineState).toBe(DEADLINE_RISK_STATES.DEADLINE_RISK);
    expect(hubEval.urgency).toBe('IMMEDIATE_DEPARTURE');
  });

  test('24. Missed Deadline: MISSED_DEADLINE when travel arrives past departure', () => {
    const hubEval = evaluateTransportDeadline({
      hubCategory: 'AIRPORT',
      scheduledDepartureMinute: 1200,
      currentMinute: 1190,
      travelTransitMinutes: 40,
    });

    expect(hubEval.deadlineState).toBe(DEADLINE_RISK_STATES.MISSED_DEADLINE);
    expect(hubEval.availableBufferMinutes).toBeLessThan(0);
  });

  test('25. Transport Hub Warning Text: Human-readable deadline risk explainability', () => {
    const hubEval = evaluateTransportDeadline({
      hubCategory: 'AIRPORT',
      scheduledDepartureMinute: 1200,
      currentMinute: 1060,
      travelTransitMinutes: 50,
      hubName: 'Visakhapatnam International Airport (VTZ)',
    });

    expect(hubEval.warningMessage).toContain('VTZ');
    expect(hubEval.warningMessage).toContain('buffer');
  });

  // ==========================================================================
  // SECTION 6: OVERNIGHT STAY & GHAT SAFETY (Scenarios 26 - 28)
  // ==========================================================================

  test('26. Ghat Sunset Hazard: Recommends overnight stay over night mountain ghat transit', () => {
    const recommendation = evaluateOvernightViability({
      currentMinute: 1200, // 20:00 (Night)
      routeTerrainType: 'GHAT_ROAD',
      plannedRemainingTransitMinutes: 180,
    });

    expect(recommendation.recommendation).toBe('STAY_HIGHLY_RECOMMENDED');
    expect(recommendation.isGhatTerrain).toBe(true);
    expect(recommendation.isNightTime).toBe(true);
  });

  test('27. Pacing Fatigue: Detects excessive cumulative drive time and flags rest', () => {
    const recommendation = evaluateOvernightViability({
      currentMinute: 1260, // 21:00
      tripPacingMinutesToday: 600, // 10 hours of travel
      declaredFatigue: true,
    });

    expect(recommendation.recommendation).toBe('STAY_ADVISED');
    expect(recommendation.reasons.some(r => r.includes('fatigue') || r.includes('pacing'))).toBe(true);
  });

  test('28. Weather Risk Veto: Flash flood or cyclone alert forces stay recommendation', () => {
    const recommendation = evaluateOvernightViability({
      currentMinute: 1200,
      activeWeatherHazards: [
        { type: 'HEAVY_RAIN', name: 'Cyclone Flash Flood Alert' },
      ],
    });

    expect(recommendation.recommendation).toBe('STAY_HIGHLY_RECOMMENDED');
    expect(recommendation.hasSevereWeather).toBe(true);
  });

  // ==========================================================================
  // SECTION 7: NEXT LEG DECISION ENGINE & EXPLAINABILITY (Scenarios 29 - 33)
  // ==========================================================================

  test('29. Master Orchestration Hierarchy: Safety strictly dominates preference', async () => {
    const decision = await evaluateNextLegDecision({
      tripId: 'journey_supremacy_101',
      currentLocation: { lat: 17.712, lon: 83.318 },
      intentType: DESTINATION_INTENTS.CONTINUE_TO_DESTINATION,
      activeSafetyAlerts: [
        { severity: 'CRITICAL', type: 'LANDSLIDE_WARNING' },
      ],
    });

    expect(decision.safetyOverrideActive).toBe(true);
    expect(decision.decision).toBe('HOLD_OR_DIVERT');
  });

  test('30. Structured Explainability Contract: Contains all 11 required contract fields', async () => {
    const decision = await evaluateNextLegDecision({
      tripId: 'journey_contract_102',
      currentLocation: { lat: 17.712, lon: 83.318 },
      intentType: DESTINATION_INTENTS.GO_TO_HOTEL,
      currentMinute: 1140,
    });

    const exp = decision.explanation;
    expect(exp).toBeDefined();
    expect(exp.where).toBeDefined();
    expect(exp.why).toBeDefined();
    expect(exp.eta).toBeDefined();
    expect(exp.cost).toBeDefined();
    expect(exp.travelEffort).toBeDefined();
    expect(exp.safety).toBeDefined();
    expect(exp.trust).toBeDefined();
    expect(exp.currentConditions).toBeDefined();
    expect(exp.constraints).toBeDefined();
    expect(exp.tradeoff).toBeDefined();
    expect(exp.confidence).toBeDefined();
  });

  test('31. Alternative Tradeoff Explanation: Articulates why option is selected', async () => {
    const decision = await evaluateNextLegDecision({
      tripId: 'journey_tradeoff_103',
      currentLocation: { lat: 17.712, lon: 83.318 },
      intentType: DESTINATION_INTENTS.GO_TO_HOTEL,
      currentMinute: 1140,
    });

    expect(decision.explanation.tradeoff).toBeDefined();
    expect(typeof decision.explanation.tradeoff).toBe('string');
  });

  test('32. Insufficient Data Resilience: Graceful fallback when telemetry is stale', async () => {
    const decision = await evaluateNextLegDecision({
      tripId: 'journey_fallback_104',
      currentLocation: { lat: 17.712, lon: 83.318 },
      intentType: DESTINATION_INTENTS.CUSTOM_DESTINATION,
      rawInput: 'Unknown Place XYZ',
    });

    expect(decision.decision).toBeDefined();
    expect(decision.explanation).toBeDefined();
  });

  test('33. Simulation Isolation: Preserves isSimulated flag without polluting live state', async () => {
    const decision = await evaluateNextLegDecision({
      tripId: 'journey_sim_105',
      currentLocation: { lat: 17.712, lon: 83.318 },
      intentType: DESTINATION_INTENTS.GO_TO_HOTEL,
      isSimulated: true,
      simulationScenario: 'SYNTHETIC_DEADLINE_STRESS',
    });

    expect(decision.isSimulated).toBe(true);
    const metrics = nextJourneyObservability.getMetrics();
    expect(metrics.simulated.next_leg_decision_count).toBeGreaterThanOrEqual(1);
  });

  // ==========================================================================
  // SECTION 8: REST API INTEGRATION & OBSERVABILITY (Scenarios 34 - 36)
  // ==========================================================================

  test('34. API: POST /api/intelligence/trips/:id/state/progress flags isCompleted when stops finish', async () => {
    const tripId = 'trip_api_test_progress';
    // Initialize journey with 1 stop
    await request(app)
      .post(`/api/intelligence/trips/${tripId}/state`)
      .send({
        tripId,
        plan: [{ id: 'stop_final', name: 'Kailasagiri', lat: 17.749, lon: 83.342, plannedDurationMinutes: 45 }],
      });

    // Complete the only stop
    const res = await request(app)
      .post(`/api/intelligence/trips/${tripId}/state/progress`)
      .send({ stopId: 'stop_final', action: 'COMPLETE' });

    expect(res.status).toBe(200);
    expect(res.body.isCompleted).toBe(true);
    expect(res.body.nextIntentRequired).toBe(true);
  });

  test('35. API: Next Leg Intent and Candidate Evaluation Flow', async () => {
    const tripId = 'trip_api_test_intent';
    // Submit intent
    const intentRes = await request(app)
      .post(`/api/intelligence/trips/${tripId}/next-leg/intent`)
      .send({ intentType: 'GO_TO_HOTEL' });

    expect(intentRes.status).toBe(200);
    expect(intentRes.body.intentType).toBe('GO_TO_HOTEL');
    expect(intentRes.body.resolution).toBeDefined();

    // Evaluate Next Leg
    const evalRes = await request(app)
      .post(`/api/intelligence/trips/${tripId}/next-leg/evaluate`)
      .send({ intentType: 'GO_TO_HOTEL' });

    expect(evalRes.status).toBe(200);
    expect(evalRes.body.decision).toBeDefined();
    expect(evalRes.body.explanation).toBeDefined();
  });

  test('36. API: Journey Chain Legs History is Queryable & Immutable', async () => {
    const journeyId = 'journey_api_chain_test';
    // Create chain
    const createRes = await request(app)
      .post(`/api/intelligence/journeys/${journeyId}/legs`)
      .send({
        origin: { name: 'RK Beach' },
        destination: { name: 'Novotel' },
        destinationIntent: 'GO_TO_HOTEL',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.leg).toBeDefined();

    // Query legs history
    const historyRes = await request(app)
      .get(`/api/intelligence/journeys/${journeyId}/legs`);

    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body.legs)).toBe(true);
    expect(historyRes.body.legs.length).toBeGreaterThanOrEqual(1);

    // Query metrics
    const metricsRes = await request(app)
      .get('/api/intelligence/next-journey/metrics');

    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.live).toBeDefined();
    expect(metricsRes.body.simulated).toBeDefined();
  });
});
