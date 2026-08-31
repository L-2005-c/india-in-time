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
const ROAD_NETWORK_FACTOR = 1.42; // Real-world road network distance vs haversine straight-line in Indian cities

function recommendTransitMode(distanceKm, opts = {}) {
  const km = Number(distanceKm) || 0;
  const corridorType = opts.corridorType || 'URBAN_ARTERIAL';
  const congestionFactor = opts.congestionFactor || 1.0;

  if (km <= 0.8) {
    return {
      mode: 'walk',
      label: 'Pedestrian Walk',
      icon: '🚶',
      estimatedFare: 0,
      fareStr: 'Free',
      rationale: 'Very close — fastest on foot through local walkways',
    };
  }
  if (km <= 3.5 && (corridorType === 'WALLED_BAZAAR' || corridorType === 'DENSE_DOWNTOWN' || congestionFactor > 1.25)) {
    const fare = Math.min(90, Math.max(30, Math.round(25 + km * 14)));
    return {
      mode: 'auto',
      label: 'Auto-Rickshaw',
      icon: '🛺',
      estimatedFare: fare,
      fareStr: `₹${fare}`,
      rationale: 'Nimble navigation through dense market traffic & bazaar lanes',
    };
  }
  const cabFare = Math.min(450, Math.max(60, Math.round(50 + km * 18)));
  return {
    mode: 'cab',
    label: 'Cab / Ride-Hailing',
    icon: '🚗',
    estimatedFare: cabFare,
    fareStr: `₹${cabFare}`,
    rationale: 'Air-conditioned comfort on arterial city road',
  };
}

function evaluateTrafficTransition(fromCoords, toCoords, departMin, mult) {
  let fromLevel = 'Low';
  let toLevel = 'Low';

  const isMorningRush = departMin >= 8 * 60 + 30 && departMin <= 10 * 60 + 30;
  const isEveningRush = departMin >= 17 * 60 + 30 && departMin <= 20 * 60 + 30;
  const isRush = isMorningRush || isEveningRush;

  let hasBottleneck = false;
  let bottleneckReason = null;

  if (toCoords && Number.isFinite(toCoords[0])) {
    const { evaluateDestinationBottleneck } = require('../routing/corridorSpeedModel');
    const bn = evaluateDestinationBottleneck(toCoords);
    if (bn.hasBottleneck) {
      hasBottleneck = true;
      bottleneckReason = bn.reason;
    }
  }

  if (mult >= 1.35 || isRush) {
    toLevel = hasBottleneck ? 'Heavy' : (mult >= 1.45 ? 'Heavy' : 'Moderate');
    fromLevel = mult >= 1.40 ? 'Moderate' : 'Low';
  } else if (mult >= 1.15) {
    toLevel = hasBottleneck ? 'Moderate' : 'Moderate';
    fromLevel = 'Low';
  } else {
    toLevel = hasBottleneck ? 'Moderate' : 'Low';
    fromLevel = 'Low';
  }

  const iconMap = { Low: '🟢', Moderate: '🟡', Heavy: '🔴' };
  let transitionStr = `${iconMap[fromLevel]} ${fromLevel} ➔ ${iconMap[toLevel]} ${toLevel}`;
  if (fromLevel === toLevel) {
    transitionStr = `${iconMap[toLevel]} ${toLevel} Traffic`;
  }

  let description = 'Uniform traffic flow';
  if (fromLevel === 'Low' && (toLevel === 'Moderate' || toLevel === 'Heavy')) {
    description = hasBottleneck
      ? `Clear start ➔ Approaching ${bottleneckReason || 'destination bottleneck'}`
      : 'Clear origin ➔ Moderate urban corridor traffic';
  } else if (fromLevel === 'Heavy' && toLevel === 'Low') {
    description = 'Congested origin exit ➔ Free flow arterial';
  } else if (isRush) {
    description = `Peak rush hour corridor (${isMorningRush ? 'Morning rush' : 'Evening rush'})`;
  }

  return {
    fromTrafficLevel: fromLevel,
    toTrafficLevel: toLevel,
    trafficTransition: transitionStr,
    transitionDescription: description,
    hasBottleneck,
  };
}

function estimateTravel(opts = {}) {
  const { fromCoords, toCoords, departMin = 720, liveTraffic = null, isFirstStop = false } = opts;
  const isMorningRush = departMin >= 8 * 60 + 30 && departMin <= 10 * 60 + 30;
  const isEveningRush = departMin >= 17 * 60 + 30 && departMin <= 20 * 60 + 30;
  const rushHourActive = isMorningRush || isEveningRush;
  const rushLabel = isMorningRush ? 'Morning Peak Rush (08:30–10:30)' : isEveningRush ? 'Evening Peak Rush (17:30–20:30)' : null;

  if (liveTraffic && Number.isFinite(liveTraffic.durationSec)) {
    const minutes = Math.max(1, Math.round(liveTraffic.durationSec / 60));
    const km = liveTraffic.distanceM != null ? liveTraffic.distanceM / 1000 : (fromCoords && toCoords ? distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]) * ROAD_NETWORK_FACTOR : null);
    const mult = liveTraffic.congestion ?? 1.0;
    const level = trafficLevelFromMult(mult);
    const source = liveTraffic.provider === 'google' ? 'live_traffic' : liveTraffic.provider === 'osrm' ? 'route_estimate' : 'live';
    const isEstimateOnly = source === 'route_estimate';
    const googleMapsUrl = (fromCoords && toCoords) ? `https://www.google.com/maps/dir/?api=1&origin=${fromCoords[0]},${fromCoords[1]}&destination=${toCoords[0]},${toCoords[1]}&travelmode=driving` : null;
    const transitRecommendation = recommendTransitMode(km, { congestionFactor: mult });
    const transition = evaluateTrafficTransition(fromCoords, toCoords, departMin, mult);
    const freeFlowMinutes = Math.max(1, Math.round(minutes / Math.max(1, mult)));
    const trafficDelayMinutes = Math.max(0, minutes - freeFlowMinutes);
    const etaBreakdown = trafficDelayMinutes > 0 ? `${minutes}m (${freeFlowMinutes}m base + ${trafficDelayMinutes}m rush delay)` : `${minutes}m (free flow)`;

    return {
      travelMinutes: minutes,
      freeFlowMinutes,
      trafficDelayMinutes,
      etaBreakdown,
      distanceKm: km != null ? Math.round(km * 10) / 10 : null,
      congestionFactor: mult,
      trafficLevel: level.level,
      trafficRisk: level.risk,
      fromTrafficLevel: transition.fromTrafficLevel,
      toTrafficLevel: transition.toTrafficLevel,
      trafficTransition: transition.trafficTransition,
      transitionDescription: transition.transitionDescription,
      rushHourActive,
      rushLabel,
      transitRecommendation,
      source,
      provider: liveTraffic.provider || 'unknown',
      freshness: liveTraffic.freshness || 'request_time',
      label: isEstimateOnly ? `${level.label} (routing estimate; not live traffic)` : level.label,
      confidence: isEstimateOnly ? 75 : 90,
      googleMapsUrl,
    };
  }
  if (!fromCoords || !toCoords || !Number.isFinite(fromCoords[0]) || !Number.isFinite(toCoords[0])) {
    return { travelMinutes: isFirstStop ? 10 : 20, freeFlowMinutes: isFirstStop ? 10 : 20, trafficDelayMinutes: 0, etaBreakdown: `${isFirstStop ? 10 : 20}m (estimated)`, distanceKm: null, congestionFactor: 1.0, trafficLevel: 'Unknown', trafficRisk: 'Unknown', fromTrafficLevel: 'Unknown', toTrafficLevel: 'Unknown', trafficTransition: '🟡 Unknown', transitionDescription: 'No route coordinates', rushHourActive: false, source: 'estimated', label: 'Travel time estimated (no coordinates)', confidence: 30, googleMapsUrl: null };
  }
  const straightKm = distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
  const roadKm = straightKm * ROAD_NETWORK_FACTOR;
  // Realistic Indian urban driving speed: 0.32 km/min (~19.2 km/h base speed before traffic multipliers)
  // Distance-scaled minimum floor: adjacent spots (<0.5km) take 1-2 mins, not an arbitrary 10-min flat penalty
  const minMinutes = isFirstStop ? Math.max(2, Math.min(8, Math.round(roadKm * 2.5))) : Math.max(1, Math.min(4, Math.round(roadKm * 2.0)));
  const baseMinutes = Math.max(minMinutes, Math.min(120, Math.round(roadKm / 0.32)));
  const mult = getTrafficMultiplier(departMin);
  const travelMinutes = Math.max(1, Math.round(baseMinutes * mult));
  const level = trafficLevelFromMult(mult);
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${fromCoords[0]},${fromCoords[1]}&destination=${toCoords[0]},${toCoords[1]}&travelmode=driving`;
  const transitRecommendation = recommendTransitMode(roadKm, { congestionFactor: mult });
  const transition = evaluateTrafficTransition(fromCoords, toCoords, departMin, mult);
  const freeFlowMinutes = baseMinutes;
  const trafficDelayMinutes = Math.max(0, travelMinutes - freeFlowMinutes);
  const etaBreakdown = trafficDelayMinutes > 0 ? `${travelMinutes}m (${freeFlowMinutes}m base + ${trafficDelayMinutes}m delay)` : `${travelMinutes}m (free flow)`;

  return {
    travelMinutes,
    freeFlowMinutes,
    trafficDelayMinutes,
    etaBreakdown,
    distanceKm: Math.round(roadKm * 10) / 10,
    straightDistanceKm: Math.round(straightKm * 10) / 10,
    congestionFactor: mult,
    trafficLevel: level.level,
    trafficRisk: level.risk,
    fromTrafficLevel: transition.fromTrafficLevel,
    toTrafficLevel: transition.toTrafficLevel,
    trafficTransition: transition.trafficTransition,
    transitionDescription: transition.transitionDescription,
    rushHourActive,
    rushLabel,
    transitRecommendation,
    source: 'estimated',
    label: `${level.label} (traffic-aware road network)`,
    confidence: 70,
    googleMapsUrl,
  };
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
  recommendTransitMode,
  evaluateTrafficTransition,
  estimateTravel,
  estimateTravelAsync,
  recommendArrivalWindow,
};

