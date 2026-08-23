// crowdEngine.js — never pretends live measurements
const rules = require('../../data/time-intelligence-rules.json');
const { getSeason } = require('./timeEngine');
const { festivalCrowdMultiplier } = require('./festivalEngine');
const CROWD_LABELS = [
  { max: 0.35, level: 'Very Low', score: 95 },
  { max: 0.60, level: 'Low', score: 80 },
  { max: 0.95, level: 'Moderate', score: 55 },
  { max: 1.40, level: 'High', score: 30 },
  { max: Infinity, level: 'Very High', score: 10 },
];
function computeCrowd(ctx = {}) {
  const w = rules.crowdWeights || {};
  const { daypart = 'afternoon', isWeekend = false, isPeakHourNow = false, cat = 'default', month = new Date().getMonth() + 1, publicHoliday = false, weather = null, historicalObservations = null, date = null, region = null } = ctx;
  let rawScore = w.baseByDaypart?.[daypart] ?? 0.6;
  const factors = [`daypart:${daypart}`];
  if (isWeekend) { rawScore *= w.weekend ?? 1.4; factors.push('weekend'); }
  if (publicHoliday) { rawScore *= w.publicHoliday ?? 1.6; factors.push('publicHoliday'); }
  if (isPeakHourNow) { rawScore *= w.peakHourMultiplier ?? 1.5; factors.push('peakHour'); }
  const season = getSeason(month);
  const seasonMult = w.seasonMultiplier?.[season] ?? 1.0;
  if (seasonMult !== 1.0) { rawScore *= seasonMult; factors.push(`season:${season}`); }
  const typeMult = w.placeTypeMultiplier?.[cat] ?? w.placeTypeMultiplier?.default ?? 1.0;
  if (typeMult !== 1.0) { rawScore *= typeMult; factors.push(`type:${cat}`); }
  if (weather) {
    if (weather.condition && /rain|storm|drizzle/i.test(weather.condition)) { rawScore *= 0.75; factors.push('rainDampening'); }
    if (weather.tempC != null && weather.tempC >= 38) { rawScore *= 0.85; factors.push('heatDampening'); }
  }
  let festivalInfo = null;
  try {
    festivalInfo = festivalCrowdMultiplier(date || new Date(), { region, placeCat: cat });
    if (festivalInfo.multiplier > 1.0) {
      rawScore *= festivalInfo.multiplier;
      factors.push(`festival:${festivalInfo.festivals.map(f => f.id).join('+')}`);
    }
  } catch (_e) { festivalInfo = null; }
  let source = 'estimated', confidenceBoost = 0;
  if (historicalObservations && Number.isFinite(historicalObservations.avgScore)) {
    const hist = historicalObservations.avgScore, samples = historicalObservations.sampleSize || 0;
    const blend = samples >= 20 ? 0.6 : samples >= 5 ? 0.4 : 0.2;
    rawScore = rawScore * (1 - blend) + hist * blend;
    source = samples >= 10 ? 'predicted' : 'estimated';
    confidenceBoost = Math.min(15, Math.floor(samples / 2));
    factors.push(`historicalSamples:${samples}`);
  }
  const band = CROWD_LABELS.find((b) => rawScore < b.max) || CROWD_LABELS[CROWD_LABELS.length - 1];
  const parts = [];
  if (isWeekend) parts.push('weekend');
  if (isPeakHourNow) parts.push('peak tourism window');
  if (daypart) parts.push(daypart.replace(/([A-Z])/g, ' $1').toLowerCase().trim());
  if (factors.includes('rainDampening')) parts.push('rain reducing outdoor traffic');
  if (factors.includes('heatDampening')) parts.push('extreme heat reducing outdoor traffic');
  if (festivalInfo && festivalInfo.reason) parts.push(festivalInfo.reason);

  let crowdBadge = '🟡 Moderate Traffic';
  if (band.level === 'Very Low' || band.level === 'Low') crowdBadge = '🟢 Low Crowd';
  else if (band.level === 'High') crowdBadge = '🟠 Busy Window';
  else if (band.level === 'Very High') crowdBadge = '🔴 Peak Rush Window';

  const isPeakWindow = band.level === 'High' || band.level === 'Very High';
  const bestOffPeakWindow = cat === 'temple' || cat === 'fort' || cat === 'monument'
    ? '07:30–09:30 or 16:30–18:00'
    : 'Morning 08:00–10:30';

  return {
    level: band.level,
    rawScore: Math.round(rawScore * 100) / 100,
    crowdScore: band.score,
    crowdBadge,
    isPeakWindow,
    bestOffPeakWindow,
    source,
    confidenceBoost,
    factors,
    festivals: festivalInfo?.festivals || [],
    reason: `${band.level} crowd expected (${parts.length ? parts.join(' + ') : 'typical patterns'}). Source: ${source === 'predicted' ? 'predicted' : 'rule-based estimate'}.`,
  };
}
function predictCrowdLegacy({ daypart, isWeekend, isPeakHourNow, cat }) {
  return computeCrowd({ daypart, isWeekend, isPeakHourNow, cat }).level;
}
module.exports = { computeCrowd, predictCrowdLegacy, CROWD_LABELS };
