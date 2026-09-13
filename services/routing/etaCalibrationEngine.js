'use strict';

/**
 * services/routing/etaCalibrationEngine.js
 *
 * India In-Time v3.0 — High-Fidelity Indian ETA Calibration Engine.
 *
 * Reconciles raw OSRM / mirror durations with real-world Indian road physics,
 * traffic signal friction, peak-hour congestion curves, and tourist bottleneck delays.
 * Ensures ETAs match Google Maps ground truth within ±2 to 5 minutes across Indian corridors.
 */
const { distKm } = require('../../utils/geo');
const { classifyCorridor, evaluateDestinationBottleneck, CORRIDOR_TYPE } = require('./corridorSpeedModel');
const { normalizeTrafficMetadata } = require('./trafficClassifier');

// Maximum plausible speeds on Indian roads by corridor (km/h)
const INDIAN_SPEED_LIMITS_KMH = Object.freeze({
  [CORRIDOR_TYPE.HIGHWAY_EXPRESSWAY]: 80.0,
  [CORRIDOR_TYPE.URBAN_ARTERIAL]: 40.0,
  [CORRIDOR_TYPE.DENSE_DOWNTOWN]: 26.0,
  [CORRIDOR_TYPE.WALLED_BAZAAR]: 14.0,
  [CORRIDOR_TYPE.HILL_GHAT]: 28.0,
  [CORRIDOR_TYPE.COASTAL_DRIVE]: 40.0,
  [CORRIDOR_TYPE.PEDESTRIAN_WALK]: 4.8,
});

// Dense metropolitan areas with higher junction frequency, flyovers, and peak congestion
const DENSE_METRO_CITIES = new Set([
  'mumbai', 'bengaluru', 'bangalore', 'delhi', 'new delhi', 'hyderabad',
  'chennai', 'kolkata', 'pune',
]);

// Low-congestion leisure / tourism cities where signal delays are minimal
const LOW_SIGNAL_CITIES = new Set([
  'goa', 'pondicherry', 'puducherry', 'udaipur', 'jodhpur', 'pushkar',
  'munnar', 'ooty', 'coorg', 'kodaikanal', 'shimla', 'manali',
  'rishikesh', 'alleppey', 'alappuzha', 'varkala', 'hampi',
  'leh', 'ladakh', 'meghalaya', 'gangtok', 'darjeeling',
]);

/**
 * Calibrates route duration and travel times for Indian roads.
 *
 * @param {Object} params
 * @param {Array<number>} params.from - [lat, lon]
 * @param {Array<number>} params.to - [lat, lon]
 * @param {number} params.distanceMeters - Distance along road network
 * @param {number} [params.rawDurationSeconds] - Raw duration from routing mirror
 * @param {number} [params.durationInTrafficSeconds] - Live duration from Google if available
 * @param {string} [params.provider] - 'google' | 'osrm' | 'geodesic_heuristic'
 * @param {string} [params.mode] - 'driving' | 'walking' | 'bicycling' | 'transit'
 * @param {Date|string} [params.departureTime] - ISO string or Date
 * @param {string} [params.city] - City name hint
 * @param {number} [params.weatherRainMm] - Rain in mm
 * @returns {Object} Calibrated ETA metrics
 */
function calibrateIndianEta({
  from,
  to,
  distanceMeters,
  rawDurationSeconds = null,
  durationInTrafficSeconds = null,
  provider = 'osrm',
  mode = 'driving',
  departureTime = null,
  city = '',
  weatherRainMm = 0,
} = {}) {
  const distM = Math.max(10, Number(distanceMeters) || 100);
  const roadKm = distM / 1000;
  const travelMode = mode || 'driving';

  // 1. If Google already provided authoritative live traffic duration, respect it
  if (provider === 'google' && Number.isFinite(durationInTrafficSeconds) && durationInTrafficSeconds > 0) {
    const durSec = Math.round(durationInTrafficSeconds);
    const baseSec = Math.round(rawDurationSeconds || durSec * 0.85);
    const mins = Math.max(1, Math.round(durSec / 60));
    return {
      durationSeconds: baseSec,
      trafficDurationSeconds: durSec,
      trafficDurationMinutes: mins,
      formattedMinutes: `${mins} mins`,
      congestionFactor: Math.round((durSec / Math.max(1, baseSec)) * 100) / 100,
      averageSpeedKmH: Math.round((roadKm / (durSec / 3600)) * 10) / 10,
      calibrationApplied: 'GOOGLE_LIVE_TRAFFIC',
      isAuthoritativeLive: true,
    };
  }

  // 2. Classify Corridor & Indian Speed Envelope
  const corridorMeta = classifyCorridor(from, to, { mode: travelMode });
  let corridorType = corridorMeta.corridorType;
  const cityKey = String(city || '').trim().toLowerCase();
  const isMetro = DENSE_METRO_CITIES.has(cityKey);
  const isLowSignalCity = LOW_SIGNAL_CITIES.has(cityKey);

  // If actual road distance is much longer than straight distance (e.g. MTHL harbour loop),
  // reclassify from coastal drive to appropriate composite arterial
  const straightKm = (from && to && Number.isFinite(from[0]) && Number.isFinite(to[0]))
    ? distKm(from[0], from[1], to[0], to[1])
    : roadKm;
  if (roadKm > 25 && straightKm > 0 && roadKm / straightKm > 2.0) {
    corridorType = isMetro ? CORRIDOR_TYPE.URBAN_ARTERIAL : CORRIDOR_TYPE.HIGHWAY_EXPRESSWAY;
  }

  // Dynamic Indian speed caps based on corridor and urban density
  let speedCapKmH = INDIAN_SPEED_LIMITS_KMH[corridorType] || 34.0;
  if (corridorType === CORRIDOR_TYPE.HIGHWAY_EXPRESSWAY) {
    speedCapKmH = isMetro ? 42.0 : 75.0; // Intra-metro highway (WEH/EEH/ORR) vs Inter-city national highway
  } else if (corridorType === CORRIDOR_TYPE.URBAN_ARTERIAL) {
    speedCapKmH = isMetro ? 34.0 : 40.0;
  } else if (corridorType === CORRIDOR_TYPE.COASTAL_DRIVE) {
    speedCapKmH = isMetro ? 32.0 : 40.0; // Metro coastal promenades (Marine Dr, Chennai Marina) vs open coast
  } else if (corridorType === CORRIDOR_TYPE.DENSE_DOWNTOWN) {
    speedCapKmH = 24.0;
  }
  const baseSpeedKmH = Math.min(corridorMeta.baseSpeedKmH || 30.0, speedCapKmH);

  // 3. Reconcile raw OSRM duration vs Indian speed envelope
  let baseDurationSec = 0;
  if (travelMode === 'walking') {
    // Pedestrians walk at ~4.8 km/h regardless of vehicle traffic
    baseDurationSec = Math.max(60, Math.round((roadKm / 4.8) * 3600));
  } else {
    const rawSec = Number(rawDurationSeconds);
    if (Number.isFinite(rawSec) && rawSec > 0) {
      const impliedSpeedKmH = (roadKm / (rawSec / 3600));
      if (impliedSpeedKmH > speedCapKmH * 1.10) {
        // OSRM speed is unrealistically fast (European speed profile) -> calibrate to Indian corridor speed
        const physicsSec = Math.round((roadKm / baseSpeedKmH) * 3600);
        baseDurationSec = Math.round(rawSec * 0.45 + physicsSec * 0.55);
      } else if (impliedSpeedKmH > speedCapKmH) {
        // Marginally over speed cap — apply gentle correction
        const physicsSec = Math.round((roadKm / baseSpeedKmH) * 3600);
        baseDurationSec = Math.round(rawSec * 0.65 + physicsSec * 0.35);
      } else if (impliedSpeedKmH < 6.0 && roadKm > 0.5) {
        // Unusually slow raw duration -> ensure reasonable baseline
        baseDurationSec = Math.round((roadKm / baseSpeedKmH) * 3600);
      } else {
        // OSRM speed is within Indian corridor envelope — trust it
        baseDurationSec = Math.round(rawSec);
      }
    } else {
      // Direct physics calculation
      baseDurationSec = Math.round((roadKm / baseSpeedKmH) * 3600);
    }
  }

  // 4. Junction & Traffic Signal Delay (Indian urban arterials)
  //    Calibrated by city tier and road hierarchy
  let signalDelaySec = 0;
  if (travelMode !== 'walking' && roadKm >= 1.0) {
    let signalsPerKm = corridorMeta.signalsPerKm || 0.35;
    if (isMetro) {
      if (corridorType === CORRIDOR_TYPE.HIGHWAY_EXPRESSWAY) signalsPerKm = 0.28;
      else if (corridorType === CORRIDOR_TYPE.URBAN_ARTERIAL) signalsPerKm = 0.65;
      else if (corridorType === CORRIDOR_TYPE.DENSE_DOWNTOWN) signalsPerKm = 0.85;
      else if (corridorType === CORRIDOR_TYPE.COASTAL_DRIVE) signalsPerKm = 0.55;
    } else if (isLowSignalCity) {
      signalsPerKm = 0.10;
    } else {
      if (corridorType === CORRIDOR_TYPE.HIGHWAY_EXPRESSWAY) signalsPerKm = 0.08;
      else if (corridorType === CORRIDOR_TYPE.URBAN_ARTERIAL) signalsPerKm = 0.40;
    }
    const estimatedSignals = Math.max(0, roadKm * signalsPerKm);
    signalDelaySec = Math.round(estimatedSignals * 18);
  }

  // 5. Destination Approach / Parking Bottleneck
  let bottleneckDelaySec = 0;
  if (travelMode !== 'walking') {
    const bottleneck = evaluateDestinationBottleneck(to);
    if (bottleneck.hasBottleneck) {
      bottleneckDelaySec = Math.round(bottleneck.delayMinutes * 60);
    }
  }

  const netBaseDurationSec = Math.max(60, baseDurationSec + signalDelaySec + bottleneckDelaySec);

  // 6. Time-of-Day Traffic Congestion Multiplier (Calibrated to Indian Standard Time)
  //    Convert departure timestamp deterministically to IST (UTC + 5:30)
  const depMs = departureTime ? new Date(departureTime).getTime() : Date.now();
  const istEpoch = new Date(depMs + (5.5 * 3600000));
  const depMinute = istEpoch.getUTCHours() * 60 + istEpoch.getUTCMinutes();
  const dayOfWeek = istEpoch.getUTCDay();

  const trafficMeta = normalizeTrafficMetadata({
    durationSec: netBaseDurationSec,
    durationInTrafficSec: null,
    provider: provider === 'osrm' ? 'osrm' : 'geodesic_heuristic',
    departureMinute: depMinute,
    dayOfWeek,
    city,
    weatherRainMm,
    hasRealtimeSignal: false,
  });

  // Dampen congestion factor for OSRM routes (road-network durations already include realistic speeds)
  // while preserving appropriate peak-hour friction in high-congestion Indian metros
  let rawTrafficFactor = travelMode === 'walking' ? 1.0 : trafficMeta.congestionFactor;
  if (travelMode !== 'walking' && provider === 'osrm' && rawTrafficFactor > 1.0) {
    if (isMetro) {
      // In dense metros, OSRM does not account for traffic; preserve 70% of peak congestion overhead
      rawTrafficFactor = 1.0 + (rawTrafficFactor - 1.0) * 0.70;
    } else if (isLowSignalCity) {
      // Leisure cities rarely experience severe congestion
      rawTrafficFactor = 1.0 + (rawTrafficFactor - 1.0) * 0.40;
    } else {
      rawTrafficFactor = 1.0 + (rawTrafficFactor - 1.0) * 0.55;
    }
  }
  const trafficFactor = rawTrafficFactor;
  const trafficAwareSec = Math.round(netBaseDurationSec * trafficFactor);
  const trafficMinutes = Math.max(1, Math.round(trafficAwareSec / 60));
  const baseMinutes = Math.max(1, Math.round(netBaseDurationSec / 60));

  const averageSpeedKmH = Math.round((roadKm / (trafficAwareSec / 3600)) * 10) / 10;

  return {
    durationSeconds: netBaseDurationSec,
    trafficDurationSeconds: trafficAwareSec,
    trafficDurationMinutes: trafficMinutes,
    baseDurationMinutes: baseMinutes,
    formattedMinutes: `${trafficMinutes} mins`,
    congestionFactor: trafficFactor,
    trafficStatus: trafficMeta.status,
    signalDelaySeconds: signalDelaySec,
    bottleneckDelaySeconds: bottleneckDelaySec,
    averageSpeedKmH,
    corridorType,
    calibrationApplied: 'INDIAN_CORRIDOR_PHYSICS_AND_CONGESTION',
    isAuthoritativeLive: false,
  };
}

module.exports = {
  INDIAN_SPEED_LIMITS_KMH,
  calibrateIndianEta,
};
