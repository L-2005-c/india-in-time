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

const { getConsensusWeather } = require('../services/travelIntelligence/weather/weatherProviderRegistry');

async function fetchWeatherHourly(lat, lon) {
  try {
    const truth = await getConsensusWeather(Number(lat), Number(lon), { skipCache: true });
    if (truth && truth.isAvailable) {
      const h = Array.isArray(truth.hourly) ? truth.hourly : [];
      return {
        currentTemp: Math.round(truth.temperatureC),
        currentCode: truth.weathercode ?? 1,
        hourlyTemps: h.map(x => (x.tempC != null ? x.tempC : (x.temperature != null ? x.temperature : Math.round(truth.temperatureC)))),
        hourlyCodes: h.map(x => (x.weathercode != null ? x.weathercode : (x.weather_code != null ? x.weather_code : 1))),
        hourlyRainProb: h.map(x => (x.precipitationProbability != null ? x.precipitationProbability : (x.rain_prob != null ? x.rain_prob : 0))),
      };
    }
  } catch (err) {
    appLogger.warn('[weather-alerts] Consensus fetch failed, using fallback:', err.message);
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
