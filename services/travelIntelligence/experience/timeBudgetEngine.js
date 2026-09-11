'use strict';

/**
 * services/travelIntelligence/experience/timeBudgetEngine.js
 *
 * Deterministic Usable Time Budget Engine for India In-Time v3.0 Phase 4.
 * Computes exact usable time bank for remaining journey stops under real-world pacing.
 *
 * Distinguishes:
 * - Gross remaining day/trip minutes
 * - Committed transit minutes
 * - Committed visit durations for planned stops
 * - Safety & fatigue buffers
 * - Net usable experience minutes
 */

const { STOP_STATUSES } = require('../journey/journeyStateEngine');

const PACE_BUFFER_RATIOS = Object.freeze({
  relaxed: 0.25,
  balanced: 0.15,
  packed: 0.08,
  default: 0.15,
});

/**
 * Computes the authoritative usable time budget for a journey.
 *
 * @param {Object} options
 * @param {Object} options.journeyState - Authoritative JourneyState instance
 * @param {Object} options.travelerDna - Traveler DNA profile
 * @param {number} [options.dayEndMinute=1320] - Target end of travel day in minutes (22:00 IST)
 * @param {number} [options.currentMinute] - Current journey minute (overrides state.currentMinute)
 * @returns {Object} Authoritative time budget breakdown
 */
function computeTimeBudget({
  journeyState = {},
  travelerDna = {},
  dayEndMinute = 1320, // 22:00 IST
  currentMinute = null,
} = {}) {
  const nowMin = currentMinute != null
    ? Number(currentMinute)
    : (Number(journeyState?.currentMinute) || 540); // default 09:00 AM

  const targetEndMin = Math.max(nowMin, Number(dayEndMinute) || 1320);
  const grossRemainingMinutes = Math.max(0, targetEndMin - nowMin);

  // Extract stops
  const stops = Array.isArray(journeyState?.stops) ? journeyState.stops : [];
  const activeStop = journeyState?.activeStop || stops.find(s => s.status === STOP_STATUSES.ACTIVE);
  const upcomingStops = stops.filter(s => s.status === STOP_STATUSES.PLANNED);

  // Remaining visit time in active stop
  let activeRemainingVisitMin = 0;
  if (activeStop && activeStop.status === STOP_STATUSES.ACTIVE) {
    const elapsed = activeStop.actualArrivalMinute != null
      ? Math.max(0, nowMin - activeStop.actualArrivalMinute)
      : 0;
    const planned = Number(activeStop.plannedDurationMinutes || activeStop.visitMinutes || 45);
    activeRemainingVisitMin = Math.max(0, planned - elapsed);
  }

  // Committed visit minutes for planned upcoming stops
  const upcomingVisitMinutes = upcomingStops.reduce((sum, s) => {
    return sum + Number(s.plannedDurationMinutes || s.visitMinutes || 45);
  }, 0);

  const committedVisitMinutes = activeRemainingVisitMin + upcomingVisitMinutes;

  // Committed transit minutes: upcoming stops count * transit estimate (default 20 min or specified)
  const committedTransitMinutes = upcomingStops.reduce((sum, s) => {
    return sum + Number(s.transitMinutes || s.travelMinutes || 20);
  }, activeStop ? 10 : 0);

  // Pace buffer
  const pace = String(travelerDna?.pacePreference || 'balanced').toLowerCase();
  const bufferRatio = PACE_BUFFER_RATIOS[pace] || PACE_BUFFER_RATIOS.default;
  const committedTotal = committedVisitMinutes + committedTransitMinutes;
  const bufferMinutes = Math.round(Math.max(15, committedTotal * bufferRatio));

  // Net usable experience minutes
  const totalCommittedWithBuffer = committedTotal + bufferMinutes;
  const usableExperienceMinutes = Math.max(0, grossRemainingMinutes - totalCommittedWithBuffer);
  const rawBalance = grossRemainingMinutes - totalCommittedWithBuffer;

  // Classification
  let budgetClassification;
  let feasibilityStatus;

  if (rawBalance >= 60) {
    budgetClassification = 'SURPLUS';
    feasibilityStatus = 'HIGH';
  } else if (rawBalance >= 20) {
    budgetClassification = 'BALANCED';
    feasibilityStatus = 'MODERATE';
  } else if (rawBalance >= 0) {
    budgetClassification = 'TIGHT';
    feasibilityStatus = 'CONSTRAINED';
  } else {
    budgetClassification = 'DEFICIT';
    feasibilityStatus = 'OVER_BUDGET';
  }

  const isTimeBankrupt = rawBalance < 0;
  const pacingLagMinutes = Number(journeyState?.pacingLagMinutes || 0);

  return {
    currentMinute: nowMin,
    dayEndMinute: targetEndMin,
    grossRemainingMinutes,
    committedTransitMinutes,
    committedVisitMinutes,
    activeRemainingVisitMin,
    upcomingVisitMinutes,
    upcomingStopsCount: upcomingStops.length,
    bufferMinutes,
    usableExperienceMinutes,
    rawBalanceMinutes: rawBalance,
    budgetClassification,
    feasibilityStatus,
    isTimeBankrupt,
    pacingLagMinutes,
    pacePreference: pace,
    summary: isTimeBankrupt
      ? `Time deficit of ${Math.abs(rawBalance)} minutes: remaining stops exceed available day window.`
      : `${usableExperienceMinutes} minutes of uncommitted usable time remaining (${budgetClassification.toLowerCase()} bank).`,
    timeAllocation: {
      gross: grossRemainingMinutes,
      committedVisits: committedVisitMinutes,
      committedTransit: committedTransitMinutes,
      fatigueBuffer: bufferMinutes,
      netUsable: usableExperienceMinutes,
    },
  };
}

module.exports = {
  computeTimeBudget,
  PACE_BUFFER_RATIOS,
};
