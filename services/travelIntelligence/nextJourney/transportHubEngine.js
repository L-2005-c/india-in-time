'use strict';

/**
 * services/travelIntelligence/nextJourney/transportHubEngine.js
 *
 * Transport Hub & Hard Departure Constraint Engine (Phase 6).
 *
 * Computes buffer math and deadline feasibility for scheduled departures
 * (Flight, Train, Long-Distance Bus).
 *
 * Architectural Invariant:
 * HARD DEPARTURE DEADLINES STRICTLY OUTRANK EXPERIENCE VALUE AND PREFERENCES.
 */

const { distKm } = require('../../../utils/geo');
const appLogger = require('../../../lib/logger');

const DEADLINE_STATES = Object.freeze({
  SAFE_BUFFER: 'SAFE_BUFFER',
  LOW_BUFFER: 'LOW_BUFFER',
  DEADLINE_RISK: 'DEADLINE_RISK',
  MISSED_DEADLINE: 'MISSED_DEADLINE',
  UNKNOWN: 'UNKNOWN',
});

// Mode-specific mandatory lead-time buffers (minutes prior to scheduled departure)
const MODE_BUFFERS = Object.freeze({
  AIRPORT_DOMESTIC: 120, // 2 hours
  AIRPORT_INTERNATIONAL: 180, // 3 hours
  RAILWAY_STATION: 45, // 45 minutes
  BUS_STATION: 30, // 30 minutes
  PORT: 60, // 60 minutes
  DEFAULT: 45,
});

/**
 * Resolves appropriate buffer for a transport hub category.
 */
function getModeBufferMinutes(category, options = {}) {
  const cat = String(category || '').toUpperCase();
  if (cat.includes('AIR')) {
    return options.isInternational ? MODE_BUFFERS.AIRPORT_INTERNATIONAL : MODE_BUFFERS.AIRPORT_DOMESTIC;
  }
  if (cat.includes('RAIL') || cat.includes('TRAIN')) {
    return MODE_BUFFERS.RAILWAY_STATION;
  }
  if (cat.includes('BUS')) {
    return MODE_BUFFERS.BUS_STATION;
  }
  return MODE_BUFFERS.DEFAULT;
}

/**
 * Evaluates transport deadline feasibility.
 */
function evaluateTransportDeadline({
  currentMinute,
  scheduledDepartureMinute,
  travelTransitMinutes,
  hubCategory = 'RAILWAY_STATION',
  trafficDelayMinutes = 0,
  isInternational = false,
  hubName = '',
} = {}) {
  if (scheduledDepartureMinute == null) {
    return {
      deadlineState: DEADLINE_STATES.UNKNOWN,
      availableBufferMinutes: null,
      message: 'No scheduled departure deadline specified.',
    };
  }

  const modeBuffer = getModeBufferMinutes(hubCategory, { isInternational });
  const totalTravelTime = (travelTransitMinutes || 30) + (trafficDelayMinutes || 0);

  // Projected arrival at hub doors
  const projectedArrivalMinute = (currentMinute || 0) + totalTravelTime;

  // Latest minute traveler must be at hub
  const latestRequiredHubArrivalMinute = scheduledDepartureMinute - modeBuffer;

  // Available safety buffer (positive = safe, negative = already into departure buffer or late)
  const availableBufferMinutes = latestRequiredHubArrivalMinute - projectedArrivalMinute;

  // Latest safe departure minute from current location
  const latestSafeDepartureMinute = scheduledDepartureMinute - (totalTravelTime + modeBuffer);

  let deadlineState = DEADLINE_STATES.SAFE_BUFFER;
  let actionRecommendation = 'PROCEED';
  let message = '';

  if (availableBufferMinutes < -modeBuffer) {
    // Cannot even arrive before flight/train takes off
    deadlineState = DEADLINE_STATES.MISSED_DEADLINE;
    actionRecommendation = 'IMMEDIATE_REROUTE_OR_REBOOK';
    message = `Critical: Scheduled departure cannot be reached. Arrival is projected after departure.`;
  } else if (availableBufferMinutes < 0) {
    // Arrival eats into security/check-in buffer
    deadlineState = DEADLINE_STATES.DEADLINE_RISK;
    actionRecommendation = 'URGENT_DEPARTURE_REQUIRED';
    message = `High Risk: Traffic delay eats into mandatory ${modeBuffer}m station/airport buffer by ${Math.abs(availableBufferMinutes)} minutes.`;
  } else if (availableBufferMinutes <= 20) {
    // Tight buffer
    deadlineState = DEADLINE_STATES.LOW_BUFFER;
    actionRecommendation = 'DEPART_NOW';
    message = `Caution: Only ${availableBufferMinutes} minutes of buffer remain before mandatory check-in threshold.`;
  } else {
    // Safe buffer
    deadlineState = DEADLINE_STATES.SAFE_BUFFER;
    actionRecommendation = 'ON_SCHEDULE';
    message = `Comfortable buffer: ${availableBufferMinutes} minutes of safety margin prior to ${modeBuffer}m boarding buffer.`;
  }

  appLogger.info(`[transportHubEngine] Deadline check: ${deadlineState} (buffer: ${availableBufferMinutes}m)`);

  return {
    deadlineState,
    actionRecommendation,
    urgency: deadlineState === DEADLINE_STATES.DEADLINE_RISK || deadlineState === DEADLINE_STATES.MISSED_DEADLINE ? 'IMMEDIATE_DEPARTURE' : actionRecommendation,
    currentMinute,
    scheduledDepartureMinute,
    modeBufferMinutes: modeBuffer,
    requiredBufferMinutes: modeBuffer,
    totalTravelTimeMinutes: totalTravelTime,
    projectedArrivalMinute,
    latestRequiredHubArrivalMinute,
    latestSafeDepartureMinute,
    availableBufferMinutes,
    message,
    warningMessage: hubName ? `[${hubName}] ${message}` : message,
  };
}

/**
 * Evaluates transport hub candidates from current location.
 */
function evaluateTransportHubCandidates({
  currentLocation,
  hubList = [],
  currentMinute = 720,
  scheduledDepartureMinute = null,
  hubCategory = 'RAILWAY_STATION',
} = {}) {
  const fromCoords = currentLocation ? [Number(currentLocation.lat), Number(currentLocation.lon)] : null;

  return hubList.map(hub => {
    const dist = fromCoords
      ? Math.round(distKm(fromCoords[0], fromCoords[1], hub.lat, hub.lon) * 10) / 10
      : 8.0;
    const transitMin = Math.round(dist * 2.2) + 10;

    const deadlineEval = evaluateTransportDeadline({
      currentMinute,
      scheduledDepartureMinute,
      travelTransitMinutes: transitMin,
      hubCategory: hub.category || hubCategory,
    });

    let score = 75;
    if (deadlineEval.deadlineState === DEADLINE_STATES.SAFE_BUFFER) score += 20;
    else if (deadlineEval.deadlineState === DEADLINE_STATES.LOW_BUFFER) score += 5;
    else if (deadlineEval.deadlineState === DEADLINE_STATES.DEADLINE_RISK) score -= 30;
    else if (deadlineEval.deadlineState === DEADLINE_STATES.MISSED_DEADLINE) score -= 60;

    score -= Math.min(25, dist * 0.5);

    return {
      ...hub,
      distanceKm: dist,
      transitMinutes: transitMin,
      deadlineEvaluation: deadlineEval,
      compositeScore: Math.max(5, Math.min(99, Math.round(score))),
    };
  }).sort((a, b) => b.compositeScore - a.compositeScore);
}

module.exports = {
  DEADLINE_STATES,
  MODE_BUFFERS,
  getModeBufferMinutes,
  evaluateTransportDeadline,
  evaluateTransportHubCandidates,
};
