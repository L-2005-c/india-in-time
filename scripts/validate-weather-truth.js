'use strict';

/**
 * scripts/validate-weather-truth.js
 *
 * Automated Multi-City Validation Benchmark for India In-Time v3.0 Weather Truth.
 * Benchmarks spatial grounding, altitude lapse rates, diurnal models,
 * and data state provenance across coastal, plain, and high-altitude stations.
 */

const { getWeatherDiagnostics } = require('../services/travelIntelligence/weather/weatherProviderRegistry');
const { findNearestStation, getImdClimatologicalNormal } = require('../services/travelIntelligence/weather/adapters/imdWeatherAdapter');

const BENCHMARK_CITIES = [
  {
    name: 'Visakhapatnam (Coastal Plain)',
    lat: 17.6868,
    lon: 83.2185,
    elevationM: 5,
    expectedStationId: '43150',
    maxExpectedTemp: 34,
    minExpectedTemp: 24,
  },
  {
    name: 'Araku Valley (Eastern Ghats Plateau)',
    lat: 18.3333,
    lon: 82.8667,
    elevationM: 911,
    expectedStationId: '43145',
    maxExpectedTemp: 28,
    minExpectedTemp: 18,
  },
  {
    name: 'Lambasingi (High-Altitude Ghats)',
    lat: 17.8200,
    lon: 82.5200,
    elevationM: 1025,
    expectedStationId: '43146',
    maxExpectedTemp: 26,
    minExpectedTemp: 16,
  },
  {
    name: 'Tirupati (Rayalaseema Foothills)',
    lat: 13.6288,
    lon: 79.4192,
    elevationM: 162,
    expectedStationId: '43241',
    maxExpectedTemp: 37,
    minExpectedTemp: 22,
  },
  {
    name: 'Vijayawada (Krishna Delta Plain)',
    lat: 16.5062,
    lon: 80.6480,
    elevationM: 25,
    expectedStationId: '43189',
    maxExpectedTemp: 38,
    minExpectedTemp: 25,
  },
];

async function runBenchmark() {
  console.log('====================================================================');
  console.log('       INDIA IN-TIME v3.0 — WEATHER TRUTH BENCHMARK SUITE          ');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const city of BENCHMARK_CITIES) {
    console.log(`--- [Testing] ${city.name} (${city.lat}, ${city.lon}, ${city.elevationM}m) ---`);

    // 1. Station Grounding Test
    const station = findNearestStation(city.lat, city.lon);
    const stationMatched = station && station.id === city.expectedStationId;
    if (stationMatched) {
      console.log(`  [PASS] Station Match: ${station.name} (${station.id}) at ${station.distanceKm} km`);
      passed++;
    } else {
      console.warn(`  [FAIL] Station Match: Expected ${city.expectedStationId}, got ${station?.id} (${station?.name})`);
      failed++;
    }

    // 2. Diurnal & Climatological Lapse Rate Normal
    const normal = getImdClimatologicalNormal(city.lat, city.lon, station, city.elevationM);
    console.log(`  [INFO] Diurnal Normal: ${normal.temperatureC}°C (IST Hour: ${normal.istHour}, Elev: ${normal.elevationM}m)`);
    if (normal.elevationAudit?.correctionApplied) {
      console.log(`  [INFO] Lapse Correction: -${normal.elevationAudit.correctionAmount}°C applied (target: ${normal.elevationAudit.targetElevation}m)`);
    }

    // 3. Full Consensus & Diagnostics Evaluation
    try {
      const diag = await getWeatherDiagnostics(city.lat, city.lon, { elevationM: city.elevationM, timeoutMs: 3000 });
      console.log(`  [INFO] Classification: ${diag.classification}`);
      console.log(`  [INFO] Data State: ${diag.consensus.dataState} (isEstimated: ${diag.consensus.isEstimated})`);
      console.log(`  [INFO] Consensus State: ${diag.consensus.consensusState}`);
      console.log(`  [INFO] Raw Temp: ${diag.temperatures.rawTemperatureC}°C -> Display: ${diag.temperatures.displayTemperatureC}°C`);
      if (diag.consensus.userDisclosure) {
        console.log(`  [INFO] Disclosure: "${diag.consensus.userDisclosure}"`);
      }

      // Assert data truth invariants
      if (diag.consensus.isEstimated && diag.consensus.dataState === 'OBSERVED') {
        console.error('  [FAIL] Invariant Violation: isEstimated is TRUE but dataState is OBSERVED!');
        failed++;
      } else {
        passed++;
      }

      if (diag.temperatures.rawTemperatureC !== null && typeof diag.temperatures.displayTemperatureC === 'number') {
        passed++;
      } else {
        console.error('  [FAIL] Missing raw or display temperature in output');
        failed++;
      }
    } catch (err) {
      console.error(`  [FAIL] Diagnostic execution error: ${err.message}`);
      failed++;
    }

    console.log('');
  }

  // 4. Comparative Altitude Lapse Verification: Araku (911m) vs Visakhapatnam (5m)
  console.log('--- [Comparative Altitude Verification: Eastern Ghats vs Coast] ---');
  const vizagNormal = getImdClimatologicalNormal(17.6868, 83.2185, findNearestStation(17.6868, 83.2185), 5);
  const arakuNormal = getImdClimatologicalNormal(18.3333, 82.8667, findNearestStation(18.3333, 82.8667), 911);
  const deltaT = vizagNormal.temperatureC - arakuNormal.temperatureC;

  console.log(`  Vizag (5m): ${vizagNormal.temperatureC}°C | Araku (911m): ${arakuNormal.temperatureC}°C`);
  console.log(`  Delta T (Lapse Cooling): ${Math.round(deltaT * 10) / 10}°C`);

  if (deltaT >= 4.0 && deltaT <= 6.5) {
    console.log('  [PASS] Eastern Ghats lapse cooling matches expected environmental lapse rate (~5.3°C drop for ~900m ascent).');
    passed++;
  } else {
    console.error(`  [FAIL] Unexpected lapse cooling delta: ${deltaT}°C`);
    failed++;
  }

  console.log('\n====================================================================');
  console.log(`BENCHMARK SUMMARY: ${passed} assertions passed, ${failed} failed.`);
  console.log('====================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runBenchmark().catch(err => {
    console.error('Fatal error running weather benchmark:', err);
    process.exit(1);
  });
}

module.exports = { runBenchmark };
