'use strict';

/**
 * services/travelIntelligence/adaptiveReplanner.js
 * Dynamic Adaptive Replanning Engine.
 * Evaluates significance thresholds (traffic, weather, closures, delays) and adapts the remaining itinerary while preserving completed stops.
 */

const REPLAN_THRESHOLDS = {
  TRAFFIC_DELAY_MINUTES: 15,
  USER_DELAY_MINUTES: 20,
  RAIN_PROBABILITY_JUMP_PERCENT: 40,
  TEMP_SPIKE_CELSIUS: 5,
};

/**
 * Evaluates whether observed environmental or user pacing changes warrant replanning.
 */
function shouldTriggerReplan(context = {}) {
  const triggers = [];

  // POI closure check
  if (context.poiClosed === true || context.poiClosureDetected) {
    triggers.push({ type: 'POI_CLOSURE', reason: `Stop ${context.closedPoiName || 'destination'} is reported closed.` });
  }

  // Traffic delay check
  const trafficDelay = Number(context.additionalTrafficMinutes || 0);
  if (trafficDelay >= REPLAN_THRESHOLDS.TRAFFIC_DELAY_MINUTES) {
    triggers.push({ type: 'TRAFFIC_SURGE', reason: `Traffic delay on upcoming route increased by ${trafficDelay} mins.` });
  }

  // User pacing delay
  const userDelay = Number(context.userDelayMinutes || 0);
  if (userDelay >= REPLAN_THRESHOLDS.USER_DELAY_MINUTES) {
    triggers.push({ type: 'USER_PACING_DELAY', reason: `User pacing behind schedule by ${userDelay} mins.` });
  }

  // Weather precipitation pivot
  const rainDelta = Number(context.rainProbabilityDelta || 0);
  if (rainDelta >= REPLAN_THRESHOLDS.RAIN_PROBABILITY_JUMP_PERCENT) {
    triggers.push({ type: 'WEATHER_PIVOT', reason: `Rain probability increased by ${rainDelta}% for outdoor window.` });
  }

  return {
    shouldReplan: triggers.length > 0,
    triggers,
    primaryReason: triggers.length ? triggers[0].reason : null,
  };
}

/**
 * Computes an explainable diff between a previous itinerary and an updated itinerary.
 */
function computeReplanningDiff(previousStops = [], newStops = [], reason = '') {
  const prevNames = previousStops.map(s => s.name || s.id);
  const newNames = newStops.map(s => s.name || s.id);

  const added = newNames.filter(n => !prevNames.includes(n));
  const dropped = prevNames.filter(n => !newNames.includes(n));
  const reordered = [];

  for (let i = 0; i < Math.min(prevNames.length, newNames.length); i++) {
    if (prevNames[i] !== newNames[i] && !added.includes(newNames[i]) && !dropped.includes(prevNames[i])) {
      reordered.push(`${newNames[i]} moved to stop #${i + 1}`);
    }
  }

  const changeSummaries = [];
  if (added.length) changeSummaries.push(`Added ${added.join(', ')}`);
  if (dropped.length) changeSummaries.push(`Adjusted route away from ${dropped.join(', ')}`);
  if (reordered.length) changeSummaries.push(`Reordered: ${reordered.join(', ')}`);

  return {
    hasChanges: changeSummaries.length > 0,
    changes: changeSummaries,
    previousStopCount: previousStops.length,
    updatedStopCount: newStops.length,
    reason: reason || 'Itinerary dynamically optimized around live conditions & travel pacing',
  };
}

module.exports = {
  REPLAN_THRESHOLDS,
  shouldTriggerReplan,
  computeReplanningDiff,
};
