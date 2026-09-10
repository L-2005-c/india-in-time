'use strict';

/**
 * services/travelIntelligence/weather/weatherProviderRegistry.js
 *
 * Multi-Provider Weather Dispatcher & Consensus Coordinator for India In-Time v3.0.
 * Coordinates primary Indian meteorological providers (IMD) and global models (Open-Meteo).
 * Leverages LRU caching with single-flight request coalescing to prevent API exhaustion.
 */

const appLogger = require('../../../lib/logger');
const { getOpenMeteoWeather } = require('./adapters/openMeteoAdapter');
const { getImdWeather, findNearestStation } = require('./adapters/imdWeatherAdapter');
const { evaluateWeatherConsensus } = require('./weatherConsensusEngine');
const { weatherCache } = require('../../cache');

/**
 * Returns quantized spatial cache key (0.05° grid ≈ 5.5km).
 */
function getQuantizedWeatherKey(lat, lon, elevationM = null) {
  const qLat = Math.round(Number(lat) * 20) / 20;
  const qLon = Math.round(Number(lon) * 20) / 20;
  const elevKey = Number.isFinite(Number(elevationM)) ? `_e${Math.round(Number(elevationM))}` : '';
  return `v3_weather_${qLat.toFixed(2)}_${qLon.toFixed(2)}${elevKey}`;
}

/**
 * Primary multi-provider weather consensus aggregator.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {Object} [options]
 * @returns {Promise<Object>} Consensus Weather Object
 */
async function getConsensusWeather(lat, lon, options = {}) {
  const numLat = Number(lat);
  const numLon = Number(lon);

  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
    return evaluateWeatherConsensus([], options);
  }

  const cacheKey = getQuantizedWeatherKey(numLat, numLon, options.elevationM);
  const cached = weatherCache ? weatherCache.get(cacheKey) : null;
  if (cached && !options.skipCache && process.env.NODE_ENV !== 'test') {
    return cached;
  }

  const nearestStation = findNearestStation(numLat, numLon);

  // Query both providers concurrently with bounded timeouts
  const [openMeteoRes, imdRes] = await Promise.allSettled([
    getOpenMeteoWeather(numLat, numLon, options),
    getImdWeather(numLat, numLon, options),
  ]);

  const reports = [];
  if (openMeteoRes.status === 'fulfilled' && openMeteoRes.value?.isAvailable) {
    reports.push(openMeteoRes.value);
  } else if (openMeteoRes.status === 'rejected') {
    appLogger.warn(`[weatherRegistry] OpenMeteo rejected: ${openMeteoRes.reason?.message}`);
  }

  if (imdRes.status === 'fulfilled' && imdRes.value?.isAvailable) {
    reports.push(imdRes.value);
  } else if (imdRes.status === 'rejected') {
    appLogger.warn(`[weatherRegistry] IMD rejected: ${imdRes.reason?.message}`);
  }

  const consensus = evaluateWeatherConsensus(reports, options);
  consensus.station = nearestStation;

  if (weatherCache && consensus.isAvailable && consensus.dataState !== 'HISTORICAL' && process.env.NODE_ENV !== 'test') {
    weatherCache.set(cacheKey, consensus);
  }

  return consensus;
}

/**
 * Deep diagnostic inspection of meteorological providers, consensus, and classification.
 */
async function getWeatherDiagnostics(lat, lon, options = {}) {
  const numLat = Number(lat);
  const numLon = Number(lon);
  const elevationM = Number.isFinite(Number(options.elevationM)) ? Number(options.elevationM) : null;
  const nearestStation = findNearestStation(numLat, numLon);
  const startTime = Date.now();

  const [openMeteoRes, imdRes] = await Promise.allSettled([
    getOpenMeteoWeather(numLat, numLon, { ...options, elevationM }),
    getImdWeather(numLat, numLon, { ...options, elevationM }),
  ]);

  const reports = [];
  if (openMeteoRes.status === 'fulfilled' && openMeteoRes.value?.isAvailable) {
    reports.push(openMeteoRes.value);
  }
  if (imdRes.status === 'fulfilled' && imdRes.value?.isAvailable) {
    reports.push(imdRes.value);
  }

  const consensus = evaluateWeatherConsensus(reports, options);
  consensus.station = nearestStation;

  const cacheKey = getQuantizedWeatherKey(numLat, numLon, elevationM);
  const isCached = weatherCache ? Boolean(weatherCache.get(cacheKey)) : false;

  let classification = 'HISTORICAL_ESTIMATE';
  if (consensus.dataState === 'OBSERVED') {
    classification = 'ACTUAL_OBSERVATION';
  } else if (consensus.dataState === 'PREDICTED' || consensus.providersConsidered?.includes('OPEN_METEO')) {
    classification = 'PROVIDER_FORECAST';
  } else if (isCached) {
    classification = 'CACHED_VALUE';
  }

  return {
    requestedLocation: { latitude: numLat, longitude: numLon, explicitElevationM: elevationM },
    resolvedStation: nearestStation,
    classification,
    temperatures: {
      rawTemperatureC: consensus.temperatureC,
      displayTemperatureC: consensus.temperatureC !== null ? Math.round(consensus.temperatureC) : null,
      apparentTempC: consensus.apparentTempC,
    },
    timestamps: {
      requestedAtIST: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      observedAt: consensus.observedAt || null,
      forecastFor: consensus.forecastFor || null,
      latencyMs: Date.now() - startTime,
    },
    temporalGrounding: {
      forecastIssuedAt: consensus.timestamps?.issuedAt || null,
      forecastTargetTime: consensus.forecastFor || consensus.observedAt || new Date().toISOString(),
      observationTime: consensus.observedAt || null,
      timeDeltaMinutes: consensus.observedAt ? Math.round(Math.abs(Date.now() - new Date(consensus.observedAt).getTime()) / 60000) : null,
      validity: consensus.dataState === 'OBSERVED' ? 'OBSERVATION_GROUND_TRUTH' : (consensus.isEstimated ? 'ESTIMATED_MODEL' : 'NWP_FORECAST'),
    },
    spatialGrounding: {
      targetCoords: { lat: numLat, lon: numLon },
      targetElevationM: elevationM ?? nearestStation?.elevationM ?? null,
      stationCoords: nearestStation ? { lat: nearestStation.lat, lon: nearestStation.lon } : null,
      stationElevationM: nearestStation?.elevationM ?? null,
      distanceKm: nearestStation?.distanceKm ?? null,
      elevationDeltaM: (elevationM != null && nearestStation?.elevationM != null) ? Math.round(elevationM - nearestStation.elevationM) : 0,
    },
    providers: {
      openMeteo: {
        status: openMeteoRes.status,
        record: openMeteoRes.value || null,
        error: openMeteoRes.status === 'rejected' ? openMeteoRes.reason?.message : (openMeteoRes.value?.warnings || null),
      },
      imd: {
        status: imdRes.status,
        record: imdRes.value || null,
        error: imdRes.status === 'rejected' ? imdRes.reason?.message : null,
      },
    },
    consensus,
    cache: {
      key: cacheKey,
      isCached,
    },
  };
}

module.exports = {
  getConsensusWeather,
  getQuantizedWeatherKey,
  getWeatherDiagnostics,
};
