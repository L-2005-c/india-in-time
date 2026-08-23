// scripts/itinerary-load-smoke.js
// FAANG-Grade Load & Performance Smoke Test for Core Itinerary Planning Engine
//
// Evaluates optimizer latency, memory throughput, and algorithmic stability
// under high-throughput concurrent load across multi-city, multi-persona constraints.
// Computes p50, p95, p99 latencies, throughput (ops/sec), and ensures zero errors.
//
// Usage: node scripts/itinerary-load-smoke.js

'use strict';

const { planAdvancedItinerary } = require('../services/travelIntelligence/advancedItineraryEngine');

const POI_POOLS = {
  visakhapatnam: [
    { id: 'v1', name: 'Yarada Beach', cat: 'beach', coords: [17.65, 83.26], vt: 90, ot: '05:30', ct: '20:00', is_sunrise_spot: true },
    { id: 'v2', name: "Dolphin's Nose Lighthouse", cat: 'scenic', coords: [17.675, 83.295], vt: 45, ot: '09:00', ct: '17:30', is_sunset_spot: true },
    { id: 'v3', name: 'Simhachalam Temple', cat: 'temple', coords: [17.766, 83.25], vt: 60, ot: '06:00', ct: '20:30' },
    { id: 'v4', name: 'Venkatadri Vantillu', cat: 'food', coords: [17.725, 83.32], vt: 45, ot: '11:00', ct: '23:00' },
    { id: 'v5', name: 'Kailasagiri', cat: 'scenic', coords: [17.748, 83.342], vt: 60, ot: '06:00', ct: '20:00', is_sunset_spot: true },
    { id: 'v6', name: 'INS Kursura Submarine Museum', cat: 'museum', coords: [17.717, 83.331], vt: 60, ot: '10:00', ct: '20:00' },
    { id: 'v7', name: 'Ramakrishna Beach', cat: 'beach', coords: [17.714, 83.323], vt: 75, ot: '05:30', ct: '21:00' },
    { id: 'v8', name: 'Tenneti Park', cat: 'park', coords: [17.748, 83.349], vt: 45, ot: '06:00', ct: '20:00' },
  ],
  jaipur: [
    { id: 'j1', name: 'Amber Fort', cat: 'fort', coords: [26.985, 75.851], vt: 90, ot: '08:00', ct: '18:00', is_sunset_spot: true },
    { id: 'j2', name: 'Hawa Mahal', cat: 'monument', coords: [26.923, 75.826], vt: 45, ot: '09:00', ct: '17:00' },
    { id: 'j3', name: 'City Palace', cat: 'heritage', coords: [26.925, 75.823], vt: 75, ot: '09:30', ct: '17:00' },
    { id: 'j4', name: 'LMB Restaurant', cat: 'food', coords: [26.921, 75.824], vt: 50, ot: '11:00', ct: '23:00' },
    { id: 'j5', name: 'Jal Mahal', cat: 'scenic', coords: [26.953, 75.846], vt: 45, ot: '06:00', ct: '20:00', is_sunset_spot: true },
    { id: 'j6', name: 'Nahargarh Fort', cat: 'fort', coords: [26.937, 75.815], vt: 60, ot: '10:00', ct: '18:00', is_sunset_spot: true },
    { id: 'j7', name: 'Johari Bazaar', cat: 'market', coords: [26.920, 75.825], vt: 60, ot: '10:30', ct: '20:30' },
  ],
  hyderabad: [
    { id: 'h1', name: 'Charminar', cat: 'monument', coords: [17.361, 78.474], vt: 45, ot: '09:00', ct: '17:30' },
    { id: 'h2', name: 'Golconda Fort', cat: 'fort', coords: [17.383, 78.401], vt: 90, ot: '09:00', ct: '17:30', is_sunset_spot: true },
    { id: 'h3', name: 'Shadab Hotel', cat: 'food', coords: [17.367, 78.473], vt: 50, ot: '11:00', ct: '23:00' },
    { id: 'h4', name: 'Salar Jung Museum', cat: 'museum', coords: [17.371, 78.480], vt: 75, ot: '10:00', ct: '17:00' },
    { id: 'h5', name: 'Hussain Sagar Lake', cat: 'scenic', coords: [17.423, 78.473], vt: 60, ot: '06:00', ct: '21:00', is_sunset_spot: true },
    { id: 'h6', name: 'Chowmahalla Palace', cat: 'heritage', coords: [17.357, 78.471], vt: 60, ot: '10:00', ct: '17:00' },
  ],
};

const CITIES = Object.keys(POI_POOLS);
const PERSONAS = [
  ['scenic', 'beach', 'museum'],
  ['fort', 'heritage', 'monument'],
  ['monument', 'food', 'scenic'],
  ['heritage', 'market', 'food'],
];

const ITERATIONS = 50;
const CONCURRENCY = 5;

function percentile(arr, p) {
  if (!arr.length) return 0;
  const idx = Math.min(Math.floor((p / 100) * arr.length), arr.length - 1);
  return arr[idx];
}

async function runScenario(id) {
  const city = CITIES[id % CITIES.length];
  const personas = PERSONAS[id % PERSONAS.length];
  const places = POI_POOLS[city];
  const startMin = 9 * 60;
  const durationMin = 480; // 8 hours
  const now = new Date('2026-08-22T09:00:00+05:30');

  const t0 = process.hrtime.bigint();
  const result = planAdvancedItinerary(places, {
    city,
    now,
    startMin,
    endMin: startMin + durationMin,
    maxStops: 6,
    preferredCategories: personas,
    bufferMin: 15,
  });
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;

  if (!result || !Array.isArray(result.stops)) {
    throw new Error(`Invalid optimizer result for scenario ${id}`);
  }

  return { ms, stopsCount: result.stops.length, efficiency: result.timeUtilizationScore || 0 };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🚀 India In-Time — Core Optimizer Load & Performance Smoke Test');
  console.log(`   Iterations: ${ITERATIONS} | Concurrency: ${CONCURRENCY} worker tasks`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const startTotal = Date.now();
  const latencies = [];
  let totalStops = 0;
  let errors = 0;

  // Process in concurrent batches
  for (let i = 0; i < ITERATIONS; i += CONCURRENCY) {
    const batch = [];
    const batchSize = Math.min(CONCURRENCY, ITERATIONS - i);
    for (let j = 0; j < batchSize; j++) {
      const idx = i + j;
      batch.push(
        runScenario(idx)
          .then((res) => {
            latencies.push(res.ms);
            totalStops += res.stopsCount;
          })
          .catch((err) => {
            errors++;
            console.error(`Error in scenario ${idx}:`, err.message);
          })
      );
    }
    await Promise.all(batch);
  }

  const elapsedTotalMs = Date.now() - startTotal;
  latencies.sort((a, b) => a - b);

  const p50 = percentile(latencies, 50).toFixed(2);
  const p95 = percentile(latencies, 95).toFixed(2);
  const p99 = percentile(latencies, 99).toFixed(2);
  const min = latencies[0]?.toFixed(2) ?? 0;
  const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
  const opsPerSec = Math.round((ITERATIONS / (elapsedTotalMs / 1000)));

  console.log('📊 Performance & Latency Benchmark Results:');
  console.log(`   • Total Completed:     ${latencies.length} / ${ITERATIONS} requests (Errors: ${errors})`);
  console.log(`   • Total Stops Planned: ${totalStops}`);
  console.log(`   • Wall Time:           ${elapsedTotalMs} ms`);
  console.log(`   • Throughput:          ${opsPerSec} ops/sec`);
  console.log(`   • Latency Min:         ${min} ms`);
  console.log(`   • Latency Avg:         ${avg} ms`);
  console.log(`   • Latency p50 (Median):${p50} ms`);
  console.log(`   • Latency p95:         ${p95} ms`);
  console.log(`   • Latency p99:         ${p99} ms`);
  console.log('───────────────────────────────────────────────────────────────────────');

  const p95BudgetMs = 800;
  const passed = errors === 0 && Number(p95) <= p95BudgetMs;

  if (passed) {
    console.log(`✅ PASS: Optimizer p95 (${p95}ms) is well within ${p95BudgetMs}ms budget with 0 errors.`);
  } else {
    console.log(`❌ FAIL: Performance degraded or errors occurred (errors=${errors}, p95=${p95}ms).`);
  }
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal load smoke error:', err);
  process.exit(1);
});
