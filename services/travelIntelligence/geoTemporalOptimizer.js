'use strict';

// Compatibility facade: itinerary decisions are owned by the requirement-aware
// advanced planner. This module intentionally contains no competing optimizer.
const { planAdvancedItinerary, replanAdvanced } = require('./advancedItineraryEngine');
const { t2m } = require('./timeEngine');

function addCompatibilityFields(result) {
  const out = { ...(result || {}) };
  out.algorithm = 'geo-temporal-beam-search-v5-world-class';
  out.stops = (out.stops || []).map((s) => ({
    ...s,
    timingFit: s.timingFit ?? 55,
    mealTimingBonus: s.mealTimingBonus ?? 0,
    decisionScore: s.optimizationScore ?? 0,
  }));
  return out;
}

async function optimizeItinerary(places, options = {}) {
  return addCompatibilityFields(planAdvancedItinerary(places, options));
}

async function replanItinerary(remainingPlaces, options = {}) {
  return addCompatibilityFields(replanAdvanced(remainingPlaces, options));
}

module.exports = { optimizeItinerary, replanItinerary, t2m };
