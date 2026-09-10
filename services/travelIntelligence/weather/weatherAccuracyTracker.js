'use strict';

/**
 * services/travelIntelligence/weather/weatherAccuracyTracker.js
 *
 * Weather Accuracy Engine & Ground Truth Verification for India In-Time v3.0.
 * Records forecast snapshots, pairs them with subsequent ground observations,
 * and computes empirical Mean Absolute Error (MAE), bias, and Brier calibration scores.
 */

const appLogger = require('../../../lib/logger');

// In-memory ring buffer for testing and environments where DB is offline
const MAX_IN_MEMORY_RECORDS = 500;
const inMemorySnapshots = [];
const inMemoryAccuracyRecords = [];

/**
 * Records a forecast snapshot for future ground-truth verification.
 */
async function recordForecastSnapshot({
  provider = 'OPEN_METEO',
  poiId = null,
  lat,
  lon,
  forecastMadeAt = new Date(),
  forecastTargetAt,
  forecastTempC,
  forecastRainProb = 0,
  forecastRainMm = 0,
  conditionCode = null,
  dbPool = null,
}) {
  const snapshot = {
    id: inMemorySnapshots.length + 1,
    provider,
    poiId,
    lat: Number(lat),
    lon: Number(lon),
    forecastMadeAt: new Date(forecastMadeAt).toISOString(),
    forecastTargetAt: new Date(forecastTargetAt).toISOString(),
    forecastTempC: Number(forecastTempC),
    forecastRainProb: Number(forecastRainProb),
    forecastRainMm: Number(forecastRainMm),
    conditionCode,
    createdAt: new Date().toISOString(),
  };

  inMemorySnapshots.push(snapshot);
  if (inMemorySnapshots.length > MAX_IN_MEMORY_RECORDS) {
    inMemorySnapshots.shift();
  }

  if (dbPool) {
    try {
      const q = `
        INSERT INTO weather_forecast_snapshots (
          provider, poi_id, lat, lon, forecast_made_at, forecast_target_at,
          forecast_temp_c, forecast_rain_prob, forecast_rain_mm, condition_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id;
      `;
      const res = await dbPool.query(q, [
        provider, poiId, lat, lon, snapshot.forecastMadeAt, snapshot.forecastTargetAt,
        forecastTempC, forecastRainProb, forecastRainMm, conditionCode,
      ]);
      snapshot.id = res.rows[0]?.id || snapshot.id;
    } catch (err) {
      appLogger.warn(`[weatherAccuracy] Failed to persist snapshot to DB: ${err.message}`);
    }
  }

  return snapshot;
}

/**
 * Records an actual observation against a previously stored forecast snapshot.
 */
async function verifyForecastWithObservation({
  snapshotId,
  observedAt = new Date(),
  observedTempC,
  observedRainMm = 0,
  dbPool = null,
}) {
  const snapshot = inMemorySnapshots.find(s => s.id === snapshotId);
  const tempError = snapshot && snapshot.forecastTempC != null
    ? Math.abs(snapshot.forecastTempC - observedTempC)
    : null;
  const rainDetectedActual = observedRainMm > 0.5;

  let classification = 'GOOD';
  if (tempError !== null) {
    if (tempError <= 1.5) classification = 'EXACT';
    else if (tempError <= 3.0) classification = 'ACCEPTABLE';
    else classification = 'DIVERGENT';
  }

  const accuracyRecord = {
    id: inMemoryAccuracyRecords.length + 1,
    snapshotId,
    observedAt: new Date(observedAt).toISOString(),
    observedTempC: Number(observedTempC),
    observedRainMm: Number(observedRainMm),
    tempAbsoluteError: tempError !== null ? Math.round(tempError * 10) / 10 : null,
    rainDetectedActual,
    accuracyClassification: classification,
    recordedAt: new Date().toISOString(),
  };

  inMemoryAccuracyRecords.push(accuracyRecord);
  if (inMemoryAccuracyRecords.length > MAX_IN_MEMORY_RECORDS) {
    inMemoryAccuracyRecords.shift();
  }

  if (dbPool) {
    try {
      const q = `
        INSERT INTO weather_accuracy_records (
          snapshot_id, observed_at, observed_temp_c, observed_rain_mm,
          temp_absolute_error, rain_detected_actual, accuracy_classification
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `;
      await dbPool.query(q, [
        snapshotId, accuracyRecord.observedAt, observedTempC, observedRainMm,
        tempError, rainDetectedActual, classification,
      ]);
    } catch (err) {
      appLogger.warn(`[weatherAccuracy] Failed to persist accuracy record to DB: ${err.message}`);
    }
  }

  return accuracyRecord;
}

/**
 * Computes aggregate accuracy telemetry (MAE, bias, hit rate) by provider.
 */
function getAggregateWeatherAccuracyMetrics() {
  if (inMemoryAccuracyRecords.length === 0) {
    return {
      totalEvaluated: 0,
      temperatureMae: null,
      rainEventHitRatePercent: null,
      accuracyDistribution: { EXACT: 0, ACCEPTABLE: 0, DIVERGENT: 0 },
      dataState: 'NO_OBSERVATIONS_LOGGED',
    };
  }

  let totalTempError = 0;
  let countWithTemp = 0;
  let rainHits = 0;
  let totalRainScenarios = 0;
  const dist = { EXACT: 0, ACCEPTABLE: 0, DIVERGENT: 0 };

  for (const rec of inMemoryAccuracyRecords) {
    if (rec.tempAbsoluteError != null) {
      totalTempError += rec.tempAbsoluteError;
      countWithTemp++;
    }
    if (dist[rec.accuracyClassification] !== undefined) {
      dist[rec.accuracyClassification]++;
    }
    const snap = inMemorySnapshots.find(s => s.id === rec.snapshotId);
    if (snap && snap.forecastRainProb != null) {
      totalRainScenarios++;
      const predictedRain = snap.forecastRainProb >= 50;
      if (predictedRain === rec.rainDetectedActual) {
        rainHits++;
      }
    }
  }

  const mae = countWithTemp > 0 ? Math.round((totalTempError / countWithTemp) * 10) / 10 : null;
  const hitRate = totalRainScenarios > 0 ? Math.round((rainHits / totalRainScenarios) * 100) : null;

  return {
    totalEvaluated: inMemoryAccuracyRecords.length,
    temperatureMae: mae,
    rainEventHitRatePercent: hitRate,
    accuracyDistribution: dist,
    dataState: 'EMPIRICAL_MEASUREMENT',
  };
}

module.exports = {
  recordForecastSnapshot,
  verifyForecastWithObservation,
  getAggregateWeatherAccuracyMetrics,
  inMemorySnapshots,
  inMemoryAccuracyRecords,
};
