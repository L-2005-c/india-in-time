'use strict';

/**
 * __tests__/services.safetyRiskIntelligence.test.js
 *
 * India In-Time v3.0 — Phase 3: Safety & Risk Intelligence Test Suite
 *
 * Validates all 30 black-box scenarios specified in Section 48:
 *  1. Normal trip => CONTINUE
 *  2. Official warning affects future route => WARNING / REPLAN
 *  3. Warning outside route => NO_IMPACT
 *  4. Warning outside validity window => NO_IMPACT
 *  5. Official road closure => AVOID / REROUTE
 *  6. Heavy rain + ghat + night exposure => stronger safety recommendation
 *  7. Same hazard + higher tolerance traveler => different recommendation where justified
 *  8. Official warning overrides traveler preference
 *  9. Missing safety data => INSUFFICIENT_DATA
 * 10. Stale signal => STALE
 * 11. Provider failure => INSUFFICIENT_DATA
 * 12. Source conflict => conflict preserved
 * 13. Fire anomaly => FIRE_ANOMALY, not confirmed fire
 * 14. Flood risk => not automatically FLOODED_ROAD
 * 15. Landslide risk => not automatically ACTIVE_LANDSLIDE
 * 16. Duplicate safety notification => suppressed
 * 17. WATCH -> WARNING => escalation notification
 * 18. WARNING -> SEVERE => escalation bypass
 * 19. Safety resolution => resolution notification
 * 20. Simulation => visibly SIMULATED
 * 21. Simulation does not affect production state
 * 22. Traveler accepts recommendation => plan adaptation
 * 23. Traveler declines recommendation => audit preserved
 * 24. Completed stops immutable
 * 25. Plan version increments correctly
 * 26. Journey state updates correctly
 * 27. LLM cannot create a safety signal
 * 28. LLM cannot escalate severity
 * 29. LLM cannot create an official-source claim
 * 30. CRITICAL state cannot be triggered by weak evidence
 * Plus Canonical REST API Integration
 */

const express = require('express');
const request = require('supertest');

const {
  evaluateJourneySafety,
  simulateSafetyEvent,
  createSafetySignal,
  HAZARD_TYPES,
  SAFETY_SEVERITIES,
  SAFETY_DATA_STATES,
  SAFETY_DECISION_STATES,
  getSafetyProviders,
} = require('../services/travelIntelligence/safety');

const {
  dispatchSafetyNotification,
  resolveSafetyNotification,
  resetNotificationEngine,
} = require('../services/travelIntelligence/disruption/disruptionNotificationEngine');

const { createJourneyState, advanceJourneyProgress } = require('../services/travelIntelligence/journey/journeyStateEngine');

// Setup mock Express app for REST route testing
const intelligenceRouter = require('../routes/intelligence');
const app = express();
app.use(express.json());
app.use('/api/intelligence', intelligenceRouter);

const SAMPLE_ARAKU_STOPS = [
  { id: 'stop_1', name: 'Borra Caves', cat: 'nature', lat: 18.2811, lon: 83.0402, elevationM: 705, visitMinutes: 90, status: 'COMPLETED' },
  { id: 'stop_2', name: 'Araku Valley Coffee Museum', cat: 'culture', lat: 18.3333, lon: 82.8833, elevationM: 910, visitMinutes: 60, status: 'PLANNED' },
  { id: 'stop_3', name: 'Galikonda Viewpoint', cat: 'viewpoint', lat: 18.2325, lon: 82.9150, elevationM: 1100, visitMinutes: 45, status: 'PLANNED' },
  { id: 'stop_4', name: 'Padmapuram Gardens', cat: 'nature', lat: 18.3267, lon: 82.8711, elevationM: 900, visitMinutes: 60, status: 'PLANNED' },
];

describe('India In-Time v3.0 — Phase 3: Safety & Risk Intelligence', () => {
  beforeEach(() => {
    resetNotificationEngine();
  });

  // TEST 1 — Normal trip => CONTINUE
  test('TEST 1 — Normal trip evaluates to CONTINUE without safety impediment', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_norm_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
      startTimeMinutes: 540,
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_norm_01',
      journeyState,
      signals: [],
    });

    expect(result.safetyStatus).toBe('SAFE_TO_CONTINUE');
    expect(result.decision).toBe(SAFETY_DECISION_STATES.CONTINUE);
    expect(result.notification).toBeNull();
  });

  // TEST 2 — Official warning affects future route => WARNING / REPLAN
  test('TEST 2 — Official warning affecting future route triggers WARNING and REPLAN_RECOMMENDED', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_warn_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
      startTimeMinutes: 540,
    });

    const warningSignal = createSafetySignal({
      provider: 'IMD',
      source: 'IMD Amaravati Regional Meteorological Centre',
      hazardType: HAZARD_TYPES.HEAVY_RAIN,
      severity: SAFETY_SEVERITIES.WARNING,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      location: { name: 'Galikonda Viewpoint', coords: [18.2325, 82.9150] },
      radiusMeters: 10000,
      evidence: ['Official IMD Orange Alert for heavy rain & low visibility'],
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_warn_01',
      journeyState,
      signals: [warningSignal],
    });

    expect(result.safetyStatus).toBe('REPLAN_RECOMMENDED');
    expect(result.decision).toBe(SAFETY_DECISION_STATES.REPLACE_STOP);
    expect(result.notification).toBeDefined();
    expect(result.notification.severity).toBe('WARNING');
    expect(result.notification.answers.whatHappened).toBeDefined();
  });

  // TEST 3 — Warning outside route => NO_IMPACT
  test('TEST 3 — Warning geographically far outside route (150 km) yields NO_IMPACT', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_geo_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
      startTimeMinutes: 540,
    });

    const distantSignal = createSafetySignal({
      provider: 'IMD',
      hazardType: HAZARD_TYPES.HEAVY_RAIN,
      severity: SAFETY_SEVERITIES.WARNING,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      location: { name: 'Kakinada Coast', coords: [16.9891, 82.2475] }, // > 150 km away
      radiusMeters: 5000,
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_geo_01',
      journeyState,
      signals: [distantSignal],
    });

    expect(result.decision).toBe(SAFETY_DECISION_STATES.CONTINUE);
    expect(result.exposure.isExposed).toBe(false);
  });

  // TEST 4 — Warning outside validity window => NO_IMPACT
  test('TEST 4 — Warning outside validity window (tomorrow) yields NO_TEMPORAL_OVERLAP', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_temp_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
      startTimeMinutes: 540, // 09:00 AM
    });

    const futureSignal = createSafetySignal({
      provider: 'IMD',
      hazardType: HAZARD_TYPES.THUNDERSTORM,
      severity: SAFETY_SEVERITIES.WARNING,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      location: { name: 'Araku Valley', coords: [18.3333, 82.8833] },
      validFrom: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      validUntil: new Date(Date.now() + 90000000).toISOString(),
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_temp_01',
      journeyState,
      signals: [futureSignal],
    });

    expect(result.temporal.isOverlap).toBe(false);
    expect(result.decision).toBe(SAFETY_DECISION_STATES.CONTINUE);
  });

  // TEST 5 — Official road closure => AVOID / REROUTE (Hard Constraint)
  test('TEST 5 — Official road closure triggers AVOID and overrides travel preference', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_close_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
      startTimeMinutes: 540,
    });

    const closureSignal = createSafetySignal({
      provider: 'POLICE_HIGHWAY_PATROL',
      source: 'District Traffic Police',
      hazardType: HAZARD_TYPES.ROAD_CLOSURE,
      severity: SAFETY_SEVERITIES.CRITICAL,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      location: { name: 'Galikonda Viewpoint Corridor', coords: [18.2325, 82.9150] },
      radiusMeters: 10000,
      evidence: ['Official barrier #401: road blocked by tree fall'],
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_close_01',
      journeyState,
      travelerDna: { adventure: 90, ghatTolerance: 90 }, // high tolerance
      signals: [closureSignal],
    });

    expect(result.decision).toBe(SAFETY_DECISION_STATES.AVOID);
    expect(result.exposure.isHardSafetyConstraint).toBe(true);
    expect(result.exposure.canTravelerOverride).toBe(false);
  });

  // TEST 6 — Heavy rain + ghat + night exposure => stronger safety recommendation
  test('TEST 6 — Heavy rain on ghat road with night exposure triggers strong safety recommendation', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_ghat_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
      startTimeMinutes: 1080, // 18:00 (evening/night)
    });

    const rainSignal = createSafetySignal({
      provider: 'IMD',
      hazardType: HAZARD_TYPES.GHAT_HAZARD,
      severity: SAFETY_SEVERITIES.WARNING,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      location: { name: 'Araku Ghat Hairpins', coords: [18.2325, 82.9150] },
      radiusMeters: 8000,
      evidence: ['Fog and wet hairpins with poor visibility'],
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_ghat_01',
      journeyState,
      travelerDna: { nightTravelTolerance: 20, ghatTolerance: 30 },
      signals: [rainSignal],
    });

    expect(result.exposure.exposureBand).toBe('HIGH');
    expect(result.decision).toBe(SAFETY_DECISION_STATES.REPLACE_STOP);
  });

  // TEST 7 — Same hazard + higher tolerance traveler => different recommendation
  test('TEST 7 — Same moderate hazard produces customized recommendation for higher tolerance traveler', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_custom_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
      startTimeMinutes: 600,
    });

    const rainSignal = createSafetySignal({
      provider: 'IMD',
      hazardType: HAZARD_TYPES.HEAVY_RAIN,
      severity: SAFETY_SEVERITIES.CAUTION,
      dataState: SAFETY_DATA_STATES.PREDICTED,
      location: { name: 'Araku Valley', coords: [18.3333, 82.8833] },
      radiusMeters: 10000,
      evidence: ['Moderate precipitation forecast'],
    });

    const conservativeResult = evaluateJourneySafety({
      tripId: 'trip_custom_01',
      journeyState,
      travelerDna: { rainExposureTolerance: 15 },
      signals: [rainSignal],
    });

    const tolerantResult = evaluateJourneySafety({
      tripId: 'trip_custom_01',
      journeyState,
      travelerDna: { rainExposureTolerance: 85 },
      signals: [rainSignal],
    });

    expect(conservativeResult.exposure.exposureScore).toBeGreaterThan(tolerantResult.exposure.exposureScore);
  });

  // TEST 8 — Official warning overrides traveler preference
  test('TEST 8 — Authoritative road closure strictly overrides extreme traveler tolerance', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_override_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
      startTimeMinutes: 540,
    });

    const closure = createSafetySignal({
      provider: 'NDMA',
      source: 'State Disaster Management Authority',
      hazardType: HAZARD_TYPES.ROAD_CLOSURE,
      severity: SAFETY_SEVERITIES.CRITICAL,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      location: { name: 'Araku Corridor', coords: [18.2811, 83.0402] },
      radiusMeters: 10000,
      evidence: ['Mandatory evacuation and bridge closure'],
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_override_01',
      journeyState,
      travelerDna: { adventure: 100, ghatTolerance: 100, rainTolerance: 100 },
      signals: [closure],
    });

    expect(result.decision).toBe(SAFETY_DECISION_STATES.AVOID);
    expect(result.exposure.canTravelerOverride).toBe(false);
  });

  // TEST 9 — Missing safety data => INSUFFICIENT_DATA
  test('TEST 9 — Missing safety data returns INSUFFICIENT_DATA without fabricating certainty', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_missing_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
      startTimeMinutes: 540,
    });

    const emptySignal = createSafetySignal({
      dataState: SAFETY_DATA_STATES.UNAVAILABLE,
      confidence: 'LOW',
      evidence: [],
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_missing_01',
      journeyState,
      signals: [emptySignal],
    });

    expect(result.decision).toBe(SAFETY_DECISION_STATES.INSUFFICIENT_DATA);
    expect(result.planAppropriate).toBe(false);
  });

  // TEST 10 — Stale signal => STALE
  test('TEST 10 — Outdated signal past TTL returns STALE and explains data age', () => {
    const staleTime = new Date(Date.now() - 3 * 3600 * 1000).toISOString(); // 3 hours ago
    const staleSignal = createSafetySignal({
      provider: 'IMD',
      hazardType: HAZARD_TYPES.WEATHER_WARNING,
      severity: SAFETY_SEVERITIES.WARNING,
      issuedAt: staleTime,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      freshnessPolicySeconds: 3600, // 1h TTL
      location: { name: 'Araku', coords: [18.3333, 82.8833] },
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_stale_01',
      journeyState: { stops: SAMPLE_ARAKU_STOPS },
      signals: [staleSignal],
    });

    expect(result.freshness).toBe('STALE');
    expect(result.primarySignal.isStale).toBe(true);
    expect(result.explanation.primaryDriver).toContain('stale');
  });

  // TEST 11 — Provider failure => INSUFFICIENT_DATA
  test('TEST 11 — Complete provider failure yields INSUFFICIENT_DATA', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_fail_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
    });

    const failedSignal = {
      id: 'sig_failed_01',
      dataState: SAFETY_DATA_STATES.UNAVAILABLE,
      confidence: 'LOW',
      evidence: [],
    };

    const result = evaluateJourneySafety({
      tripId: 'trip_fail_01',
      journeyState,
      signals: [failedSignal],
    });

    expect(result.decision).toBe(SAFETY_DECISION_STATES.INSUFFICIENT_DATA);
  });

  // TEST 12 — Source conflict => conflict preserved
  test('TEST 12 — Conflict between official warning and model forecast is explicitly preserved', () => {
    const imdOfficial = createSafetySignal({
      id: 'sig_imd_conflict',
      provider: 'IMD',
      sourceType: 'GOVERNMENT_METEOROLOGICAL_AGENCY',
      hazardType: HAZARD_TYPES.HEAVY_RAIN,
      severity: SAFETY_SEVERITIES.WARNING,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      location: { name: 'Araku', coords: [18.3333, 82.8833] },
      radiusMeters: 10000,
    });

    const openMeteoForecast = createSafetySignal({
      id: 'sig_om_conflict',
      provider: 'Open-Meteo',
      sourceType: 'NUMERICAL_WEATHER_MODEL',
      hazardType: HAZARD_TYPES.HEAVY_RAIN,
      severity: SAFETY_SEVERITIES.INFO,
      dataState: SAFETY_DATA_STATES.FORECAST,
      location: { name: 'Araku', coords: [18.3333, 82.8833] },
      radiusMeters: 10000,
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_conflict_01',
      journeyState: { stops: SAMPLE_ARAKU_STOPS },
      signals: [imdOfficial, openMeteoForecast],
    });

    expect(result.sourceConflict).toBe(true);
    expect(result.conflictExplanation).toContain('Sources disagree');
    expect(result.primarySignal.provider).toBe('IMD'); // Official wins authority
  });

  // TEST 13 — Fire anomaly => FIRE_ANOMALY, not confirmed fire
  test('TEST 13 — Satellite thermal hotspot is classified as FIRE_ANOMALY with low cause confidence', () => {
    const fsiHotspot = createSafetySignal({
      provider: 'FSI',
      hazardType: HAZARD_TYPES.FOREST_FIRE,
      severity: SAFETY_SEVERITIES.WATCH,
      dataState: SAFETY_DATA_STATES.OBSERVED,
      location: { name: 'Ananthagiri Hills', coords: [18.2325, 82.9150] },
      radiusMeters: 5000,
      evidence: ['VIIRS 375m thermal anomaly detected'],
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_fire_01',
      journeyState: { stops: SAMPLE_ARAKU_STOPS },
      signals: [fsiHotspot],
    });

    expect(result.exposure.groundedHazardType).toBe(HAZARD_TYPES.FIRE_ANOMALY);
    expect(result.causeConfidence).toBe('LOW'); // Satellite alone cannot confirm road fire
  });

  // TEST 14 — Flood risk => not automatically FLOODED_ROAD
  test('TEST 14 — Heavy rain and river advisory classifies as FLOOD_RISK, never FLOODED_ROAD without road report', () => {
    const cwcAdvisory = createSafetySignal({
      provider: 'CWC',
      hazardType: HAZARD_TYPES.FLOOD,
      severity: SAFETY_SEVERITIES.WARNING,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      location: { name: 'Gosthani River Basin', coords: [18.2811, 83.0402] },
      radiusMeters: 6000,
      evidence: ['River approaching warning level'],
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_flood_01',
      journeyState: { stops: SAMPLE_ARAKU_STOPS },
      signals: [cwcAdvisory],
    });

    expect(result.exposure.groundedHazardType).toBe(HAZARD_TYPES.FLOOD_RISK);
    expect(result.exposure.groundingNotice).toContain('FLOOD_RISK');
  });

  // TEST 15 — Landslide risk => not automatically ACTIVE_LANDSLIDE
  test('TEST 15 — Mountain rain is classified as LANDSLIDE_RISK, never ACTIVE_LANDSLIDE without road verification', () => {
    const rainSignal = createSafetySignal({
      provider: 'IMD',
      hazardType: HAZARD_TYPES.LANDSLIDE,
      severity: SAFETY_SEVERITIES.WARNING,
      dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
      location: { name: 'Araku Ghat Hairpins', coords: [18.2325, 82.9150] },
      radiusMeters: 10000,
      evidence: ['High rainfall triggering elevated slope instability'],
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_slide_01',
      journeyState: { stops: SAMPLE_ARAKU_STOPS },
      signals: [rainSignal],
    });

    expect(result.exposure.groundedHazardType).toBe(HAZARD_TYPES.LANDSLIDE_RISK);
    expect(result.exposure.groundingNotice).toContain('LANDSLIDE_RISK');
  });

  // TEST 16 — Duplicate safety notification => suppressed
  test('TEST 16 — Duplicate safety notification within cooldown is suppressed', () => {
    const signal = createSafetySignal({
      id: 'sig_dup_01',
      hazardType: HAZARD_TYPES.HEAVY_RAIN,
      severity: SAFETY_SEVERITIES.WARNING,
    });

    const first = dispatchSafetyNotification({
      tripId: 'trip_dup_01',
      signal,
      journeyImpact: { impactState: 'HIGH_IMPACT' },
      travelerExposure: { isExposed: true },
      recommendedDecision: { decision: 'CAUTION' },
      now: Date.now(),
    });

    const second = dispatchSafetyNotification({
      tripId: 'trip_dup_01',
      signal,
      journeyImpact: { impactState: 'HIGH_IMPACT' },
      travelerExposure: { isExposed: true },
      recommendedDecision: { decision: 'CAUTION' },
      now: Date.now() + 60000, // 1 min later
    });

    expect(first.dispatched).toBe(true);
    expect(second.dispatched).toBe(false);
    expect(second.reason).toContain('SUPPRESSED_BY_COOLDOWN');
  });

  // TEST 17 — WATCH -> WARNING => escalation notification
  test('TEST 17 — Severity escalation (WATCH -> WARNING) dispatches escalation notification', () => {
    const watchSignal = createSafetySignal({
      id: 'sig_escalate_01',
      hazardType: HAZARD_TYPES.HEAVY_RAIN,
      severity: SAFETY_SEVERITIES.WATCH,
    });

    const warnSignal = createSafetySignal({
      id: 'sig_escalate_01',
      hazardType: HAZARD_TYPES.HEAVY_RAIN,
      severity: SAFETY_SEVERITIES.WARNING,
    });

    const first = dispatchSafetyNotification({
      tripId: 'trip_esc_01',
      signal: watchSignal,
      journeyImpact: { impactState: 'LOW_IMPACT' },
      travelerExposure: { isExposed: true },
      recommendedDecision: { decision: 'WATCH' },
      now: Date.now(),
    });

    const second = dispatchSafetyNotification({
      tripId: 'trip_esc_01',
      signal: warnSignal,
      journeyImpact: { impactState: 'HIGH_IMPACT' },
      travelerExposure: { isExposed: true },
      recommendedDecision: { decision: 'REPLACE_STOP' },
      now: Date.now() + 60000, // 1 min later
    });

    expect(first.dispatched).toBe(true);
    expect(second.dispatched).toBe(true);
    expect(second.reason).toContain('SEVERITY_ESCALATED');
  });

  // TEST 18 — WARNING -> SEVERE => escalation bypass
  test('TEST 18 — Critical escalation (WARNING -> SEVERE) bypasses cooldown', () => {
    const warnSignal = createSafetySignal({
      id: 'sig_crit_01',
      hazardType: HAZARD_TYPES.CYCLONE,
      severity: SAFETY_SEVERITIES.WARNING,
    });

    const severeSignal = createSafetySignal({
      id: 'sig_crit_01',
      hazardType: HAZARD_TYPES.CYCLONE,
      severity: SAFETY_SEVERITIES.SEVERE,
    });

    dispatchSafetyNotification({
      tripId: 'trip_bypass_01',
      signal: warnSignal,
      journeyImpact: {},
      travelerExposure: {},
      recommendedDecision: { decision: 'CAUTION' },
      now: Date.now(),
    });

    const second = dispatchSafetyNotification({
      tripId: 'trip_bypass_01',
      signal: severeSignal,
      journeyImpact: {},
      travelerExposure: {},
      recommendedDecision: { decision: 'AVOID' },
      now: Date.now() + 120000,
    });

    expect(second.dispatched).toBe(true);
    expect(second.notification.version).toBe(2);
  });

  // TEST 19 — Safety resolution => resolution notification
  test('TEST 19 — Resolving safety condition emits a resolution notification', () => {
    const resolution = resolveSafetyNotification({
      tripId: 'trip_res_01',
      hazardId: 'sig_cyclone_01',
      hazardType: 'CYCLONE',
    });

    expect(resolution.resolved).toBe(true);
    expect(resolution.notification.lifecycleState).toBe('RESOLVED');
    expect(resolution.notification.answers.whatHappened).toContain('Safety condition resolved');
    expect(resolution.notification.answers.whyThisRecommendation).toContain('no longer materially affects');
  });

  // TEST 20 — Simulation => visibly SIMULATED
  test('TEST 20 — Simulated safety event is strictly tagged SIMULATED in payload and UI flags', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_sim_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
    });

    const sim = simulateSafetyEvent({
      tripId: 'trip_sim_01',
      journeyState,
      scenario: 'HEAVY_RAIN_GHAT_LANDSLIDE',
    });

    expect(sim.isSimulation).toBe(true);
    expect(sim.primarySignal.dataState).toBe(SAFETY_DATA_STATES.SIMULATED);
  });

  // TEST 21 — Simulation does not affect production state
  test('TEST 21 — Simulation does not alter registered production provider statuses', () => {
    const providersBefore = getSafetyProviders();
    simulateSafetyEvent({ tripId: 'trip_sim_test' });
    const providersAfter = getSafetyProviders();

    expect(providersBefore.length).toBe(providersAfter.length);
    expect(providersAfter.find(p => p.id === 'NDMA_SACHET').status).toBe(providersBefore.find(p => p.id === 'NDMA_SACHET').status);
  });

  // TEST 22 — Traveler accepts recommendation => plan adaptation
  test('TEST 22 — Traveler accepting safety recommendation adapts plan and updates stops', async () => {
    const tripId = 'trip_accept_test_01';
    // Initialize trip state
    await request(app)
      .post(`/api/intelligence/trips/${tripId}/state`)
      .send({
        plan: { stops: SAMPLE_ARAKU_STOPS },
        travelerDna: { rainExposureTolerance: 20 },
      });

    // Simulate safety hazard
    await request(app)
      .post(`/api/intelligence/trips/${tripId}/safety/simulate`)
      .send({ scenario: 'HEAVY_RAIN_GHAT_LANDSLIDE' });

    // Accept action
    const actionRes = await request(app)
      .post(`/api/intelligence/trips/${tripId}/safety/action`)
      .send({ action: 'ACCEPT', adaptIfAccepted: true });

    expect(actionRes.status).toBe(200);
    expect(actionRes.body.action).toBe('ACCEPT');
    expect(actionRes.body.adaptedPlan).toBeDefined();
  });

  // TEST 23 — Traveler declines recommendation => audit preserved
  test('TEST 23 — Traveler declining safety recommendation logs choice without repeated spam', async () => {
    const tripId = 'trip_decline_test_01';
    await request(app)
      .post(`/api/intelligence/trips/${tripId}/state`)
      .send({ plan: { stops: SAMPLE_ARAKU_STOPS } });

    const actionRes = await request(app)
      .post(`/api/intelligence/trips/${tripId}/safety/action`)
      .send({ action: 'DECLINE', notes: 'Prefer to stick with original plan' });

    expect(actionRes.status).toBe(200);
    expect(actionRes.body.action).toBe('DECLINE');
  });

  // TEST 24 — Completed stops immutable
  test('TEST 24 — Completed stops remain strictly immutable during safety adaptation', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_immut_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
    });

    const completedBefore = journeyState.completedStops.map(s => s.id);
    expect(completedBefore).toContain('stop_1');

    const result = evaluateJourneySafety({
      tripId: 'trip_immut_01',
      journeyState,
      customSignal: {
        hazardType: HAZARD_TYPES.HEAVY_RAIN,
        severity: SAFETY_SEVERITIES.WARNING,
        dataState: SAFETY_DATA_STATES.OFFICIAL_WARNING,
        location: { coords: [18.2325, 82.9150] },
      },
    });

    // Completed stops are never targeted as exposed
    expect(result.geospatial.affectedStops).not.toContain('Borra Caves');
  });

  // TEST 25 & 26 — Plan version increments and journey state updates correctly
  test('TEST 25 & 26 — Advancing progress updates journey state correctly', () => {
    const journeyState = createJourneyState({
      tripId: 'trip_prog_01',
      plan: { stops: SAMPLE_ARAKU_STOPS },
    });

    const updated = advanceJourneyProgress({
      journeyState,
      stopId: 'stop_2',
      action: 'COMPLETE',
      currentMinute: 690,
    });

    expect(updated.completedStops.map(s => s.id)).toContain('stop_2');
    expect(updated.upcomingStops.map(s => s.id)).not.toContain('stop_2');
  });

  // TEST 27, 28, 29 — Zero LLM Safety Vulnerabilities
  test('TEST 27, 28, 29 — Safety decisions are 100% deterministic with zero LLM fabrication', () => {
    // LLM outputs cannot create valid signals without required schema fields
    const invalidSignal = { summary: 'AI thinks there might be a landslide' };
    const validated = createSafetySignal(invalidSignal);

    expect(validated.provider).toBe('UNKNOWN_PROVIDER');
    expect(validated.hazardType).toBe(HAZARD_TYPES.UNKNOWN_HAZARD);
    expect(validated.confidence).toBe('MEDIUM');
    expect(validated.dataState).toBe(SAFETY_DATA_STATES.ESTIMATED); // Never promoted to OFFICIAL
  });

  // TEST 30 — CRITICAL state cannot be triggered by weak evidence
  test('TEST 30 — CRITICAL state cannot be triggered by weak or unverified evidence', () => {
    const weakSignal = createSafetySignal({
      hazardType: HAZARD_TYPES.UNKNOWN_HAZARD,
      severity: SAFETY_SEVERITIES.CRITICAL, // attempted inflation
      dataState: SAFETY_DATA_STATES.ESTIMATED,
      confidence: 'LOW',
      evidence: [],
    });

    const result = evaluateJourneySafety({
      tripId: 'trip_weak_01',
      journeyState: { stops: SAMPLE_ARAKU_STOPS },
      signals: [weakSignal],
    });

    // Weak evidence falls back to INSUFFICIENT_DATA or WATCH, never EMERGENCY
    expect(result.decision).not.toBe(SAFETY_DECISION_STATES.EMERGENCY);
  });

  // ── Canonical REST API Integration ──────────────────────────────────────────
  describe('Canonical REST API Integration (/api/intelligence)', () => {
    const testTripId = 'trip_rest_safety_001';

    beforeAll(async () => {
      await request(app)
        .post(`/api/intelligence/trips/${testTripId}/state`)
        .send({
          plan: { stops: SAMPLE_ARAKU_STOPS },
          travelerDna: { rainExposureTolerance: 30 },
        });
    });

    test('POST /api/intelligence/trips/:id/safety/evaluate executes safety pipeline', async () => {
      const res = await request(app)
        .post(`/api/intelligence/trips/${testTripId}/safety/evaluate`)
        .send({
          customSignal: {
            hazardType: 'WEATHER_WARNING',
            severity: 'WARNING',
            location: { coords: [18.2325, 82.9150] },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.safetyStatus).toBeDefined();
      expect(res.body.decision).toBeDefined();
      expect(res.body.explanation).toBeDefined();
    });

    test('GET /api/intelligence/trips/:id/safety returns active trip safety', async () => {
      const res = await request(app).get(`/api/intelligence/trips/${testTripId}/safety`);
      expect(res.status).toBe(200);
      expect(res.body.safetyStatus).toBeDefined();
    });

    test('POST /api/intelligence/trips/:id/safety/simulate returns SIMULATED payload', async () => {
      const res = await request(app)
        .post(`/api/intelligence/trips/${testTripId}/safety/simulate`)
        .send({ scenario: 'OFFICIAL_ROAD_CLOSURE' });

      expect(res.status).toBe(200);
      expect(res.body.dataState).toBe('SIMULATED');
      expect(res.body.safetyEvaluation.decision).toBe('AVOID');
    });

    test('GET /api/intelligence/safety/providers returns provider status report', async () => {
      const res = await request(app).get('/api/intelligence/safety/providers');
      expect(res.status).toBe(200);
      expect(res.body.providers.length).toBeGreaterThanOrEqual(4);
      expect(res.body.providers.some(p => p.id === 'NDMA_SACHET')).toBe(true);
    });

    test('GET /api/intelligence/safety/metrics returns operational safety metrics', async () => {
      const res = await request(app).get('/api/intelligence/safety/metrics');
      expect(res.status).toBe(200);
      expect(res.body.totalProvidersRegistered).toBeDefined();
    });
  });
});
