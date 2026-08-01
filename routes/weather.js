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

async function fetchOpenMeteo(lat, lon, timeoutMs = 8000) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  const upstream = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
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

  let data;
  try {
    data = await fetchOpenMeteo(lat, lon);
  } catch (firstErr) {
    // One retry — most Open-Meteo failures on Render are a single transient
    // blip (cold outbound connection, brief upstream hiccup), not a real outage.
    console.warn('[weather] first attempt failed, retrying:', firstErr.message);
    try {
      data = await fetchOpenMeteo(lat, lon);
    } catch (secondErr) {
      // Log the real reason so it's actually diagnosable in Render logs,
      // instead of a generic "Weather upstream error" every time.
      console.error('[weather] upstream failed after retry:', secondErr.message);
      const status = secondErr.name === 'TimeoutError' || secondErr.name === 'AbortError' ? 504 : 502;
      return res.status(status).json({ error: 'Weather upstream error', detail: secondErr.message });
    }
  }

  try {
    const cw = data?.current_weather;
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
    console.error('[weather] parse error:', err.message);
    res.status(500).json({ error: 'Weather fetch failed' });
  }
});

module.exports = router;