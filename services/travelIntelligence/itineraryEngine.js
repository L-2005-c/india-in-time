// services/travelIntelligence/itineraryEngine.js
// Specialized single-place advisory and rescheduling helper module.
//
// NOTE: Authoritative multi-stop day planning, temporal beam-search optimization,
// and time-aware arrival re-scoring are unified in:
// services/travelIntelligence/advancedItineraryEngine.js
'use strict';

const rules = require('../../data/time-intelligence-rules.json');
const { t2m, m2t } = require('./timeEngine');

const DEFAULT_VISIT_MIN = {
  temple: 45, beach: 90, scenic: 40, museum: 75, fort: 60, park: 45,
  garden: 40, waterfall: 50, hill: 60, market: 60, food: 50, monument: 50, default: 45,
};

function visitDurationMin(place) {
  if (Number.isFinite(place?.vt) && place.vt > 0) return Math.round(place.vt);
  if (Number.isFinite(place?.visitMinutes) && place.visitMinutes > 0) return Math.round(place.visitMinutes);
  return DEFAULT_VISIT_MIN[place?.cat] || DEFAULT_VISIT_MIN.default;
}

function mealSlot(nowMin) {
  if (nowMin >= 7 * 60 && nowMin < 10 * 60) return 'breakfast';
  if (nowMin >= 12 * 60 && nowMin < 15 * 60) return 'lunch';
  if (nowMin >= 19 * 60 && nowMin < 22 * 60) return 'dinner';
  return null;
}

/**
 * Build a timed day plan from a list of places.
 * Delegates to the authoritative advancedItineraryEngine while maintaining backward compatibility.
 */
function buildDayPlan(places, opts = {}) {
  const { planAdvancedItinerary } = require('./advancedItineraryEngine');
  const result = planAdvancedItinerary(places, opts);
  return {
    ...result,
    stopCount: result.stops ? result.stops.length : 0,
    optimizer: result.optimizer || 'beam-search-2-opt',
  };
}

function buildStopNotes(place, arriveMin, intel = {}) {
  const notes = [];
  if (place?.is_sunrise_spot && arriveMin < 9 * 60) notes.push('Sunrise window');
  if (place?.is_sunset_spot && arriveMin >= 16 * 60) notes.push('Sunset / golden hour');
  if (place?.cat === 'food') {
    const slot = mealSlot(arriveMin);
    if (slot) notes.push(`${slot.charAt(0).toUpperCase() + slot.slice(1)} stop`);
  }
  if (intel.crowd?.level === 'High' || intel.crowd?.level === 'Very High') notes.push('Expect crowds');
  if (intel.weather?.warnings?.length) notes.push(intel.weather.warnings[0]);
  return notes;
}

/**
 * Dynamic advice based on measurable signals for a single place "right now".
 */
function dynamicAdvice(intel, _opts = {}) {
  const actions = [];
  if (!intel) return { actions: ['Insufficient data'], headline: 'Unknown' };

  if (intel.isOpenNow === false) {
    if (intel.minutesToOpen != null && intel.minutesToOpen <= 90) {
      actions.push(`Wait ${intel.minutesToOpen} minutes — opens soon`);
    } else {
      actions.push('Avoid now — currently closed');
      if (intel.opening?.openTime) actions.push(`Try after ${intel.opening.openTime}`);
    }
  } else if (intel.opening?.status === 'CLOSING_SOON') {
    actions.push(`Hurry — closes in ${intel.minutesToClose} min`);
  }

  if (intel.visitScore >= 75 && intel.isOpenNow) {
    actions.push('Visit now — conditions are favourable');
  } else if (intel.visitScore < 40) {
    actions.push('Consider postponing — conditions are poor');
  }

  if (intel.crowd?.level === 'Very High' || intel.crowd?.level === 'High') {
    actions.push('High crowd — consider an alternative or a later slot');
  }
  if (intel.weather?.suitability === 'Poor' || intel.weather?.suitability === 'Very Poor') {
    actions.push('Weather unfavourable for outdoor activity');
  }
  if (intel.scenic?.bestScenicWindow && intel.inGoldenHour?.any) {
    actions.push('Golden-hour window is active — good for photography');
  }
  if (intel.arrival?.recommendedDeparture) {
    actions.push(`If traveling, leave around ${intel.arrival.recommendedDeparture}`);
  }

  const headline = actions[0] || intel.statusLabel || 'See details';
  return { headline, actions, visitScore: intel.visitScore, confidence: intel.confidence };
}

/**
 * Lightweight multi-day advice: suggest moving outdoor-heavy stops when today is poor.
 * Does not invent weather — uses provided intel signals only.
 */
function multiDayAdvice(placesIntel = [], _opts = {}) {
  const suggestions = [];
  for (const item of placesIntel) {
    const intel = item.intel || item;
    const name = item.name || intel.name || 'Place';
    const outdoor = ['beach', 'scenic', 'park', 'garden', 'waterfall', 'hill', 'fort', 'monument'].includes(intel.category || item.cat);
    const wx = intel.weather;
    const crowd = intel.crowd || {};
    if (outdoor && wx && (wx.suitability === 'Poor' || wx.suitability === 'Very Poor')) {
      suggestions.push({
        place: name,
        action: 'reschedule',
        when: 'tomorrow morning',
        reason: `Outdoor conditions poor today (${wx.suitability}). Prefer a cooler/clearer window.`,
      });
    } else if (crowd.level === 'Very High' && outdoor) {
      suggestions.push({
        place: name,
        action: 'reschedule',
        when: 'early tomorrow or later evening',
        reason: `Very high predicted crowd today.`,
      });
    } else if (intel.visitScore != null && intel.visitScore < 40 && intel.isOpenNow === false) {
      suggestions.push({
        place: name,
        action: 'defer',
        when: 'next open window',
        reason: intel.statusLabel || 'Currently closed with low visit score',
      });
    }
  }
  return {
    suggestions,
    headline: suggestions.length
      ? `${suggestions.length} stop(s) may be better on another day/window`
      : 'No multi-day reschedule suggested from current signals',
  };
}

module.exports = {
  buildDayPlan,
  dynamicAdvice,
  multiDayAdvice,
  visitDurationMin,
  buildStopNotes,
};
