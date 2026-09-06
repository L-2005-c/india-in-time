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
function computeEstimatedQueueMinutes(place = {}, crowdLevel = 'Moderate', isWeekend = false) {
  const cat = String(place.cat || place.category || 'default').toLowerCase();
  const baseQueue = {
    temple: 25,
    monument: 15,
    fort: 15,
    museum: 10,
    food: 10,
    cafe: 5,
    viewpoint: 5,
    beach: 0,
    park: 2,
    default: 5,
  }[cat] ?? 5;

  const crowdMult = {
    'Very Low': 0.3,
    Low: 0.6,
    Moderate: 1.0,
    High: 2.2,
    'Very High': 3.5,
  }[crowdLevel] || 1.0;

  const weekendMult = isWeekend ? 1.3 : 1.0;
  const nominalWait = Math.round(baseQueue * crowdMult * weekendMult);

  let minWait = nominalWait;
  let maxWait = nominalWait;
  let rangeLabel = 'Direct Entry (No Wait)';
  let descriptor = 'Direct Entry (No Wait)';

  if (nominalWait > 0) {
    minWait = Math.max(0, Math.round(nominalWait * 0.75));
    maxWait = Math.round(nominalWait * 1.35);
    rangeLabel = `${minWait}–${maxWait} min`;
    if (nominalWait >= 25) {
      descriptor = `~${rangeLabel} Heavy Darshan/Entry Queue`;
    } else if (nominalWait >= 12) {
      descriptor = `~${rangeLabel} Entry / Security Queue`;
    } else {
      descriptor = `~${rangeLabel} Short Line`;
    }
  }

  return {
    estimatedQueueMinutes: nominalWait,
    estimatedWaitRange: rangeLabel,
    minWaitMinutes: minWait,
    maxWaitMinutes: maxWait,
    queueDescriptor: descriptor,
    isModelEstimate: true,
  };
}

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
  let source = 'estimated', method = 'RULE_BASED_ESTIMATE', confidence = 'LOW';
  if (historicalObservations && Number.isFinite(historicalObservations.avgScore)) {
    const hist = historicalObservations.avgScore, samples = historicalObservations.sampleSize || 0;
    const blend = samples >= 20 ? 0.6 : samples >= 5 ? 0.4 : 0.2;
    rawScore = rawScore * (1 - blend) + hist * blend;
    source = samples >= 10 ? 'predicted' : 'estimated';
    method = samples >= 10 ? 'HISTORICAL_PATTERN' : 'RULE_BASED_ESTIMATE';
    confidence = samples >= 20 ? 'HIGH' : (samples >= 5 ? 'MEDIUM' : 'LOW');
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

  const queueInfo = computeEstimatedQueueMinutes({ cat }, band.level, isWeekend);

  return {
    level: band.level,
    rawScore: Math.round(rawScore * 100) / 100,
    crowdScore: band.score,
    crowdBadge,
    isPeakWindow,
    bestOffPeakWindow,
    estimatedQueueMinutes: queueInfo.estimatedQueueMinutes,
    estimatedWaitRange: queueInfo.estimatedWaitRange,
    queueDescriptor: queueInfo.queueDescriptor,
    source,
    method,
    confidence,
    factors,
    festivals: festivalInfo?.festivals || [],
    reason: `${band.level} crowd expected (${parts.length ? parts.join(' + ') : 'typical patterns'}). Method: ${method.replace(/_/g, ' ').toLowerCase()}.`,
  };
}

function predictCrowdLegacy({ daypart, isWeekend, isPeakHourNow, cat }) {
  return computeCrowd({ daypart, isWeekend, isPeakHourNow, cat }).level;
}

module.exports = { computeCrowd, predictCrowdLegacy, computeEstimatedQueueMinutes, CROWD_LABELS };
