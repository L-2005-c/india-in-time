'use strict';

/**
 * services/travelIntelligence/disruption/trafficAnomalyDetector.js
 *
 * India In-Time v3.0 — Disruption-Aware Traffic Anomaly Detector
 *
 * Distinguishes normal recurrent urban congestion from active disruptions:
 * - Compares live travel times against context-aware corridor baselines.
 * - Tracks rate of deterioration (e.g., 25m -> 45m -> 70m).
 * - Classifies into:
 *     NORMAL_CONGESTION, ELEVATED_CONGESTION, TRAFFIC_ANOMALY,
 *     MAJOR_DISRUPTION, ROAD_BLOCKED, UNKNOWN_DISRUPTION.
 */

const { getCityTrafficMultiplier, isGhatRoadCorridor } = require('../trafficEngine');

const TRAFFIC_ANOMALY_STATES = Object.freeze({
  NORMAL_CONGESTION: 'NORMAL_CONGESTION',
  ELEVATED_CONGESTION: 'ELEVATED_CONGESTION',
  TRAFFIC_ANOMALY: 'TRAFFIC_ANOMALY',
  MAJOR_DISRUPTION: 'MAJOR_DISRUPTION',
  TRAFFIC_COLLAPSE: 'TRAFFIC_COLLAPSE',
  ROAD_BLOCKED: 'ROAD_BLOCKED',
  UNKNOWN_DISRUPTION: 'UNKNOWN_DISRUPTION',
});

// In-memory trajectory registry: corridorKey -> array of { timestamp, travelMinutes }
const corridorHistories = new Map();
const MAX_HISTORY_POINTS = 10;

/**
 * Computes contextual free-flow and expected baseline for a corridor.
 */
function getCorridorBaseline({
  fromCoords,
  toCoords,
  cityKey = null,
  minuteOfDay = 720,
  freeFlowMinutes = null,
  distanceKm = null,
} = {}) {
  const isGhat = isGhatRoadCorridor(fromCoords, toCoords, cityKey);
  const baseSpeedKmPerMin = isGhat ? 0.22 : 0.32;

  let freeFlow = freeFlowMinutes;
  if (!Number.isFinite(freeFlow) || freeFlow <= 0) {
    if (Number.isFinite(distanceKm) && distanceKm > 0) {
      freeFlow = Math.max(2, Math.round(distanceKm / baseSpeedKmPerMin));
    } else {
      freeFlow = 20; // Generic sensible urban corridor fallback
    }
  }

  const congestionMultiplier = getCityTrafficMultiplier(cityKey, minuteOfDay);
  const expectedTravelMinutes = Math.max(1, Math.round(freeFlow * congestionMultiplier));

  return {
    freeFlowMinutes: freeFlow,
    expectedTravelMinutes,
    congestionMultiplier,
    isGhat,
  };
}

/**
 * Evaluates rate of change over recent history readings.
 */
function evaluateRateOfChange(corridorKey, currentTravelMinutes, timestamp = Date.now()) {
  if (!corridorKey) {
    return {
      previousTravelTime: currentTravelMinutes,
      currentTravelTime: currentTravelMinutes,
      changeAmount: 0,
      changeRate: 0, // minutes change per minute of time
      isRapidlyWorsening: false,
      historyCount: 1,
    };
  }

  let history = corridorHistories.get(corridorKey);
  if (!history) {
    history = [];
    corridorHistories.set(corridorKey, history);
  }

  const prev = history.length > 0 ? history[history.length - 1] : null;
  history.push({ timestamp, travelMinutes: currentTravelMinutes });
  if (history.length > MAX_HISTORY_POINTS) {
    history.shift();
  }

  if (!prev) {
    return {
      previousTravelTime: currentTravelMinutes,
      currentTravelTime: currentTravelMinutes,
      changeAmount: 0,
      changeRate: 0,
      isRapidlyWorsening: false,
      historyCount: 1,
    };
  }

  const elapsedMs = Math.max(1000, timestamp - prev.timestamp);
  const elapsedMinutes = elapsedMs / 60000;
  const changeAmount = currentTravelMinutes - prev.travelMinutes;
  const changeRate = Math.round((changeAmount / elapsedMinutes) * 100) / 100;

  // Check multi-step rapid deterioration (e.g. 25 -> 45 -> 70)
  let isRapidlyWorsening = false;
  if (history.length >= 3) {
    const p1 = history[history.length - 3].travelMinutes;
    const p2 = history[history.length - 2].travelMinutes;
    const p3 = history[history.length - 1].travelMinutes;
    if (p3 - p2 >= 15 && p2 - p1 >= 8) {
      isRapidlyWorsening = true;
    }
  } else if (changeAmount >= 20) {
    isRapidlyWorsening = true;
  }

  return {
    previousTravelTime: prev.travelMinutes,
    currentTravelTime: currentTravelMinutes,
    changeAmount,
    changeRate,
    isRapidlyWorsening,
    historyCount: history.length,
  };
}

/**
 * Detects whether observed travel time constitutes a traffic anomaly or disruption.
 *
 * @param {Object} input
 * @param {string} [input.corridorKey] - Unique identifier for corridor
 * @param {number} input.currentTravelMinutes - Live measured or reported travel time
 * @param {number} [input.freeFlowMinutes] - Base free-flow minutes
 * @param {number} [input.expectedTravelMinutes] - Historical expected time for time of day
 * @param {boolean} [input.isRoadBlocked] - Explicit closure/blockage flag
 * @param {Array<number>} [input.fromCoords] - [lat, lon]
 * @param {Array<number>} [input.toCoords] - [lat, lon]
 * @param {string} [input.cityKey] - City identifier
 * @param {number} [input.minuteOfDay] - Minute of day (0-1439)
 * @param {number} [input.timestamp] - Timestamp in ms
 * @param {Array<number>} [input.historicalTrajectory] - Optional array of preceding travel times for synthetic testing
 * @returns {Object} Anomaly detection outcome
 */
function detectTrafficAnomaly({
  corridorKey = 'default_corridor',
  currentTravelMinutes,
  freeFlowMinutes = null,
  expectedTravelMinutes = null,
  isRoadBlocked = false,
  fromCoords = null,
  toCoords = null,
  cityKey = null,
  minuteOfDay = 720,
  timestamp = Date.now(),
  historicalTrajectory = null,
} = {}) {
  const current = Number(currentTravelMinutes);
  if (!Number.isFinite(current) || current <= 0) {
    return {
      anomalyState: TRAFFIC_ANOMALY_STATES.UNKNOWN_DISRUPTION,
      isDisruption: false,
      delayMinutes: 0,
      delayRatio: 1.0,
      confidence: 'LOW',
      details: 'Invalid or missing travel time measurement',
    };
  }

  // Pre-seed trajectory history if supplied for testing or batch analysis
  if (Array.isArray(historicalTrajectory) && historicalTrajectory.length > 0) {
    const seeded = [];
    const t0 = timestamp - (historicalTrajectory.length * 10 * 60000);
    historicalTrajectory.forEach((m, idx) => {
      seeded.push({ timestamp: t0 + (idx * 10 * 60000), travelMinutes: m });
    });
    corridorHistories.set(corridorKey, seeded);
  }

  const baseline = getCorridorBaseline({
    fromCoords,
    toCoords,
    cityKey,
    minuteOfDay,
    freeFlowMinutes,
  });

  const expected = Number.isFinite(expectedTravelMinutes) && expectedTravelMinutes > 0
    ? expectedTravelMinutes
    : baseline.expectedTravelMinutes;
  const freeFlow = baseline.freeFlowMinutes;

  const delayOverExpected = Math.max(0, current - expected);
  const delayOverFreeFlow = Math.max(0, current - freeFlow);
  const delayRatio = Math.round((current / Math.max(1, expected)) * 100) / 100;

  // Rate of change evaluation
  const rateInfo = evaluateRateOfChange(corridorKey, current, timestamp);

  let anomalyState = TRAFFIC_ANOMALY_STATES.NORMAL_CONGESTION;
  let isDisruption = false;
  let severity = 'INFO';

  if (isRoadBlocked) {
    anomalyState = TRAFFIC_ANOMALY_STATES.ROAD_BLOCKED;
    isDisruption = true;
    severity = 'CRITICAL';
  } else if (current >= freeFlow * 5.0 || (delayOverExpected >= 60 && delayRatio >= 3.0)) {
    // Zero-velocity standstill or extreme travel delay WITHOUT verified closure evidence
    // Invariant: Speed collapse is NOT confirmed official road closure
    anomalyState = TRAFFIC_ANOMALY_STATES.TRAFFIC_COLLAPSE;
    isDisruption = true;
    severity = 'CRITICAL';
  } else if (delayOverExpected >= 50 || delayRatio >= 2.4 || (delayOverExpected >= 35 && rateInfo.isRapidlyWorsening)) {
    anomalyState = TRAFFIC_ANOMALY_STATES.MAJOR_DISRUPTION;
    isDisruption = true;
    severity = 'SEVERE';
  } else if (delayOverExpected >= 25 || delayRatio >= 1.6 || rateInfo.isRapidlyWorsening) {
    anomalyState = TRAFFIC_ANOMALY_STATES.TRAFFIC_ANOMALY;
    isDisruption = true;
    severity = 'WARNING';
  } else if (delayOverExpected >= 12 || delayRatio >= 1.25) {
    anomalyState = TRAFFIC_ANOMALY_STATES.ELEVATED_CONGESTION;
    isDisruption = false;
    severity = 'WATCH';
  } else {
    anomalyState = TRAFFIC_ANOMALY_STATES.NORMAL_CONGESTION;
    isDisruption = false;
    severity = 'INFO';
  }

  return {
    corridorKey,
    anomalyState,
    isDisruption,
    severity,
    currentTravelMinutes: current,
    expectedTravelMinutes: expected,
    freeFlowMinutes: freeFlow,
    delayMinutes: delayOverExpected,
    delayOverFreeFlow,
    delayRatio,
    rateInfo,
    isGhat: baseline.isGhat,
    detectedAt: new Date(timestamp).toISOString(),
  };
}

/**
 * Resets in-memory corridor histories (useful for tests).
 */
function resetCorridorHistories() {
  corridorHistories.clear();
}

module.exports = {
  TRAFFIC_ANOMALY_STATES,
  detectTrafficAnomaly,
  getCorridorBaseline,
  resetCorridorHistories,
};
