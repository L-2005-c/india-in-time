'use strict';

/**
 * __tests__/intelligence.operatingSystemE2E.test.js
 *
 * India In-Time v3.0 Master Operating System End-to-End Simulation:
 * "Visakhapatnam to Araku Valley: The Contextual Travel Decision Experience"
 *
 * Demonstrates the Core Product Loop:
 * PLAN -> TRAVEL -> OBSERVE -> UNDERSTAND -> DETECT CHANGE -> EVALUATE IMPACT
 * -> DECIDE -> ADAPT -> EXPLAIN -> ACT -> LEARN
 */

const { createJourneyState, advanceJourneyProgress, STOP_STATUSES, TRIP_HEALTH_STATES } = require('../services/travelIntelligence/journey/journeyStateEngine');
const { evaluateTripGuardian } = require('../services/travelIntelligence/guardian/travelGuardian');
const { adaptJourneyPlan } = require('../services/travelIntelligence/decision/adaptationPipeline');
const { commitPlanVersion, getPlanVersionHistory, inMemoryVersions } = require('../services/travelIntelligence/journey/planVersioning');
const { sanitizeDnaProfile, recordTravelerObservation } = require('../services/travelIntelligence/personalTravelDna');

describe('India In-Time v3.0 — The AI Travel Operating System End-to-End Simulation', () => {
  beforeEach(() => {
    inMemoryVersions.clear();
  });

  test('Visakhapatnam to Araku 2-Day Journey Adaptation Simulation', async () => {
    // ── STEP 1: Traveler Modeling (Traveler DNA) ──────────────────────────────
    // Traveler: Nature & Photography focused, crowd-sensitive, low rain tolerance
    let travelerDna = sanitizeDnaProfile({
      photography: 95,
      nature: 90,
      scenic: 90,
      crowdTolerance: 25,
      rainTolerance: 30, // Dislikes heavy rain during photography
      heatTolerance: 45,
      pacePreference: 'relaxed',
    });

    expect(travelerDna.photography).toBe(95);
    expect(travelerDna.rainTolerance).toBe(30);

    // ── STEP 2: Initial Journey Plan (Plan v1) ────────────────────────────────
    const initialPlan = {
      tripId: 'trip_vizag_araku_301',
      title: 'Visakhapatnam to Araku Scenic Route',
      stops: [
        {
          id: 'stop_borra',
          name: 'Borra Caves',
          cat: 'cave',
          lat: 18.281,
          lon: 83.041,
          elevationM: 705,
          visitMinutes: 90,
          plannedArrivalMinute: 570, // 09:30 AM
          plannedDepartureMinute: 660, // 11:00 AM
        },
        {
          id: 'stop_coffee_museum',
          name: 'Araku Coffee Museum',
          cat: 'museum',
          lat: 18.333,
          lon: 82.871,
          elevationM: 911,
          visitMinutes: 45,
          plannedArrivalMinute: 700, // 11:40 AM
          plannedDepartureMinute: 745, // 12:25 PM
        },
        {
          id: 'stop_padmapuram',
          name: 'Padmapuram Gardens',
          cat: 'nature',
          lat: 18.324,
          lon: 82.861,
          elevationM: 915,
          visitMinutes: 60,
          plannedArrivalMinute: 765, // 12:45 PM
          plannedDepartureMinute: 825, // 01:45 PM
        },
        {
          id: 'stop_galikonda',
          name: 'Galikonda View Point',
          cat: 'viewpoint',
          lat: 18.252,
          lon: 82.951,
          elevationM: 1060,
          visitMinutes: 60,
          plannedArrivalMinute: 960, // 04:00 PM
          plannedDepartureMinute: 1020, // 05:00 PM (Sunset timing)
        },
      ],
    };

    // Initialize Canonical Journey State
    let journeyState = createJourneyState({
      tripId: initialPlan.tripId,
      travelerId: 'traveler_aditya',
      plan: initialPlan,
      startTimeMinutes: 540,
    });

    // Commit Plan v1 to Audit History
    await commitPlanVersion({
      tripId: journeyState.tripId,
      versionNumber: 1,
      triggerType: 'INITIAL_PLAN',
      triggerReason: 'Baseline itinerary confirmed by traveler',
      plan: journeyState.stops,
      changedStops: [],
      preservedStops: [],
      confidence: 'HIGH',
    });

    expect(journeyState.activePlanVersion).toBe(1);
    expect(journeyState.tripHealth).toBe(TRIP_HEALTH_STATES.ON_TRACK);
    expect(journeyState.activeStop.name).toBe('Borra Caves');
    expect(journeyState.completedStops).toHaveLength(0);
    expect(journeyState.upcomingStops).toHaveLength(3);

    // ── STEP 3: Journey Begins & Stop 1 is Completed ──────────────────────────
    // Traveler visits Borra Caves, stays 90 mins, completes at 11:10 AM (670 mins)
    journeyState = advanceJourneyProgress(journeyState, {
      stopId: 'stop_borra',
      action: 'COMPLETE',
      currentMinute: 670,
      actualVisitMinutes: 90,
    });

    expect(journeyState.completedStops).toHaveLength(1);
    expect(journeyState.completedStops[0].name).toBe('Borra Caves');
    expect(journeyState.completedStops[0].status).toBe(STOP_STATUSES.COMPLETED);
    expect(journeyState.activeStop.name).toBe('Araku Coffee Museum');
    expect(journeyState.upcomingStops).toHaveLength(2);

    // ── STEP 4: Immutability Defense Check ────────────────────────────────────
    // Assert that the completed stop CANNOT be altered or deleted
    expect(() => {
      advanceJourneyProgress(journeyState, {
        stopId: 'stop_borra',
        action: 'SKIP',
      });
    }).toThrow(/already COMPLETED and cannot be modified/);

    // ── STEP 5: Reality Disruption (Monsoon Ghat Downpour) ────────────────────
    // Controlled simulation: Sudden orographic torrential rainfall develops across Eastern Ghats
    const simulatedWeatherContext = {
      isSimulation: true,
      dataState: 'SIMULATED',
      weather: {
        temperatureC: 21,
        apparentTempC: 21,
        precipitationProb: 85, // 85% rain exceeds traveler's 30% tolerance!
        precipitationMm: 32,
        condition: 'Heavy Mountain Downpour & Fog',
      },
      traffic: {
        isGhatCorridor: true,
        trafficDelayMinutes: 30,
        corridorName: 'Ananthagiri Ghat Section',
      },
      provenance: { confidence: 'HIGH' },
    };

    // ── STEP 6: Travel Guardian Evaluation ───────────────────────────────────
    // Guardian inspects remaining stops under the degraded weather & ghat hazards
    const guardianResult = evaluateTripGuardian(journeyState, simulatedWeatherContext, travelerDna);

    expect(guardianResult.shouldReplan).toBe(true);
    expect(guardianResult.tripHealth).toBe(TRIP_HEALTH_STATES.CRITICAL);
    expect(guardianResult.reasons.some(r => r.includes('Ghat Road'))).toBe(true);
    expect(guardianResult.preservedStops).toContain('Borra Caves');

    // ── STEP 7: Contextual Decision Engine & Alternative Generation ──────────
    // Evaluates outdoor stops: Padmapuram Gardens and Galikonda Viewpoint are now unviable.
    // Preserves Borra Caves (already completed).
    // Replaces degraded outdoor stops with sheltered havens (e.g. Roastery / Craft Pavilion).
    const adaptationResult = adaptJourneyPlan(
      journeyState,
      simulatedWeatherContext,
      travelerDna,
      guardianResult
    );

    expect(adaptationResult.shouldAdapt).toBe(true);
    expect(adaptationResult.newPlanVersion).toBe(2);
    expect(adaptationResult.preservedStops).toContain('Borra Caves');
    expect(adaptationResult.substitutedStops.length).toBeGreaterThanOrEqual(1);

    // Verify substitution justification
    const sub = adaptationResult.substitutedStops[0];
    expect(sub.reason).toContain('adverse weather');

    // ── STEP 8: Traveler Accepts Plan v2 ─────────────────────────────────────
    // Commit Plan v2 to version history
    await commitPlanVersion({
      tripId: journeyState.tripId,
      versionNumber: adaptationResult.newPlanVersion,
      triggerType: guardianResult.tripHealth,
      triggerReason: guardianResult.reasons.join('; '),
      plan: adaptationResult.newStopsList,
      changedStops: adaptationResult.substitutedStops,
      preservedStops: adaptationResult.preservedStops,
      confidence: adaptationResult.confidence,
    });

    // Update active journey state to Plan v2
    journeyState.activePlanVersion = 2;
    journeyState.stops = adaptationResult.newStopsList;
    journeyState.completedStops = adaptationResult.newStopsList.filter(s => s.status === STOP_STATUSES.COMPLETED);
    journeyState.upcomingStops = adaptationResult.newStopsList.filter(s => s.status === STOP_STATUSES.PLANNED);
    journeyState.tripHealth = TRIP_HEALTH_STATES.ON_TRACK;

    // Verify that Borra Caves is STILL completed in the new version
    expect(journeyState.completedStops[0].name).toBe('Borra Caves');
    expect(journeyState.completedStops[0].status).toBe(STOP_STATUSES.COMPLETED);

    // Verify version history contains full audit trail
    const history = await getPlanVersionHistory(journeyState.tripId);
    expect(history).toHaveLength(2);
    expect(history[0].versionNumber).toBe(1);
    expect(history[1].versionNumber).toBe(2);

    // ── STEP 9: Outcome Learning (Updating Traveler DNA) ──────────────────────
    // Record that traveler accepted the bad-weather indoor adaptation
    travelerDna = recordTravelerObservation(travelerDna, {
      type: 'ADAPTATION_ACCEPTED',
      dimension: 'nature',
      delta: 0,
      context: { tripId: journeyState.tripId, event: 'GHAT_RAIN_SHELTER_ACCEPTED' },
      confidence: 'HIGH',
    });

    expect(travelerDna.observationHistory).toHaveLength(1);
    expect(travelerDna.observationHistory[0].type).toBe('ADAPTATION_ACCEPTED');
  });
});
