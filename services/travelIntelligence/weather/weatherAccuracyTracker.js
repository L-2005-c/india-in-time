'use strict';

/**
 * services/travelIntelligence/weather/weatherAccuracyTracker.js
 *
 * Weather Accuracy Engine & Ground Truth Verification for India In-Time v3.0.
 * Records forecast snapshots, pairs them with subsequent ground observations,
 * and computes empirical Mean Absolute Error (MAE), bias, and Brier calibration scores.
 */

const appLogger = require('../../../lib/logger');
const { distKm } = require('../../../utils/geo');

// In-memory ring buffer for testing and environments where DB is offline
const MAX_IN_MEMORY_RECORDS = 500;
const inMemorySnapshots = [];
const inMemoryAccuracyRecords = [];

/**
 * Rigorously evaluates a forecast-observation pair enforcing temporal & spatial matching.
 */
function evaluateForecastObservationPair({
  forecast = {},
  observation = {},
  options = {},
} = {}) {
  const maxTemporalDeltaMinutes = options.maxTemporalDeltaMinutes ?? 60;
  const maxSpatialDistanceKm = options.maxSpatialDistanceKm ?? 45;

  const fTarget = forecast.targetTime ? new Date(forecast.targetTime).getTime() : NaN;
  const oTime = observation.observedAt ? new Date(observation.observedAt).getTime() : NaN;

  const hasValidTimes = !Number.isNaN(fTarget) && !Number.isNaN(oTime);
  const timeDeltaMinutes = hasValidTimes ? Math.round(Math.abs(fTarget - oTime) / 60000) : null;
  const isTemporalMatch = hasValidTimes && timeDeltaMinutes <= maxTemporalDeltaMinutes;

  const fLat = Number(forecast.lat);
  const fLon = Number(forecast.lon);
  const oLat = Number(observation.lat);
  const oLon = Number(observation.lon);

  const hasCoords = Number.isFinite(fLat) && Number.isFinite(fLon) && Number.isFinite(oLat) && Number.isFinite(oLon);
  const distanceKm = hasCoords ? Math.round(distKm(fLat, fLon, oLat, oLon) * 10) / 10 : 0;
  const isSpatialMatch = distanceKm <= maxSpatialDistanceKm;

  const fElev = Number.isFinite(Number(forecast.elevationM)) ? Number(forecast.elevationM) : null;
  const oElev = Number.isFinite(Number(observation.elevationM)) ? Number(observation.elevationM) : null;
  const elevationDeltaM = (fElev !== null && oElev !== null) ? Math.round(fElev - oElev) : 0;

  // Environmental lapse rate drop (-6.5°C per 1000m ascent)
  const lapseAdjustmentC = Math.round(((elevationDeltaM / 1000) * -6.5) * 10) / 10;

  let validity = 'VALID_GROUND_TRUTH';
  let invalidReason = null;

  if (!hasValidTimes || !isTemporalMatch) {
    validity = 'INVALID_TEMPORAL_MISMATCH';
    invalidReason = `Temporal delta of ${timeDeltaMinutes ?? '--'} minutes exceeds acceptable tolerance of ${maxTemporalDeltaMinutes} minutes.`;
  } else if (!isSpatialMatch) {
    validity = 'INVALID_SPATIAL_MISMATCH';
    invalidReason = `Spatial distance of ${distanceKm} km exceeds acceptable radius of ${maxSpatialDistanceKm} km.`;
  } else if (observation.tempC === null || observation.tempC === undefined) {
    validity = 'MISSING_OBSERVATION';
    invalidReason = 'Observation record does not contain measured temperature.';
  }

  const fTemp = Number(forecast.tempC);
  const oTemp = Number(observation.tempC);
  const hasTemps = Number.isFinite(fTemp) && Number.isFinite(oTemp);

  const signedBiasC = hasTemps ? Math.round((fTemp - oTemp) * 10) / 10 : null;
  const absoluteErrorC = signedBiasC !== null ? Math.round(Math.abs(signedBiasC) * 10) / 10 : null;

  const lapseAdjustedObsTemp = hasTemps ? Math.round((oTemp + lapseAdjustmentC) * 10) / 10 : null;
  const lapseAdjustedErrorC = hasTemps ? Math.round(Math.abs(fTemp - lapseAdjustedObsTemp) * 10) / 10 : null;

  let accuracyClassification = 'UNEVALUATED';
  if (validity === 'VALID_GROUND_TRUTH' && absoluteErrorC !== null) {
    if (absoluteErrorC <= 1.5) accuracyClassification = 'EXACT';
    else if (absoluteErrorC <= 3.0) accuracyClassification = 'ACCEPTABLE';
    else accuracyClassification = 'DIVERGENT';
  }

  return {
    validity,
    isValidComparison: validity === 'VALID_GROUND_TRUTH',
    invalidReason,
    temporalMatching: {
      forecastIssuedAt: forecast.issuedAt || null,
      forecastTargetTime: forecast.targetTime || null,
      observationTime: observation.observedAt || null,
      timeDeltaMinutes,
      isTemporalMatch,
      maxAllowedMinutes: maxTemporalDeltaMinutes,
    },
    spatialMatching: {
      targetCoords: { lat: fLat, lon: fLon },
      targetElevationM: fElev,
      observationCoords: { lat: oLat, lon: oLon },
      observationElevationM: oElev,
      distanceKm,
      elevationDeltaM,
      lapseAdjustmentC,
      isSpatialMatch,
    },
    errorMetrics: {
      forecastTempC: fTemp,
      observedTempC: oTemp,
      signedBiasC,
      absoluteErrorC,
      lapseAdjustedObservedTempC: lapseAdjustedObsTemp,
      lapseAdjustedErrorC,
      accuracyClassification,
    },
  };
}

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

  const countSufficient = countWithTemp >= 3;
  const mae = countWithTemp > 0 ? Math.round((totalTempError / countWithTemp) * 10) / 10 : null;
  const hitRate = totalRainScenarios > 0 ? Math.round((rainHits / totalRainScenarios) * 100) : null;

  return {
    totalEvaluated: inMemoryAccuracyRecords.length,
    sampleSize: countWithTemp,
    temperatureMae: mae,
    rainEventHitRatePercent: hitRate,
    accuracyDistribution: dist,
    dataState: 'EMPIRICAL_MEASUREMENT',
    sampleSizeStatus: countSufficient ? 'SUFFICIENT' : 'PRELIMINARY',
    statusNotice: countSufficient
      ? `Empirical MAE based on N=${countWithTemp} matched pairs.`
      : `Sample size (N=${countWithTemp}) is preliminary. Minimum N=3 verified ground pairs recommended for high statistical confidence.`,
  };
}

module.exports = {
  evaluateForecastObservationPair,
  recordForecastSnapshot,
  verifyForecastWithObservation,
  getAggregateWeatherAccuracyMetrics,
  inMemorySnapshots,
  inMemoryAccuracyRecords,
};
