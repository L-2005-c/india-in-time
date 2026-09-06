'use strict';

/**
 * services/travelIntelligence/advisoryEngine.js
 *
 * Real-time traveler dynamic advice and multi-day schedule recommendations
 * driven by live temporal, weather, and crowd signals.
 */

/**
 * Highland Ghat & Monsoon Hazard Advisory
 * Assesses landslide, rockfall, flash fog, and night mountain hazard risks
 * for Western and Eastern Ghat corridors (Araku, Paderu, Lambasingi, Tirumala, etc.).
 */
function getGhatHazardAdvisory(placeOrCoords, weather = {}, minuteOfDay = null) {
  if (!placeOrCoords) return { isGhat: false, hasHazard: false, severity: 'NORMAL', alerts: [], guidance: [] };

  const name = typeof placeOrCoords === 'string' 
    ? placeOrCoords.toLowerCase() 
    : (placeOrCoords.name || placeOrCoords.title || placeOrCoords.district || '').toLowerCase();
  
  const lat = placeOrCoords.lat || placeOrCoords.latitude || (Array.isArray(placeOrCoords) ? placeOrCoords[0] : null);
  const lng = placeOrCoords.lng || placeOrCoords.lon || placeOrCoords.longitude || (Array.isArray(placeOrCoords) ? placeOrCoords[1] : null);

  const GHAT_KEYWORDS = [
    'ghat', 'hairpin', 'araku', 'paderu', 'lambasingi', 'vanjangi', 'borra',
    'tirumala', 'ananthagiri', 'munnar', 'wayanad', 'kodaikanal', 'ooty',
    'coorg', 'lonavala', 'mahabaleshwar', 'matheran', 'chikmagalur', 'chikkamagaluru'
  ];

  let isGhat = GHAT_KEYWORDS.some(k => name.includes(k));

  // Geofence checks for key ghat regions if coords present
  if (!isGhat && lat != null && lng != null) {
    // Eastern Ghats (Alluri Sitharama Raju / Araku / Paderu)
    if (lat >= 17.5 && lat <= 18.6 && lng >= 82.2 && lng <= 83.3) isGhat = true;
    // Seshachalam / Tirumala Ghat
    if (lat >= 13.6 && lat <= 13.8 && lng >= 79.25 && lng <= 79.45) isGhat = true;
    // Nilgiris / Western Ghats
    if (lat >= 9.8 && lat <= 11.8 && lng >= 76.2 && lng <= 77.3) isGhat = true;
  }

  if (!isGhat) {
    return { isGhat: false, hasHazard: false, severity: 'NORMAL', alerts: [], guidance: [] };
  }

  const alerts = [];
  const guidance = [];
  let severity = 'NORMAL';

  // 1. Rain / Monsoon landslide risk
  const precip = Number(weather.precipitation ?? weather.rainfall ?? weather.rain ?? 0);
  const condition = String(weather.condition || weather.text || weather.summary || '').toLowerCase();
  const isHeavyRain = precip >= 15 || /heavy rain|torrential|storm|downpour|cyclone|monsoon/.test(condition);
  const isModerateRain = precip >= 5 || /rain|shower|drizzle/.test(condition);

  if (isHeavyRain) {
    severity = 'CRITICAL';
    alerts.push('Highland Monsoon Hazard: Elevated rockfall and mudslide risk on ghat hairpins.');
    guidance.push('Ascent strictly discouraged during heavy downpours. Verify highway status with ITDA / Highway Police.');
  } else if (isModerateRain) {
    if (severity !== 'CRITICAL') severity = 'WARNING';
    alerts.push('Slippery Ghat Incline: Wet hairpins and diminished braking friction.');
    guidance.push('Engage low gear during descent; maintain at least 4x normal braking distance.');
  }

  // 2. Night ghat fog & visibility hazards
  if (minuteOfDay != null) {
    const isNightOrEarlyDawn = minuteOfDay >= 1140 || minuteOfDay < 330; // 19:00 (7 PM) - 05:30 AM
    if (isNightOrEarlyDawn) {
      if (severity === 'NORMAL') severity = 'ADVISORY';
      alerts.push('Dense Ghat Fog & Night Hairpin Curfew: Visibility drops below 10m on mountain roads.');
      guidance.push('Avoid night travel without high-intensity amber fog lamps. Beware of blind curves.');
    }
  }

  return {
    isGhat: true,
    hasHazard: alerts.length > 0,
    severity,
    alerts,
    guidance,
  };
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

  // Ghat & Monsoon advisory integration
  const ghatHazard = getGhatHazardAdvisory(intel, intel.weather, intel.minuteOfDay);
  if (ghatHazard.hasHazard) {
    actions.unshift(...ghatHazard.alerts);
  }

  const headline = actions[0] || intel.statusLabel || 'See details';
  return { headline, actions, visitScore: intel.visitScore, confidence: intel.confidence, ghatHazard };
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
  getGhatHazardAdvisory,
};
