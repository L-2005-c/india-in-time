'use strict';

/**
 * services/travelIntelligence/predictiveTourism.js
 * Predictive Tourism Intelligence Engine.
 *
 * Implements:
 * 1. Multi-horizon destination suitability forecasting (NOW, NEXT_HOURS, TOMORROW, WEEKEND, SEASONAL).
 * 2. Multi-factor future condition prediction (Crowd, Weather, Scenic Light, Traffic pressure).
 * 3. Proactive predictive travel opportunity alerts.
 * 4. Data provenance & confidence transparency.
 */

const { generatePredictiveCrowdCurve } = require('./crowdCurve');
const { computeScenic } = require('./scenicEngine');
const { classifyWeatherWindow } = require('./weatherOpportunity');

const PREDICTION_HORIZONS = {
  NOW: { id: 'NOW', label: 'Current Window', offsetHours: 0 },
  NEXT_HOURS: { id: 'NEXT_HOURS', label: 'Next 3–6 Hours', offsetHours: 3 },
  TOMORROW: { id: 'TOMORROW', label: 'Tomorrow', offsetHours: 24 },
  WEEKEND: { id: 'WEEKEND', label: 'Upcoming Weekend', offsetHours: 48 },
  SEASONAL: { id: 'SEASONAL', label: 'Seasonal Trend', offsetHours: 720 },
};

/**
 * Predicts the travel conditions & suitability score for a destination across a given time horizon.
 */
function predictDestinationSuitability(place = {}, horizonKey = 'TOMORROW', options = {}) {
  const horizon = PREDICTION_HORIZONS[String(horizonKey).toUpperCase()] || PREDICTION_HORIZONS.TOMORROW;
  const cat = String(place.cat || place.category || 'default').toLowerCase();
  const weather = options.weather || { tempC: 28, condition: 'Clear', precipitationProbability: 10, visibilityKm: 10 };
  const targetMinute = options.targetMinute || (horizonKey === 'NOW' ? 720 : 10 * 60); // 10:00 AM default for future days

  // 1. Predictive Crowd
  const isWeekend = horizonKey === 'WEEKEND' || (horizonKey === 'NOW' ? [0, 6].includes(new Date().getDay()) : false);
  const crowdPrediction = generatePredictiveCrowdCurve(place, {
    arrivalMin: targetMinute,
    isWeekend,
    weather,
    hasLiveSensors: options.hasLiveSensors,
    historicalObservations: options.historicalObservations,
  });

  // 2. Weather Suitability
  const weatherWindow = classifyWeatherWindow(weather);
  const isOutdoor = !['museum', 'food', 'restaurant', 'cafe', 'mall', 'shopping'].includes(cat);
  const weatherScore = isOutdoor ? weatherWindow.outdoorSuitability : 90;

  // 3. Scenic Opportunity
  const scenic = computeScenic(place, {
    nowMin: targetMinute,
    sun: { sunriseMin: 6 * 60, sunsetMin: 18 * 60 },
    weatherIntel: { score: weatherScore, visibilityKm: weather.visibilityKm, cloudCover: weather.cloudCover },
  });

  // 4. Composite Suitability Score (0-100)
  const crowdScore = crowdPrediction.arrivalCrowd.level === 'Low' ? 95 : crowdPrediction.arrivalCrowd.level === 'Moderate' ? 80 : 50;
  const compositeScore = Math.round((scenic.score * 0.4) + (weatherScore * 0.35) + (crowdScore * 0.25));

  const confidence = horizonKey === 'NOW' ? 92 : horizonKey === 'NEXT_HOURS' ? 86 : horizonKey === 'TOMORROW' ? 80 : 70;
  const telemetryType = options.hasLiveSensors ? 'LIVE_SIGNAL' : 'PREDICTED';

  // Opportunity Alert generation
  let opportunityAlert = null;
  if (compositeScore >= 88 && crowdPrediction.arrivalCrowd.level === 'Low') {
    opportunityAlert = `Prime ${horizon.label} opportunity: Low crowd & optimal conditions expected at ${place.name || 'destination'}.`;
  }

  return {
    placeId: place.id || place.name,
    placeName: place.name,
    horizon: horizon.label,
    compositeSuitabilityScore: compositeScore,
    predictedCrowd: crowdPrediction.arrivalCrowd,
    predictedWeather: {
      tier: weatherWindow.tier,
      label: weatherWindow.label,
      score: weatherScore,
    },
    scenicScore: scenic.score,
    bestScenicWindow: scenic.bestWindow,
    peakScenicMoment: scenic.peakMoment,
    telemetryType,
    confidence,
    opportunityAlert,
  };
}

/**
 * Predicts multi-horizon forecast across NOW, NEXT_HOURS, TOMORROW, and WEEKEND.
 */
function predictMultiHorizonForecast(place = {}, options = {}) {
  return {
    placeName: place.name,
    now: predictDestinationSuitability(place, 'NOW', options),
    nextHours: predictDestinationSuitability(place, 'NEXT_HOURS', options),
    tomorrow: predictDestinationSuitability(place, 'TOMORROW', options),
    weekend: predictDestinationSuitability(place, 'WEEKEND', options),
  };
}

/**
 * Scans a list of places and returns top actionable opportunity alerts for tomorrow.
 */
function generatePredictiveOpportunityAlerts(places = [], horizonKey = 'TOMORROW', options = {}) {
  const alerts = [];
  places.forEach(p => {
    const pred = predictDestinationSuitability(p, horizonKey, options);
    if (pred.opportunityAlert) {
      alerts.push({
        placeName: p.name,
        category: p.cat || p.category,
        alert: pred.opportunityAlert,
        suitabilityScore: pred.compositeSuitabilityScore,
        confidence: pred.confidence,
      });
    }
  });
  return alerts.sort((a, b) => b.suitabilityScore - a.suitabilityScore).slice(0, 4);
}

module.exports = {
  PREDICTION_HORIZONS,
  predictDestinationSuitability,
  predictMultiHorizonForecast,
  generatePredictiveOpportunityAlerts,
};
