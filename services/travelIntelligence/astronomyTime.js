'use strict';

/**
 * services/travelIntelligence/astronomyTime.js
 * Real solar astronomy and photographic lighting calculations across Indian coordinates.
 * Computes sunrise, morning golden hour, solar noon, evening golden hour, sunset, blue hour, and night.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Approximate Day of Year from a Date.
 */
function getDayOfYear(date) {
  const d = date instanceof Date ? date : new Date(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  const diff = d - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Computes solar times (in minutes from midnight IST) for a given lat/lon and date.
 * Uses standard solar declination & equation of time algorithms.
 */
function calculateSolarTimes(lat = 17.6868, lon = 83.2185, date = new Date()) {
  const dayOfYear = getDayOfYear(date);

  // Solar declination (approximate in radians)
  const declination = 23.45 * Math.sin(DEG2RAD * (360 / 365) * (dayOfYear - 81)) * DEG2RAD;

  // Equation of time in minutes
  const b = (360 / 365) * (dayOfYear - 81) * DEG2RAD;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  // Solar noon in UTC (IST is UTC + 5.5 hours = 330 minutes)
  const timeOffset = (lon * 4) - 330; // Minutes difference from IST standard meridian (82.5°E)
  const solarNoonMin = 720 - timeOffset - eot;

  // Hour angle for standard sunrise/sunset (sun center at -0.833° altitude)
  const latRad = lat * DEG2RAD;
  const cosH0 = (Math.sin(-0.833 * DEG2RAD) - (Math.sin(latRad) * Math.sin(declination))) /
                (Math.cos(latRad) * Math.cos(declination));

  const clampedCosH0 = Math.max(-1, Math.min(1, cosH0));
  const halfDayMinutes = (Math.acos(clampedCosH0) * RAD2DEG) * 4;

  const sunriseMin = Math.round(solarNoonMin - halfDayMinutes);
  const sunsetMin = Math.round(solarNoonMin + halfDayMinutes);

  // Golden hour (sun elevation between -4° and +6°)
  const cosGolden = (Math.sin(6.0 * DEG2RAD) - (Math.sin(latRad) * Math.sin(declination))) /
                    (Math.cos(latRad) * Math.cos(declination));
  const halfDayGolden = (Math.acos(Math.max(-1, Math.min(1, cosGolden))) * RAD2DEG) * 4;

  const morningGoldenStart = Math.max(0, sunriseMin - 15);
  const morningGoldenEnd = Math.round(solarNoonMin - halfDayGolden);

  const eveningGoldenStart = Math.round(solarNoonMin + halfDayGolden);
  const eveningGoldenEnd = sunsetMin + 15;

  // Blue hour (civil twilight: sun elevation between -6° and -4°)
  const eveningBlueHourStart = sunsetMin + 15;
  const eveningBlueHourEnd = sunsetMin + 40;

  return {
    sunrise: sunriseMin,
    sunset: sunsetMin,
    solarNoon: Math.round(solarNoonMin),
    morningGoldenHour: { start: morningGoldenStart, end: morningGoldenEnd },
    eveningGoldenHour: { start: eveningGoldenStart, end: eveningGoldenEnd },
    blueHour: { start: eveningBlueHourStart, end: eveningBlueHourEnd },
  };
}

/**
 * Classifies a minute of the day into a photographic time phase.
 */
function classifyTimePhase(minuteOfDay, solarTimes) {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const { sunrise, sunset: _sunset, morningGoldenHour, eveningGoldenHour, blueHour } = solarTimes;

  if (m < sunrise - 40) return { phase: 'NIGHT', label: 'Night Sky', badge: '🌙 Night' };
  if (m < sunrise - 15) return { phase: 'DAWN', label: 'First Light / Dawn', badge: '🌌 Dawn' };
  if (m >= morningGoldenHour.start && m <= morningGoldenHour.end) {
    return { phase: 'SUNRISE_GOLDEN', label: 'Morning Golden Hour', badge: '🌅 Sunrise Golden Hour' };
  }
  if (m < 11 * 60 + 30) return { phase: 'MORNING', label: 'Bright Morning', badge: '🌤️ Morning' };
  if (m <= 15 * 60 + 30) return { phase: 'MIDDAY', label: 'Solar Midday', badge: '☀️ Midday Sun' };
  if (m < eveningGoldenHour.start) return { phase: 'AFTERNOON', label: 'Late Afternoon', badge: '🌤️ Late Afternoon' };
  if (m >= eveningGoldenHour.start && m <= eveningGoldenHour.end) {
    return { phase: 'GOLDEN_HOUR', label: 'Evening Golden Hour', badge: '🌇 Golden Hour' };
  }
  if (m >= blueHour.start && m <= blueHour.end) {
    return { phase: 'BLUE_HOUR', label: 'Twilight / Blue Hour', badge: '🌆 Blue Hour' };
  }
  if (m < 22 * 60) return { phase: 'EVENING', label: 'Nightlife / Evening', badge: '✨ Evening' };
  return { phase: 'NIGHT', label: 'Late Night', badge: '🌙 Night' };
}

/**
 * Calculates a scenic / photography suitability score (0-100) for a place at a projected arrival time.
 */
function getScenicScore(place, arriveMin, solarTimes, weather = {}) {
  const phaseInfo = classifyTimePhase(arriveMin, solarTimes);
  const cat = String(place.cat || '').toLowerCase();
  const isScenic = ['scenic', 'beach', 'hill', 'viewpoint', 'waterfall', 'fort'].includes(cat) ||
                   place.is_sunset_spot || place.is_sunrise_spot;

  let score = 50;
  const reasons = [];

  if (phaseInfo.phase === 'GOLDEN_HOUR') {
    if (place.is_sunset_spot || cat === 'beach' || cat === 'scenic' || cat === 'hill') {
      score += 45;
      reasons.push('Peak golden hour lighting for photography & sunset views');
    } else {
      score += 20;
    }
  } else if (phaseInfo.phase === 'SUNRISE_GOLDEN') {
    if (place.is_sunrise_spot || cat === 'hill' || cat === 'beach') {
      score += 45;
      reasons.push('Pristine sunrise lighting & soft morning shadows');
    } else {
      score += 15;
    }
  } else if (phaseInfo.phase === 'BLUE_HOUR') {
    if (place.is_sunset_spot || cat === 'monument' || cat === 'fort' || place.has_nightlife) {
      score += 35;
      reasons.push('Vibrant twilight atmosphere & illuminated monument silhouettes');
    }
  } else if (phaseInfo.phase === 'MIDDAY' && isScenic) {
    score -= 20;
    reasons.push('Harsh overhead sun with high glare');
  }

  // Weather modifiers
  const wx = weather || {};
  if (wx.cloudCover != null) {
    if (wx.cloudCover >= 20 && wx.cloudCover <= 60 && phaseInfo.phase === 'GOLDEN_HOUR') {
      score += 10;
      reasons.push('Scattered clouds create dramatic sunset coloration');
    } else if (wx.cloudCover > 85 && (place.is_sunset_spot || place.is_sunrise_spot)) {
      score -= 25;
      reasons.push('Overcast cloud deck obscures solar disk');
    }
  }

  return {
    score: Math.max(10, Math.min(100, Math.round(score))),
    phase: phaseInfo.phase,
    badge: phaseInfo.badge,
    label: phaseInfo.label,
    reasons,
  };
}

module.exports = {
  calculateSolarTimes,
  classifyTimePhase,
  getScenicScore,
};
