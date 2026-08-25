'use strict';

/**
 * services/travelIntelligence/fatigueModel.js
 * Human-Aware Travel Load & Fatigue Optimization Engine.
 *
 * Implements:
 * 1. Travel load scoring based on walking distance, activity intensity, heat exposure, and driving.
 * 2. Day rhythm optimization (interleaving active stops with rest/dining/indoor recovery).
 * 3. Rest buffer and recovery window detection.
 * 4. Travel Intensity Modes: RELAXED, BALANCED, ACTIVE, PACKED.
 */

const ACTIVITY_INTENSITY = {
  trekking: 90,
  hiking: 85,
  fort: 75,
  hill: 70,
  beach: 50,
  temple: 55,
  park: 45,
  monument: 50,
  museum: 35,
  shopping: 40,
  food: 15,
  cafe: 10,
  scenic: 30,
  default: 45,
};

/**
 * Evaluates the human travel load across an entire itinerary.
 */
function evaluateTravelLoad(stops = [], options = {}) {
  const weather = options.weather || {};
  const tempC = Number(weather.tempC ?? 28);
  const targetIntensity = (options.tripMode || options.intensity || 'balanced').toLowerCase();

  let totalWalkingM = 0;
  let outdoorExposureMinutes = 0;
  let totalTravelMinutes = 0;
  let highIntensityCount = 0;
  let restMinutes = 0;
  let consecutiveHighIntensity = 0;
  const recoveryWindows = [];

  stops.forEach((stop, idx) => {
    const cat = String(stop.category || stop.cat || 'default').toLowerCase();
    const stay = Number(stop.stayMinutes || 45);
    const travel = Number(stop.travelMinutes || 15);
    totalTravelMinutes += travel;

    const intensity = ACTIVITY_INTENSITY[cat] || ACTIVITY_INTENSITY.default;
    const isOutdoor = !['museum', 'food', 'restaurant', 'cafe', 'mall', 'shopping'].includes(cat);

    if (isOutdoor) {
      outdoorExposureMinutes += stay;
      totalWalkingM += Math.round(stay * 18); // ~18m walk per minute of outdoor visit
    } else if (cat === 'food' || cat === 'cafe') {
      restMinutes += stay;
    }

    if (intensity >= 65) {
      highIntensityCount++;
      consecutiveHighIntensity++;
      if (consecutiveHighIntensity >= 2) {
        recoveryWindows.push({
          afterStopIndex: idx,
          afterStopName: stop.name,
          suggestedDurationMin: 30,
          reason: 'Suggested 30-min refreshment/cafe buffer to restore energy between active stops',
        });
        consecutiveHighIntensity = 0;
      }
    } else {
      consecutiveHighIntensity = 0;
    }
  });

  const totalWalkingKm = Math.round((totalWalkingM / 1000) * 10) / 10;
  const heatStressPenalty = tempC >= 36 ? Math.round((outdoorExposureMinutes / 60) * 8) : 0;

  // Compute composite Travel Load Score (0-100)
  const rawLoad = (totalWalkingKm * 7) +
    (outdoorExposureMinutes * 0.15) +
    (totalTravelMinutes * 0.2) +
    (highIntensityCount * 12) +
    heatStressPenalty -
    (restMinutes * 0.12);

  const loadScore = Math.max(10, Math.min(100, Math.round(rawLoad)));

  let loadBand = 'BALANCED';
  if (loadScore < 35) loadBand = 'RELAXED';
  else if (loadScore > 75) loadBand = 'PACKED';
  else if (loadScore > 55) loadBand = 'ACTIVE';

  let rhythmAssessment = 'Smooth, well-balanced day rhythm';
  if (loadBand === 'PACKED') rhythmAssessment = 'High energy demand — recommend adding rest buffers';
  else if (loadBand === 'RELAXED') rhythmAssessment = 'Comfortable leisure pace with ample breathing room';

  return {
    loadScore,
    loadBand,
    targetIntensity,
    rhythmAssessment,
    metrics: {
      totalWalkingKm,
      outdoorExposureMinutes,
      totalTravelMinutes,
      highIntensityCount,
      restMinutes,
    },
    recoveryWindows,
    summary: `Travel Load: ${loadBand} (${totalWalkingKm} km walking · ${Math.round(outdoorExposureMinutes / 60)}h outdoor exposure · ${restMinutes}m rest). ${rhythmAssessment}.`,
  };
}

module.exports = {
  ACTIVITY_INTENSITY,
  evaluateTravelLoad,
};
