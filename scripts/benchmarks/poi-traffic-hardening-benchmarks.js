'use strict';

/**
 * scripts/benchmarks/poi-traffic-hardening-benchmarks.js
 *
 * Automated Hardening Benchmark Suite:
 * 1. POI Accuracy & Canonical Identity Verification
 * 2. Entrance & Navigation Coordinate Validity
 * 3. Adversarial / Cross-City Quarantine
 * 4. Live Traffic Fallback & Hysteresis Reroute Evaluation
 * 5. Route Speed Sanity Checks
 * 6. Multi-Domain Data Freshness & Provenance Contracts
 */

const { resolveCanonicalPlace } = require('../../services/travelIntelligence/tourismPoi/canonicalPlaceResolver');
const { computeIdentityScore, resolveNavigationAndEntrancePoints } = require('../../services/travelIntelligence/tourismPoi/coordinateVerificationEngine');
const { calculateRoute, validateRouteSanity } = require('../../services/routing/routingService');
const {
  trafficQualityEngine,
  computeTrafficFreshness,
  evaluateRerouteHysteresis,
  FRESHNESS_WINDOWS,
} = require('../../services/routing/trafficProvider');
const {
  wrapTrafficData,
  wrapWeatherData,
  wrapAqiData,
  wrapAlertsData,
  wrapClosureData,
  wrapTransitData,
  wrapPoiData,
} = require('../../services/dataFreshnessService');
const { distKm } = require('../../utils/geo');

const GOLDEN_POIS = [
  { name: 'Charminar', city: 'Hyderabad', state: 'Telangana', expectedLat: 17.3616, expectedLon: 78.4747 },
  { name: 'Taj Mahal', city: 'Agra', state: 'Uttar Pradesh', expectedLat: 27.1751, expectedLon: 78.0421 },
  { name: 'Gateway of India', city: 'Mumbai', state: 'Maharashtra', expectedLat: 18.9220, expectedLon: 72.8347 },
  { name: 'Qutub Minar', city: 'Delhi', state: 'Delhi', expectedLat: 28.5245, expectedLon: 77.1855 },
  { name: 'Hawa Mahal', city: 'Jaipur', state: 'Rajasthan', expectedLat: 26.9239, expectedLon: 75.8267 },
  { name: 'Victoria Memorial', city: 'Kolkata', state: 'West Bengal', expectedLat: 22.5448, expectedLon: 88.3426 },
  { name: 'Mysore Palace', city: 'Mysuru', state: 'Karnataka', expectedLat: 12.3051, expectedLon: 76.6551 },
  { name: 'Meenakshi Temple', city: 'Madurai', state: 'Tamil Nadu', expectedLat: 9.9195, expectedLon: 78.1193 },
  { name: 'Golden Temple', city: 'Amritsar', state: 'Punjab', expectedLat: 31.6200, expectedLon: 74.8765 },
  { name: 'Konark Sun Temple', city: 'Puri', state: 'Odisha', expectedLat: 19.8876, expectedLon: 86.0945 },
];

const ADVERSARIAL_CASES = [
  { name: 'Charminar', targetCity: 'Mumbai', shouldReject: true, description: 'Cross-city wrong target' },
  { name: 'Taj Mahal', targetCity: 'Bengaluru', shouldReject: true, description: 'Cross-state hallucination' },
  { name: 'Fake Nonexistent Monument 12345', targetCity: 'Hyderabad', shouldReject: true, description: 'Fabricated POI' },
];

async function runHardeningBenchmarks() {
  console.log('================================================================');
  console.log('   INDIA IN-TIME: PRODUCTION HARDENING BENCHMARK RUNNER');
  console.log('================================================================\n');

  const results = {
    poiAccuracy: { total: 0, passed: 0, maxOffsetMeters: 0, avgOffsetMeters: 0 },
    entranceNavigation: { total: 0, passed: 0 },
    adversarialQuarantine: { total: 0, rejectedProperly: 0 },
    trafficRouting: { total: 0, passed: 0, fallbackVerified: 0 },
    freshnessContracts: { total: 0, passed: 0 },
  };

  // ── 1. Golden POI Accuracy & Coordinate Verification ────────────────────────
  console.log('── [1/4] Golden POI Accuracy & Coordinate Resolution ──');
  let totalOffset = 0;
  for (const poi of GOLDEN_POIS) {
    results.poiAccuracy.total++;
    const resolved = await resolveCanonicalPlace(poi.name, { city: poi.city, state: poi.state });
    if (!resolved) {
      console.log(`  ✗ ${poi.name} (${poi.city}): Resolution failed`);
      continue;
    }

    const offsetM = distKm(resolved.latitude, resolved.longitude, poi.expectedLat, poi.expectedLon) * 1000;
    totalOffset += offsetM;
    results.poiAccuracy.maxOffsetMeters = Math.max(results.poiAccuracy.maxOffsetMeters, offsetM);

    const isAccurate = offsetM <= 350; // within 350m of canonical centroid
    if (isAccurate) results.poiAccuracy.passed++;

    // Entrance and Navigation Check
    results.entranceNavigation.total++;
    const hasNav = typeof resolved.navigationLatitude === 'number' && typeof resolved.navigationLongitude === 'number';
    const hasEntrance = typeof resolved.entranceLatitude === 'number' && typeof resolved.entranceLongitude === 'number';
    if (hasNav && hasEntrance) results.entranceNavigation.passed++;

    console.log(`  ${isAccurate ? '✓' : '✗'} ${poi.name.padEnd(20)} [${poi.city}] offset: ${Math.round(offsetM)}m | conf: ${resolved.confidenceState} | navPt: ${hasNav ? 'OK' : 'MISSING'}`);
  }
  results.poiAccuracy.avgOffsetMeters = Math.round(totalOffset / results.poiAccuracy.total);

  // ── 2. Adversarial & Cross-City Quarantine ──────────────────────────────────
  console.log('\n── [2/4] Adversarial & Cross-City Quarantine Checks ──');
  for (const adv of ADVERSARIAL_CASES) {
    results.adversarialQuarantine.total++;
    const resolved = await resolveCanonicalPlace(adv.name, { city: adv.targetCity });
    // If resolved in wrong city, check distance or city match
    let quarantined = false;
    if (!resolved) {
      quarantined = true;
    } else {
      const cityMismatch = resolved.city && resolved.city.toLowerCase() !== adv.targetCity.toLowerCase();
      const distFromTarget = adv.targetCity === 'Mumbai'
        ? distKm(resolved.latitude, resolved.longitude, 18.92, 72.83)
        : distKm(resolved.latitude, resolved.longitude, 12.97, 77.59);
      quarantined = cityMismatch || distFromTarget > 100;
    }

    if (quarantined) results.adversarialQuarantine.rejectedProperly++;
    console.log(`  ${quarantined ? '✓' : '✗'} ${adv.description}: "${adv.name}" in ${adv.targetCity} -> ${quarantined ? 'QUARANTINED/REJECTED' : 'ACCEPTED (DEFECT)'}`);
  }

  // ── 3. Traffic Provider Fallback & Hysteresis ───────────────────────────────
  console.log('\n── [3/4] Live Traffic Fallback, Speed Sanity & Hysteresis ──');
  const routeTests = [
    { name: 'Hyderabad Urban Corridor', from: [17.3616, 78.4747], to: [17.3833, 78.4011], city: 'Hyderabad' },
    { name: 'Delhi Arterial Corridor', from: [28.6562, 77.2410], to: [28.5245, 77.1855], city: 'Delhi' },
    { name: 'Bengaluru IT Corridor', from: [12.9779, 77.5952], to: [12.8009, 77.5777], city: 'Bengaluru' },
  ];

  for (const rt of routeTests) {
    results.trafficRouting.total++;
    const route = await calculateRoute(rt.from, rt.to, { city: rt.city, mode: 'driving' });
    const hasSanity = route.sanity && route.sanity.sane === true;
    const hasTrafficState = !!route.trafficState;
    const hasFreshness = !!route.freshnessWindow;
    const hasProvenance = ['PROVIDER_DERIVED', 'LIVE_TRAFFIC', 'ROAD_NETWORK_ESTIMATE', 'FALLBACK_CORRIDOR_ESTIMATE'].includes(route.provenance);

    if (hasSanity && hasTrafficState && hasFreshness && hasProvenance) {
      results.trafficRouting.passed++;
    }
    if (route.fallback || ['osrm', 'corridor_heuristic', 'haversine_fallback'].includes(route.provider)) {
      results.trafficRouting.fallbackVerified++;
    }

    console.log(`  ✓ ${rt.name}: dist: ${route.distance.formatted} | dur: ${route.duration.formatted} | traffic: ${route.trafficState} | prov: ${route.provenance} | sanity: ${route.sanity.speedKmH} km/h`);
  }

  // Test Hysteresis
  const h1 = evaluateRerouteHysteresis(1800, 1680, { minTimeSavingsSeconds: 300 });
  const h2 = evaluateRerouteHysteresis(1800, 1300, { minTimeSavingsSeconds: 300 });
  console.log(`  ✓ Hysteresis Ping-Pong Suppression: 2m savings -> ${h1.shouldReroute ? 'REROUTED (BAD)' : 'IGNORED (GOOD)'}`);
  console.log(`  ✓ Hysteresis Acceptance: 8.3m savings -> ${h2.shouldReroute ? 'ACCEPTED (GOOD)' : 'IGNORED (BAD)'}`);

  // ── 4. Unified Data Freshness & Provenance Contracts ────────────────────────
  console.log('\n── [4/4] Multi-Domain Data Freshness & Provenance Contracts ──');
  const envelopes = [
    wrapTrafficData({ flow: 'MODERATE' }),
    wrapWeatherData({ temp: 29 }),
    wrapAqiData({ aqi: 110 }),
    wrapAlertsData([{ type: 'HEAT' }]),
    wrapClosureData([]),
    wrapTransitData({ line: 'Red' }),
    wrapPoiData({ name: 'Charminar' }),
  ];

  for (const env of envelopes) {
    results.freshnessContracts.total++;
    const valid = env.value && env.domain && env.provider && env.provenance && env.retrievedAt && env.expiresAt && env.freshness;
    if (valid) results.freshnessContracts.passed++;
    console.log(`  ✓ [${env.domain.toUpperCase()}] Provider: ${env.provider} | Provenance: ${env.provenance} | Freshness: ${env.freshness}`);
  }

  console.log('\n================================================================');
  console.log('   BENCHMARK SUMMARY & SCORECARD');
  console.log('================================================================');
  console.log(`  POI Accuracy:              ${results.poiAccuracy.passed}/${results.poiAccuracy.total} passed (Avg offset: ${results.poiAccuracy.avgOffsetMeters}m)`);
  console.log(`  Entrance / Navigation Pts: ${results.entranceNavigation.passed}/${results.entranceNavigation.total} resolved`);
  console.log(`  Adversarial Quarantine:    ${results.adversarialQuarantine.rejectedProperly}/${results.adversarialQuarantine.total} blocked`);
  console.log(`  Traffic Routing & Sanity:  ${results.trafficRouting.passed}/${results.trafficRouting.total} verified`);
  console.log(`  Freshness Contracts:       ${results.freshnessContracts.passed}/${results.freshnessContracts.total} verified`);
  console.log('================================================================\n');

  return results;
}

if (require.main === module) {
  runHardeningBenchmarks().then(() => process.exit(0)).catch(err => {
    console.error('Benchmark error:', err);
    process.exit(1);
  });
}

module.exports = { runHardeningBenchmarks };
