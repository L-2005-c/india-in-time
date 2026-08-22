'use strict';
// routes/weather-alerts.js
// Returns detailed weather + best time to visit for each stop in the itinerary
// POST /api/weather-alerts   { lat, lon, stops: [{name, cat, ot, ct}] }

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();
const appLogger = require('../lib/logger');
const { keepAliveAgent } = require('../lib/httpAgent');
const { weatherCache } = require('../services/cache');
const {
  getDeterministicWeather,
  weatherEmoji,
  weatherDesc,
} = require('../services/travelIntelligence/weatherEngine');

function alertLevel(code, temp) {
  if (code >= 80) return 'danger';
  if (code >= 61 || temp >= 40 || temp <= 5) return 'warning';
  return 'good';
}

function bestTimeForCat(cat, weatherCode) {
  const isRainy = weatherCode >= 51;
  if (cat === 'beach') return isRainy ? 'Avoid — wait for clear skies' : 'Best: Early morning (6–9 AM) or sunset (5–7 PM)';
  if (cat === 'temple') return 'Best: Early morning (6–9 AM) — cooler & less crowded';
  if (cat === 'food') return 'Best: Lunch (12–2 PM) or dinner (7–10 PM)';
  if (cat === 'scenic') return isRainy ? 'Misty views possible — bring raincoat' : 'Best: Golden hour (6–8 AM or 4–6 PM)';
  return 'Anytime during opening hours';
}

async function fetchWeatherHourly(lat, lon) {
  const cacheKey = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Array.isArray(cached.hourly) && cached.hourly.length) {
    return {
      currentTemp: cached.tempC ?? cached.temp ?? 28,
      currentCode: cached.weathercode ?? 1,
      hourlyTemps: cached.hourly.map(h => h.tempC),
      hourlyCodes: cached.hourly.map(h => h.weathercode),
      hourlyRainProb: cached.hourly.map(h => h.precipitationProbability),
    };
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode,precipitation_probability&current_weather=true&forecast_days=1`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(6000), agent: keepAliveAgent });
    if (upstream.ok) {
      const data = await upstream.json();
      const cw = data.current_weather || {};
      const hourly = data.hourly || {};
      return {
        currentTemp: Math.round(cw.temperature ?? 28),
        currentCode: cw.weathercode ?? 1,
        hourlyTemps: Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m.map(t => Math.round(t)) : [],
        hourlyCodes: Array.isArray(hourly.weathercode) ? hourly.weathercode : [],
        hourlyRainProb: Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [],
      };
    }
  } catch (err) {
    appLogger.warn('[weather-alerts] Open-Meteo failed, using fallback:', err.message);
  }

  const fallback = getDeterministicWeather(lat, lon);
  return {
    currentTemp: fallback.tempC,
    currentCode: fallback.weathercode,
    hourlyTemps: fallback.hourly.map(h => h.tempC),
    hourlyCodes: fallback.hourly.map(h => h.weathercode),
    hourlyRainProb: fallback.hourly.map(h => h.precipitationProbability),
  };
}

router.post('/', async (req, res) => {
  const { lat, lon } = req.body;
  const stops = Array.isArray(req.body.stops)
    ? req.body.stops.slice(0, 50).filter(s => s && typeof s === 'object')
    : [];
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat/lon' });

  const numLat = parseFloat(lat);
  const numLon = parseFloat(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
    return res.status(400).json({ error: 'Invalid lat/lon coordinates' });
  }

  try {
    const weather = await fetchWeatherHourly(numLat, numLon);
    const { currentTemp, currentCode, hourlyTemps, hourlyCodes, hourlyRainProb } = weather;

    const stopAlerts = stops.map(stop => {
      const openHour = parseInt((stop.ot || '09:00').split(':')[0]) || 9;
      const hourIdx  = Math.min(openHour, Math.max(0, hourlyTemps.length - 1));

      const temp     = hourlyTemps[hourIdx] ?? currentTemp;
      const code     = hourlyCodes[hourIdx] ?? currentCode;
      const rainProb = hourlyRainProb[hourIdx] ?? 0;

      return {
        name:        stop.name,
        cat:         stop.cat,
        temp,
        weatherCode: code,
        emoji:       weatherEmoji(code),
        desc:        weatherDesc(code),
        rainProb,
        alertLevel:  alertLevel(code, temp),
        bestTime:    bestTimeForCat(stop.cat, code),
        advice:      temp >= 35
          ? `🌡️ Very hot (${temp}°C) — carry water & sunscreen!`
          : rainProb > 60
          ? `🌧️ ${rainProb}% rain chance — carry an umbrella!`
          : `✅ Good conditions at ${temp}°C`,
      };
    });

    res.json({
      current: {
        temp:    currentTemp,
        emoji:   weatherEmoji(currentCode),
        desc:    weatherDesc(currentCode),
        code:    currentCode,
      },
      stops: stopAlerts,
    });
  } catch (err) {
    appLogger.error('[weather-alerts]', err.message);
    res.status(500).json({ error: 'Weather alerts fetch failed' });
  }
});

module.exports = router;
