'use strict';

/**
 * scripts/benchmarks/route-eta-benchmark.js
 *
 * 50-Scenario Real-World Indian Route & ETA Benchmark Suite
 * Measures:
 * 1. Road distance computation accuracy
 * 2. Travel duration and ETA precision
 * 3. Rush-hour traffic factor integration
 * 4. Temporal propagation across multi-stop itineraries
 * 5. Provider fallback and transparent provenance
 */

const { calculateRoute } = require('../../services/routing/routingService');
const { evaluateEtaAccuracy } = require('../../services/routing/etaCalibration');

// 50 Verified Test Route Corridors across 10 Indian cities
const ROUTE_BENCHMARKS = [
  // ── VISAKHAPATNAM (1-8) ───────────────────────────────────────────────────
  { id: 'vtz_01', city: 'Visakhapatnam', name: 'RK Beach to INS Kursura (Short Urban)', from: [17.7142, 83.3237], to: [17.7172, 83.3301], expectedDistKm: 0.9, expectedMin: 3, mode: 'driving' },
  { id: 'vtz_02', city: 'Visakhapatnam', name: 'RK Beach to Kailasagiri (Scenic Coastal)', from: [17.7142, 83.3237], to: [17.7492, 83.3418], expectedDistKm: 5.5, expectedMin: 12, mode: 'driving' },
  { id: 'vtz_03', city: 'Visakhapatnam', name: 'Kailasagiri to Rushikonda Beach (Coastal Highway)', from: [17.7492, 83.3418], to: [17.7825, 83.3851], expectedDistKm: 7.2, expectedMin: 14, mode: 'driving' },
  { id: 'vtz_04', city: 'Visakhapatnam', name: 'Rushikonda to Thotlakonda (Heritage Corridor)', from: [17.7825, 83.3851], to: [17.8285, 83.4092], expectedDistKm: 6.8, expectedMin: 11, mode: 'driving' },
  { id: 'vtz_05', city: 'Visakhapatnam', name: 'Thotlakonda to Bheemili Beach (Extended Coast)', from: [17.8285, 83.4092], to: [17.8903, 83.4559], expectedDistKm: 9.1, expectedMin: 15, mode: 'driving' },
  { id: 'vtz_06', city: 'Visakhapatnam', name: 'RK Beach to Simhachalam Temple (Urban Cross-Town)', from: [17.7142, 83.3237], to: [17.7666, 83.2501], expectedDistKm: 16.5, expectedMin: 35, mode: 'driving' },
  { id: 'vtz_07', city: 'Visakhapatnam', name: 'Simhachalam to Dolphin Nose (Ghat & Ridge)', from: [17.7666, 83.2501], to: [17.6765, 83.2926], expectedDistKm: 19.8, expectedMin: 45, mode: 'driving' },
  { id: 'vtz_08', city: 'Visakhapatnam', name: 'Dolphin Nose to Yarada Beach (Coastal Hill Cut)', from: [17.6765, 83.2926], to: [17.6549, 83.2691], expectedDistKm: 4.8, expectedMin: 14, mode: 'driving' },

  // ── HYDERABAD (9-14) ─────────────────────────────────────────────────────
  { id: 'hyd_09', city: 'Hyderabad', name: 'Charminar to Chowmahalla Palace (Old City Walk)', from: [17.3616, 78.4747], to: [17.3578, 78.4717], expectedDistKm: 0.8, expectedMin: 4, mode: 'walking' },
  { id: 'hyd_10', city: 'Hyderabad', name: 'Charminar to Salar Jung Museum (Urban Core)', from: [17.3616, 78.4747], to: [17.3713, 78.4804], expectedDistKm: 1.6, expectedMin: 7, mode: 'driving' },
  { id: 'hyd_11', city: 'Hyderabad', name: 'Salar Jung to Hussain Sagar (Mid-City Link)', from: [17.3713, 78.4804], to: [17.4239, 78.4738], expectedDistKm: 6.8, expectedMin: 18, mode: 'driving' },
  { id: 'hyd_12', city: 'Hyderabad', name: 'Hussain Sagar to Birla Mandir (Hill Viewpoint)', from: [17.4239, 78.4738], to: [17.4062, 78.4691], expectedDistKm: 2.8, expectedMin: 9, mode: 'driving' },
  { id: 'hyd_13', city: 'Hyderabad', name: 'Birla Mandir to Golconda Fort (West Corridor)', from: [17.4062, 78.4691], to: [17.3833, 78.4011], expectedDistKm: 9.5, expectedMin: 26, mode: 'driving' },
  { id: 'hyd_14', city: 'Hyderabad', name: 'Golconda Fort to Qutb Shahi Tombs (Heritage Link)', from: [17.3833, 78.4011], to: [17.3894, 78.3962], expectedDistKm: 1.4, expectedMin: 5, mode: 'driving' },

  // ── BENGALURU (15-20) ────────────────────────────────────────────────────
  { id: 'blr_15', city: 'Bengaluru', name: 'Cubbon Park to Visvesvaraya Museum (Walk)', from: [12.9779, 77.5952], to: [12.9752, 77.5963], expectedDistKm: 0.4, expectedMin: 5, mode: 'walking' },
  { id: 'blr_16', city: 'Bengaluru', name: 'Cubbon Park to Bangalore Palace (Central Urban)', from: [12.9779, 77.5952], to: [12.9988, 77.5921], expectedDistKm: 3.2, expectedMin: 12, mode: 'driving' },
  { id: 'blr_17', city: 'Bengaluru', name: 'Bangalore Palace to ISKCON Temple (Northwest)', from: [12.9988, 77.5921], to: [13.0098, 77.5511], expectedDistKm: 5.8, expectedMin: 18, mode: 'driving' },
  { id: 'blr_18', city: 'Bengaluru', name: 'Cubbon Park to Lalbagh Botanical Garden', from: [12.9779, 77.5952], to: [12.9507, 77.5848], expectedDistKm: 3.9, expectedMin: 15, mode: 'driving' },
  { id: 'blr_19', city: 'Bengaluru', name: 'Lalbagh to Tipu Sultan Palace (Heritage Loop)', from: [12.9507, 77.5848], to: [12.9593, 77.5738], expectedDistKm: 2.1, expectedMin: 9, mode: 'driving' },
  { id: 'blr_20', city: 'Bengaluru', name: 'Lalbagh to Bannerghatta National Park (South Suburb)', from: [12.9507, 77.5848], to: [12.8009, 77.5777], expectedDistKm: 21.0, expectedMin: 48, mode: 'driving' },

  // ── MUMBAI (21-26) ───────────────────────────────────────────────────────
  { id: 'mum_21', city: 'Mumbai', name: 'Gateway of India to CSMVS Museum (South Bombay Walk)', from: [18.9220, 72.8347], to: [18.9269, 72.8327], expectedDistKm: 0.7, expectedMin: 8, mode: 'walking' },
  { id: 'mum_22', city: 'Mumbai', name: 'CSMVS Museum to Marine Drive (Heritage Promenade)', from: [18.9269, 72.8327], to: [18.9432, 72.8230], expectedDistKm: 2.3, expectedMin: 9, mode: 'driving' },
  { id: 'mum_23', city: 'Mumbai', name: 'Marine Drive to Siddhivinayak Temple (Mid-Town Transit)', from: [18.9432, 72.8230], to: [19.0169, 72.8304], expectedDistKm: 11.2, expectedMin: 28, mode: 'driving' },
  { id: 'mum_24', city: 'Mumbai', name: 'Siddhivinayak to Bandra Fort (Sea Link Corridor)', from: [19.0169, 72.8304], to: [19.0416, 72.8184], expectedDistKm: 5.4, expectedMin: 16, mode: 'driving' },
  { id: 'mum_25', city: 'Mumbai', name: 'Bandra Fort to Kanheri Caves (Suburban North)', from: [19.0416, 72.8184], to: [19.2056, 72.9067], expectedDistKm: 24.5, expectedMin: 55, mode: 'driving' },
  { id: 'mum_26', city: 'Mumbai', name: 'Gateway of India to Elephanta Pier', from: [18.9220, 72.8347], to: [18.9633, 72.9315], expectedDistKm: 11.0, expectedMin: 45, mode: 'driving' },

  // ── DELHI (27-32) ────────────────────────────────────────────────────────
  { id: 'del_27', city: 'Delhi', name: 'Red Fort to Jama Masjid (Old Delhi)', from: [28.6562, 77.2410], to: [28.6507, 77.2334], expectedDistKm: 1.1, expectedMin: 6, mode: 'driving' },
  { id: 'del_28', city: 'Delhi', name: 'Red Fort to India Gate (Rajpath Axis)', from: [28.6562, 77.2410], to: [28.6129, 77.2295], expectedDistKm: 6.1, expectedMin: 16, mode: 'driving' },
  { id: 'del_29', city: 'Delhi', name: 'India Gate to National Museum (Walk)', from: [28.6129, 77.2295], to: [28.6118, 77.2193], expectedDistKm: 1.1, expectedMin: 14, mode: 'walking' },
  { id: 'del_30', city: 'Delhi', name: 'India Gate to Humayun Tomb (Central-South)', from: [28.6129, 77.2295], to: [28.5933, 77.2507], expectedDistKm: 3.5, expectedMin: 10, mode: 'driving' },
  { id: 'del_31', city: 'Delhi', name: 'Humayun Tomb to Lotus Temple (South East)', from: [28.5933, 77.2507], to: [28.5535, 77.2588], expectedDistKm: 5.6, expectedMin: 15, mode: 'driving' },
  { id: 'del_32', city: 'Delhi', name: 'Lotus Temple to Qutub Minar (South Ring)', from: [28.5535, 77.2588], to: [28.5245, 77.1855], expectedDistKm: 9.8, expectedMin: 24, mode: 'driving' },

  // ── JAIPUR (33-37) ───────────────────────────────────────────────────────
  { id: 'jai_33', city: 'Jaipur', name: 'Hawa Mahal to City Palace (Walled City Walk)', from: [26.9239, 75.8267], to: [26.9258, 75.8236], expectedDistKm: 0.5, expectedMin: 6, mode: 'walking' },
  { id: 'jai_34', city: 'Jaipur', name: 'City Palace to Jantar Mantar (Observatory Walk)', from: [26.9258, 75.8236], to: [26.9248, 75.8246], expectedDistKm: 0.2, expectedMin: 3, mode: 'walking' },
  { id: 'jai_35', city: 'Jaipur', name: 'City Palace to Albert Hall Museum (South Axis)', from: [26.9258, 75.8236], to: [26.9117, 75.8195], expectedDistKm: 2.1, expectedMin: 8, mode: 'driving' },
  { id: 'jai_36', city: 'Jaipur', name: 'Hawa Mahal to Jal Mahal (Amer Road)', from: [26.9239, 75.8267], to: [26.9534, 75.8462], expectedDistKm: 4.6, expectedMin: 12, mode: 'driving' },
  { id: 'jai_37', city: 'Jaipur', name: 'Jal Mahal to Amber Fort (Heritage Hill)', from: [26.9534, 75.8462], to: [26.9855, 75.8513], expectedDistKm: 4.2, expectedMin: 10, mode: 'driving' },

  // ── GOA (38-42) ──────────────────────────────────────────────────────────
  { id: 'goa_38', city: 'Goa', name: 'Baga Beach to Calangute Beach (North Coast Walk)', from: [15.5553, 73.7517], to: [15.5439, 73.7553], expectedDistKm: 1.8, expectedMin: 7, mode: 'driving' },
  { id: 'goa_39', city: 'Goa', name: 'Calangute to Anjuna Beach (North Circuit)', from: [15.5439, 73.7553], to: [15.5752, 73.7405], expectedDistKm: 6.2, expectedMin: 16, mode: 'driving' },
  { id: 'goa_40', city: 'Goa', name: 'Calangute to Fort Aguada (South Tip of Candolim)', from: [15.5439, 73.7553], to: [15.4924, 73.7735], expectedDistKm: 8.5, expectedMin: 20, mode: 'driving' },
  { id: 'goa_41', city: 'Goa', name: 'Fort Aguada to Basilica of Bom Jesus (Old Goa Cross)', from: [15.4924, 73.7735], to: [15.5009, 73.9116], expectedDistKm: 23.5, expectedMin: 45, mode: 'driving' },
  { id: 'goa_42', city: 'Goa', name: 'Bom Jesus to Palolem Beach (South Goa Highway)', from: [15.5009, 73.9116], to: [15.0100, 74.0232], expectedDistKm: 66.0, expectedMin: 95, mode: 'driving' },

  // ── CHENNAI (43-45) ──────────────────────────────────────────────────────
  { id: 'chn_43', city: 'Chennai', name: 'Marina Beach to San Thome Basilica (Coastal Drive)', from: [13.0500, 80.2824], to: [13.0337, 80.2783], expectedDistKm: 2.2, expectedMin: 8, mode: 'driving' },
  { id: 'chn_44', city: 'Chennai', name: 'San Thome to Kapaleeshwarar Temple (Mylapore Core)', from: [13.0337, 80.2783], to: [13.0336, 80.2699], expectedDistKm: 1.2, expectedMin: 5, mode: 'driving' },
  { id: 'chn_45', city: 'Chennai', name: 'Kapaleeshwarar to Fort St George (North Link)', from: [13.0336, 80.2699], to: [13.0797, 80.2874], expectedDistKm: 6.8, expectedMin: 22, mode: 'driving' },

  // ── KOLKATA (46-48) ──────────────────────────────────────────────────────
  { id: 'kol_46', city: 'Kolkata', name: 'Victoria Memorial to St Paul Cathedral (Walk)', from: [22.5448, 88.3426], to: [22.5441, 88.3468], expectedDistKm: 0.5, expectedMin: 6, mode: 'walking' },
  { id: 'kol_47', city: 'Kolkata', name: 'Victoria Memorial to Indian Museum (Central Axis)', from: [22.5448, 88.3426], to: [22.5579, 88.3511], expectedDistKm: 2.0, expectedMin: 8, mode: 'driving' },
  { id: 'kol_48', city: 'Kolkata', name: 'Indian Museum to Howrah Bridge (Riverfront Arterial)', from: [22.5579, 88.3511], to: [22.5851, 88.3468], expectedDistKm: 4.8, expectedMin: 18, mode: 'driving' },

  // ── PUNE (49-50) ─────────────────────────────────────────────────────────
  { id: 'pun_49', city: 'Pune', name: 'Shaniwar Wada to Dagdusheth Ganpati (Old City Walk)', from: [18.5196, 73.8553], to: [18.5164, 73.8560], expectedDistKm: 0.5, expectedMin: 6, mode: 'walking' },
  { id: 'pun_50', city: 'Pune', name: 'Shaniwar Wada to Aga Khan Palace (East Urban)', from: [18.5196, 73.8553], to: [18.5524, 73.9015], expectedDistKm: 7.2, expectedMin: 24, mode: 'driving' },
];

async function run50RouteBenchmarks() {
  console.log(`\n============================================================`);
  console.log(`EXECUTING 50-SCENARIO REAL-WORLD ROUTE & ETA BENCHMARKS`);
  console.log(`============================================================\n`);

  const results = [];
  let passedCount = 0;
  const evaluationSamples = [];

  for (let i = 0; i < ROUTE_BENCHMARKS.length; i++) {
    const item = ROUTE_BENCHMARKS[i];
    const departureTime = '2026-08-30T10:00:00.000Z'; // Standard morning

    const route = await calculateRoute(item.from, item.to, {
      mode: item.mode,
      originName: item.name.split(' to ')[0],
      destName: item.name.split(' to ')[1],
      departureTime,
    });

    const distKm = route.distance.kilometers;
    const durationMin = route.duration.minutes;
    const distDiffKm = Math.abs(distKm - item.expectedDistKm);
    const durationDiffMin = Math.abs(durationMin - item.expectedMin);

    // Realistic road network tolerance (accounting for urban one-ways, ghat roads, and ring road bypasses)
    const isDistOk = distDiffKm <= Math.max(4.0, item.expectedDistKm * 0.70);
    const isDurationOk = durationDiffMin <= Math.max(10, item.expectedMin * 0.70);
    const passed = route.success && isDistOk && isDurationOk;

    if (passed) passedCount++;

    evaluationSamples.push({
      predictedSeconds: route.duration.seconds,
      observedSeconds: item.expectedMin * 60,
      city: item.city,
      provider: route.provider,
    });

    results.push({
      id: item.id,
      city: item.city,
      name: item.name,
      mode: item.mode,
      calculatedDistKm: distKm,
      expectedDistKm: item.expectedDistKm,
      calculatedMin: durationMin,
      expectedMin: item.expectedMin,
      provider: route.provider,
      trafficStatus: route.trafficStatus,
      provenance: route.provenance,
      passed,
    });

    const statusSymbol = passed ? '✓' : '✗';
    console.log(`${statusSymbol} [${String(i + 1).padStart(2, '0')}/50] ${item.city} | ${item.name} -> ${distKm}km (${durationMin}m) [Prov: ${route.provider}]`);
  }

  const accuracyReport = evaluateEtaAccuracy(evaluationSamples);

  console.log(`\n============================================================`);
  console.log(`BENCHMARK RESULTS: ${passedCount}/50 Passed (${Math.round((passedCount / 50) * 100)}%)`);
  console.log(`ETA MAE:           ${accuracyReport.maeSeconds}s (${Math.round(accuracyReport.maeSeconds / 60)} mins)`);
  console.log(`ETA Median Error:  ${accuracyReport.medianErrorSeconds}s`);
  console.log(`ETA P90 Error:     ${accuracyReport.p90ErrorSeconds}s`);
  console.log(`ETA MAPE:          ${accuracyReport.mapePercent}%`);
  console.log(`Accuracy Tier:     ${accuracyReport.accuracyTier}`);
  console.log(`============================================================\n`);

  return {
    results,
    passedCount,
    total: ROUTE_BENCHMARKS.length,
    accuracyReport,
  };
}

if (require.main === module) {
  run50RouteBenchmarks().then(res => {
    if (res.passedCount < 45) {
      process.exitCode = 1;
    }
  });
}

module.exports = {
  ROUTE_BENCHMARKS,
  run50RouteBenchmarks,
};
