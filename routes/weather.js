'use strict';
// routes/weather.js — v3.0 Canonical Multi-Provider Weather Truth Route
// Integrates Open-Meteo NWP and IMD Ground Observations with consensus evaluation,
// altitude lapse-rate modeling, and strict provenance tracking.
// GET /api/weather?lat=17.71&lon=83.32[&elevationM=45]

const express = require('express');
const router  = express.Router();
const appLogger = require('../lib/logger');
const { getConsensusWeather, getWeatherDiagnostics } = require('../services/travelIntelligence/weather/weatherProviderRegistry');
const { getDeterministicWeather, weatherEmoji, weatherCodeToCondition } = require('../services/travelIntelligence/weatherEngine');

function conditionToWeatherCode(cond, defaultCode = 1) {
  const c = String(cond || '').toLowerCase();
  if (/thunder|storm/i.test(c)) return 95;
  if (/shower/i.test(c)) return 80;
  if (/rain|drizzle/i.test(c)) return 61;
  if (/overcast|fog/i.test(c)) return 45;
  if (/cloud/i.test(c)) return 3;
  return defaultCode;
}

// Development/admin diagnostic endpoint for real-world meteorological validation
router.get('/debug', async (req, res) => {
  const { lat, lon, elevationM } = req.query;
  const numLat = parseFloat(lat || 17.6868);
  const numLon = parseFloat(lon || 83.2185);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
    return res.status(400).json({ error: 'Invalid lat / lon coordinates' });
  }

  const numElev = Number.isFinite(Number(elevationM)) ? Number(elevationM) : null;
  try {
    const diag = await getWeatherDiagnostics(numLat, numLon, { elevationM: numElev, skipCache: true });
    return res.json(diag);
  } catch (err) {
    appLogger.error('[weather/debug] Diagnostic check failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  const { lat, lon, elevationM } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat / lon params' });

  const numLat = parseFloat(lat);
  const numLon = parseFloat(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
    return res.status(400).json({ error: 'Invalid lat / lon coordinates' });
  }

  const numElev = Number.isFinite(Number(elevationM)) ? Number(elevationM) : null;

  try {
    const truth = await getConsensusWeather(numLat, numLon, { elevationM: numElev });
    if (!truth || !truth.isAvailable) {
      const fallback = getDeterministicWeather(numLat, numLon);
      return res.json(fallback);
    }

    const temp = Math.round(truth.temperatureC);
    const tempC = truth.temperatureC;
    const feelsLikeC = truth.apparentTempC ?? tempC;
    const windKph = Math.round(truth.windKph || 0);
    const condition = truth.condition || weatherCodeToCondition(truth.weathercode);
    const weathercode = truth.weathercode ?? conditionToWeatherCode(condition);
    const emoji = weatherEmoji(weathercode);

    const isSeasonal = truth.dataState === 'HISTORICAL' || truth.dataState === 'ESTIMATED' ||
      truth.selectedSource === 'seasonal_estimate' ||
      (!truth.providersConsidered?.includes('OPEN_METEO') && truth.providersConsidered?.includes('IMD') && truth.dataState !== 'OBSERVED');

    const isEstimated = Boolean(truth.isEstimated ?? (truth.dataState === 'ESTIMATED' || truth.dataState === 'HISTORICAL' || isSeasonal));

    const result = {
      temp,
      tempC,
      rawTemperatureC: tempC,
      displayTemperatureC: temp,
      feelsLikeC,
      windKph,
      weathercode,
      condition,
      emoji,
      display: `${emoji} ${temp}°C`,
      forecastSource: isSeasonal
        ? 'seasonal_estimate'
        : (truth.selectedSource || (truth.providersConsidered?.join(' + ')) || 'Weather Consensus Engine'),
      consensusState: truth.consensusState,
      confidence: truth.confidence,
      dataState: truth.dataState || (isSeasonal ? 'HISTORICAL' : 'PREDICTED'),
      isEstimated,
      userDisclosure: truth.userDisclosure || (isEstimated ? 'Live weather observation is unavailable. Showing a mathematical model estimate based on diurnal and historical patterns.' : null),
      selectionReason: truth.selectionReason || (isEstimated ? 'FALLBACK_DIURNAL_ESTIMATE' : 'NWP_MODEL_AVAILABLE'),
      elevationAudit: truth.elevationAudit || null,
      rainProb: truth.precipitationProb,
      humidity: truth.humidityPercent,
      station: truth.station || null,
      divergence: truth.divergence || null,
      advisories: truth.advisories || [],
      disagreementNotice: truth.disagreementNotice || null,
      hourly: truth.hourly || [],
      observedAt: truth.observedAt || null,
      updatedAtIST: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };

    return res.json(result);
  } catch (err) {
    appLogger.error('[weather] Error computing consensus weather:', err.message);
    const fallback = getDeterministicWeather(numLat, numLon);
    return res.json(fallback);
  }
});

module.exports = router;