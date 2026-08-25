'use strict';

/**
 * services/travelIntelligence/crowdCurve.js
 * Predictive Crowd Curve Engine.
 * Generates 24-hour predictive crowd curves, peak windows, off-peak avoidance suggestions, and telemetry confidence.
 */

const { computeCrowd } = require('./crowdEngine');
const { m2t } = require('./timeEngine');

const CATEGORY_HOURLY_PROFILES = {
  temple: [
    { hour: 6, weight: 0.7 }, { hour: 7, weight: 0.9 }, { hour: 8, weight: 0.8 }, { hour: 9, weight: 0.6 },
    { hour: 10, weight: 0.4 }, { hour: 11, weight: 0.3 }, { hour: 12, weight: 0.2 }, { hour: 13, weight: 0.1 },
    { hour: 14, weight: 0.1 }, { hour: 15, weight: 0.2 }, { hour: 16, weight: 0.5 }, { hour: 17, weight: 0.85 },
    { hour: 18, weight: 0.95 }, { hour: 19, weight: 0.85 }, { hour: 20, weight: 0.5 }, { hour: 21, weight: 0.2 },
  ],
  beach: [
    { hour: 6, weight: 0.6 }, { hour: 7, weight: 0.5 }, { hour: 8, weight: 0.3 }, { hour: 9, weight: 0.2 },
    { hour: 10, weight: 0.15 }, { hour: 11, weight: 0.1 }, { hour: 12, weight: 0.1 }, { hour: 13, weight: 0.1 },
    { hour: 14, weight: 0.15 }, { hour: 15, weight: 0.3 }, { hour: 16, weight: 0.65 }, { hour: 17, weight: 0.95 },
    { hour: 18, weight: 0.98 }, { hour: 19, weight: 0.85 }, { hour: 20, weight: 0.6 }, { hour: 21, weight: 0.35 },
  ],
  viewpoint: [
    { hour: 6, weight: 0.85 }, { hour: 7, weight: 0.6 }, { hour: 8, weight: 0.4 }, { hour: 9, weight: 0.3 },
    { hour: 10, weight: 0.25 }, { hour: 11, weight: 0.2 }, { hour: 12, weight: 0.15 }, { hour: 13, weight: 0.15 },
    { hour: 14, weight: 0.2 }, { hour: 15, weight: 0.35 }, { hour: 16, weight: 0.7 }, { hour: 17, weight: 0.98 },
    { hour: 18, weight: 0.95 }, { hour: 19, weight: 0.4 }, { hour: 20, weight: 0.15 }, { hour: 21, weight: 0.05 },
  ],
  museum: [
    { hour: 10, weight: 0.4 }, { hour: 11, weight: 0.65 }, { hour: 12, weight: 0.8 }, { hour: 13, weight: 0.7 },
    { hour: 14, weight: 0.75 }, { hour: 15, weight: 0.85 }, { hour: 16, weight: 0.8 }, { hour: 17, weight: 0.5 },
  ],
  shopping: [
    { hour: 11, weight: 0.3 }, { hour: 12, weight: 0.45 }, { hour: 13, weight: 0.5 }, { hour: 14, weight: 0.5 },
    { hour: 15, weight: 0.55 }, { hour: 16, weight: 0.7 }, { hour: 17, weight: 0.85 }, { hour: 18, weight: 0.95 },
    { hour: 19, weight: 0.98 }, { hour: 20, weight: 0.9 }, { hour: 21, weight: 0.6 },
  ],
  food: [
    { hour: 8, weight: 0.6 }, { hour: 9, weight: 0.75 }, { hour: 12, weight: 0.8 }, { hour: 13, weight: 0.95 },
    { hour: 14, weight: 0.8 }, { hour: 17, weight: 0.5 }, { hour: 19, weight: 0.7 }, { hour: 20, weight: 0.95 },
    { hour: 21, weight: 0.9 }, { hour: 22, weight: 0.6 },
  ],
  default: [
    { hour: 8, weight: 0.3 }, { hour: 9, weight: 0.45 }, { hour: 10, weight: 0.6 }, { hour: 11, weight: 0.7 },
    { hour: 12, weight: 0.65 }, { hour: 13, weight: 0.55 }, { hour: 14, weight: 0.6 }, { hour: 15, weight: 0.7 },
    { hour: 16, weight: 0.85 }, { hour: 17, weight: 0.95 }, { hour: 18, weight: 0.9 }, { hour: 19, weight: 0.7 },
    { hour: 20, weight: 0.5 }, { hour: 21, weight: 0.3 },
  ],
};

/**
 * Predicts the full hourly crowd curve for a destination.
 */
function generatePredictiveCrowdCurve(place = {}, ctx = {}) {
  const cat = String(place.cat || place.category || 'default').toLowerCase();
  const profile = CATEGORY_HOURLY_PROFILES[cat] || CATEGORY_HOURLY_PROFILES.default;
  const isWeekend = ctx.isWeekend ?? [0, 6].includes(new Date().getDay());
  const weather = ctx.weather || null;
  const isRaining = weather && /rain|storm|drizzle/i.test(weather.condition || '');
  const isHot = weather && weather.tempC >= 38;

  const hourlyCurve = [];
  let peakHour = 17;
  let maxWeight = 0;
  let minHour = 9;
  let minWeight = 1.0;

  profile.forEach(slot => {
    let w = slot.weight;
    if (isWeekend) w *= 1.35;
    if (isRaining && !['museum', 'shopping', 'mall'].includes(cat)) w *= 0.65;
    if (isHot && slot.hour >= 12 && slot.hour <= 15 && !['museum', 'shopping', 'mall', 'food'].includes(cat)) w *= 0.7;

    const percentage = Math.min(100, Math.round(w * 100));
    hourlyCurve.push({
      hour: slot.hour,
      timeLabel: `${String(slot.hour).padStart(2, '0')}:00`,
      crowdPercentage: percentage,
      crowdLevel: percentage >= 80 ? 'High' : percentage >= 50 ? 'Moderate' : 'Low',
    });

    if (percentage > maxWeight) {
      maxWeight = percentage;
      peakHour = slot.hour;
    }
    if (percentage < minWeight && slot.hour >= 8 && slot.hour <= 20) {
      minWeight = percentage;
      minHour = slot.hour;
    }
  });

  // Calculate arrival metrics
  const arrivalMin = Number.isFinite(ctx.arrivalMin) ? ctx.arrivalMin : 720;
  const arrivalHour = Math.floor(arrivalMin / 60);
  const currentSlot = hourlyCurve.find(s => s.hour === arrivalHour) || { crowdPercentage: 50, crowdLevel: 'Moderate' };
  const nextSlot = hourlyCurve.find(s => s.hour === arrivalHour + 1);

  let trend = 'stable';
  if (nextSlot) {
    if (nextSlot.crowdPercentage > currentSlot.crowdPercentage + 8) trend = 'increasing';
    else if (nextSlot.crowdPercentage < currentSlot.crowdPercentage - 8) trend = 'decreasing';
  }

  const baseResult = computeCrowd({ ...ctx, cat });
  const telemetryType = ctx.hasLiveSensors ? 'LIVE_SIGNAL' : ctx.historicalObservations ? 'PREDICTED' : 'HISTORICAL_BASELINE';

  return {
    telemetryType,
    confidence: telemetryType === 'LIVE_SIGNAL' ? 95 : telemetryType === 'PREDICTED' ? 88 : 78,
    arrivalCrowd: {
      percentage: currentSlot.crowdPercentage,
      level: currentSlot.crowdLevel,
      trend,
      timeLabel: m2t(arrivalMin),
    },
    peakWindow: `${String(peakHour).padStart(2, '0')}:00–${String(peakHour + 1).padStart(2, '0')}:30`,
    offPeakWindow: `${String(minHour).padStart(2, '0')}:00–${String(minHour + 1).padStart(2, '0')}:30`,
    avoidanceRecommendation: currentSlot.crowdLevel === 'High'
      ? `Visit earlier around ${String(minHour).padStart(2, '0')}:30 to avoid expected peak rush`
      : 'Optimal off-peak visit window',
    hourlyCurve,
    baseEngine: baseResult,
  };
}

module.exports = {
  generatePredictiveCrowdCurve,
  CATEGORY_HOURLY_PROFILES,
};
