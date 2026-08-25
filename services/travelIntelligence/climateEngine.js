'use strict';

/**
 * services/travelIntelligence/climateEngine.js
 * Unified Climate-Aware Planning Engine.
 * Evaluates Monsoon intelligence (rain windows & dry lulls) and Heat Escape intelligence (thermal comfort & heat index).
 */

const CLIMATE_MODES = {
  NORMAL: 'NORMAL',
  MONSOON: 'MONSOON',
  RAIN_WINDOW: 'RAIN_WINDOW',
  HEAT_ESCAPE: 'HEAT_ESCAPE',
  EXTREME_HEAT: 'EXTREME_HEAT',
  MIXED_WEATHER: 'MIXED_WEATHER',
};

/**
 * Computes Steadman Heat Index (°C) given dry bulb temperature (°C) and relative humidity (%).
 */
function computeHeatIndex(tempC, humidityPercent = 50) {
  if (!Number.isFinite(tempC)) return tempC;
  if (tempC < 25) return tempC; // Heat index only relevant above 25°C

  const t = (tempC * 9 / 5) + 32; // Fahrenheit
  const r = Math.max(0, Math.min(100, humidityPercent));

  // Steadman simple formula
  let hi = 0.5 * (t + 61.0 + ((t - 68.0) * 1.2) + (r * 0.094));
  if (hi >= 80) {
    // Rothfusz regression equation
    hi = -42.379 + 2.04901523 * t + 10.14333127 * r - 0.22475541 * t * r -
         0.00683783 * t * t - 0.05481717 * r * r + 0.00122874 * t * t * r +
         0.00085282 * t * r * r - 0.00000199 * t * t * r * r;
  }

  const hiC = (hi - 32) * 5 / 9;
  return Math.round(hiC * 10) / 10;
}

/**
 * Analyzes full-day weather forecast and classifies the primary climate planning strategy.
 */
function analyzeClimateStrategy(weatherForecast = {}) {
  const wf = weatherForecast || {};
  const hourly = Array.isArray(wf.hourly) ? wf.hourly : [];
  const currentTemp = wf.tempC ?? 28;
  const currentRain = /rain|storm|drizzle|shower/i.test(wf.condition || '');
  const currentHumidity = wf.humidity ?? 65;

  let maxTemp = currentTemp;
  let maxHeatIndex = computeHeatIndex(currentTemp, currentHumidity);
  let maxPrecipProb = currentRain ? 80 : 0;
  let rainHours = 0;
  let dryHours = 0;
  const dryWindows = [];
  let currentDryStart = null;

  for (let i = 0; i < hourly.length; i++) {
    const h = hourly[i] || {};
    const t = h.tempC ?? currentTemp;
    const hum = h.humidity ?? currentHumidity;
    const hi = computeHeatIndex(t, hum);
    const rainProb = h.precipProbability ?? (/rain|storm/i.test(h.condition || '') ? 75 : 0);

    if (t > maxTemp) maxTemp = t;
    if (hi > maxHeatIndex) maxHeatIndex = hi;
    if (rainProb > maxPrecipProb) maxPrecipProb = rainProb;

    const minute = typeof h.time === 'string' && h.time.includes(':')
      ? parseInt(h.time.split(':')[0], 10) * 60 + parseInt(h.time.split(':')[1], 10)
      : (i * 60);

    if (rainProb >= 45) {
      rainHours++;
      if (currentDryStart !== null) {
        dryWindows.push({ start: currentDryStart, end: minute });
        currentDryStart = null;
      }
    } else {
      dryHours++;
      if (currentDryStart === null) currentDryStart = minute;
    }
  }

  if (currentDryStart !== null) {
    dryWindows.push({ start: currentDryStart, end: 1440 });
  }

  // Strategy Decision Matrix
  let mode = CLIMATE_MODES.NORMAL;
  let banner = null;

  if ((rainHours >= 2 || currentRain) && maxPrecipProb >= 60) {
    if (dryWindows.some(w => (w.end - w.start) >= 90)) {
      mode = CLIMATE_MODES.RAIN_WINDOW;
      banner = {
        title: '🌧️ Monsoon Opportunity Plan',
        subtitle: 'Dynamic rain lulls detected: Outdoor highlights scheduled during dry spells; covered venues during rain.',
        badge: '🌧️ Rain Window Smart Plan',
      };
    } else {
      mode = CLIMATE_MODES.MONSOON;
      banner = {
        title: '⛈️ Monsoon Safe & Shelter Plan',
        subtitle: 'Persistent rainfall detected: Prioritizing rich indoor culture, cafes, covered temples, and safe viewpoints.',
        badge: '⛈️ Monsoon Mode',
      };
    }
  } else if (maxHeatIndex >= 42 || maxTemp >= 38) {
    mode = CLIMATE_MODES.EXTREME_HEAT;
    banner = {
      title: '🔥 Extreme Heat Escape Plan',
      subtitle: `Severe heat index (${maxHeatIndex}°C): Midday fully shifted to AC indoor venues; breezy evening recovery at 16:30+.`,
      badge: '🔥 Extreme Heat Advisory',
    };
  } else if (maxHeatIndex >= 35 || maxTemp >= 33) {
    mode = CLIMATE_MODES.HEAT_ESCAPE;
    banner = {
      title: '🌡️ Smart Heat Escape Plan',
      subtitle: 'Midday thermal peak: Indoor attractions & dining scheduled 12:00–15:30; outdoor exploration after 16:00.',
      badge: '🌡️ Heat Escape Plan',
    };
  }

  return {
    mode,
    banner,
    maxTemp,
    maxHeatIndex,
    maxPrecipProb,
    rainHours,
    dryHours,
    dryWindows,
    heatPeakWindow: { start: 12 * 60, end: 15 * 60 + 45 },
    outdoorRecoveryWindow: { start: 16 * 60, end: 19 * 60 + 30 },
  };
}

/**
 * Calculates climate suitability score (-30 to +30) and notes for a place at a projected arrival time.
 */
function scorePlaceUnderClimate(place = {}, arriveMin, climateStrategy = {}, weather = {}) {
  const strat = climateStrategy || {};
  const mode = strat.mode || CLIMATE_MODES.NORMAL;
  const heatPeakWindow = strat.heatPeakWindow || { start: 12 * 60, end: 15 * 60 + 45 };
  const outdoorRecoveryWindow = strat.outdoorRecoveryWindow || { start: 16 * 60, end: 19 * 60 + 30 };
  const dryWindows = Array.isArray(strat.dryWindows) ? strat.dryWindows : [];
  const isOutdoor = !['museum', 'food', 'restaurant', 'cafe', 'mall', 'shopping', 'nightlife', 'theater'].includes(String(place.cat || '').toLowerCase());
  const isWaterfall = String(place.cat || '').toLowerCase() === 'waterfall';
  const hasAc = place.has_ac === true || ['mall', 'museum', 'shopping'].includes(place.cat);

  let delta = 0;
  const reasons = [];

  if (mode === CLIMATE_MODES.HEAT_ESCAPE || mode === CLIMATE_MODES.EXTREME_HEAT) {
    const isMiddayHeat = arriveMin >= heatPeakWindow.start && arriveMin <= heatPeakWindow.end;
    const isRecovery = arriveMin >= outdoorRecoveryWindow.start && arriveMin <= outdoorRecoveryWindow.end;

    if (isMiddayHeat) {
      if (isOutdoor) {
        delta -= (mode === CLIMATE_MODES.EXTREME_HEAT ? 35 : 22);
        reasons.push(`Midday heat peak (${weather.tempC ?? 34}°C) — harsh for open outdoor exposure`);
      } else {
        delta += 20;
        reasons.push(hasAc ? 'Air-conditioned indoor haven during peak midday heat' : 'Sheltered escape from midday sun');
      }
    } else if (isRecovery && isOutdoor) {
      delta += 18;
      reasons.push('Comfortable temperature recovery window with cooler evening breeze');
    }
  } else if (mode === CLIMATE_MODES.MONSOON || mode === CLIMATE_MODES.RAIN_WINDOW) {
    const isInsideDryWindow = dryWindows.some(w => arriveMin >= w.start && arriveMin <= w.end);

    if (isInsideDryWindow) {
      if (isWaterfall || place.cat === 'hill') {
        delta += 26;
        reasons.push('Monsoon dry window: Lush green vegetation & cascading water volume');
      } else if (isOutdoor) {
        delta += 12;
        reasons.push('Dry weather opportunity window for outdoor views');
      }
    } else {
      if (isOutdoor) {
        delta -= (isWaterfall ? 10 : 30);
        reasons.push('Active precipitation window — wet conditions & low visibility');
      } else {
        delta += 18;
        reasons.push('Covered indoor refuge during rainfall period');
      }
    }
  }

  return { delta, reasons };
}

module.exports = {
  CLIMATE_MODES,
  computeHeatIndex,
  analyzeClimateStrategy,
  scorePlaceUnderClimate,
};
