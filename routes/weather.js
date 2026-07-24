// routes/weather.js
// Proxies Open-Meteo weather fetch (no API key needed, but we proxy for consistency).
// GET /api/weather?lat=17.71&lon=83.32
// Returns: { temp: number, weathercode: number, emoji: string }
//
// weatherCache (services/cache.js) was already defined and configured
// (config.cache.weatherTtlMs, 5 min default) but this route never called
// .get()/.set() on it — every GPS update hit Open-Meteo fresh, so any
// transient upstream hiccup (rate limit, brief outage) surfaced immediately
// to every user as the "Weather offline" banner, with zero resilience.

const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();
const { weatherCache } = require('../services/cache');

// How long a last-known-good reading may be served if Open-Meteo is down.
// Weather changes slowly enough that a few-hour-old reading is far better
// UX than an outright failure banner.
const STALE_FALLBACK_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

function weatherEmoji(code) {
  if (code <= 1)  return '☀️';
  if (code <= 3)  return '⛅';
  if (code <= 48) return '☁️';
  return '🌧️';
}

// Round coords to ~1.1km precision so GPS jitter/nearby pings during a trip
// share one cache entry instead of each fractional-degree reading missing.
function weatherCacheKey(lat, lon) {
  return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
}

router.get('/', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat / lon params' });

  const key = weatherCacheKey(lat, lon);
  const cached = weatherCache.get(key);
  if (cached) return res.json(cached);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(6000) });

    if (!upstream.ok) {
      const err = new Error('Weather upstream error');
      err.upstreamStatus = upstream.status;
      throw err;
    }

    const data = await upstream.json();
    const cw   = data?.current_weather;
    if (!cw) throw new Error('No weather data in response');

    const temp = Math.round(cw.temperature);
    const windKph = Math.round(cw.windspeed || 0);
    const payload = {
      temp,
      windKph,
      weathercode: cw.weathercode,
      emoji:       weatherEmoji(cw.weathercode),
      display:     `${weatherEmoji(cw.weathercode)} ${temp}°C`,
    };

    weatherCache.set(key, payload); // hot cache, default TTL from config.cache.weatherTtlMs
    weatherCache.set(`${key}:stale`, payload, STALE_FALLBACK_TTL_MS); // long-lived fallback copy
    res.json(payload);
  } catch (err) {
    console.error('[weather]', err.message);

    // Open-Meteo down or rate-limited: serve the last known-good reading for
    // this location (up to 3h old) instead of failing outright.
    const stale = weatherCache.get(`${key}:stale`);
    if (stale) {
      console.warn(`[weather] upstream failed, serving stale reading for ${key}`);
      return res.json({ ...stale, stale: true });
    }

    if (err.upstreamStatus) {
      return res.status(502).json({ error: 'Weather upstream error', status: err.upstreamStatus });
    }
    res.status(500).json({ error: 'Weather fetch failed' });
  }
});

module.exports = router;