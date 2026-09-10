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
const { getImdWeather } = require('./adapters/imdWeatherAdapter');
const { evaluateWeatherConsensus } = require('./weatherConsensusEngine');
const { weatherCache } = require('../../cache');

/**
 * Generates a stable spatial cache key accounting for 0.05° (~5km) grid quantization and elevation.
 */
function getQuantizedWeatherKey(lat, lon, elevationM = null) {
  const qLat = (Math.round(lat * 20) / 20).toFixed(2);
  const qLon = (Math.round(lon * 20) / 20).toFixed(2);
  const elev = elevationM != null ? `_e${Math.round(elevationM / 100) * 100}` : '';
  return `v3_weather_${qLat}_${qLon}${elev}`;
}

/**
 * Fetches multi-provider weather for target coordinates, evaluates consensus,
 * and caches the resulting Canonical Consensus Record.
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
  if (cached && !options.skipCache) {
    return cached;
  }

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

  if (weatherCache && consensus.isAvailable) {
    weatherCache.set(cacheKey, consensus);
  }

  return consensus;
}

module.exports = {
  getConsensusWeather,
  getQuantizedWeatherKey,
};
