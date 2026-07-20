// routes/weather-alerts.js
// Returns detailed weather + best time to visit for each stop in the itinerary
// POST /api/weather-alerts   { lat, lon, stops: [{name, cat, ot, ct}] }

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

function weatherEmoji(code) {
  if (code <= 1)  return '☀️';
  if (code <= 3)  return '⛅';
  if (code <= 48) return '☁️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  return '⛈️';
}

function weatherDesc(code) {
  if (code <= 1)  return 'Clear skies';
  if (code <= 3)  return 'Partly cloudy';
  if (code <= 48) return 'Overcast / foggy';
  if (code <= 67) return 'Rain expected';
  if (code <= 77) return 'Snow / sleet';
  return 'Thunderstorm';
}

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

router.post('/', async (req, res) => {
  const { lat, lon } = req.body;
  // Cap + shape-check stops: unbounded, unvalidated arrays here let a
  // single request force arbitrarily large work (unlike routes/ai.js,
  // which runs every array through sanitizeStringArray/sanitizeObjectArray).
  const stops = Array.isArray(req.body.stops)
    ? req.body.stops.slice(0, 50).filter(s => s && typeof s === 'object')
    : [];
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat/lon' });

  try {
    // Fetch hourly forecast for today
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode,precipitation_probability&current_weather=true&forecast_days=1`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return res.status(502).json({ error: 'Weather upstream error' });

    const data = await upstream.json();
    const cw   = data.current_weather;
    // Guarded: every other upstream call in this app defensively handles a
    // malformed/partial response — this one previously assumed `hourly`
    // would always be present and would throw a 500 if it wasn't.
    const hourly = data.hourly || {};
    if (!cw) return res.status(502).json({ error: 'No weather data in response' });

    const currentTemp = Math.round(cw.temperature);
    const currentCode = cw.weathercode;

    // Build per-stop alerts
    const stopAlerts = stops.map(stop => {
      // Parse opening hour to get the forecast at that time
      const openHour = parseInt((stop.ot || '09:00').split(':')[0]);
      const hourIdx  = Math.min(openHour, (hourly.temperature_2m?.length || 1) - 1);

      const temp     = Math.round(hourly.temperature_2m?.[hourIdx] ?? currentTemp);
      const code     = hourly.weathercode?.[hourIdx] ?? currentCode;
      const rainProb = hourly.precipitation_probability?.[hourIdx] ?? 0;

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
    console.error('[weather-alerts]', err.message);
    res.status(500).json({ error: 'Weather alerts fetch failed' });
  }
});

module.exports = router;
