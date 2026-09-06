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
    reason: reason || 'Itinerary dynamically optimized around live conditions & travel pacing',
  };
}

const { m2t, t2m } = require('./timeEngine');

/**
 * Re-evaluates only remaining unvisited stops when conditions change,
 * strictly preserving completed stop history.
 *
 * @param {Object} params
 * @returns {Object} Replanned itinerary with delta & plain-language explanation
 */
function replanRemainingItinerary(params = {}) {
  const {
    stops = [],
    completedStopKeys = [],
    currentMinute = null,
    closedPlaceKeys = [],
    weatherUpdate = null,
    transitDelayMinutes = 0,
    reason = 'Environmental conditions changed',
  } = params;

  const completedKeysSet = new Set(completedStopKeys.map(k => String(k).toLowerCase()));
  const closedKeysSet = new Set(closedPlaceKeys.map(k => String(k).toLowerCase()));

  const completedStops = [];
  const remainingStops = [];

  for (const s of stops) {
    const key = String(s.key || s.id || s.name || '').toLowerCase();
    const isCompleted = completedKeysSet.has(key) || (currentMinute != null && s.leaveAt && t2m(s.leaveAt) <= currentMinute);
    if (isCompleted) {
      completedStops.push({ ...s, isCompleted: true });
    } else {
      remainingStops.push({ ...s, isCompleted: false });
    }
  }

  // Adjust remaining stops
  const adjustedRemaining = [];
  const droppedStops = [];
  let cursorMin = currentMinute != null
    ? currentMinute + transitDelayMinutes
    : (completedStops.length && completedStops[completedStops.length - 1].leaveAt
      ? t2m(completedStops[completedStops.length - 1].leaveAt) + transitDelayMinutes
      : 540);

  for (const s of remainingStops) {
    const key = String(s.key || s.id || s.name || '').toLowerCase();
    // Check closure
    if (closedKeysSet.has(key)) {
      droppedStops.push({ stop: s, reason: 'Reported closed by authority' });
      continue;
    }

    // Check weather suitability for outdoor stops
    const isOutdoor = s.category === 'beach' || s.category === 'scenic' || s.category === 'waterfall';
    if (isOutdoor && weatherUpdate && /heavy rain|storm|cyclone/i.test(weatherUpdate.condition || '')) {
      droppedStops.push({ stop: s, reason: `Unsuitable due to ${weatherUpdate.condition || 'severe weather'}` });
      continue;
    }

    // Recompute arrival time
    const travelMin = Math.max(5, Number(s.travelMinutes || 15));
    const arriveMin = cursorMin + travelMin;
    const stayMin = Number(s.stayMinutes || 60);
    const leaveMin = arriveMin + stayMin;

    adjustedRemaining.push({
      ...s,
      arriveAt: m2t(arriveMin),
      leaveAt: m2t(leaveMin),
      departAt: m2t(cursorMin),
      travelMinutes: travelMin,
      recalculated: true,
    });

    cursorMin = leaveMin;
  }

  const newStops = [...completedStops, ...adjustedRemaining];
  const diff = computeReplanningDiff(stops, newStops, reason);

  const plainExplanation = droppedStops.length > 0
    ? `Your plan changed because ${droppedStops.map(d => `${d.stop.name} (${d.reason})`).join(', ')}. Remaining stops have been rescheduled without altering your completed visits.`
    : (transitDelayMinutes > 0
      ? `Your plan changed because transit delays added ${transitDelayMinutes} mins. Remaining stops were shifted smoothly.`
      : `Your plan was re-optimized around live conditions.`);

  return {
    success: true,
    stops: newStops,
    completedStopsCount: completedStops.length,
    remainingStopsCount: adjustedRemaining.length,
    droppedCount: droppedStops.length,
    droppedStops,
    diff,
    explanation: plainExplanation,
  };
}

module.exports = {
  REPLAN_THRESHOLDS,
  shouldTriggerReplan,
  computeReplanningDiff,
  replanRemainingItinerary,
};
