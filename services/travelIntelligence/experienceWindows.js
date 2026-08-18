'use strict';

/**
 * Deterministic experience-window generator.
 * It evaluates each candidate at explicit times and never invents future
 * weather/traffic values. Unknown signals are omitted from the weighted score.
 */
function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, Number(v) || 0)); }

function normalizeTime(min) {
  const n = ((Number(min) || 0) % 1440 + 1440) % 1440;
  return n;
}
function formatTime(min) {
  const n = normalizeTime(min);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
function mergeSegments(points, threshold = 8) {
  if (!points.length) return [];
  const segments = [];
  let current = { start: points[0].minute, end: points[0].minute, scores: [points[0]] };
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const point = points[i];
    if (point.minute - prev.minute <= threshold + 60 && Math.abs(point.score - prev.score) <= 18) {
      current.end = point.minute;
      current.scores.push(point);
    } else {
      segments.push(current);
      current = { start: point.minute, end: point.minute, scores: [point] };
    }
  }
  segments.push(current);
  return segments;
}

function generateExperienceWindows(opts = {}) {
  const {
    startMin = 6 * 60,
    endMin = 22 * 60,
    stepMin = 60,
    evaluate,
    weatherResolver = null,
  } = opts;

  if (typeof evaluate !== 'function') return { windows: [], source: 'unavailable', reason: 'Evaluator unavailable' };

  const points = [];
  for (let minute = startMin; minute <= endMin; minute += stepMin) {
    const at = Number.isFinite(opts.referenceDate)
      ? new Date(opts.referenceDate)
      : (opts.referenceDate instanceof Date ? new Date(opts.referenceDate) : new Date());
    at.setMinutes(at.getMinutes() + (minute - (opts.referenceStartMin ?? minute)));
    let weather = null;
    if (typeof weatherResolver === 'function') {
      weather = weatherResolver(at, minute) || null;
    }
    let intel;
    try {
      intel = evaluate(at, weather, minute);
    } catch (_e) {
      continue;
    }
    if (!intel) continue;
    const score = clamp(intel.visitScore);
    points.push({
      minute,
      score,
      confidence: Number(intel.confidence?.confidence ?? intel.confidence ?? 0),
      opening: intel.opening?.status,
      weatherSource: intel.weather?.source || 'unavailable',
      trafficSource: intel.traffic?.source || 'unavailable',
      reasons: [
        ...(intel.scenic?.reasons || []).slice(0, 1),
        intel.weather?.reason,
        intel.crowd?.reason,
        intel.opening?.status === 'OPEN' ? 'Open at this time' : null,
      ].filter(Boolean),
    });
  }

  const segments = mergeSegments(points);
  const windows = segments
    .map((segment) => {
      const best = segment.scores.reduce((a, b) => b.score > a.score ? b : a);
      const confidence = Math.round(
        segment.scores.reduce((sum, p) => sum + (Number(p.confidence) || 0), 0) / segment.scores.length
      );
      return {
        start: formatTime(segment.start),
        end: formatTime(segment.end),
        score: best.score,
        confidence: clamp(confidence),
        reasons: [...new Set(segment.scores.flatMap((p) => p.reasons || []))].slice(0, 4),
        dataSources: {
          weather: [...new Set(segment.scores.map((p) => p.weatherSource))],
          traffic: [...new Set(segment.scores.map((p) => p.trafficSource))],
        },
        dataFreshness: {
          weather: segment.scores.some((p) => p.weatherSource === 'forecast') ? 'forecast' : 'observed-or-unavailable',
          traffic: segment.scores.some((p) => p.trafficSource === 'live') ? 'live' : 'estimate-or-unavailable',
        },
      };
    })
    .filter((w) => w.score >= 65)
    .sort((a, b) => b.score - a.score);

  const bestNow = windows[0] || null;
  return {
    windows,
    bestNow,
    modes: {
      BEST_NOW: bestNow,
      BEST_LATER: windows.find((w) => Number(w.start.slice(0, 2)) * 60 + Number(w.start.slice(3)) > (opts.currentMin ?? 0)) || null,
      BEST_MORNING: windows.find((w) => Number(w.start.slice(0, 2)) < 12) || null,
      BEST_EVENING: windows.find((w) => Number(w.start.slice(0, 2)) >= 16) || null,
      BEST_PHOTOGRAPHY_WINDOW: windows.find((w) => /golden|sunset|sunrise|photograph/i.test(w.reasons.join(' '))) || null,
    },
    source: 'deterministic',
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = { generateExperienceWindows, formatTime };
