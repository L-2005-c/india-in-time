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
 * Midday Sun Harshness & Solar Shade Index
 * Evaluates extreme midday thermal and UV radiation risk on unshaded stone monuments,
 * coastal beaches, and open heritage plazas (11:30 - 15:30) when temperatures >= 30°C or UV >= 7.
 */
function getMiddaySunExposureAdvisory(placeOrIntel, weather = {}, minuteOfDay = null) {
  if (!placeOrIntel) {
    return { isHarshSun: false, level: 'NONE', shadeIndex: 'HIGH', alert: null, guidance: null };
  }

  const name = typeof placeOrIntel === 'string'
    ? placeOrIntel.toLowerCase()
    : (placeOrIntel.name || placeOrIntel.title || '').toLowerCase();
  const category = String(placeOrIntel.cat || placeOrIntel.category || '').toLowerCase();

  const UNSHADED_KEYWORDS = [
    'beach', 'fort', 'red sand dunes', 'viewpoint', 'view point', 'qutub minar',
    'charminar', 'monument', 'ramparts', 'barrage', 'promenade', 'marine drive',
    'sea face', 'stone arch', 'silathoranam', 'ruins', 'ghat road', 'sand dunes',
    'amber fort', 'nahargarh', 'chunar fort', 'sinhagad', 'golconda', 'chandragiri',
    'temple', 'mandir', 'ghat'
  ];

  const isLowShadeCategory = ['beach', 'scenic', 'viewpoint', 'heritage', 'temple'].includes(category);
  const isUnshadedPlace = UNSHADED_KEYWORDS.some(k => name.includes(k)) || isLowShadeCategory;

  const UNSHADED_EXCEPTION_KEYWORDS = ['museum', 'indoor', 'cave', 'aquarium', 'covered', 'hall', 'sanctuary jungle'];
  if (UNSHADED_EXCEPTION_KEYWORDS.some(k => name.includes(k))) {
    return { isHarshSun: false, level: 'NONE', shadeIndex: 'HIGH', alert: null, guidance: null };
  }

  if (!isUnshadedPlace) {
    return { isHarshSun: false, level: 'NONE', shadeIndex: 'HIGH', alert: null, guidance: null };
  }

  const temp = Number(weather.temp ?? weather.temperature ?? weather.current_temp ?? weather.feelsLike ?? 28);
  const uv = Number(weather.uvIndex ?? weather.uv ?? (temp >= 36 ? 9 : temp >= 32 ? 7 : 4));
  const isMiddayWindow = minuteOfDay != null
    ? (minuteOfDay >= 690 && minuteOfDay <= 930) // 11:30 AM to 15:30 PM
    : (temp >= 33 || uv >= 8);

  if (!isMiddayWindow || (temp < 30 && uv < 7)) {
    return { isHarshSun: false, level: 'NONE', shadeIndex: isUnshadedPlace ? 'LOW' : 'MEDIUM', alert: null, guidance: null };
  }

  const isTemple = category === 'temple' || /temple|mandir/.test(name);
  const isExtreme = temp >= 38 || uv >= 10;
  const level = isExtreme ? 'EXTREME_HEAT' : (uv >= 8 ? 'HIGH_UV' : 'MODERATE');
  const alert = isTemple
    ? `Barefoot Courtyard Heat Warning (${temp}°C): Stone temple courtyards become scorching between 11:30 - 15:30.`
    : (isExtreme
      ? `Midday Heat Danger (${temp}°C): Severe unshaded stone surface radiation between 11:30 - 15:30.`
      : `Peak Sun Harshness (${temp}°C / UV ${uv}): Exposed outdoor monument/beach during 11:30 - 15:30.`);

  const guidance = isTemple
    ? 'Devotees must walk barefoot on stone slabs; use covered coir mats, carry hydration, or visit in early morning/evening.'
    : (isExtreme
      ? 'Postpone open-air exploration until after 16:00. Carry 1L electrolyte water and seek air-conditioned indoor exhibits.'
      : 'Wear UV-blocking headwear, carry hydration, and prefer shaded colonnades or indoor gallery pauses.');

  return {
    isHarshSun: true,
    level,
    shadeIndex: 'LOW',
    alert,
    guidance,
    temp,
    uv,
  };
}

/**
 * Sacred Darshan Queue Time & Crowd Slot Predictor
 * Models queue wait durations and optimal spiritual slots for major Indian pilgrimage shrines.
 */
function getDarshanQueueEstimate(placeOrName, minuteOfDay = null, dayOfWeek = null) {
  if (!placeOrName) {
    return { isSacredDarshan: false, shrineName: '', estimatedWaitMinutes: 0, crowdFactor: 'LOW', tip: null };
  }

  const name = typeof placeOrName === 'string'
    ? placeOrName.toLowerCase()
    : String(placeOrName.name || placeOrName.title || '').toLowerCase();

  const SHRINES = [
    {
      id: 'tirumala',
      keywords: ['tirumala', 'venkateswara temple', 'srivari temple', 'balaji temple'],
      name: 'Tirumala Venkateswara Swamy Temple',
      baseWaitWeekday: 180,
      baseWaitWeekend: 360,
      earlyMorningWait: 75,
      recommendedSlot: '04:00 - 06:30 (Suprabhatam slot) or Pre-booked Special Entry ₹300',
      tip: 'Footpath walkers with Divya Darshan tokens clear 40% faster; free luggage transfer at Alipiri / Srivari Mettu.',
    },
    {
      id: 'kanaka_durga',
      keywords: ['kanaka durga', 'durga temple vijayawada', 'indrakeeladri temple', 'malleswara swamy'],
      name: 'Sri Durga Malleswara Swamy (Kanaka Durga)',
      baseWaitWeekday: 45,
      baseWaitWeekend: 120,
      earlyMorningWait: 25,
      recommendedSlot: '05:30 - 07:00 (Morning Nirmalya Darshanam)',
      tip: 'Use the Indrakeeladri Ghat Road lift or ₹100 Mukhamandapam fast-track pass on Fridays and Sundays.',
    },
    {
      id: 'simhachalam',
      keywords: ['simhachalam', 'varaha lakshmi narasimha'],
      name: 'Sri Varaha Lakshmi Narasimha Temple, Simhachalam',
      baseWaitWeekday: 35,
      baseWaitWeekend: 90,
      earlyMorningWait: 20,
      recommendedSlot: '06:30 - 08:30 or 17:30 - 19:00',
      tip: 'Hilltop devasthanam buses depart every 10 mins from base; ₹100 special queue saves 45 mins.',
    },
    {
      id: 'siddhivinayak',
      keywords: ['siddhivinayak', 'shree siddhivinayak'],
      name: 'Shree Siddhivinayak Ganapati Temple Mumbai',
      baseWaitWeekday: 45,
      baseWaitWeekend: 110,
      tuesdayWait: 180,
      earlyMorningWait: 25,
      recommendedSlot: '06:00 - 07:30 (Kakad Aarti) or after 20:30 (Wed-Mon)',
      tip: 'Tuesdays witness heavy crowd for Angarika Sankashti; use mobile app QR pass to avoid 2+ hour queues.',
    },
    {
      id: 'kashi_vishwanath',
      keywords: ['kashi vishwanath', 'vishwanath temple'],
      name: 'Kashi Vishwanath Temple Varanasi',
      baseWaitWeekday: 60,
      baseWaitWeekend: 140,
      mondayWait: 180,
      earlyMorningWait: 35,
      recommendedSlot: '05:00 - 06:30 or pre-booked Sugam Darshan token',
      tip: 'Mondays and Shravan month see immense queues; Ganga corridor Gate 4 (Lalita Ghat) offers direct accessible entry.',
    },
    {
      id: 'chamundeshwari',
      keywords: ['chamundeshwari', 'chamundi hill temple'],
      name: 'Sri Chamundeshwari Temple Mysuru',
      baseWaitWeekday: 30,
      baseWaitWeekend: 75,
      earlyMorningWait: 15,
      recommendedSlot: '07:30 - 09:00',
      tip: 'Fridays of Ashadha and Dasara month have heavy crowds; early morning hill breeze is pleasant.',
    },
    {
      id: 'srikalahasti',
      keywords: ['srikalahasti', 'kalahasteeswara'],
      name: 'Sri Srikalahasti Temple (Rahu Kethu Kshetram)',
      baseWaitWeekday: 50,
      baseWaitWeekend: 105,
      earlyMorningWait: 25,
      recommendedSlot: '06:30 - 08:00 (Rahu Kalam pooja slots fill rapidly during midday)',
      tip: 'Book Rahu Kethu Sarpa Dosha Nivarana tickets at counter early; morning slots have coolest interior stone temps.',
    },
    {
      id: 'modakondamma',
      keywords: ['modakondamma', 'modamamba'],
      name: 'Sri Modakondamma Ammavari Temple Paderu',
      baseWaitWeekday: 20,
      baseWaitWeekend: 50,
      earlyMorningWait: 10,
      recommendedSlot: '07:00 - 09:00 (Sunday Jathara peak)',
      tip: 'Sunday santha days bring colorful tribal pilgrimage footfall; peaceful early morning darshan.',
    },
  ];

  const shrine = SHRINES.find(s => s.keywords.some(k => name.includes(k)));
  if (!shrine) {
    return { isSacredDarshan: false, shrineName: '', estimatedWaitMinutes: 0, crowdFactor: 'LOW', tip: null };
  }

  const dow = dayOfWeek != null ? Number(dayOfWeek) : new Date().getDay();
  const isWeekend = dow === 0 || dow === 6 || (shrine.id === 'kanaka_durga' && dow === 5);
  const isTuesday = dow === 2;
  const isMonday = dow === 1;

  let baseWait = isWeekend ? shrine.baseWaitWeekend : shrine.baseWaitWeekday;
  if (shrine.tuesdayWait && isTuesday) baseWait = shrine.tuesdayWait;
  if (shrine.mondayWait && isMonday) baseWait = shrine.mondayWait;

  let estimatedWait = baseWait;
  if (minuteOfDay != null) {
    if (minuteOfDay < 420) {
      estimatedWait = shrine.earlyMorningWait;
    } else if (minuteOfDay >= 540 && minuteOfDay <= 720) {
      estimatedWait = Math.round(baseWait * 1.25);
    } else if (minuteOfDay >= 1050 && minuteOfDay <= 1230) {
      estimatedWait = Math.round(baseWait * 1.15);
    }
  }

  const crowdFactor = estimatedWait >= 180 ? 'EXTREME' : estimatedWait >= 90 ? 'HIGH' : estimatedWait >= 45 ? 'MODERATE' : 'LOW';

  return {
    isSacredDarshan: true,
    shrineName: shrine.name,
    estimatedWaitMinutes: estimatedWait,
    crowdFactor,
    recommendedSlot: shrine.recommendedSlot,
    tip: shrine.tip,
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

  // Midday Sun Harshness & Solar Shade Index
  const sunExposure = getMiddaySunExposureAdvisory(intel, intel.weather, intel.minuteOfDay);
  if (sunExposure.isHarshSun) {
    actions.push(sunExposure.alert);
  }

  // Sacred Darshan Queue Time & Crowd Slot Predictor
  const darshanQueue = getDarshanQueueEstimate(intel, intel.minuteOfDay, intel.dayOfWeek);
  if (darshanQueue.isSacredDarshan) {
    actions.push(`Darshan Queue ~${darshanQueue.estimatedWaitMinutes}m wait (${darshanQueue.crowdFactor} crowd) — Best: ${darshanQueue.recommendedSlot}`);
  }

  // Ghat & Monsoon advisory integration
  const ghatHazard = getGhatHazardAdvisory(intel, intel.weather, intel.minuteOfDay);
  if (ghatHazard.hasHazard) {
    actions.unshift(...ghatHazard.alerts);
  }

  const headline = actions[0] || intel.statusLabel || 'See details';
  return {
    headline,
    actions,
    visitScore: intel.visitScore,
    confidence: intel.confidence,
    ghatHazard,
    sunExposure,
    darshanQueue,
  };
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
  getMiddaySunExposureAdvisory,
  getDarshanQueueEstimate,
};
