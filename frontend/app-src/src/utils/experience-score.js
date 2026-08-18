/** Pure experience / open / crowd scoring — extracted from core/app.js */

export const CROWD_BASE_BY_DAYPART = {
  earlyMorning: 0.3, morning: 0.6, lateMorning: 0.8,
  afternoon: 0.9, evening: 1.1, night: 0.5,
};
export const CROWD_WEEKEND_MULT = 1.4;
export const CROWD_PEAK_MULT = 1.5;

export function timeToMinutes(t) {
  if (typeof t === 'number' && Number.isFinite(t)) return t;
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function getDaypartClient(nowMin, sunsetMin = 18 * 60) {
  if (nowMin >= 5 * 60 && nowMin < 9 * 60) return 'earlyMorning';
  if (nowMin >= 9 * 60 && nowMin < 12 * 60) return 'lateMorning';
  if (nowMin >= 12 * 60 && nowMin < 16 * 60) return 'afternoon';
  if (nowMin >= 16 * 60 && nowMin < sunsetMin) return 'evening';
  if (nowMin >= sunsetMin || nowMin < 5 * 60) return 'night';
  return 'morning';
}

export function getOpeningStatusPure(loc, nowMin) {
  const ot = timeToMinutes(loc?.ot ?? '00:00');
  const ct = timeToMinutes(loc?.ct ?? '23:59');
  if (!Number.isFinite(ot) || !Number.isFinite(ct)) {
    return { status: 'unknown', label: 'Hours unknown', color: 'var(--text-muted)' };
  }
  const overnight = ct <= ot;
  const open = overnight ? (nowMin >= ot || nowMin < ct) : (nowMin >= ot && nowMin < ct);
  if (!open) return { status: 'closed', label: '🔴 Closed', color: 'var(--danger-color, #ef4444)' };
  const minsToClose = overnight ? (nowMin < ct ? ct - nowMin : (1440 - nowMin) + ct) : ct - nowMin;
  if (minsToClose <= 60 && minsToClose > 0) {
    return { status: 'closing_soon', label: '🟡 Closing Soon', color: 'var(--warning-color)' };
  }
  return { status: 'open', label: '🟢 Open', color: 'var(--success-color)' };
}

export function getCrowdPredictionPure(loc, nowMin, opts = {}) {
  const isWeekend = opts.isWeekend ?? false;
  const sunsetMin = opts.sunsetMin ?? 18 * 60;
  const daypart = getDaypartClient(nowMin, sunsetMin);
  let isPeakNow = false;
  if (loc?.peak_hours) {
    const parts = String(loc.peak_hours).split('-');
    if (parts.length === 2) {
      const pStart = timeToMinutes(parts[0].trim());
      const pEnd = timeToMinutes(parts[1].trim());
      if (Number.isFinite(pStart) && Number.isFinite(pEnd)) {
        isPeakNow = nowMin >= pStart && nowMin <= pEnd;
      }
    }
  }
  let score = CROWD_BASE_BY_DAYPART[daypart] ?? 0.6;
  if (isWeekend) score *= CROWD_WEEKEND_MULT;
  if (isPeakNow) score *= CROWD_PEAK_MULT;
  if (loc?.cat === 'market' || loc?.cat === 'food') score *= 1.15;
  if (score < 0.35) return 'Very Low';
  if (score < 0.6) return 'Low';
  if (score < 0.95) return 'Moderate';
  if (score < 1.4) return 'High';
  return 'Very High';
}

/**
 * Full experience score used by planner cards.
 * ctx: { sunriseMin, sunsetMin, tempC, weatherMain, windKph, isWeekend }
 */
export function calculateExperienceScorePure(loc, simTime, ctx = {}) {
  let score = 50;
  const reasons = [];
  let state = 'Normal';
  const sunriseMin = ctx.sunriseMin ?? 6 * 60;
  const sunsetMin = ctx.sunsetMin ?? 18 * 60;
  const status = getOpeningStatusPure(loc, simTime);

  if (status.status === 'closed') {
    return { score: 0, state: 'Closed', reasons: ['Currently Closed'], crowd: null, status: status.status };
  }
  score += 15;
  reasons.push('Currently Open');

  if (simTime >= sunriseMin - 30 && simTime <= sunriseMin + 90) {
    if (loc.is_sunrise_spot) {
      score += 35; state = 'Sunrise Mode'; reasons.push('Perfect time for Sunrise View');
    } else {
      score += 10; state = 'Morning Mode'; reasons.push('Peaceful morning atmosphere');
    }
  } else if (simTime >= sunsetMin - 90 && simTime <= sunsetMin + 30) {
    if (loc.is_sunset_spot) {
      score += 35; state = 'Golden Hour'; reasons.push('Perfect time for Sunset View');
    } else {
      score += 10; state = 'Evening Mode'; reasons.push('Pleasant evening vibe');
    }
  } else if (simTime >= sunsetMin + 30) {
    if (loc.has_nightlife) {
      score += 25; state = 'Night Mode'; reasons.push('Nightlife active');
    } else if (loc.indoor_outdoor === 'outdoor' && loc.cat !== 'food') {
      score -= 20; reasons.push('Outdoor at night — limited visibility');
    }
  }

  if (ctx.tempC != null && ctx.tempC > 35 && simTime >= 720 && simTime <= 960) {
    if (loc.indoor_outdoor === 'indoor') {
      score += 20; state = 'Heat Escape'; reasons.push('Indoor escape from heat');
    } else if (loc.indoor_outdoor === 'outdoor') {
      score -= 30; state = 'Heat Alert'; reasons.push('Extreme heat for outdoor activity');
    }
  }
  if (/rain|storm|drizzle/i.test(ctx.weatherMain || '') && loc.indoor_outdoor !== 'indoor') {
    score -= 25;
    reasons.push('Rain — outdoor experience reduced');
  }
  if (ctx.windKph != null && ctx.windKph >= 30 && (loc.cat === 'beach' || loc.cat === 'scenic' || loc.is_sunset_spot)) {
    score -= 15;
    reasons.push('Strong wind at exposed spot');
  }

  const crowd = getCrowdPredictionPure(loc, simTime, { isWeekend: ctx.isWeekend, sunsetMin });
  if (crowd === 'Very High' || crowd === 'High') {
    score -= 10;
    reasons.push(`${crowd} crowd expected`);
  } else if (crowd === 'Very Low' || crowd === 'Low') {
    score += 8;
    reasons.push(`${crowd} crowd`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, state, reasons, crowd, status: status.status };
}
