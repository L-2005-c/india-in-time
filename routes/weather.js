'use strict';
// routes/weather.js
// Proxies Open-Meteo weather fetch with multi-tier caching and deterministic fail-open fallback.
// GET /api/weather?lat=17.71&lon=83.32
// Returns: { temp: number, weathercode: number, emoji: string, hourly: [...] }

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();
const appLogger = require('../lib/logger');
const { keepAliveAgent } = require('../lib/httpAgent');
const { weatherCache } = require('../services/cache');
const { getDeterministicWeather, weatherEmoji } = require('../services/travelIntelligence/weatherEngine');

async function fetchOpenMeteo(lat, lon, timeoutMs = 7000) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,precipitation_probability,precipitation,relative_humidity_2m,wind_speed_10m,uv_index,cloud_cover,visibility,weather_code&forecast_days=2&timezone=Asia%2FKolkata`;
  const upstream = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), agent: keepAliveAgent });
  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '');
    const err = new Error(`Open-Meteo responded ${upstream.status}: ${body.slice(0, 200)}`);
    err.status = upstream.status;
    throw err;
  }
  return upstream.json();
}

router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat / lon params' });

  const numLat = parseFloat(lat);
  const numLon = parseFloat(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
    return res.status(400).json({ error: 'Invalid lat / lon coordinates' });
  }

  const cacheKey = `${numLat.toFixed(2)},${numLon.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  let data;
  try {
    data = await fetchOpenMeteo(numLat, numLon);
  } catch (firstErr) {
    appLogger.warn('[weather] first attempt failed, retrying:', firstErr.message);
    try {
      data = await fetchOpenMeteo(numLat, numLon, 5000);
    } catch (secondErr) {
      appLogger.warn('[weather] Open-Meteo upstream unavailable; serving deterministic seasonal fallback:', secondErr.message);
      const fallback = getDeterministicWeather(numLat, numLon);
      weatherCache.set(cacheKey, fallback);
      return res.json(fallback);
    }
  }

  try {
    const cw = data?.current_weather;
    if (!cw) {
      const fallback = getDeterministicWeather(numLat, numLon);
      weatherCache.set(cacheKey, fallback);
      return res.json(fallback);
    }

    const temp = Math.round(cw.temperature);
    const windKph = Math.round(cw.windspeed || 0);
    const h = data?.hourly || {};
    const hourly = Array.isArray(h.time) ? h.time.map((time, i) => ({
      time,
      tempC: h.temperature_2m?.[i] != null ? Math.round(h.temperature_2m[i] * 10) / 10 : null,
      precipitationProbability: h.precipitation_probability?.[i] ?? null,
      precipitationMm: h.precipitation?.[i] ?? null,
      humidity: h.relative_humidity_2m?.[i] ?? null,
      windKph: h.wind_speed_10m?.[i] ?? null,
      uvIndex: h.uv_index?.[i] ?? null,
      cloudCover: h.cloud_cover?.[i] ?? null,
      visibilityM: h.visibility?.[i] ?? null,
      weathercode: h.weather_code?.[i] ?? null,
    })) : [];

    const response = {
      temp,
      tempC: temp,
      windKph,
      weathercode: cw.weathercode,
      emoji:       weatherEmoji(cw.weathercode),
      display:     `${weatherEmoji(cw.weathercode)} ${temp}°C`,
      forecastSource: 'Open-Meteo forecast',
      hourly,
    };
    weatherCache.set(cacheKey, response);
    res.json(response);
  } catch (err) {
    appLogger.error('[weather] parse error, serving fallback:', err.message);
    const fallback = getDeterministicWeather(numLat, numLon);
    res.json(fallback);
  }
});

module.exports = router;