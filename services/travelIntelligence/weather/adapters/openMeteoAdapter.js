'use strict';

/**
 * services/travelIntelligence/weather/adapters/openMeteoAdapter.js
 *
 * Open-Meteo Weather Provider Adapter for India In-Time v3.0.
 * Ingests global numerical weather prediction (NWP) telemetry (ECMWF / GFS).
 */

const fetch = require('node-fetch');
const { keepAliveAgent } = require('../../../../lib/httpAgent');
const appLogger = require('../../../../lib/logger');
const { normalizeWeatherRecord } = require('../weatherNormalizer');
const { DATA_STATES, CONFIDENCE_LEVELS } = require('../../provenanceModel');
const { weatherCodeToCondition } = require('../../weatherEngine');

const PROVIDER_NAME = 'OPEN_METEO';

async function fetchFromOpenMeteo(lat, lon, { elevationM = null, timeoutMs = 9000 } = {}) {
  let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,relative_humidity_2m,wind_speed_10m,uv_index,cloud_cover,visibility,weather_code&forecast_days=2&timezone=Asia%2FKolkata`;
  if (Number.isFinite(Number(elevationM))) {
    url += `&elevation=${Math.round(Number(elevationM))}`;
  }

  const upstream = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    agent: keepAliveAgent,
    headers: {
      'User-Agent': 'IndiaInTime/3.0 (weather-intelligence@indiaintime.app)',
      'Accept': 'application/json',
    },
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    const err = new Error(`Open-Meteo returned HTTP ${upstream.status}: ${text.slice(0, 150)}`);
    err.status = upstream.status;
    throw err;
  }

  return upstream.json();
}

/**
 * Fetches and normalizes weather from Open-Meteo.
 */
async function getOpenMeteoWeather(lat, lon, options = {}) {
  let raw = null;
  let lastError = null;
  try {
    raw = await fetchFromOpenMeteo(lat, lon, options);
  } catch (firstErr) {
    lastError = firstErr;
    appLogger.info(`[openMeteoAdapter] First attempt failed (${firstErr.message}), retrying...`);
    try {
      raw = await fetchFromOpenMeteo(lat, lon, { ...options, timeoutMs: 5000 });
    } catch (secondErr) {
      lastError = secondErr;
      appLogger.warn(`[openMeteoAdapter] Provider fetch failed: ${secondErr.message}`);
      return normalizeWeatherRecord({
        provider: PROVIDER_NAME,
        dataState: DATA_STATES.UNAVAILABLE,
        confidence: CONFIDENCE_LEVELS.LOW,
        latitude: lat,
        longitude: lon,
        rawWarnings: [`Open-Meteo fetch failed: ${secondErr.message}`],
      });
    }
  }

  try {
    const cw = raw?.current_weather;
    if (!cw) {
      throw new Error('Missing current_weather in Open-Meteo payload');
    }

    const h = raw?.hourly || {};
    const condition = weatherCodeToCondition ? weatherCodeToCondition(cw.weathercode) : 'Clear';

    // Extract current hourly values if available
    const firstTemp = cw.temperature;
    const firstRainProb = Array.isArray(h.precipitation_probability) ? h.precipitation_probability[0] : 0;
    const firstRainMm = Array.isArray(h.precipitation) ? h.precipitation[0] : 0;
    const firstHumidity = Array.isArray(h.relative_humidity_2m) ? h.relative_humidity_2m[0] : 60;
    const firstCloud = Array.isArray(h.cloud_cover) ? h.cloud_cover[0] : 20;
    const firstUv = Array.isArray(h.uv_index) ? h.uv_index[0] : 3;

    const timeKeys = Array.isArray(h.time)
      ? h.time
      : (Array.isArray(h.temperature_2m)
          ? h.temperature_2m.map((_, i) => `+${i}h`)
          : (Array.isArray(h.weathercode)
              ? h.weathercode.map((_, i) => `+${i}h`)
              : (Array.isArray(h.weather_code)
                  ? h.weather_code.map((_, i) => `+${i}h`)
                  : [])));

    const hourly = timeKeys.map((time, i) => ({
      time,
      tempC: h.temperature_2m?.[i] != null ? Math.round(h.temperature_2m[i] * 10) / 10 : null,
      apparentTempC: h.apparent_temperature?.[i] != null ? Math.round(h.apparent_temperature[i] * 10) / 10 : null,
      precipitationProbability: h.precipitation_probability?.[i] ?? null,
      precipitationMm: h.precipitation?.[i] ?? null,
      humidity: h.relative_humidity_2m?.[i] ?? null,
      windKph: h.wind_speed_10m?.[i] ?? null,
      uvIndex: h.uv_index?.[i] ?? null,
      cloudCover: h.cloud_cover?.[i] ?? null,
      visibilityM: h.visibility?.[i] ?? null,
      weathercode: h.weathercode?.[i] ?? h.weather_code?.[i] ?? null,
    }));

    return normalizeWeatherRecord({
      provider: PROVIDER_NAME,
      dataState: DATA_STATES.PREDICTED,
      confidence: CONFIDENCE_LEVELS.HIGH,
      latitude: lat,
      longitude: lon,
      elevationM: raw.elevation ?? options.elevationM,
      temperatureC: firstTemp,
      apparentTempC: h.apparent_temperature?.[0] ?? firstTemp,
      humidityPercent: firstHumidity,
      windKph: cw.windspeed,
      precipitationProb: firstRainProb,
      precipitationMm: firstRainMm,
      condition,
      cloudCoverPercent: firstCloud,
      uvIndex: firstUv,
      observedAt: cw.time ? new Date(cw.time).toISOString() : new Date().toISOString(),
      forecastFor: new Date().toISOString(),
      hourly,
    });
  } catch (err) {
    appLogger.warn(`[openMeteoAdapter] Provider fetch failed: ${err.message}`);
    return normalizeWeatherRecord({
      provider: PROVIDER_NAME,
      dataState: DATA_STATES.UNAVAILABLE,
      confidence: CONFIDENCE_LEVELS.LOW,
      latitude: lat,
      longitude: lon,
      rawWarnings: [`Open-Meteo fetch failed: ${err.message}`],
    });
  }
}

module.exports = {
  PROVIDER_NAME,
  getOpenMeteoWeather,
};
