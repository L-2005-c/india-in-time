'use strict';

/**
 * services/travelIntelligence/advisoryEngine.js
 *
 * Real-time traveler dynamic advice and multi-day schedule recommendations
 * driven by live temporal, weather, and crowd signals.
 */

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
  dynamicAdvice,
  multiDayAdvice,
};
