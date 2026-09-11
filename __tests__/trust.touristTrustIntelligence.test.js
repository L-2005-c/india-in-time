/**
 * __tests__/trust.touristTrustIntelligence.test.js
 *
 * India In-Time v3.0 Phase 5 — Tourist Trust Intelligence Test Suite
 * 27 Black-Box Verification Scenarios (Prompt Sections 57 to 77)
 */

const {
  TrustEntityResolver,
  MATCH_STATES,
  TrustEvidenceGraph,
  SOURCE_CLASSES,
  FRESHNESS_STATES,
  nidhiAdapter,
  fssaiAdapter,
  gstinAdapter,
  ProviderLegitimacyEngine,
  PROVIDER_TRUST_STATES,
  PriceTrustEngine,
  TRANSPARENCY_TIERS,
  PRICE_TRUST_STATES,
  ReviewTrustEngine,
  REVIEW_TRUST_STATES,
  RouteTrustEngine,
  ROUTE_TRUST_STATES,
  RecommendationTrustEngine,
  RECOMMENDATION_TRUST_STATES,
  TouristTrustEngine,
  TRUST_STATES,
  trustOutcomeTracker,
  trustObservability
} = require('../services/travelIntelligence/trust');

describe('Phase 5: Tourist Trust Intelligence Test Suite', () => {
  let resolver;
  let evidenceGraph;
  let providerEngine;
  let priceEngine;
  let reviewEngine;
  let routeEngine;
  let recommendationEngine;
  let touristTrustEngine;

  beforeEach(() => {
    resolver = new TrustEntityResolver();
    evidenceGraph = new TrustEvidenceGraph();
    providerEngine = new ProviderLegitimacyEngine();
    priceEngine = new PriceTrustEngine();
    reviewEngine = new ReviewTrustEngine();
    routeEngine = new RouteTrustEngine();
    recommendationEngine = new RecommendationTrustEngine();
    touristTrustEngine = new TouristTrustEngine();
    trustOutcomeTracker.reset();
    trustObservability.reset();
  });

  // ==========================================================================
  // SECTION 57: ENTITY RESOLUTION & IDENTITY INTEGRITY (Scenarios 1 - 4)
  // ==========================================================================

  test('1. Entity Resolution: Exact match within same city', () => {
    const input = { name: 'Kailasagiri Hilltop Park', city: 'Visakhapatnam', lat: 17.749, lon: 83.342 };
    const candidates = [
      { id: 'place_kg_1', name: 'Kailasagiri Park', city: 'Visakhapatnam', lat: 17.7492, lon: 83.3421 },
      { id: 'place_sub_2', name: 'INS Kursura Submarine', city: 'Visakhapatnam', lat: 17.717, lon: 83.332 }
    ];

    const result = resolver.resolveEntity(input, candidates);
    expect(result.matchState).toBe(MATCH_STATES.EXACT_MATCH);
    expect(result.matchedEntity.id).toBe('place_kg_1');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('2. Entity Resolution: Cross-city collision protection (Hyderabad Charminar vs Vizag Charminar)', () => {
    const hydInput = { name: 'Charminar Cafe', city: 'Hyderabad', lat: 17.3616, lon: 78.4747 };
    const candidates = [
      { id: 'vizag_cafe', name: 'Charminar Cafe', city: 'Visakhapatnam', lat: 17.72, lon: 83.31 }
    ];

    const result = resolver.resolveEntity(hydInput, candidates);
    // MUST NOT merge across different cities even with identical names
    expect(result.matchState).not.toBe(MATCH_STATES.EXACT_MATCH);
    expect(result.matchState).not.toBe(MATCH_STATES.HIGH_CONFIDENCE_MATCH);
    expect([MATCH_STATES.CONFLICTED, MATCH_STATES.UNRESOLVED]).toContain(result.matchState);
    expect(result.matchedEntity).toBeNull();
  });

  test('3. Entity Resolution: Spatial proximity within 200m match', () => {
    // 17.7170 to 17.7175 is ~55 meters
    const input = { name: 'Submarine Museum', city: 'Visakhapatnam', lat: 17.7170, lon: 83.3320 };
    const candidates = [
      { id: 'sub_mus', name: 'INS Kursura Submarine Museum', city: 'Visakhapatnam', lat: 17.7175, lon: 83.3322 }
    ];

    const result = resolver.resolveEntity(input, candidates);
    expect([MATCH_STATES.EXACT_MATCH, MATCH_STATES.HIGH_CONFIDENCE_MATCH]).toContain(result.matchState);
    expect(result.matchedEntity.id).toBe('sub_mus');
    expect(result.spatialDistanceMeters).toBeLessThanOrEqual(200);
  });

  test('4. Entity Resolution: Unresolved ambiguous candidates with multiple partial matches', () => {
    const input = { name: 'Sai Residency', city: 'Visakhapatnam', lat: 17.70, lon: 83.30 };
    const candidates = [
      { id: 'res_1', name: 'Hotel Sri Sai Residency', city: 'Visakhapatnam', lat: 17.76, lon: 83.35 },
      { id: 'res_2', name: 'Sai Residency Guesthouse', city: 'Visakhapatnam', lat: 17.65, lon: 83.25 }
    ];

    const result = resolver.resolveEntity(input, candidates);
    expect([MATCH_STATES.CONFLICTED, MATCH_STATES.UNRESOLVED, MATCH_STATES.POSSIBLE_MATCH]).toContain(result.matchState);
    expect(result.confidence).toBeLessThan(0.7);
  });

  // ==========================================================================
  // SECTION 58: EVIDENCE GRAPH & PROVENANCE (Scenarios 5 - 8)
  // ==========================================================================

  test('5. Evidence Graph: Multiple claims and sources for an entity', () => {
    const claim1 = evidenceGraph.addClaim('entity_borra', 'OPERATING_HOURS', '10:00 - 17:00');
    evidenceGraph.addEvidence(claim1.id, {
      sourceClass: SOURCE_CLASSES.GOVERNMENT_REGISTRY,
      sourceName: 'AP Tourism Department Schedule'
    });

    const claim2 = evidenceGraph.addClaim('entity_borra', 'ENTRY_FEE', '₹80 per adult');
    evidenceGraph.addEvidence(claim2.id, {
      sourceClass: SOURCE_CLASSES.MUNICIPAL_FEED,
      sourceName: 'District Tourism Portal'
    });

    const claims = evidenceGraph.getClaimsForEntity('entity_borra');
    expect(claims.length).toBe(2);
    expect(claims[0].evidence.length).toBe(1);
    expect(claims[1].evidence.length).toBe(1);
  });

  test('6. Evidence Graph: Source class provenance tagging (11 source classes)', () => {
    const claim = evidenceGraph.addClaim('entity_1', 'SAFETY_STATUS', 'ALL_CLEAR');
    const ev = evidenceGraph.addEvidence(claim.id, {
      sourceClass: SOURCE_CLASSES.OFFICIAL_SAFETY_ALERT,
      sourceName: 'NDMA SACHET Alert'
    });

    expect(ev.sourceClass).toBe('OFFICIAL_SAFETY_ALERT');
    expect(evidenceGraph.isEvidenceVerified(claim.id)).toBe(true);
  });

  test('7. Evidence Graph: Contradicting claims preserved without erasure', () => {
    const claimA = evidenceGraph.addClaim('entity_hotel', 'TARIFF', '₹2,500/night');
    evidenceGraph.addEvidence(claimA.id, {
      sourceClass: SOURCE_CLASSES.COMMERCIAL_PLATFORM,
      sourceName: 'Booking Partner A'
    });

    const claimB = evidenceGraph.addClaim('entity_hotel', 'TARIFF', '₹4,800/night');
    evidenceGraph.addEvidence(claimB.id, {
      sourceClass: SOURCE_CLASSES.USER_REPORTED,
      sourceName: 'Direct Walk-in Traveler'
    });

    const claims = evidenceGraph.getClaimsForEntity('entity_hotel');
    expect(claims.length).toBe(2);
    expect(claims.map(c => c.value)).toContain('₹2,500/night');
    expect(claims.map(c => c.value)).toContain('₹4,800/night');
  });

  test('8. Evidence Graph: Freshness states (CURRENT, AGING, STALE, EXPIRED)', () => {
    const now = new Date();
    const claim = evidenceGraph.addClaim('entity_freshness', 'STATUS', 'OPEN');

    const freshEv = evidenceGraph.addEvidence(claim.id, {
      sourceClass: SOURCE_CLASSES.OPERATIONAL_TELEMETRY,
      sourceName: 'Sensor',
      capturedAt: now.toISOString()
    });
    expect(freshEv.freshnessState).toBe(FRESHNESS_STATES.CURRENT);

    const staleEv = evidenceGraph.addEvidence(claim.id, {
      sourceClass: SOURCE_CLASSES.OPERATIONAL_TELEMETRY,
      sourceName: 'Old Sensor',
      capturedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    });
    expect(staleEv.freshnessState).toBe(FRESHNESS_STATES.STALE);
  });

  // ==========================================================================
  // SECTION 59: OFFICIAL REGISTRY VERIFICATION (Scenarios 9 - 12)
  // ==========================================================================

  test('9. Official Registry: NIDHI+ verified provider returns TOURISM_RECOGNITION_VERIFIED with truthful phrasing', async () => {
    const res = await nidhiAdapter.verifyNidhiRegistration('MOT-AP-98124', {
      providerName: 'Araku Valley Eco Resort'
    });

    expect(res.verified).toBe(true);
    expect(res.status).toBe('TOURISM_RECOGNITION_VERIFIED');
    expect(res.phrasing).toContain('Ministry of Tourism');
    // Must NOT state "government approved" or "guaranteed high quality"
    expect(res.phrasing).not.toContain('government approved business');
  });

  test('10. Official Registry: FSSAI 14-digit validation and registration status', async () => {
    const validResult = await fssaiAdapter.verifyFssaiLicense('10123456789012', {
      businessName: 'Dolphin Heritage Restaurant'
    });
    expect(validResult.verified).toBe(true);
    expect(validResult.status).toBe('FSSAI_REGISTRATION_VERIFIED');
    expect(validResult.phrasing).toContain('FSSAI registration status verified');
    // Must NOT claim "food is guaranteed safe"
    expect(validResult.phrasing).not.toContain('guaranteed safe');

    const invalidResult = await fssaiAdapter.verifyFssaiLicense('12345', {
      businessName: 'Random Cafe'
    });
    expect(invalidResult.verified).toBe(false);
    expect(invalidResult.status).toBe('INVALID_REGISTRATION_FORMAT');
  });

  test('11. Official Registry: GSTIN 15-character validation and registration status', async () => {
    const validGstin = await gstinAdapter.verifyGstin('37AAAAA0000A1Z5', {
      tradeName: 'Vizag Coastal Travels'
    });
    expect(validGstin.verified).toBe(true);
    expect(validGstin.status).toBe('GST_REGISTRATION_VERIFIED');
    expect(validGstin.phrasing).toContain('GST tax registration evidence');
    // Must NOT guarantee fair pricing
    expect(validGstin.phrasing).not.toContain('fair pricing guaranteed');

    const invalidGstin = await gstinAdapter.verifyGstin('INVALID_GSTIN');
    expect(invalidGstin.verified).toBe(false);
  });

  test('12. Official Registry: Service outage produces VERIFICATION_UNAVAILABLE (never UNTRUSTED/SCAM)', async () => {
    const result = await nidhiAdapter.verifyNidhiRegistration('OUTAGE_TEST_ID', {
      simulateOutage: true
    });

    expect(result.verified).toBe(false);
    expect(result.status).toBe('VERIFICATION_UNAVAILABLE');
    // CRITICAL: Must never equate outage with fraud or scam
    expect(result.phrasing).toContain('Digital registry connection temporarily unavailable');
    expect(result.phrasing).not.toContain('UNTRUSTED');
    expect(result.phrasing).not.toContain('SCAM');
  });

  // ==========================================================================
  // SECTION 60: PROVIDER LEGITIMACY ENGINE (Scenarios 13 - 14)
  // ==========================================================================

  test('13. Provider Legitimacy: Unregistered local guide classified as UNVERIFIED with neutral notice, NOT scam', async () => {
    const guide = {
      id: 'guide_ramesh',
      name: 'Ramesh Kumar Heritage Walks',
      type: 'LOCAL_GUIDE',
      city: 'Visakhapatnam',
      yearsOperating: 4,
      phone: '+91 98480 12345'
    };

    const res = await providerEngine.evaluateProvider(guide);
    expect(res.trustState).toBe(PROVIDER_TRUST_STATES.UNVERIFIED);
    expect(res.neutralAdvisory).toContain('This guide is not listed in central digital registries');
    expect(res.summary).not.toContain('FRAUD');
    expect(res.summary).not.toContain('SCAM');
  });

  test('14. Provider Legitimacy: Mismatched claimed credentials classified as CONFLICTED', async () => {
    const shadyProvider = {
      id: 'prov_mismatch',
      name: 'Sunrise Holiday Travels',
      claimedRegistrations: [
        { scheme: 'NIDHI+', id: 'MOT-DEL-11001', resolvedName: 'Delhi Heritage Palace', mismatchDetected: true }
      ]
    };

    const res = await providerEngine.evaluateProvider(shadyProvider);
    expect(res.trustState).toBe(PROVIDER_TRUST_STATES.CONFLICTED);
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.conflicts[0].type).toBe('REGISTRATION_MISMATCH');
  });

  // ==========================================================================
  // SECTION 61: PRICE TRUST ENGINE & DECOMPOSITION (Scenarios 15 - 19)
  // ==========================================================================

  test('15. Price Trust: 11-component decomposition with HIGH transparency tier', () => {
    const quote = {
      basePrice: 500,
      taxes: 90,
      fees: 25,
      serviceCharge: 0,
      mandatoryExtras: 50,
      currency: 'INR'
    };

    const res = priceEngine.evaluatePrice(quote);
    expect(res.transparencyTier).toBe(TRANSPARENCY_TIERS.HIGH);
    expect(res.knownTotal).toBe(665);
    expect(res.components.basePrice).toBe(500);
    expect(res.components.taxes).toBe(90);
  });

  test('16. Price Trust: Single lump-sum quote classified as LOW transparency tier', () => {
    const quote = {
      total: 1200,
      currency: 'INR'
    };

    const res = priceEngine.evaluatePrice(quote);
    expect(res.transparencyTier).toBe(TRANSPARENCY_TIERS.LOW);
    expect(res.trustState).toBe(PRICE_TRUST_STATES.OPAQUE_PRICING);
    expect(res.pricingAdvice).toContain('Single lump-sum quote provided');
  });

  test('17. Price Trust: Peak season festival surge classified as SURGE_ACTIVE (never scam/ripoff)', () => {
    const quote = { basePrice: 2000, total: 2000 };
    const benchmark = {
      medianPrice: 900,
      isPeakSeason: true,
      peakReason: 'Diwali Festival Peak'
    };

    const res = priceEngine.evaluatePrice(quote, benchmark);
    expect(res.trustState).toBe(PRICE_TRUST_STATES.SURGE_ACTIVE);
    expect(res.pricingAdvice).toContain('Diwali Festival Peak');
    // Must NOT label surge as scam or rip-off
    expect(res.pricingAdvice).not.toContain('scam');
    expect(res.pricingAdvice).not.toContain('ripoff');
  });

  test('18. Price Trust: Official ASI dual pricing domestic vs foreign classified as OFFICIAL_DUAL_PRICING', () => {
    const foreignQuote = { basePrice: 550, total: 550, foreignNationalMarkup: 500 };
    const benchmark = {
      isAsiMonument: true,
      officialTicketTiers: { domestic: 50, foreign: 550 }
    };

    const res = priceEngine.evaluatePrice(foreignQuote, benchmark);
    const hasDualPricingObs = res.observations.some(o => o.type === 'OFFICIAL_DUAL_PRICING');
    expect(hasDualPricingObs).toBe(true);
    expect(res.disclosures[0]).toContain('Official ASI regulated ticket tiers');
  });

  test('19. Price Trust: Unexplained 3x price elevation classified as ELEVATED_UNEXPLAINED / PRICE_ANOMALY', () => {
    const quote = { total: 3000 };
    const benchmark = {
      medianPrice: 1000,
      isPeakSeason: false // Off-peak, no event
    };

    const res = priceEngine.evaluatePrice(quote, benchmark);
    expect(res.trustState).toBe(PRICE_TRUST_STATES.ELEVATED_UNEXPLAINED);
    const hasAnomaly = res.observations.some(o => o.type === 'PRICE_ANOMALY');
    expect(hasAnomaly).toBe(true);
    expect(res.pricingAdvice).toContain('above comparable historical medians');
  });

  // ==========================================================================
  // SECTION 62: REVIEW TRUST ENGINE (Scenarios 20 - 22)
  // ==========================================================================

  test('20. Review Trust: Contextual volume for remote destination (5 reviews) recognized as sufficient/meaningful', () => {
    const reviews = [
      { rating: 5, date: '2026-08-01' },
      { rating: 4, date: '2026-08-05' },
      { rating: 5, date: '2026-08-10' },
      { rating: 4, date: '2026-08-15' },
      { rating: 5, date: '2026-08-20' }
    ];

    const res = reviewEngine.evaluateReviews({ reviews }, { isRemoteLocation: true });
    expect(res.trustState).not.toBe(REVIEW_TRUST_STATES.INSUFFICIENT_DATA);
    expect(res.signals.totalReviews).toBe(5);
  });

  test('21. Review Trust: Recency weighting and trend shift detection (last 90 days decline labeled TREND_CHANGE)', () => {
    const now = new Date();
    const reviews = [
      // Historical (all 5-star)
      { rating: 5, date: new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000).toISOString() },
      { rating: 5, date: new Date(now.getTime() - 210 * 24 * 60 * 60 * 1000).toISOString() },
      { rating: 5, date: new Date(now.getTime() - 220 * 24 * 60 * 60 * 1000).toISOString() },
      // Recent (deteriorated to 2-star)
      { rating: 2, date: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() },
      { rating: 2, date: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString() },
      { rating: 2, date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() }
    ];

    const res = reviewEngine.evaluateReviews({ reviews });
    expect(res.trustState).toBe(REVIEW_TRUST_STATES.RECENT_TREND_CHANGE);
    expect(res.signals.trendShiftDetected).toBe(true);
    expect(res.signals.trendShiftDirection).toBe('DECLINING');
    expect(res.summary).not.toContain('BUSINESS_IS_BAD');
  });

  test('22. Review Trust: Temporal burst clustering (60% reviews in 48h) labeled SIGNAL_ANOMALY', () => {
    const now = new Date();
    const baseTime = now.getTime() - 10 * 24 * 60 * 60 * 1000;
    const reviews = [
      // 6 reviews within 12 hours
      { rating: 5, date: new Date(baseTime + 1 * 3600000).toISOString() },
      { rating: 5, date: new Date(baseTime + 2 * 3600000).toISOString() },
      { rating: 5, date: new Date(baseTime + 3 * 3600000).toISOString() },
      { rating: 5, date: new Date(baseTime + 4 * 3600000).toISOString() },
      { rating: 5, date: new Date(baseTime + 5 * 3600000).toISOString() },
      { rating: 5, date: new Date(baseTime + 6 * 3600000).toISOString() },
      // 2 spaced reviews
      { rating: 4, date: new Date(baseTime - 30 * 24 * 3600000).toISOString() },
      { rating: 4, date: new Date(baseTime - 60 * 24 * 3600000).toISOString() }
    ];

    const res = reviewEngine.evaluateReviews({ reviews });
    const hasBurst = res.observations.some(o => o.type === 'TEMPORAL_BURST_ANOMALY');
    expect(hasBurst).toBe(true);
    // Never label "fake reviews" or "fraud"
    expect(res.summary).not.toContain('fake reviews');
    expect(res.summary).not.toContain('fraud');
  });

  // ==========================================================================
  // SECTION 63: ROUTE TRUST ENGINE & CONFLICT RESOLUTION (Scenarios 23 - 24)
  // ==========================================================================

  test('23. Route Trust: Map says OPEN, but official closure signal active -> ROUTE_CONFLICT', () => {
    const routeData = {
      origin: 'Visakhapatnam',
      destination: 'Bheemili Beach',
      mapEngineStatus: 'OPEN',
      officialSignals: {
        roadClosures: [{ road: 'Beach Road Segment B', status: 'CLOSED', isClosed: true }]
      }
    };

    const res = routeEngine.evaluateRoute(routeData);
    expect(res.trustState).toBe(ROUTE_TRUST_STATES.ROUTE_CONFLICT);
    expect(res.isPassable).toBe(false);
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.conflicts[0].type).toBe('MAP_OFFICIAL_DISCREPANCY');
  });

  test('24. Route Trust: Seasonal high-altitude Himalayan winter closure -> OFFICIALLY_CLOSED', () => {
    const routeData = {
      origin: 'Manali',
      destination: 'Leh',
      waypoints: ['Rohtang Pass'],
      travelDate: '2026-01-15' // January (winter closure month for Rohtang)
    };

    const res = routeEngine.evaluateRoute(routeData);
    expect(res.trustState).toBe(ROUTE_TRUST_STATES.OFFICIALLY_CLOSED);
    expect(res.isPassable).toBe(false);
    expect(res.advisories[0]).toContain('seasonal winter snow closure');
  });

  // ==========================================================================
  // SECTION 64: RECOMMENDATION TRUST & INVARIANT HIERARCHY (Scenarios 25 - 27)
  // ==========================================================================

  test('25. Recommendation Trust: Ungrounded recommendation without independent corroboration cannot produce HIGH_CONFIDENCE', () => {
    const rec = {
      id: 'rec_ungrounded',
      title: 'Secret Sunset Viewpoint',
      evidenceItems: [] // No verified facts
    };

    const res = recommendationEngine.evaluateRecommendation(rec);
    expect(res.trustState).not.toBe(RECOMMENDATION_TRUST_STATES.HIGH_CONFIDENCE);
    expect(res.confidenceScore).toBeLessThan(0.6);
  });

  test('26. Invariant Hierarchy: Phase 3 Safety AVOID directive overrides Trust state to HIGH_RISK', async () => {
    const candidate = {
      id: 'place_rk_beach',
      name: 'RK Beach Promenade',
      type: 'PLACE',
      providerInfo: {
        name: 'AP Tourism Beach Resort',
        nidhiId: 'MOT-AP-98124' // Highly trusted provider
      }
    };

    const context = {
      safetyAssessment: {
        action: 'AVOID',
        riskLevel: 'HIGH',
        summary: 'Cyclone sea-surge red warning issued for coastal stretch.'
      }
    };

    const res = await touristTrustEngine.evaluateTrust(candidate, context);
    // SAFETY > TRUST invariant
    expect(res.overallTrustState).toBe(TRUST_STATES.HIGH_RISK);
    expect(res.safetyOverrideActive).toBe(true);
    expect(res.explainability.canITrustThis).toContain('Active Safety Restriction');
  });

  test('27. LLM Guardrails: Evidence from LLM_DERIVED alone cannot satisfy factual verification or high confidence', () => {
    const recWithLlm = {
      id: 'rec_llm',
      title: 'AI Suggested Tea Stall',
      evidenceItems: [
        { claim: 'Best ginger chai in town', sourceClass: 'LLM_DERIVED' }
      ]
    };

    const res = recommendationEngine.evaluateRecommendation(recWithLlm);
    expect(res.trustState).not.toBe(RECOMMENDATION_TRUST_STATES.HIGH_CONFIDENCE);
    expect(res.knownUnknowns.some(u => u.includes('LLM derivation'))).toBe(true);
  });
});
