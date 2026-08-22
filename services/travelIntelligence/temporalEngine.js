'use strict';

const { getISTParts, m2t } = require('./timeEngine');
const { uncertaintyFromSignals, scenarioRobustness, temporalRegret } = require('./decisionEngine');

const DEFAULT_STEP_MIN = 30;
const DEFAULT_HORIZON_HOURS = 48;
const MAX_HORIZON_HOURS = 72;

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : min));
}

function toDateMinutes(date) {
  return getISTParts(date).minutesOfDay;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function localDayKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const pick = (t) => parts.find((p) => p.type === t)?.value || '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function dayOffset(reference, at) {
  const a = new Date(`${localDayKey(reference)}T00:00:00+05:30`).getTime();
  const b = new Date(`${localDayKey(at)}T00:00:00+05:30`).getTime();
  return Math.round((b - a) / 86400000);
}

function nearestHourlyWeather(weather, at) {
  const hourly = Array.isArray(weather?.hourly) ? weather.hourly : [];
  if (!hourly.length) return null;
  const target = at.getTime();
  let best = null;
  let delta = Infinity;
  for (const row of hourly) {
    const raw = row.time || row.timestamp || row.datetime;
    const t = new Date(raw);
    if (Number.isNaN(t.getTime())) continue;
    const d = Math.abs(t.getTime() - target);
    if (d < delta) { delta = d; best = row; }
  }
  return delta <= 3 * 60 * 60 * 1000 ? best : null;
}

function scoreTimingFit(intel) {
  let score = Number(intel?.visitScore) || 0;
  if (intel?.isBestTimeNow) score += 6;
  if (intel?.opening?.isOpenNow === false || intel?.isOpenNow === false) score -= 25;
  if (intel?.scenic?.bestScenicWindow && intel?.scenic?.bestScenicWindow.score) {
    score += Math.min(10, Number(intel.scenic.bestScenicWindow.score) / 10);
  }
  return clamp(score);
}

function buildWindows(points, minScore = 60) {
  const eligible = points.filter((p) => p.score >= minScore);
  if (!eligible.length) return [];
  const windows = [];
  let current = null;
  for (const point of eligible) {
    if (!current) {
      current = { dayKey: point.dayKey, dayOffset: point.dayOffset, startMin: point.minute, endMin: point.minute, points: [point] };
      continue;
    }
    const sameDay = point.dayKey === current.dayKey;
    if (sameDay && point.minute - current.endMin <= point.stepMin + 5) {
      current.endMin = point.minute;
      current.points.push(point);
    } else {
      windows.push(current);
      current = { dayKey: point.dayKey, dayOffset: point.dayOffset, startMin: point.minute, endMin: point.minute, points: [point] };
    }
  }
  if (current) windows.push(current);
  return windows.map((w) => {
    const best = w.points.reduce((a, b) => b.score > a.score ? b : a);
    const confidence = Math.round(w.points.reduce((s, p) => s + p.confidence, 0) / w.points.length);
    const sourceValues = (key) => [...new Set(w.points.map((p) => p[key] || 'unavailable'))];
    return {
      dayKey: w.dayKey,
      dayOffset: w.dayOffset,
      start: m2t(w.startMin),
      end: m2t(w.endMin + Math.max(0, (w.points[0]?.stepMin || DEFAULT_STEP_MIN) - 5)),
      startMin: w.startMin,
      endMin: w.endMin,
      peakTime: m2t(best.minute),
      peakMin: best.minute,
      score: Math.round(best.score),
      confidence,
      reasons: [...new Set(w.points.flatMap((p) => p.reasons || []))].slice(0, 8),
      sources: {
        weather: sourceValues('weatherSource'),
        crowd: sourceValues('crowdSource'),
        traffic: sourceValues('trafficSource'),
        scenic: sourceValues('scenicSource'),
      },
    };
  }).sort((a, b) => b.score - a.score || a.dayOffset - b.dayOffset || a.startMin - b.startMin);
}

function _classifyWindow(window, referenceDate) {
  if (!window) return null;
  const currentMin = toDateMinutes(referenceDate);
  if (window.dayOffset === 0 && window.endMin >= currentMin && window.startMin <= currentMin) return 'NOW';
  if (window.dayOffset === 0 && window.startMin > currentMin) return 'LATER';
  if (window.dayOffset === 1) return 'TOMORROW';
  if (window.dayOffset === 0 && window.startMin < 12 * 60) return 'MORNING';
  if (window.startMin >= 16 * 60) return 'EVENING';
  return 'FUTURE';
}

function selectModes(windows, referenceDate) {
  const currentMin = toDateMinutes(referenceDate);
  const future = windows.filter((w) => w.dayOffset > 0 || w.endMin >= currentMin);
  const now = future.find((w) => w.dayOffset === 0 && w.startMin <= currentMin && w.endMin >= currentMin) || null;
  const later = future.filter((w) => w.dayOffset === 0 && w.startMin > currentMin).sort((a,b) => b.score-a.score)[0] || null;
  const tomorrow = future.filter((w) => w.dayOffset === 1).sort((a,b) => b.score-a.score)[0] || null;
  const morning = future.filter((w) => (w.dayOffset === 0 && w.startMin >= currentMin && w.startMin < 12*60) || (w.dayOffset > 0 && w.startMin < 12*60)).sort((a,b) => b.score-a.score)[0] || null;
  const evening = future.filter((w) => w.startMin >= 16*60).sort((a,b) => b.score-a.score)[0] || null;
  const photography = future.filter((w) => /sunset|sunrise|golden|photograph|blue hour/i.test(w.reasons.join(' '))).sort((a,b) => b.score-a.score)[0] || null;
  const best = future[0] || null;
  return { BEST_NOW: now, BEST_LATER: later, BEST_TOMORROW: tomorrow, BEST_MORNING: morning, BEST_EVENING: evening, BEST_PHOTOGRAPHY_WINDOW: photography, BEST_OVERALL: best };
}

function confidenceSummary(points) {
  if (!points.length) return { score: 0, level: 'LOW', reasons: ['No usable temporal observations.'] };
  const avg = Math.round(points.reduce((s,p)=>s+p.confidence,0)/points.length);
  const missing = [];
  if (!points.some((p) => p.weatherSource === 'forecast')) missing.push('future weather forecast unavailable');
  if (!points.some((p) => ['predicted','historical-db','observed'].includes(p.crowdSource))) missing.push('crowd evidence limited');
  if (!points.some((p) => ['route_estimate','live_traffic'].includes(p.trafficSource))) missing.push('routing/traffic evidence unavailable');
  return { score: clamp(avg), level: avg >= 80 ? 'HIGH' : avg >= 60 ? 'MEDIUM' : 'LOW', reasons: missing.length ? missing : ['Multiple independent signals available.'] };
}

function buildTemporalProfile(place, options = {}) {
  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date(options.referenceDate || Date.now());
  const stepMin = Math.max(15, Number(options.stepMin) || DEFAULT_STEP_MIN);
  const horizonMin = Math.max(stepMin, Math.min(MAX_HORIZON_HOURS * 60, Number(options.horizonMin) || DEFAULT_HORIZON_HOURS * 60));
  const startOffset = Math.max(0, Number(options.startOffsetMin) || 0);
  const weather = options.weather || null;
  const points = [];
  const { getTravelIntelligence } = require('./index');

  for (let offset = startOffset; offset <= horizonMin; offset += stepMin) {
    const at = addMinutes(referenceDate, offset);
    const futureWeather = nearestHourlyWeather(weather, at);
    const intel = getTravelIntelligence(place, at, futureWeather, {
      ...(options.intelOptions || {}),
      disableExperienceWindows: true,
    });
    const minute = getISTParts(at).minutesOfDay;
    const confidence = clamp(Math.round(Number(intel?.confidence?.confidence ?? intel?.confidence ?? 40)));
    points.push({
      at: at.toISOString(),
      dayKey: localDayKey(at),
      dayOffset: dayOffset(referenceDate, at),
      minute,
      stepMin,
      score: scoreTimingFit(intel),
      confidence,
      open: intel?.isOpenNow,
      weatherSource: intel?.weather?.source || 'unavailable',
      crowdSource: intel?.crowd?.source || 'unavailable',
      trafficSource: intel?.traffic?.source || 'unavailable',
      scenicSource: intel?.dataSources?.scenic || 'astronomical_rules',
      reasons: [
        intel?.isBestTimeNow ? 'Within configured best-time window' : null,
        intel?.scenic?.bestScenicWindow ? 'Scenic timing window available' : null,
        intel?.weather?.suitability ? `Weather: ${intel.weather.suitability}` : null,
        intel?.crowd?.level ? `Crowd: ${intel.crowd.level}` : null,
        intel?.isOpenNow === false ? 'Closed at this time' : 'Open/available at this time',
      ].filter(Boolean),
      components: intel?.components || null,
      weather: intel?.weather || null,
      crowd: intel?.crowd || null,
      traffic: intel?.traffic || null,
      scenic: intel?.scenic || null,
      opening: intel?.opening || null,
    });
  }

  const windows = buildWindows(points, Number(options.minWindowScore) || 60);
  const modes = selectModes(windows, referenceDate);
  const usablePoints = points.filter((p) => Number.isFinite(p.score));
  const signalBundle = usablePoints.flatMap((p) => [
    { confidence: p.confidence, source: p.weatherSource },
    { confidence: p.confidence, source: p.crowdSource },
    { confidence: p.confidence, source: p.trafficSource },
    { confidence: p.confidence, source: p.scenicSource },
  ]);
  const uncertainty = uncertaintyFromSignals(signalBundle);
  const robustness = scenarioRobustness(modes.BEST_OVERALL?.score || 0, uncertainty.band);
  const arrivalScore = usablePoints.find((p) => p.minute >= toDateMinutes(referenceDate))?.score || modes.BEST_NOW?.score || 0;
  const bestFutureScore = Math.max(...usablePoints.filter((p) => p.dayOffset > 0 || p.minute >= toDateMinutes(referenceDate)).map((p) => p.score), arrivalScore);
  const opportunity = temporalRegret(arrivalScore, bestFutureScore);
  const days = [...new Set(points.map((p) => p.dayKey))].map((dayKey) => {
    const dayWindows = windows.filter((w) => w.dayKey === dayKey);
    const best = dayWindows[0] || null;
    return { dayKey, dayOffset: dayWindows[0]?.dayOffset ?? 0, bestWindow: best, windows: dayWindows.slice(0, 8) };
  });

  return {
    place: place.name,
    generatedAt: new Date().toISOString(),
    referenceAt: referenceDate.toISOString(),
    resolutionMinutes: stepMin,
    horizonHours: Math.round(horizonMin / 60),
    points,
    windows,
    days,
    modes,
    bestWindow: modes.BEST_OVERALL,
    confidence: { ...confidenceSummary(points), uncertaintyBand: uncertainty.band, robustnessScore: robustness.robustness, robustnessScenarios: robustness.scenarios },
    temporalOpportunity: opportunity,
    dataSources: {
      weather: [...new Set(points.map((p) => p.weatherSource))],
      crowd: [...new Set(points.map((p) => p.crowdSource))],
      traffic: [...new Set(points.map((p) => p.trafficSource))],
      scenic: [...new Set(points.map((p) => p.scenicSource))],
    },
    dataQuality: {
      weatherForecastAvailable: points.some((p) => p.weatherSource === 'forecast'),
      historicalCrowdAvailable: points.some((p) => ['predicted','historical-db','observed'].includes(p.crowdSource)),
      routingAvailable: points.some((p) => ['route_estimate','live_traffic'].includes(p.trafficSource)),
      scenicCalculated: points.some((p) => p.scenicSource),
      futureDaysEvaluated: new Set(points.map((p) => p.dayOffset)).size,
    },
  };
}

module.exports = { buildTemporalProfile, nearestHourlyWeather, buildWindows, selectModes, confidenceSummary };
