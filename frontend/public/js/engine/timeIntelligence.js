// ══════════════════════════════════════════════════
// Time Intelligence Engine
// Simulates time, computes experience scores, crowd levels, etc.
// ══════════════════════════════════════════════════
import { state } from '../core/state.js';
import { t2m, getCurrentLocalMin } from '../core/utils.js';

const _sunTimesCache = new Map();

/** Get sunrise/sunset min for a location. Cached by lat,lon,date. */
export function getSunTimesClient(lat, lon, date = new Date()) {
  const dayKey = `${lat.toFixed(2)},${lon.toFixed(2)},${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (_sunTimesCache.has(dayKey)) return _sunTimesCache.get(dayKey);
  let result;
  try {
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    const lngHour = lon / 15;
    const zenith = 90.833;
    const calc = (isRise) => {
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
      const cosH = (Math.cos((zenith * Math.PI) / 180) - sinDec * Math.sin((lat * Math.PI) / 180)) / (cosDec * Math.cos((lat * Math.PI) / 180));
      if (cosH > 1 || cosH < -1) return null;
      let H = isRise ? 360 - (180 / Math.PI) * Math.acos(cosH) : (180 / Math.PI) * Math.acos(cosH);
      H /= 15;
      const T = H + RA - 0.06571 * t - 6.622;
      let UT = T - lngHour;
      UT = ((UT % 24) + 24) % 24;
      let localT = UT + 5.5; // IST
      localT = ((localT % 24) + 24) % 24;
      return Math.round(localT * 60);
    };
    const sunriseMin = calc(true);
    const sunsetMin = calc(false);
    result = { sunriseMin: sunriseMin ?? 6 * 60, sunsetMin: sunsetMin ?? 18 * 60 + 30 };
  } catch (_e) {
    result = { sunriseMin: 6 * 60, sunsetMin: 18 * 60 + 30 };
  }
  _sunTimesCache.set(dayKey, result);
  return result;
}

export function placeSunTimes(loc, date = new Date()) {
  const [lat, lon] = loc.coords || [20.5937, 78.9629];
  return getSunTimesClient(lat, lon, date);
}

export function getPlaceDynamicStatus(loc, evalTime) {
  const now = evalTime !== undefined ? evalTime : getCurrentLocalMin();
  const ot = t2m(loc.ot || '06:00');
  const ct = t2m(loc.ct || '23:00', 23 * 60);
  const overnight = ct <= ot;
  const isOpen = overnight ? (now >= ot || now < ct) : (now >= ot && now < ct);
  if (!isOpen) return { status: 'closed', label: '🔴 Closed', color: 'var(--danger-color)' };
  const minsToClose = overnight ? (now < ct ? ct - now : (1440 - now) + ct) : ct - now;
  if (minsToClose <= 60 && minsToClose > 0) return { status: 'closing_soon', label: '🟡 Closing Soon', color: 'var(--warning-color)' };
  return { status: 'open', label: '🟢 Open', color: 'var(--success-color)' };
}

const CROWD_BASE_BY_DAYPART = { earlyMorning: 0.3, morning: 0.6, lateMorning: 0.8, afternoon: 0.9, evening: 1.1, night: 0.5 };
const CROWD_WEEKEND_MULT = 1.4;
const CROWD_PEAK_MULT = 1.5;

export function getDaypartClient(nowMin, sunsetMin) {
  if (nowMin >= 5 * 60 && nowMin < 9 * 60) return 'earlyMorning';
  if (nowMin >= 9 * 60 && nowMin < 12 * 60) return 'lateMorning';
  if (nowMin >= 12 * 60 && nowMin < 16 * 60) return 'afternoon';
  if (nowMin >= 16 * 60 && nowMin < sunsetMin) return 'evening';
  if (nowMin >= sunsetMin || nowMin < 5 * 60) return 'night';
  return 'morning';
}

export function getCrowdPrediction(loc, evalTime) {
  const now = evalTime !== undefined ? evalTime : getCurrentLocalMin();
  const isWeekend = [0, 6].includes(new Date().getDay());
  const { sunsetMin } = placeSunTimes(loc);
  const daypart = getDaypartClient(now, sunsetMin);

  let isPeakNow = false;
  if (loc.peak_hours) {
    const parts = loc.peak_hours.split('-');
    if (parts.length === 2) {
      const pStart = t2m(parts[0].trim());
      const pEnd = t2m(parts[1].trim());
      isPeakNow = now >= pStart && now <= pEnd;
    }
  }

  let score = CROWD_BASE_BY_DAYPART[daypart] ?? 0.6;
  if (isWeekend) score *= CROWD_WEEKEND_MULT;
  if (isPeakNow) score *= CROWD_PEAK_MULT;
  if (loc.cat === 'market' || loc.cat === 'food') score *= 1.15;

  if (score < 0.35) return 'Very Low';
  if (score < 0.6) return 'Low';
  if (score < 0.95) return 'Moderate';
  if (score < 1.4) return 'High';
  return 'Very High';
}

export function calculateExperienceScore(loc, simTime = state.globalSimulationTime) {
  let score = 50;
  const reasons = [];
  let locState = "Normal";

  const status = getPlaceDynamicStatus(loc, simTime);
  const crowd = getCrowdPrediction(loc, simTime);
  const { sunriseMin, sunsetMin } = placeSunTimes(loc);

  if (status.status === 'closed') {
    return { score: 0, state: 'Closed', reasons: ['🔴 Currently Closed', 'Check opening hours before visiting.'] };
  }

  score += 15;
  reasons.push('🟢 Currently Open');

  if (simTime >= sunriseMin - 30 && simTime <= sunriseMin + 90) {
    if (loc.is_sunrise_spot) {
      score += 35;
      locState = "Sunrise Mode";
      reasons.push('🌅 Perfect time for Sunrise View', '📸 Golden lighting for photography');
    } else {
      score += 10;
      locState = "Morning Mode";
      reasons.push('🌤️ Peaceful morning atmosphere');
    }
  } else if (simTime >= sunsetMin - 90 && simTime <= sunsetMin + 30) {
    if (loc.is_sunset_spot) {
      score += 35;
      locState = "Golden Hour";
      reasons.push('🌇 Perfect time for Sunset View', '📸 Excellent Golden Hour lighting');
    } else {
      score += 10;
      locState = "Evening Mode";
      reasons.push('🌆 Pleasant evening vibe');
    }
  } else if (simTime >= sunsetMin + 30) {
    if (loc.has_nightlife) {
      score += 25;
      locState = "Night Mode";
      reasons.push('🍹 Vibrant Nightlife is active');
    } else if (loc.indoor_outdoor === 'outdoor' && loc.cat !== 'food') {
      score -= 20;
      reasons.push('🌙 Outdoor attraction at night (Limited visibility)');
    }
  }

  if (state.realTemp && state.realTemp > 35 && simTime >= 720 && simTime <= 960) {
    if (loc.indoor_outdoor === 'indoor') {
      score += 20;
      locState = "Heat Escape";
      reasons.push('❄️ Great AC/Indoor escape from extreme heat');
    } else if (loc.indoor_outdoor === 'outdoor') {
      score -= 30;
      locState = "Heat Alert";
      reasons.push('⚠️ Extreme Heat warning for outdoor activity');
    }
  }

  if (state.realWeatherMain && /rain|storm|drizzle/i.test(state.realWeatherMain) && loc.indoor_outdoor !== 'indoor') {
    score -= 20;
    reasons.push('🌧 Rain expected — outdoor visit may be uncomfortable');
  }
  if (window.realWind >= 30 && (loc.cat === 'beach' || loc.cat === 'scenic' || loc.is_sunset_spot)) {
    score -= 10;
    reasons.push('💨 Strong winds at this open viewpoint/beach');
  }

  if (crowd === 'Very High') {
    score -= 15;
    reasons.push('👥 Very High Crowd expected');
  } else if (crowd === 'High') {
    score -= 5;
    reasons.push('👥 High Crowd expected');
  } else {
    score += 10;
    reasons.push('🚶 Low/Moderate Crowd expected');
  }
  
  if (status.status === 'closing_soon') {
    score -= 15;
    reasons.push('🟡 Closing soon (Hurry!)');
  }

  score = Math.max(1, Math.min(100, score));
  return { score, state: locState !== "Normal" ? locState : "Recommended", reasons };
}

export function getTimeBadgesHtml(loc, evalTime) {
  const status = getPlaceDynamicStatus(loc, evalTime);
  const crowd = getCrowdPrediction(loc, evalTime);
  const now = evalTime !== undefined ? evalTime : getCurrentLocalMin();
  const scoreInfo = calculateExperienceScore(loc, now);
  
  let html = `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:${status.color}; color:#fff; display:inline-block; margin-top:4px; margin-right:4px;">${status.label}</span>`;
  
  if (crowd === 'High' || crowd === 'Very High') {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,100,100,0.2); display:inline-block; margin-top:4px; margin-right:4px;">👥 Peak Crowd</span>`;
  }
  
  const { sunriseMin, sunsetMin } = placeSunTimes(loc);
  if (loc.is_sunrise_spot && now >= sunriseMin - 30 && now <= sunriseMin + 90) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,200,0,0.2); display:inline-block; margin-top:4px; margin-right:4px;">🌅 Best at Sunrise</span>`;
  }
  if (loc.is_sunset_spot && now >= sunsetMin - 90 && now <= sunsetMin + 30) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,100,0,0.2); display:inline-block; margin-top:4px; margin-right:4px;">🌇 Best at Sunset</span>`;
  }
  
  if (state.realTemp && state.realTemp > 35 && loc.indoor_outdoor === 'outdoor') {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,0,0,0.2); display:inline-block; margin-top:4px; margin-right:4px;">🔥 Hot Weather</span>`;
  }
  if (state.realWeatherMain && /rain|storm|drizzle/i.test(state.realWeatherMain) && loc.indoor_outdoor !== 'indoor') {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(0,100,255,0.2); display:inline-block; margin-top:4px; margin-right:4px;">🌧 Rain Alert</span>`;
  }
  if (window.realWind >= 30 && (loc.cat === 'beach' || loc.cat === 'scenic' || loc.is_sunset_spot)) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(120,180,255,0.2); display:inline-block; margin-top:4px; margin-right:4px;">💨 Strong Wind</span>`;
  }
  if (status.status === 'open' && scoreInfo.score >= 80) {
    html += `<span style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(168,85,247,0.25); display:inline-block; margin-top:4px; margin-right:4px;">✨ Best Time Now</span>`;
  }
  
  return html;
}
