'use strict';

/**
 * services/travelIntelligence/weatherOpportunity.js
 * Weather Opportunity Window Engine.
 * Classifies hourly weather into BAD, NEUTRAL, GOOD, and EXCELLENT windows and detects weather transitions.
 */

const { m2t } = require('./timeEngine');

/**
 * Evaluates an hourly weather data point and assigns a window classification.
 */
function classifyWeatherWindow(hourlyData = {}) {
  const hasTemp = hourlyData.tempC != null && Number.isFinite(Number(hourlyData.tempC));
  const hasRain = (hourlyData.precipitationProbability != null || hourlyData.rainProb != null);
  const hasCondition = Boolean(hourlyData.condition);

  if (!hasTemp && !hasRain && !hasCondition) {
    return {
      tier: 'UNKNOWN',
      label: 'Weather Unavailable',
      icon: '⚪',
      outdoorSuitability: 50,
      recommendation: 'Weather data unavailable; check local conditions',
    };
  }

  const rainProb = Number(hourlyData.precipitationProbability ?? hourlyData.rainProb ?? 0);
  const tempC = hasTemp ? Number(hourlyData.tempC) : null;
  const condition = String(hourlyData.condition || '').toLowerCase();
  const visibilityKm = Number(hourlyData.visibilityKm ?? 10);
  const cloudCover = Number(hourlyData.cloudCover ?? 30);

  if (/thunderstorm|heavy rain|squall|cyclone/i.test(condition) || rainProb >= 70 || (tempC != null && tempC >= 41)) {
    return {
      tier: 'BAD',
      label: 'Adverse Window',
      icon: '🌧️',
      outdoorSuitability: 15,
      recommendation: 'Prioritize indoor museums, shopping, and dining',
    };
  }

  if (rainProb >= 45 || (tempC != null && tempC >= 37)) {
    return {
      tier: 'NEUTRAL',
      label: 'Marginal Window',
      icon: '🌦️',
      outdoorSuitability: 50,
      recommendation: 'Covered attractions or short outdoor stops',
    };
  }

  if (tempC != null && rainProb <= 20 && tempC >= 21 && tempC <= 31 && visibilityKm >= 8 && cloudCover <= 60) {
    return {
      tier: 'EXCELLENT',
      label: 'Excellent Outdoor Window',
      icon: '☀️',
      outdoorSuitability: 96,
      recommendation: 'Prime window for beaches, hill viewpoints & photography',
    };
  }

  return {
    tier: 'GOOD',
    label: 'Favorable Window',
    icon: '🌤️',
    outdoorSuitability: 80,
    recommendation: 'Good conditions for walking tours and sightseeing',
  };
}

/**
 * Evaluates a sequence of hourly forecast slots (e.g. 08:00 to 20:00) to find opportunity windows & trends.
 */
function evaluateWeatherOpportunityWindows(hourlyForecast = [], currentMinute = 720) {
  if (!Array.isArray(hourlyForecast) || !hourlyForecast.length) {
    // Generate default daylight slots if raw forecast is missing
    const defaultSlots = [];
    for (let h = 8; h <= 20; h++) {
      defaultSlots.push({ hour: h, tempC: 28, rainProb: 10, condition: 'Clear', visibilityKm: 10 });
    }
    hourlyForecast = defaultSlots;
  }

  const windows = hourlyForecast.map(slot => {
    const classification = classifyWeatherWindow(slot);
    return {
      hour: slot.hour,
      timeLabel: `${String(slot.hour).padStart(2, '0')}:00`,
      minute: slot.hour * 60,
      tempC: slot.tempC,
      rainProb: slot.precipitationProbability ?? slot.rainProb ?? 0,
      condition: slot.condition || 'Clear',
      ...classification,
    };
  });

  // Determine current window at arrival
  const currentHour = Math.floor(currentMinute / 60);
  const currentWindow = windows.find(w => w.hour === currentHour) || windows[0];

  // Detect Weather Transition Trend
  const currentIdx = windows.findIndex(w => w.hour === currentHour);
  const futureWindows = currentIdx >= 0 ? windows.slice(currentIdx, currentIdx + 4) : windows.slice(0, 4);

  let transitionType = 'STABLE';
  let transitionDescription = 'Consistent weather conditions expected throughout the day';

  if (futureWindows.length >= 2) {
    const rainStart = futureWindows[0].rainProb;
    const rainEnd = futureWindows[futureWindows.length - 1].rainProb;

    if (rainStart >= 50 && rainEnd <= 25) {
      transitionType = 'IMPROVING';
      transitionDescription = 'Weather clearing: Rain lull opening in the upcoming hours — great window for outdoor highlights';
    } else if (rainStart <= 25 && rainEnd >= 50) {
      transitionType = 'DETERIORATING';
      transitionDescription = 'Precipitation expected to increase later — front-load outdoor scenic activities';
    }
  }

  const bestOutdoorWindow = windows.filter(w => w.tier === 'EXCELLENT' || w.tier === 'GOOD');
  const bestWindowLabel = bestOutdoorWindow.length
    ? `${bestOutdoorWindow[0].timeLabel}–${m2t(bestOutdoorWindow[bestOutdoorWindow.length - 1].minute + 60)}`
    : 'Morning 08:00–11:00';

  return {
    currentWindow,
    bestWindowLabel,
    transition: {
      type: transitionType,
      description: transitionDescription,
    },
    windows,
    summary: `${currentWindow.label} (${currentWindow.tempC}°C, ${currentWindow.rainProb}% rain prob). ${transitionDescription}.`,
  };
}

module.exports = {
  classifyWeatherWindow,
  evaluateWeatherOpportunityWindows,
};
