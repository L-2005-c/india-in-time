// routes/weather.js
// Proxies Open-Meteo weather fetch (no API key needed, but we proxy for consistency).
// GET /api/weather?lat=17.71&lon=83.32
// Returns: { temp: number, weathercode: number, emoji: string }

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

function weatherEmoji(code) {
  if (code <= 1)  return '☀️';
  if (code <= 3)  return '⛅';
  if (code <= 48) return '☁️';
  return '🌧️';
}

router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat / lon params' });

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(6000) });

    if (!upstream.ok) return res.status(502).json({ error: 'Weather upstream error' });

    const data = await upstream.json();
    const cw   = data?.current_weather;

    if (!cw) return res.status(502).json({ error: 'No weather data in response' });

    const temp = Math.round(cw.temperature);
    const windKph = Math.round(cw.windspeed || 0);
    res.json({
      temp,
      windKph,
      weathercode: cw.weathercode,
      emoji:       weatherEmoji(cw.weathercode),
      display:     `${weatherEmoji(cw.weathercode)} ${temp}°C`,
    });
  } catch (err) {
    console.error('[weather]', err.message);
    res.status(500).json({ error: 'Weather fetch failed' });
  }
});

module.exports = router;