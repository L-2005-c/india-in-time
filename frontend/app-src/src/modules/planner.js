/**
 * Planner domain — pure itinerary transforms (enterprise boundary).
 */
export function getRouteStopsForDay(dayStops) {
  return (dayStops || []).filter((stop) => !stop?.isBreak);
}

export function createBreakStop(anchorStop, index, duration) {
  return {
    id: `break-${index}-${Date.now()}`,
    name: 'Break',
    cat: 'break',
    isBreak: true,
    vt: duration,
    coords: anchorStop?.coords || null,
  };
}

export function estimateStopLoadMinutes(stops) {
  return (stops || []).reduce((sum, s) => sum + (Number(s.vt) || 45), 0);
}

export function applyBreakPlan(baseStops, everyMin, durationMin) {
  if (!everyMin || !durationMin || everyMin <= 0 || durationMin <= 0) {
    return [...(baseStops || [])];
  }
  const out = [];
  let elapsed = 0;
  let breakIdx = 0;
  for (const stop of baseStops || []) {
    out.push(stop);
    elapsed += Number(stop.vt) || 45;
    if (elapsed >= everyMin) {
      out.push(createBreakStop(stop, breakIdx++, durationMin));
      elapsed = 0;
    }
  }
  return out;
}

export function switchDayIndex(mdPlan, idx) {
  const safe = Math.max(0, Math.min(idx, (mdPlan?.length || 1) - 1));
  return { dayIdx: safe, itin: Array.isArray(mdPlan?.[safe]) ? mdPlan[safe] : [] };
}
