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
  const corridorType = corridorMeta.corridorType;
  const speedCapKmH = INDIAN_SPEED_LIMITS_KMH[corridorType] || 32.0;
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
      if (impliedSpeedKmH > speedCapKmH * 1.15) {
        // OSRM speed is unrealistically fast (European speed profile) -> calibrate to Indian corridor speed
        // Use a blend: 60% OSRM raw + 40% physics-capped to avoid over-correction
        const physicsSec = Math.round((roadKm / baseSpeedKmH) * 3600);
        baseDurationSec = Math.round(rawSec * 0.6 + physicsSec * 0.4);
      } else if (impliedSpeedKmH > speedCapKmH) {
        // Marginally over speed cap — apply gentle correction
        const physicsSec = Math.round((roadKm / baseSpeedKmH) * 3600);
        baseDurationSec = Math.round(rawSec * 0.75 + physicsSec * 0.25);
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
  //    Reduced for leisure / low-congestion cities where signal infrastructure is sparse
  let signalDelaySec = 0;
  const cityKey = String(city || '').trim().toLowerCase();
  const isLowSignalCity = LOW_SIGNAL_CITIES.has(cityKey);
  if (travelMode !== 'walking' && roadKm >= 1.5) {
    let signalsPerKm = corridorMeta.signalsPerKm || (corridorType === CORRIDOR_TYPE.URBAN_ARTERIAL ? 0.6 : 0.2);
    // Leisure cities have far fewer traffic signals
    if (isLowSignalCity) signalsPerKm *= 0.3;
    // Highway corridors have minimal signals
    if (corridorType === CORRIDOR_TYPE.HIGHWAY_EXPRESSWAY) signalsPerKm = Math.min(signalsPerKm, 0.08);
    const estimatedSignals = Math.max(0, roadKm * signalsPerKm);
    // Average 18 seconds waiting time per signal cycle (slightly lower than old 20 to reflect modern sync signals)
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
  //    For OSRM provider, apply a dampened congestion factor since OSRM durations
  //    already partially account for road geometry and average speeds.
  const depDate = departureTime ? new Date(departureTime) : new Date();
  const utcMs = depDate.getTime() + (depDate.getTimezoneOffset() * 60000);
  const istDate = new Date(utcMs + (5.5 * 3600000));
  const depMinute = istDate.getHours() * 60 + istDate.getMinutes();
  const dayOfWeek = istDate.getDay();

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
  // and for leisure cities where congestion rarely reaches metro levels
  let rawTrafficFactor = travelMode === 'walking' ? 1.0 : trafficMeta.congestionFactor;
  if (travelMode !== 'walking' && provider === 'osrm' && rawTrafficFactor > 1.0) {
    // OSRM gives road-aware durations; apply only 50% of the congestion overhead
    rawTrafficFactor = 1.0 + (rawTrafficFactor - 1.0) * 0.50;
  }
  if (isLowSignalCity && rawTrafficFactor > 1.0) {
    // Leisure cities rarely experience metro-grade congestion
    rawTrafficFactor = 1.0 + (rawTrafficFactor - 1.0) * 0.40;
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
