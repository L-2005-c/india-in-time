// ─────────────────────────────────────────────
//  GeoAI Time Intelligence Engine
//  services/timeIntelligence.js
//
//  Turns a static place record into a "living" record whose status,
//  crowd level, badges, recommendations and notifications change
//  every minute based on time of day, weekday/weekend, season and
//  live weather. Nothing here is hardcoded per-place — all category
//  defaults come from data/time-intelligence-rules.json so new
//  places/categories can be added without touching this file.
// ─────────────────────────────────────────────

const rules = require('../data/time-intelligence-rules.json');

// ── time helpers ──────────────────────────────────────────────────────────
function t2m(t, fallback = 0) {
  if (!t || typeof t !== 'string' || !t.includes(':')) return fallback;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}
function m2t(m) {
  m = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function inWindow(min, windows) {
  return (windows || []).some(([a, b]) => min >= t2m(a) && min <= t2m(b));
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Servers (e.g. Vercel) usually run in UTC, but every place in this app is
// in India — so we always read the wall-clock time in Asia/Kolkata rather
// than trusting the process's local timezone (Date#getHours() etc. would
// silently be wrong by 5.5 hours on a UTC server).
const IST_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short',
});
function getISTParts(date) {
  const parts = IST_FORMATTER.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const hour = parseInt(get('hour'), 10) % 24; // Intl can return "24" for midnight
  const minute = parseInt(get('minute'), 10);
  const weekdayShort = get('weekday');
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayShort);
  return {
    minutesOfDay: hour * 60 + minute,
    dayIndex: weekdayIndex,
    month: parseInt(get('month'), 10),
  };
}

function getSeason(month) {
  // Indian seasonal calendar (approximate, generalized across regions)
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([3, 4, 5].includes(month)) return 'summer';
  if ([6, 7, 8, 9].includes(month)) return 'monsoon';
  return 'autumn'; // 10, 11
}

function categoryRules(cat) {
  return rules.categories[cat] || rules.categories.default;
}

/**
 * Approximate sunrise/sunset for a given lat on a given date.
 * Lightweight astronomical approximation — good enough for UX badges,
 * not for navigation. Falls back to 06:00/18:30 if inputs are bad.
 */
function computeSunTimes(lat, lon, date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    const lngHour = lon / 15;
    const zenith = 90.833;

    function calc(isRise) {
      const t = dayOfYear + ((isRise ? 6 : 18) - lngHour) / 24;
      const M = 0.9856 * t - 3.289;
      let L = M + 1.916 * Math.sin((M * Math.PI) / 180) + 0.020 * Math.sin((2 * M * Math.PI) / 180) + 282.634;
      L = ((L % 360) + 360) % 360;
      let RA = (180 / Math.PI) * Math.atan(0.91764 * Math.tan((L * Math.PI) / 180));
      RA = ((RA % 360) + 360) % 360;
      const Lquadrant = Math.floor(L / 90) * 90;
      const RAquadrant = Math.floor(RA / 90) * 90;
      RA = RA + (Lquadrant - RAquadrant);
      RA /= 15;
      const sinDec = 0.39782 * Math.sin((L * Math.PI) / 180);
      const cosDec = Math.cos(Math.asin(sinDec));
      const cosH =
        (Math.cos((zenith * Math.PI) / 180) - sinDec * Math.sin((lat * Math.PI) / 180)) /
        (cosDec * Math.cos((lat * Math.PI) / 180));
      if (cosH > 1 || cosH < -1) return null; // sun never rises/sets (not relevant in India)
      let H = isRise ? 360 - (180 / Math.PI) * Math.acos(cosH) : (180 / Math.PI) * Math.acos(cosH);
      H /= 15;
      const T = H + RA - 0.06571 * t - 6.622;
      let UT = T - lngHour;
      UT = ((UT % 24) + 24) % 24;
      const istOffset = 5.5; // India Standard Time
      let localT = UT + istOffset;
      localT = ((localT % 24) + 24) % 24;
      const hh = Math.floor(localT);
      const mm = Math.round((localT - hh) * 60);
      return m2t(hh * 60 + mm);
    }

    return { sunrise: calc(true) || '06:00', sunset: calc(false) || '18:30' };
  } catch (_e) {
    return { sunrise: '06:00', sunset: '18:30' };
  }
}

/**
 * Classify the current moment into a day-part bucket.
 */
function getDaypart(nowMin, sunsetMin) {
  if (nowMin >= 5 * 60 && nowMin < 9 * 60) return 'earlyMorning';
  if (nowMin >= 9 * 60 && nowMin < 12 * 60) return 'lateMorning';
  if (nowMin >= 12 * 60 && nowMin < 16 * 60) return 'afternoon';
  if (nowMin >= 16 * 60 && nowMin < sunsetMin) return 'evening';
  if (nowMin >= sunsetMin || nowMin < 5 * 60) return 'night';
  return 'morning';
}

/**
 * Core: compute the full "living" state of a single place right now.
 * @param {object} place  { name, cat, ot, ct, is_sunrise_spot, is_sunset_spot,
 *                           indoor_outdoor, weeklyHoliday?, coords }
 * @param {Date}   now
 * @param {object} weather { tempC, condition, windKph, rainMm } (optional)
 */
function getPlaceState(place, now = new Date(), weather = null) {
  const cat = place.cat || 'default';
  const catRule = categoryRules(cat);
  const [lat, lon] = place.coords || [20.5937, 78.9629];

  const openMin = t2m(place.ot, 6 * 60);
  const closeMin = t2m(place.ct, 20 * 60);
  const istNow = getISTParts(now);
  const nowMin = istNow.minutesOfDay;
  const dayName = DAY_NAMES[istNow.dayIndex];
  const isWeekend = istNow.dayIndex === 0 || istNow.dayIndex === 6;
  const month = istNow.month;
  const season = getSeason(month);

  const sun = computeSunTimes(lat, lon, now);
  const sunsetMin = t2m(sun.sunset, 18 * 60 + 30);

  const weeklyHoliday = place.weeklyHoliday !== undefined ? place.weeklyHoliday : catRule.weeklyHoliday;
  const nightAvailable = place.night_availability !== undefined ? place.night_availability : catRule.nightAvailable;

  // ── Open / Closed status ────────────────────────────────────────────────
  const isHolidayToday = weeklyHoliday && weeklyHoliday === dayName;
  const isWithinHours = nowMin >= openMin && nowMin < closeMin;
  const isOpenNow = !isHolidayToday && (isWithinHours || (nightAvailable && (nowMin >= sunsetMin || nowMin < openMin)));

  const minutesToClose = isOpenNow ? (closeMin >= nowMin ? closeMin - nowMin : 1440 - nowMin + closeMin) : null;
  const minutesToOpen = !isOpenNow
    ? (isHolidayToday ? null : (openMin >= nowMin ? openMin - nowMin : 1440 - nowMin + openMin))
    : null;

  // ── Daypart-driven messaging ────────────────────────────────────────────
  const daypart = getDaypart(nowMin, sunsetMin);
  const bestHours = place.best_hours || catRule.bestHours;
  const peakHours = place.peak_hours || catRule.peakHours;
  const isBestTimeNow = inWindow(nowMin, bestHours);
  const isPeakHourNow = inWindow(nowMin, peakHours);

  let statusLabel = 'Good time to visit';
  const recommendations = [];

  if (!isOpenNow) {
    statusLabel = isHolidayToday ? `Closed today (weekly holiday: ${weeklyHoliday})` : 'Currently Closed';
  } else if (daypart === 'earlyMorning') {
    statusLabel = isBestTimeNow ? 'Excellent time to visit' : 'Good time to visit';
    if (place.is_sunrise_spot) recommendations.push('Sunrise viewpoint — arrive 15 min before sunrise');
    recommendations.push('Suggest breakfast nearby');
  } else if (daypart === 'lateMorning' || daypart === 'morning') {
    statusLabel = 'Good time to visit';
  } else if (daypart === 'afternoon') {
    if (place.indoor_outdoor === 'outdoor' && weather && weather.tempC > 35) {
      statusLabel = 'Hot outside — consider an indoor break';
      recommendations.push('Recommend indoor attractions nearby');
    } else {
      statusLabel = 'Good time to visit';
    }
    recommendations.push('Suggest lunch restaurants nearby');
  } else if (daypart === 'evening') {
    if (place.is_sunset_spot) {
      statusLabel = 'Great sunset spot — golden hour approaching';
      recommendations.push('Golden hour photography tips');
    } else {
      statusLabel = 'Good time to visit';
    }
  } else if (daypart === 'night') {
    if (nightAvailable) {
      statusLabel = 'Open at night';
      recommendations.push('Illuminated views / night market nearby');
    } else {
      statusLabel = 'Closed for the night';
    }
  }

  // ── Weather overrides ───────────────────────────────────────────────────
  const weatherWarnings = [];
  if (weather) {
    if (weather.condition && /rain/i.test(weather.condition)) {
      weatherWarnings.push('Rain expected — consider indoor attractions');
    }
    if (weather.tempC != null && weather.tempC >= 38) {
      weatherWarnings.push('Extreme heat — prefer indoor museums/malls, reduce walking routes');
    }
    if (weather.windKph != null && weather.windKph >= 35 && (place.cat === 'beach' || place.is_sunset_spot)) {
      weatherWarnings.push('Strong winds — use caution at open viewpoints/beaches');
    }
  }

  // ── Crowd prediction ────────────────────────────────────────────────────
  const crowdLevel = predictCrowd({ daypart, isWeekend, isPeakHourNow, cat });

  // ── Seasonal behaviour ───────────────────────────────────────────────────
  const bestSeason = place.season || catRule.season;
  const seasonalNote =
    bestSeason && bestSeason !== 'any' && bestSeason !== season
      ? `Best experienced in ${bestSeason} — visiting off-season is still fine, just set expectations`
      : bestSeason && bestSeason !== 'any'
      ? `Peak season right now (${bestSeason})`
      : null;

  // ── Badges ───────────────────────────────────────────────────────────────
  const badges = [];
  badges.push(isOpenNow ? '🟢 Open' : '🔴 Closed');
  if (isOpenNow && minutesToClose != null && minutesToClose <= 45) badges.push('🟡 Closing Soon');
  if (place.is_sunrise_spot) badges.push('🌅 Best at Sunrise');
  if (place.is_sunset_spot) badges.push('🌇 Best at Sunset');
  if (weather && weather.tempC >= 38) badges.push('🔥 Hot Weather');
  if (weather && /rain/i.test(weather.condition || '')) badges.push('🌧 Rain Alert');
  if (crowdLevel === 'High' || crowdLevel === 'Very High') badges.push('👥 Peak Crowd');
  if (weather && weather.windKph != null && weather.windKph >= 30 && (cat === 'beach' || cat === 'scenic' || place.is_sunset_spot)) badges.push('💨 Strong Wind');
  if (isBestTimeNow && isOpenNow) badges.push('✨ Best Time Now');

  // ── Notifications ────────────────────────────────────────────────────────
  const notifications = [];
  if (isOpenNow && minutesToClose != null && minutesToClose <= 60) {
    notifications.push(`This attraction closes in ${minutesToClose} minutes.`);
  }
  if (place.is_sunset_spot && nowMin < sunsetMin && sunsetMin - nowMin <= 30) {
    notifications.push(`Golden hour starts in ${sunsetMin - nowMin} minutes.`);
  }
  if (crowdLevel === 'High' || crowdLevel === 'Very High') {
    notifications.push(`Heavy crowd expected — consider visiting earlier or later.`);
  }
  if (!isOpenNow && minutesToOpen != null) {
    notifications.push(`Opens in ${Math.round(minutesToOpen / 60) > 0 ? `${Math.floor(minutesToOpen / 60)}h ${minutesToOpen % 60}m` : `${minutesToOpen}m`} — best time tomorrow is around ${sun.sunrise}.`);
  }

  return {
    name: place.name,
    category: cat,
    isOpenNow,
    statusLabel,
    minutesToClose,
    minutesToOpen,
    openTime: place.ot,
    closeTime: place.ct,
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    nightAvailable,
    weeklyHoliday,
    daypart,
    isBestTimeNow,
    isPeakHourNow,
    crowdLevel,
    season,
    bestSeason,
    seasonalNote,
    recommendations,
    weatherWarnings,
    badges,
    notifications,
  };
}

/**
 * Crowd prediction: Very Low / Low / Moderate / High / Very High
 */
function predictCrowd({ daypart, isWeekend, isPeakHourNow, cat }) {
  const w = rules.crowdWeights;
  let score = w.baseByDaypart[daypart] ?? 0.6;
  if (isWeekend) score *= w.weekend;
  if (isPeakHourNow) score *= w.peakHourMultiplier;
  if (cat === 'market' || cat === 'food') score *= 1.15;

  if (score < 0.35) return 'Very Low';
  if (score < 0.6) return 'Low';
  if (score < 0.95) return 'Moderate';
  if (score < 1.4) return 'High';
  return 'Very High';
}

// Valid trip-mode keys — anything else (typos, stray input) is silently
// ignored rather than looked up on the rules object, so this doubles as a
// safe allow-list for what would otherwise be a user-controlled property key.
const TRIP_MODES = ['solo', 'duo', 'trio', 'family', 'group'];

/**
 * Apply one weight set (a persona's or a trip mode's multipliers) to a score.
 * Shared by personalizeScore for both dimensions since the matching rules
 * are identical: sunrise/sunset spot flags, has_nightlife, or a direct
 * category match all multiply the running score.
 */
function applyWeightSet(score, place, weights) {
  for (const [key, mult] of Object.entries(weights)) {
    if (key === 'sunrise' && place.is_sunrise_spot) score *= mult;
    else if (key === 'sunset' && place.is_sunset_spot) score *= mult;
    else if (key === 'nightlife' && place.has_nightlife) score *= mult;
    else if (key === 'safety' && place.family_friendly) score *= mult;
    else if (key === place.cat) score *= mult;
  }
  return score;
}

/**
 * Personalization: adjust a place's base score for given personas and/or
 * a trip mode (who's traveling: solo/duo/trio/family/group). Multiple
 * personas may be supplied; multipliers stack multiplicatively. tripMode
 * is a single value (a trip has one composition) applied on top.
 */
function personalizeScore(baseScore, place, personas = [], tripMode = null) {
  let score = baseScore;
  for (const persona of personas) {
    const weights = rules.personas[persona];
    if (weights) score = applyWeightSet(score, place, weights);
  }
  if (tripMode && TRIP_MODES.includes(tripMode) && rules.tripModes) {
    const weights = rules.tripModes[tripMode];
    if (weights) score = applyWeightSet(score, place, weights);
  }
  return score;
}

/**
 * Batch: compute state for a list of places at once (used by the frontend
 * to paint the whole map/list in a single request).
 */
function getBatchState(places, now = new Date(), weather = null) {
  return (places || []).map((p) => getPlaceState(p, now, weather));
}

/**
 * Suggest similar open alternatives when a place is currently closed.
 */
function suggestOpenAlternatives(closedPlace, allPlaces, now = new Date(), weather = null, limit = 3) {
  return (allPlaces || [])
    .filter((p) => p.name !== closedPlace.name && p.cat === closedPlace.cat)
    .map((p) => ({ place: p, state: getPlaceState(p, now, weather) }))
    .filter((x) => x.state.isOpenNow)
    .slice(0, limit)
    .map((x) => x.place.name);
}

module.exports = {
  getPlaceState,
  getBatchState,
  predictCrowd,
  personalizeScore,
  computeSunTimes,
  suggestOpenAlternatives,
  t2m,
  m2t,
  TRIP_MODES,
};