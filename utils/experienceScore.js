'use strict';
function timeToMinutes(t) {
  if (typeof t === 'number' && Number.isFinite(t)) return t;
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
function getOpeningStatusPure(loc, min) {
  const ot = timeToMinutes(loc?.ot ?? '00:00'), ct = timeToMinutes(loc?.ct ?? '23:59');
  if (!Number.isFinite(ot) || !Number.isFinite(ct)) return { status: 'unknown' };
  const open = ct > ot ? (min >= ot && min < ct) : (min >= ot || min < ct);
  if (!open) return { status: 'closed' };
  const left = ct > min ? ct - min : ct + 1440 - min;
  return left <= 45 ? { status: 'closing_soon' } : { status: 'open' };
}
function getCrowdPredictionPure(loc, min, opts = {}) {
  const daypart = min < 540 ? 'earlyMorning' : min < 720 ? 'lateMorning' : min < 960 ? 'afternoon' : min < 1080 ? 'evening' : 'night';
  const base = { earlyMorning: 0.3, lateMorning: 0.8, afternoon: 0.9, evening: 1.1, night: 0.5 }[daypart] || 0.6;
  const s = base * (opts.isWeekend ? 1.4 : 1);
  if (s < 0.35) return 'Very Low';
  if (s < 0.6) return 'Low';
  if (s < 0.95) return 'Moderate';
  if (s < 1.4) return 'High';
  return 'Very High';
}
function calculateExperienceScorePure(loc, simTime, ctx = {}) {
  if (getOpeningStatusPure(loc, simTime).status === 'closed') return { score: 0, state: 'Closed' };
  let score = 65;
  if (loc.is_sunset_spot && simTime >= (ctx.sunsetMin || 1080) - 90) score += 35;
  if (ctx.tempC > 35 && loc.indoor_outdoor === 'outdoor' && simTime >= 720 && simTime <= 960) score -= 30;
  return { score: Math.max(0, Math.min(100, score)), state: 'Normal', crowd: getCrowdPredictionPure(loc, simTime, ctx) };
}
module.exports = { timeToMinutes, getOpeningStatusPure, getCrowdPredictionPure, calculateExperienceScorePure };
