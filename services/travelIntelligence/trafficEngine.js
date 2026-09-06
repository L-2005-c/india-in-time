// trafficEngine.js — never invents live traffic
const rules = require('../../data/time-intelligence-rules.json');
const { distKm } = require('../../utils/geo');

const CITY_CONGESTION_BIAS = rules.cityTrafficBiases || {
  mumbai: 1.35,
  delhi: 1.30,
  bengaluru: 1.25,
  chennai: 1.20,
  hyderabad: 1.15,
  kolkata: 1.20,
  varanasi: 1.05,
  jaipur: 1.0,
  kochi: 0.95,
  vizag: 0.90,
  paderu: 0.75,
};

function getTrafficMultiplier(minuteOfDay) {
  const patterns = rules.trafficPatterns || {};
  for (const [key, p] of Object.entries(patterns)) {
    if (key === '_comment' || key === 'default' || !p || p.start == null) continue;
    if (p.start > p.end) { if (minuteOfDay >= p.start || minuteOfDay < p.end) return p.mult; }
    else if (minuteOfDay >= p.start && minuteOfDay < p.end) return p.mult;
  }
  return patterns.default ?? 1.0;
}

function getCityTrafficMultiplier(cityKey, minuteOfDay) {
  const baseMult = getTrafficMultiplier(minuteOfDay);
  const key = String(cityKey || '').toLowerCase();
  const bias = CITY_CONGESTION_BIAS[key];
  if (!bias) return baseMult;
  if (baseMult > 1.2) {
    return Math.round((1.0 + (baseMult - 1.0) * (bias >= 1.0 ? bias : 0.85)) * 100) / 100;
  }
  return baseMult;
}

function isGhatRoadCorridor(fromCoords, toCoords, cityKey) {
  const key = String(cityKey || '').toLowerCase();
  if (['paderu', 'araku', 'lambasingi', 'vanjangi'].includes(key)) return true;
  const isHighland = (c) => Array.isArray(c) && c.length >= 2 && c[0] >= 17.65 && c[0] <= 18.45 && c[1] >= 82.35 && c[1] <= 83.15;
  const isTirumalaGhat = (c) => Array.isArray(c) && c.length >= 2 && c[0] >= 13.62 && c[0] <= 13.72 && c[1] >= 79.30 && c[1] <= 79.45;
  return isHighland(fromCoords) || isHighland(toCoords) || (isTirumalaGhat(fromCoords) && isTirumalaGhat(toCoords));
}

function trafficLevelFromMult(mult) {
  if (mult <= 1.05) return { level: 'Low', label: 'Light traffic', risk: 'Low' };
  if (mult <= 1.35) return { level: 'Moderate', label: 'Moderate traffic', risk: 'Medium' };
  return { level: 'High', label: 'Heavy traffic', risk: 'High' };
}
const ROAD_NETWORK_FACTOR = 1.42; // Real-world road network distance vs haversine straight-line in Indian cities

function recommendTransitMode(distanceKm, opts = {}) {
  let km = 0;
  let fromName = '';
  let toName = '';
  let options = opts || {};

  if (typeof distanceKm === 'object' && distanceKm !== null) {
    const fromPlace = distanceKm;
    const toPlace = opts || {};
    options = arguments[2] || {};
    fromName = String(fromPlace.name || fromPlace.title || '').toLowerCase();
    toName = String(toPlace.name || toPlace.title || '').toLowerCase();
    km = Number(options.distanceKm) || 25;
  } else {
    km = Number(distanceKm) || 0;
    fromName = String(options.fromName || '').toLowerCase();
    toName = String(options.toName || '').toLowerCase();
  }

  const corridorType = options.corridorType || 'URBAN_ARTERIAL';
  const congestionFactor = options.congestionFactor || 1.0;

  // 1. Iconic Scenic Rail: Visakhapatnam <-> Araku / Borra Caves Vistadome Express
  const isVizagAraku = (fromName.includes('visakhapatnam') || fromName.includes('vizag')) && (toName.includes('araku') || toName.includes('borra'));
  const isArakuVizag = (fromName.includes('araku') || fromName.includes('borra')) && (toName.includes('visakhapatnam') || toName.includes('vizag'));
  if (options.isVistadome || options.corridor === 'vizag_araku' || isVizagAraku || isArakuVizag) {
    return {
      mode: 'vistadome_rail',
      recommendedMode: 'vistadome_rail',
      label: 'Vistadome Glass-Coach (Train 18551/18552)',
      modeLabel: 'Vistadome Scenic Rail (Train 18551/18552)',
      icon: '🚆',
      modeIcon: '🚆',
      corridorTag: 'Train 18551/18552 VSKP-KRDL Express',
      scenicFeatures: '58 tunnels & 84 bridges through the Ananthagiri Eastern Ghats',
      bookingTip: 'Advance IRCTC Vistadome booking essential; departs 06:45 AM from Visakhapatnam',
      estimatedFare: 670,
      fareStr: '₹670',
      durationMinutes: 195,
      isScenicRail: true,
      rationale: 'Panoramic glass-roof train crossing 58 tunnels and 84 bridges through the Ananthagiri Eastern Ghats',
      bookingNotice: 'IRCTC booking opens 120 days in advance; morning departure from Visakhapatnam (VSKP) at 06:45 AM',
    };
  }

  // 2. Pilgrim Express Corridor: Chennai <-> Tirupati
  const isChennaiTirupati = (fromName.includes('chennai') || fromName.includes('madras')) && (toName.includes('tirupati') || toName.includes('tirumala'));
  const isTirupatiChennai = (fromName.includes('tirupati') || fromName.includes('tirumala')) && (toName.includes('chennai') || toName.includes('madras'));
  if (options.corridor === 'chennai_tirupati' || isChennaiTirupati || isTirupatiChennai) {
    const fare = Math.round(1800 + km * 12);
    return {
      mode: 'pilgrim_express',
      recommendedMode: 'pilgrim_express',
      label: 'Tirupati Pilgrimage Expressway (NH716) / Sapthagiri Express',
      modeLabel: 'Interstate Pilgrim Express (NH716 / Sapthagiri)',
      icon: '🚆',
      modeIcon: '🚆',
      corridorTag: 'Chennai-Tirupati Pilgrim Corridor',
      bookingTip: 'TTD Special Entry Darshan booking recommended prior to arrival',
      estimatedFare: fare,
      fareStr: `₹${fare}`,
      isPilgrimCorridor: true,
      rationale: 'Smooth 4-lane highway transit from Chennai Central to Alipiri Tollgate check-post',
    };
  }

  if (options.isGhat) {
    const cabFare = Math.min(650, Math.max(90, Math.round(70 + km * 18)));
    return {
      mode: 'ghat_cab',
      recommendedMode: 'ghat_cab',
      label: 'Mountain Cab / 4x4',
      modeLabel: 'Mountain Cab / 4x4',
      icon: '🚙',
      modeIcon: '🚙',
      estimatedFare: cabFare,
      fareStr: `₹${cabFare}`,
      rationale: 'Experienced mountain ghat driver recommended for high-altitude hairpin curves',
    };
  }

  if (km <= 0.8) {
    return {
      mode: 'walk',
      recommendedMode: 'walk',
      label: 'Pedestrian Walk',
      modeLabel: 'Pedestrian Walk',
      icon: '🚶',
      modeIcon: '🚶',
      estimatedFare: 0,
      fareStr: 'Free',
      rationale: 'Very close — fastest on foot through local walkways',
    };
  }
  if (km <= 3.5 && (corridorType === 'WALLED_BAZAAR' || corridorType === 'DENSE_DOWNTOWN' || congestionFactor > 1.25)) {
    const fare = Math.min(90, Math.max(30, Math.round(25 + km * 14)));
    return {
      mode: 'auto',
      recommendedMode: 'auto',
      label: 'Auto-Rickshaw',
      modeLabel: 'Auto-Rickshaw',
      icon: '🛺',
      modeIcon: '🛺',
      estimatedFare: fare,
      fareStr: `₹${fare}`,
      rationale: 'Nimble navigation through dense market traffic & bazaar lanes',
    };
  }
  const cabFare = Math.min(450, Math.max(60, Math.round(50 + km * 18)));
  return {
    mode: 'cab',
    recommendedMode: 'cab',
    label: 'Cab / Ride-Hailing',
    modeLabel: 'Cab / Ride-Hailing',
    icon: '🚗',
    modeIcon: '🚗',
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
  const { fromCoords, toCoords, departMin = 720, liveTraffic = null, isFirstStop = false, cityKey = null, region = null } = opts;
  const effectiveCity = cityKey || region;
  const isGhat = isGhatRoadCorridor(fromCoords, toCoords, effectiveCity);
  const roadNetworkFactor = isGhat ? (rules.ghatRoadTransit?.windingFactor || 1.68) : ROAD_NETWORK_FACTOR;
  const baseSpeedKmPerMin = isGhat ? (rules.ghatRoadTransit?.speedKmPerMin || 0.22) : 0.32;
  const isNightGhat = isGhat && (departMin >= (rules.ghatRoadTransit?.nightFogThresholdMin || 1080) || departMin <= (rules.ghatRoadTransit?.dawnFogThresholdMin || 330));
  const ghatNightAdvisory = isNightGhat ? 'Night mountain pass: severe fog and unlit hairpin switchbacks. Drive under 30 km/h.' : null;

  const isMorningRush = departMin >= 8 * 60 + 30 && departMin <= 10 * 60 + 30;
  const isEveningRush = departMin >= 17 * 60 + 30 && departMin <= 20 * 60 + 30;
  const rushHourActive = isMorningRush || isEveningRush;
  const rushLabel = isMorningRush ? 'Morning Peak Rush (08:30–10:30)' : isEveningRush ? 'Evening Peak Rush (17:30–20:30)' : null;

  if (liveTraffic && Number.isFinite(liveTraffic.durationSec)) {
    const minutes = Math.max(1, Math.round(liveTraffic.durationSec / 60));
    const km = liveTraffic.distanceM != null ? liveTraffic.distanceM / 1000 : (fromCoords && toCoords ? distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]) * roadNetworkFactor : null);
    const mult = liveTraffic.congestion ?? 1.0;
    const level = trafficLevelFromMult(mult);
    const source = liveTraffic.provider === 'google' ? 'live_traffic' : liveTraffic.provider === 'osrm' ? 'route_estimate' : 'live';
    const isEstimateOnly = source === 'route_estimate';
    const googleMapsUrl = (fromCoords && toCoords) ? `https://www.google.com/maps/dir/?api=1&origin=${fromCoords[0]},${fromCoords[1]}&destination=${toCoords[0]},${toCoords[1]}&travelmode=driving` : null;
    const transitRecommendation = recommendTransitMode(km, { congestionFactor: mult, isGhat });
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
      isGhatRoad: isGhat,
      ghatNightAdvisory,
    };
  }
  if (!fromCoords || !toCoords || !Number.isFinite(fromCoords[0]) || !Number.isFinite(toCoords[0])) {
    return { travelMinutes: isFirstStop ? 10 : 20, freeFlowMinutes: isFirstStop ? 10 : 20, trafficDelayMinutes: 0, etaBreakdown: `${isFirstStop ? 10 : 20}m (estimated)`, distanceKm: null, congestionFactor: 1.0, trafficLevel: 'Unknown', trafficRisk: 'Unknown', fromTrafficLevel: 'Unknown', toTrafficLevel: 'Unknown', trafficTransition: '🟡 Unknown', transitionDescription: 'No route coordinates', rushHourActive: false, source: 'estimated', label: 'Travel time estimated (no coordinates)', confidence: 30, googleMapsUrl: null, isGhatRoad: isGhat, ghatNightAdvisory: null };
  }
  const straightKm = distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
  const roadKm = straightKm * roadNetworkFactor;
  // Realistic Indian driving speed: 0.32 km/min (~19.2 km/h base speed urban) vs 0.22 km/min on mountain ghats
  const minMinutes = isFirstStop ? Math.max(2, Math.min(8, Math.round(roadKm * 2.5))) : Math.max(1, Math.min(4, Math.round(roadKm * 2.0)));
  const baseMinutes = Math.max(minMinutes, Math.min(180, Math.round(roadKm / baseSpeedKmPerMin)));
  const mult = effectiveCity ? getCityTrafficMultiplier(effectiveCity, departMin) : getTrafficMultiplier(departMin);
  const travelMinutes = Math.max(1, Math.round(baseMinutes * mult));
  const level = trafficLevelFromMult(mult);
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${fromCoords[0]},${fromCoords[1]}&destination=${toCoords[0]},${toCoords[1]}&travelmode=driving`;
  const transitRecommendation = recommendTransitMode(roadKm, { congestionFactor: mult, isGhat });
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
    label: isGhat ? `${level.label} (mountain ghat winding pass)` : `${level.label} (traffic-aware road network)`,
    confidence: 70,
    googleMapsUrl,
    isGhatRoad: isGhat,
    ghatNightAdvisory,
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
  CITY_CONGESTION_BIAS,
  getTrafficMultiplier,
  getCityTrafficMultiplier,
  isGhatRoadCorridor,
  trafficLevelFromMult,
  recommendTransitMode,
  evaluateTrafficTransition,
  estimateTravel,
  estimateTravelAsync,
  recommendArrivalWindow,
};

