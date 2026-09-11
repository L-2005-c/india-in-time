'use strict';

/**
 * services/travelIntelligence/safety/temporalSafetyEngine.js
 *
 * Temporal Safety Overlap Engine for India In-Time v3.0.
 *
 * Evaluates whether a time-bounded hazard window intersects
 * the traveler's scheduled exposure interval.
 *
 * Returns canonical states:
 * - ACTIVE_OVERLAP
 * - UPCOMING_OVERLAP
 * - EXPIRED
 * - NO_OVERLAP
 * - UNKNOWN
 */

const TEMPORAL_STATES = Object.freeze({
  ACTIVE_OVERLAP: 'ACTIVE_OVERLAP',
  UPCOMING_OVERLAP: 'UPCOMING_OVERLAP',
  EXPIRED: 'EXPIRED',
  NO_OVERLAP: 'NO_OVERLAP',
  UNKNOWN: 'UNKNOWN',
  // Backward compatibility alias
  TEMPORAL_OVERLAP: 'ACTIVE_OVERLAP',
  NO_TEMPORAL_OVERLAP: 'NO_OVERLAP',
});

/**
 * Robust parser for various official timestamp formats:
 * - ISO: "2026-09-11T13:50:00.000Z"
 * - IMD Bulletin: "2026-09-11 1300 Hrs" or "1600 Hrs"
 * - NDMA SACHET: "Fri Sep 11 13:50:00 IST 2026"
 */
function parseTimestampToMinutes(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return Math.floor((ts / 60000) % 1440);

  const str = String(ts).trim();

  // Check for "HHMM Hrs" e.g. "1600 Hrs"
  const hhmmMatch = str.match(/([0-2][0-9])([0-5][0-9])\s*Hrs/i);
  if (hhmmMatch) {
    const h = parseInt(hhmmMatch[1], 10);
    const m = parseInt(hhmmMatch[2], 10);
    return h * 60 + m;
  }

  // Check for standard Date parsing
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    return d.getHours() * 60 + d.getMinutes();
  }

  return null;
}

/**
 * Evaluates temporal overlap between hazard valid window and traveler schedule.
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
      state: TEMPORAL_STATES.ACTIVE_OVERLAP,
      overlapMinutes: 60,
      isOverlap: true,
      explanation: 'Hazard is currently active with open validity window.',
    };
  }

  const hazardStartMin = parseTimestampToMinutes(signal.validFrom) ?? 0;
  const hazardEndMin = parseTimestampToMinutes(signal.validUntil) ?? 1440;

  const tStart = travelerStartMinute != null ? travelerStartMinute : nowMinute;
  const tEnd = travelerEndMinute != null ? travelerEndMinute : (tStart + 120);

  // Check if hazard already expired before traveler arrives
  if (hazardEndMin < tStart && hazardEndMin < nowMinute) {
    return {
      state: TEMPORAL_STATES.EXPIRED,
      overlapMinutes: 0,
      isOverlap: false,
      explanation: 'Hazard validity window expired prior to scheduled arrival.',
    };
  }

  // Check if hazard starts > 60m after traveler departs
  if (hazardStartMin > tEnd + 60) {
    return {
      state: TEMPORAL_STATES.NO_OVERLAP,
      overlapMinutes: 0,
      isOverlap: false,
      explanation: 'Hazard window starts well after traveler has cleared corridor.',
    };
  }

  // Check direct intersection
  const overlapStart = Math.max(hazardStartMin, tStart);
  const overlapEnd = Math.min(hazardEndMin, tEnd);
  const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

  if (overlapMinutes > 0) {
    return {
      state: TEMPORAL_STATES.ACTIVE_OVERLAP,
      overlapMinutes,
      isOverlap: true,
      overlapWindow: {
        startMinute: overlapStart,
        endMinute: overlapEnd,
      },
      explanation: `Traveler schedule directly overlaps active hazard window for ~${overlapMinutes} minutes.`,
    };
  }

  // If starts within next 60 min
  if (hazardStartMin >= tStart && hazardStartMin <= tEnd + 60) {
    return {
      state: TEMPORAL_STATES.UPCOMING_OVERLAP,
      overlapMinutes: 30,
      isOverlap: true,
      explanation: 'Hazard window is approaching scheduled transit interval.',
    };
  }

  return {
    state: TEMPORAL_STATES.NO_OVERLAP,
    overlapMinutes: 0,
    isOverlap: false,
    explanation: 'Hazard window does not intersect scheduled transit time.',
  };
}

module.exports = {
  TEMPORAL_STATES,
  parseTimestampToMinutes,
  evaluateTemporalOverlap,
};
