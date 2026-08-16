// trafficEngine.js — never invents live traffic
const rules = require('../../data/time-intelligence-rules.json');
const { distKm } = require('../../utils/geo');
function getTrafficMultiplier(minuteOfDay) {
  const patterns = rules.trafficPatterns || {};
  for (const [key, p] of Object.entries(patterns)) {
    if (key === '_comment' || key === 'default' || !p || p.start == null) continue;
    if (p.start > p.end) { if (minuteOfDay >= p.start || minuteOfDay < p.end) return p.mult; }
    else if (minuteOfDay >= p.start && minuteOfDay < p.end) return p.mult;
  }
  return patterns.default ?? 1.0;
}
function trafficLevelFromMult(mult) {
  if (mult <= 1.05) return { level: 'Low', label: 'Light traffic', risk: 'Low' };
  if (mult <= 1.35) return { level: 'Moderate', label: 'Moderate traffic', risk: 'Medium' };
  return { level: 'High', label: 'Heavy traffic', risk: 'High' };
}
function estimateTravel(opts = {}) {
  const { fromCoords, toCoords, departMin = 720, liveTraffic = null, isFirstStop = false } = opts;
  if (liveTraffic && Number.isFinite(liveTraffic.durationSec)) {
    const minutes = Math.max(1, Math.round(liveTraffic.durationSec / 60));
    const km = liveTraffic.distanceM != null ? liveTraffic.distanceM / 1000 : (fromCoords && toCoords ? distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]) : null);
    const mult = liveTraffic.congestion ?? 1.0;
    const level = trafficLevelFromMult(mult);
    return { travelMinutes: minutes, distanceKm: km != null ? Math.round(km * 10) / 10 : null, congestionFactor: mult, trafficLevel: level.level, trafficRisk: level.risk, source: liveTraffic.provider === 'google' ? 'live_traffic' : 'route_estimate', provider: liveTraffic.provider || 'unknown', freshness: liveTraffic.freshness || 'request_time', label: liveTraffic.provider === 'google' ? level.label : `${level.label} (routing estimate; not live traffic)`, confidence: liveTraffic.provider === 'google' ? 85 : 65 };
  }
  if (!fromCoords || !toCoords || !Number.isFinite(fromCoords[0]) || !Number.isFinite(toCoords[0])) {
    return { travelMinutes: isFirstStop ? 10 : 20, distanceKm: null, congestionFactor: 1.0, trafficLevel: 'Unknown', trafficRisk: 'Unknown', source: 'estimated', label: 'Travel time estimated (no coordinates)', confidence: 30 };
  }
  const km = distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
  const baseMinutes = Math.max(isFirstStop ? 8 : 10, Math.min(90, Math.round(km / 0.42)));
  const mult = getTrafficMultiplier(departMin);
  const travelMinutes = Math.round(baseMinutes * mult);
  const level = trafficLevelFromMult(mult);
  return { travelMinutes, distanceKm: Math.round(km * 10) / 10, congestionFactor: mult, trafficLevel: level.level, trafficRisk: level.risk, source: 'estimated', label: `${level.label} (time-of-day heuristic)`, confidence: 55 };
}
function recommendArrivalWindow(opts = {}) {
  const { experienceStartMin, experienceEndMin, travelMinutes = 20, bufferMin = (rules.buffers && rules.buffers.arrivalBufferMin) || 15 } = opts;
  if (!Number.isFinite(experienceStartMin)) return null;
  const recommendedArrivalMin = Math.max(0, experienceStartMin - bufferMin);
  const recommendedDepartureMin = Math.max(0, recommendedArrivalMin - travelMinutes);
  const arrivalEndMin = Number.isFinite(experienceEndMin) ? experienceEndMin : recommendedArrivalMin + 30;
  function fmt(m) { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  return { experienceWindow: { start: fmt(experienceStartMin), end: fmt(arrivalEndMin), startMin: experienceStartMin, endMin: arrivalEndMin }, recommendedDeparture: fmt(recommendedDepartureMin), recommendedArrival: fmt(recommendedArrivalMin), recommendedArrivalWindow: { start: fmt(recommendedArrivalMin), end: fmt(Math.min(recommendedArrivalMin + 15, experienceStartMin + 5)) }, travelMinutes, bufferMin };
}

/**
 * Async variant: tries live routing (OSRM) then falls back to heuristic.
 * Always labels source. Never invents live data on failure.
 */
async function estimateTravelAsync(opts = {}) {
  const { resolveLiveTravel } = require('./routingEngine');
  let live = opts.liveTraffic || null;
  if (!live && opts.enableLiveRouting !== false) {
    try {
      live = await resolveLiveTravel({
        fromCoords: opts.fromCoords,
        toCoords: opts.toCoords,
        liveTraffic: opts.liveTraffic,
        enableLiveRouting: opts.enableLiveRouting !== false,
      });
    } catch (_e) {
      live = null;
    }
  }
  return estimateTravel({ ...opts, liveTraffic: live });
}

module.exports = {
  getTrafficMultiplier,
  trafficLevelFromMult,
  estimateTravel,
  estimateTravelAsync,
  recommendArrivalWindow,
};

