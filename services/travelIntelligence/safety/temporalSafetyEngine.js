'use strict';

/**
 * services/travelIntelligence/safety/temporalSafetyEngine.js
 *
 * Temporal Safety Overlap Engine for India In-Time v3.0.
 *
 * Evaluates whether a time-bounded hazard window intersects
 * the traveler's scheduled exposure interval.
 */

const TEMPORAL_STATES = Object.freeze({
  TEMPORAL_OVERLAP: 'TEMPORAL_OVERLAP',
  NO_TEMPORAL_OVERLAP: 'NO_TEMPORAL_OVERLAP',
  UNKNOWN_TEMPORAL_OVERLAP: 'UNKNOWN_TEMPORAL_OVERLAP',
});

/**
 * Evaluates temporal overlap between hazard valid window and traveler schedule.
 *
 * @param {Object} input
 * @param {Object} input.signal - SafetySignal with validFrom, validUntil
 * @param {number} [input.travelerStartMinute] - Minute of day (0-1439)
 * @param {number} [input.travelerEndMinute] - Minute of day (0-1439)
 * @param {number} [input.nowMinute] - Current minute of day
 * @returns {Object} Temporal overlap evaluation
 */
function evaluateTemporalOverlap({
  signal = {},
  travelerStartMinute = null,
  travelerEndMinute = null,
  nowMinute = 600,
} = {}) {
  // If hazard has no explicit time window, default to active now
  if (!signal.validFrom && !signal.validUntil) {
    return {
      state: TEMPORAL_STATES.TEMPORAL_OVERLAP,
      overlapMinutes: 60,
      isOverlap: true,
      explanation: 'Hazard is currently active with open validity window.',
    };
  }

  const parseMinute = (isoString) => {
    if (!isoString) return null;
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return null;
    return d.getHours() * 60 + d.getMinutes();
  };

  const hazardStartMin = parseMinute(signal.validFrom) ?? 0;
  const hazardEndMin = parseMinute(signal.validUntil) ?? 1440;

  const tStart = travelerStartMinute != null ? travelerStartMinute : nowMinute;
  const tEnd = travelerEndMinute != null ? travelerEndMinute : (tStart + 120);

  // Check intersection: [hazardStartMin, hazardEndMin] overlaps [tStart, tEnd]
  const overlapStart = Math.max(hazardStartMin, tStart);
  const overlapEnd = Math.min(hazardEndMin, tEnd);
  const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

  if (overlapMinutes > 0) {
    return {
      state: TEMPORAL_STATES.TEMPORAL_OVERLAP,
      overlapMinutes,
      isOverlap: true,
      overlapWindow: {
        startMinute: overlapStart,
        endMinute: overlapEnd,
      },
      explanation: `Traveler schedule overlaps hazard validity window for ~${overlapMinutes} minutes.`,
    };
  }

  return {
    state: TEMPORAL_STATES.NO_TEMPORAL_OVERLAP,
    overlapMinutes: 0,
    isOverlap: false,
    explanation: 'Hazard window does not intersect scheduled transit time.',
  };
}

module.exports = {
  TEMPORAL_STATES,
  evaluateTemporalOverlap,
};
