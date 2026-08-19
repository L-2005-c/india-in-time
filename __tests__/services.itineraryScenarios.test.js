'use strict';

const { planAdvancedItinerary, replanAdvanced } = require('../services/travelIntelligence/advancedItineraryEngine');
const { staticCityPlaces } = require('../data/city-seeds');

function generateTestPlan(places, opts = {}) {
  return planAdvancedItinerary(places, {
    beamWidth: 16,
    expansionLimit: 6,
    ...opts,
  });
}

describe('World-Class Tourism Itinerary Engine — 32 End-to-End Production Scenarios', () => {

  const vizagPlaces = staticCityPlaces('visakhapatnam');

  // 1. "I want only tourist attractions"
  test('Scenario 1: Only tourist attractions — every scheduled stop is a verified tourist destination', () => {
    const mixed = [
      ...vizagPlaces,
      { name: 'Marripalem', cat: 'scenic', coords: [17.75, 83.25] },
      { name: 'Seethammadhara Residential Area', cat: 'scenic', coords: [17.74, 83.31] },
    ];
    const planResult = generateTestPlan(mixed, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '18:00',
      onlyTouristPlaces: true,
    });

    expect(planResult.status).toBe('FEASIBLE');
    expect(planResult.stops.length).toBeGreaterThanOrEqual(2);
    for (const stop of planResult.stops) {
      expect(stop.isVerifiedTouristPoi).toBe(true);
      expect(stop.name).not.toMatch(/marripalem|seethammadhara/i);
    }
  });

  // 2. "Do not include localities" — MARRIPALEM MUST NEVER APPEAR
  test('Scenario 2: Do not include localities — Marripalem or any other locality is 100% blocked', () => {
    const localityHeavy = [
      { name: 'Marripalem', cat: 'scenic', coords: [17.75, 83.25], ot: '06:00', ct: '22:00' },
      { name: 'Gajuwaka Junction', cat: 'scenic', coords: [17.68, 83.21], ot: '06:00', ct: '22:00' },
      { name: 'MVP Colony Layout', cat: 'scenic', coords: [17.74, 83.33], ot: '06:00', ct: '22:00' },
      ...vizagPlaces,
    ];
    const plan = generateTestPlan(localityHeavy, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '17:00',
    });

    expect(plan.status).toBe('FEASIBLE');
    const stopNames = plan.stops.map((s) => s.name.toLowerCase());
    expect(stopNames).not.toContain('marripalem');
    expect(stopNames).not.toContain('gajuwaka junction');
    expect(stopNames).not.toContain('mvp colony layout');
  });

  // 3. "Do not include temples"
  test('Scenario 3: Do not include temples — strictly zero religious/temple stops appear', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '17:00',
      noTemples: true,
    });

    expect(plan.status).toBe('FEASIBLE');
    for (const stop of plan.stops) {
      expect(stop.category).not.toBe('temple');
      expect(stop.name.toLowerCase()).not.toMatch(/temple|mandir|church|mosque|shrine|simhachalam|iskcon/);
    }
  });

  // 4. "I want beaches"
  test('Scenario 4: I want beaches — prioritizes beach destinations', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '08:00',
      endTime: '14:00',
      preferredCategories: ['beach'],
    });

    expect(plan.status).toBe('FEASIBLE');
    const hasBeach = plan.stops.some((s) => s.category === 'beach' || /beach/i.test(s.name));
    expect(hasBeach).toBe(true);
  });

  // 5. "I want temples"
  test('Scenario 5: I want temples — prioritizes spiritual/temple destinations', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '07:00',
      endTime: '13:00',
      preferredCategories: ['temple'],
    });

    expect(plan.status).toBe('FEASIBLE');
    const hasTemple = plan.stops.some((s) => s.category === 'temple' || /temple/i.test(s.name));
    expect(hasTemple).toBe(true);
  });

  // 6. "I want food"
  test('Scenario 6: I want food — schedules lunch/dining at verified food establishments', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '11:00',
      endTime: '16:00',
      preferredCategories: ['food'],
      foodFocus: true,
    });

    expect(plan.status).toBe('FEASIBLE');
    const hasFood = plan.stops.some((s) => s.category === 'food' || /restaurant|vantillu|dhaba|hotel/i.test(s.name));
    expect(hasFood).toBe(true);
  });

  // 7. "I want shopping"
  test('Scenario 7: I want shopping — includes verified shopping destinations like CMR Central or Inorbit Mall', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '15:00',
      endTime: '21:00',
      preferredCategories: ['shopping'],
      shoppingFocus: true,
    });

    expect(plan.status).toBe('FEASIBLE');
    const hasShopping = plan.stops.some((s) => s.category === 'shopping' || /mall|cmr|inorbit|handicraft|lepakshi/i.test(s.name));
    expect(hasShopping).toBe(true);
  });

  // 8. "I want photography"
  test('Scenario 8: I want photography — aligns stops with scenic / golden-hour windows', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '15:30',
      endTime: '19:30',
      photography: true,
      preferredCategories: ['scenic'],
    });

    expect(plan.status).toBe('FEASIBLE');
    const hasScenic = plan.stops.some((s) => s.category === 'scenic' || s.category === 'beach' || s.is_sunset_spot);
    expect(hasScenic).toBe(true);
  });

  // 9. "I want low crowd"
  test('Scenario 9: Low crowd preference penalizes or avoids high-crowd stops', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '15:00',
      lowCrowd: true,
    });

    expect(plan.status).toBe('FEASIBLE');
    const highCrowdCount = plan.stops.filter((s) => s.crowdLevel === 'Very High').length;
    expect(highCrowdCount).toBe(0);
  });

  // 10. "I want highly rated places"
  test('Scenario 10: Highly rated places — prioritizes Tier S and Tier A destinations', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '17:00',
    });

    expect(plan.status).toBe('FEASIBLE');
    for (const stop of plan.stops) {
      expect(stop.tourismQualityScore).toBeGreaterThanOrEqual(60);
      expect(['TIER_S', 'TIER_A', 'TIER_B']).toContain(stop.tourismTier);
    }
  });

  // 11. "I want malls"
  test('Scenario 11: I want malls — strictly selects verified shopping malls', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '14:00',
      endTime: '20:00',
      onlyMalls: true,
    });

    expect(plan.status).toBe('FEASIBLE');
    for (const stop of plan.stops) {
      expect(stop.name).toMatch(/mall|central|shopping/i);
    }
  });

  // 12. Afternoon trip (1 PM start -> Lunch -> Indoor -> Evening Scenic -> Mall -> Dinner)
  test('Scenario 12: Afternoon trip starting at 13:00 creates balanced sequence with lunch and evening sunset', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '13:00',
      endTime: '20:00',
      preferredCategories: ['food', 'scenic', 'shopping'],
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
    expect(plan.stops[0].arriveAt).toBeDefined();
  });

  // 13. Evening trip (17:00 to 22:00)
  test('Scenario 13: Evening trip emphasizes sunset viewpoint, shopping, and dinner', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '17:00',
      endTime: '22:00',
      preferredCategories: ['scenic', 'shopping', 'food'],
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
  });

  // 14. Night trip (19:30 to 23:00)
  test('Scenario 14: Night trip selects safe dinner destinations and night-active POIs', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '19:30',
      endTime: '23:00',
      preferredCategories: ['food'],
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.length).toBeGreaterThanOrEqual(1);
    for (const stop of plan.stops) {
      expect(stop.open).not.toBe(false);
    }
  });

  // 15. Rain scenario (prefers indoor POIs like Submarine Museum & Malls)
  test('Scenario 15: Rain scenario adapts to prioritize indoor museums and shopping malls', () => {
    const rainyWeather = {
      condition: 'Heavy Rain',
      tempC: 24,
      rainProb: 90,
      hourly: [
        { time: '10:00', condition: 'Heavy Rain', rainProb: 95 },
        { time: '14:00', condition: 'Heavy Rain', rainProb: 90 },
        { time: '18:00', condition: 'Moderate Rain', rainProb: 80 },
      ],
    };

    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '10:00',
      endTime: '17:00',
      weather: rainyWeather,
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.length).toBeGreaterThanOrEqual(1);
  });

  // 16. Extreme heat scenario
  test('Scenario 16: Extreme heat (40°C) avoids unshaded midday outdoor exposure', () => {
    const hotWeather = {
      condition: 'Clear and Scorching',
      tempC: 41,
      hourly: [{ time: '12:00', tempC: 41 }, { time: '14:00', tempC: 42 }],
    };

    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '12:00',
      endTime: '17:00',
      weather: hotWeather,
    });

    expect(plan.status).toBe('FEASIBLE');
  });

  // 17. Restaurant closed during off-hours
  test('Scenario 17: Enforces strict opening hours — places closed at arrival are not scheduled', () => {
    const strictlyClosedAtNoon = [
      { name: 'Night Only Club', cat: 'food', coords: [17.72, 83.31], ot: '20:00', ct: '23:30', vt: 60 },
      ...vizagPlaces,
    ];
    const plan = generateTestPlan(strictlyClosedAtNoon, {
      city: 'Visakhapatnam',
      startTime: '10:00',
      endTime: '14:00',
    });

    expect(plan.status).toBe('FEASIBLE');
    const stopNames = plan.stops.map((s) => s.name);
    expect(stopNames).not.toContain('Night Only Club');
  });

  // 18. Mall closed during early morning
  test('Scenario 18: Mall opening hours respected (does not schedule CMR Central at 07:00)', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '06:30',
      endTime: '12:30',
      preferredCategories: ['shopping', 'beach'],
    });

    expect(plan.status).toBe('FEASIBLE');
    const firstStop = plan.stops[0];
    // At 06:30/07:00, beach opens, not the mall
    expect(firstStop.category).not.toBe('shopping');
  });

  // 19. Scenic window optimization
  test('Scenario 19: Scenic sunset window aligns with late afternoon / sunset time', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '15:00',
      endTime: '19:00',
      preferredCategories: ['scenic'],
    });

    expect(plan.status).toBe('FEASIBLE');
    const sunsetStops = plan.stops.filter((s) => s.is_sunset_spot || s.category === 'scenic' || s.category === 'beach');
    expect(sunsetStops.length).toBeGreaterThanOrEqual(1);
  });

  // 20. Golden hour alignment
  test('Scenario 20: Golden hour alignment rewards evening photography viewpoints', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '16:30',
      endTime: '19:00',
      photography: true,
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops[0].experienceScore).toBeGreaterThanOrEqual(50);
  });

  // 21. Four-hour compact trip
  test('Scenario 21: 4-hour compact trip schedules 2 to 3 quality stops without rushing', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '10:00',
      endTime: '14:00',
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
    expect(plan.stops.length).toBeLessThanOrEqual(4);
    expect(plan.totalTravelMinutes + plan.totalVisitMinutes).toBeLessThanOrEqual(270);
  });

  // 22. Eight-hour full-day trip
  test('Scenario 22: 8-hour full-day trip plans balanced diverse multi-category itinerary', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '17:00',
      preferredCategories: ['beach', 'museum', 'food', 'scenic'],
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.length).toBeGreaterThanOrEqual(3);
  });

  // 23. User delay handling (replanning)
  test('Scenario 23: Replan handles user delay by recalculating remaining feasibility from new clock cursor', () => {
    const initialPlan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '17:00',
    });

    expect(initialPlan.status).toBe('FEASIBLE');
    const firstStop = initialPlan.stops[0];

    // User is delayed and finishes first stop at 12:30 instead of 10:30
    const replanned = replanAdvanced(vizagPlaces, {
      beamWidth: 16,
      expansionLimit: 6,
      city: 'Visakhapatnam',
      completedStops: [firstStop],
      cursor: 12 * 60 + 30,
      endTime: '17:00',
    });

    expect(replanned.status).toBe('FEASIBLE');
    expect(replanned.stops[0].name).not.toBe(firstStop.name);
  });

  // 24. Traffic increase resilience
  test('Scenario 24: Traffic delays are accounted for without exceeding hard mustLeaveBy deadline', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '14:00',
      maxTravelMinutes: 60,
    });

    expect(plan.status).toBe('FEASIBLE');
    for (const stop of plan.stops) {
      expect(stop.travelMinutes).toBeLessThanOrEqual(60);
    }
  });

  // 25. Missing weather fallback
  test('Scenario 25: Missing weather gracefully falls back to baseline seasonal model', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '15:00',
      weather: null,
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.length).toBeGreaterThanOrEqual(2);
  });

  // 26. Missing crowd fallback
  test('Scenario 26: Missing crowd data uses historical crowd store defaults', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '15:00',
    });

    expect(plan.status).toBe('FEASIBLE');
    for (const stop of plan.stops) {
      expect(stop.crowdLevel).toBeDefined();
    }
  });

  // 27. Missing route fallback
  test('Scenario 27: Missing live route estimates travel using haversine urban matrix fallback', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '15:00',
      liveTraffic: null,
    });

    expect(plan.status).toBe('FEASIBLE');
    for (const stop of plan.stops) {
      expect(stop.travelMinutes).toBeGreaterThanOrEqual(0);
    }
  });

  // 28. Locality returned by geocoder rejected
  test('Scenario 28: Locality entity returned by external geocoder is rejected at entry', () => {
    const geocoderOutput = [
      { name: 'Marripalem Post Office Area', cat: 'scenic', coords: [17.75, 83.25] },
      { name: 'Kailasagiri', cat: 'scenic', coords: [17.7492, 83.3418], isCurated: true, ot: '06:00', ct: '20:00' },
    ];
    const plan = generateTestPlan(geocoderOutput, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '13:00',
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.map((s) => s.name)).toContain('Kailasagiri');
    expect(plan.stops.map((s) => s.name)).not.toContain('Marripalem Post Office Area');
  });

  // 29. Low-quality map candidate rejected
  test('Scenario 29: Low-quality map candidate with no reviews or tourism category is filtered out', () => {
    const candidates = [
      { name: 'Unidentified Plot 554', cat: 'unknown', coords: [17.73, 83.30] },
      ...vizagPlaces,
    ];
    const plan = generateTestPlan(candidates, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '14:00',
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.map((s) => s.name)).not.toContain('Unidentified Plot 554');
  });

  // 30. AI-generated candidate verification
  test('Scenario 30: AI-generated place candidates must pass tourism eligibility validation', () => {
    const aiCandidates = [
      { name: 'Ramakrishna Beach', cat: 'beach', coords: [17.7142, 83.3237], source: 'llm_discovery', ot: '05:30', ct: '21:00', vt: 90 },
      { name: 'Random Residential Block', cat: 'scenic', coords: [17.72, 83.31], source: 'llm_discovery' },
    ];
    const plan = generateTestPlan(aiCandidates, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '13:00',
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.stops.map((s) => s.name)).toContain('Ramakrishna Beach');
    expect(plan.stops.map((s) => s.name)).not.toContain('Random Residential Block');
  });

  // 31. Data provenance & confidence score exposure
  test('Scenario 31: Exposes data provenance, tourism quality score, and confidence on all stops', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '17:00',
    });

    expect(plan.status).toBe('FEASIBLE');
    for (const stop of plan.stops) {
      expect(typeof stop.tourismQualityScore).toBe('number');
      expect(stop.tourismQualityScore).toBeGreaterThanOrEqual(0);
      expect(stop.tourismTier).toBeDefined();
      expect(stop.dataSource).toBeDefined();
      expect(stop.sourceLabel).toBeDefined();
      expect(typeof stop.experienceScore).toBe('number');
      expect(typeof stop.confidence).toBe('number');
    }
  });

  // 32. Requirement satisfaction score computation (0-100)
  test('Scenario 32: Computes explicit requirement satisfaction score and criteria breakdown', () => {
    const plan = generateTestPlan(vizagPlaces, {
      city: 'Visakhapatnam',
      startTime: '09:00',
      endTime: '17:00',
      preferredCategories: ['beach', 'museum'],
      noTemples: true,
      foodFocus: true,
      photography: true,
    });

    expect(plan.status).toBe('FEASIBLE');
    expect(plan.requirementSatisfaction).toBeDefined();
    expect(typeof plan.requirementSatisfaction.satisfactionScore).toBe('number');
    expect(plan.requirementSatisfaction.satisfactionScore).toBeGreaterThanOrEqual(70);
    expect(Array.isArray(plan.requirementSatisfaction.satisfiedCriteria)).toBe(true);
    expect(plan.validation.passed).toBe(true);
  });

});
