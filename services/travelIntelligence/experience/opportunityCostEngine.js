'use strict';

/**
 * services/travelIntelligence/experience/opportunityCostEngine.js
 *
 * Deterministic Opportunity Cost & Tradeoff Engine for India In-Time v3.0 Phase 4.
 * Evaluates downstream sacrifices (skipped stops, missed closing hours, daylight loss)
 * if a candidate action is selected now.
 */

const { STOP_STATUSES } = require('../journey/journeyStateEngine');
const { distKm } = require('../../../utils/geo');
const { t2m, m2t } = require('../timeEngine');

/**
 * Evaluates the opportunity cost of choosing a candidate action now.
 *
 * @param {Object} options
 * @param {Object} options.candidate - Candidate place
 * @param {Object} options.journeyState - Active JourneyState
 * @param {Object} [options.timeBudget] - Precomputed time budget
 * @param {Object} [options.solarTimes] - Solar lighting times
 * @param {number} [options.dayEndMinute=1320] - Target day completion minute
 * @returns {Object} Opportunity cost assessment
 */
function evaluateOpportunityCost({
  candidate = {},
  journeyState = {},
  currentMinute = null,
  _timeBudget = null,
  solarTimes = null,
  dayEndMinute = 1320,
} = {}) {
  const currentMin = currentMinute != null
    ? Number(currentMinute)
    : Number(journeyState?.currentMinute || 540);
  const stops = Array.isArray(journeyState?.stops) ? journeyState.stops : [];
  const upcomingStops = stops.filter(s => s.status === STOP_STATUSES.PLANNED);

  // If candidate is already an upcoming stop, it's just being done in sequence or prioritized
  const isAlreadyPlannedStop = upcomingStops.some(s => s.id === candidate.id || s.name === candidate.name);

  // Estimate transit to candidate
  const currentLoc = journeyState?.currentLocation || (
    journeyState?.activeStop ? { lat: journeyState.activeStop.lat, lon: journeyState.activeStop.lon } : null
  );

  let transitToCandidateMin = 20; // default
  if (currentLoc && candidate.lat && candidate.lon) {
    const d = distKm(currentLoc.lat, currentLoc.lon, candidate.lat, candidate.lon);
    transitToCandidateMin = Math.max(5, Math.round(d * 2.2)); // ~27 km/h urban/suburban average
  }

  const candidateStayMin = Number(candidate.visitMinutes || 45);
  const timeConsumedByCandidate = transitToCandidateMin + candidateStayMin;

  // Downstream simulation cursor
  let simCursor = currentMin + timeConsumedByCandidate;
  let prevLoc = { lat: candidate.lat, lon: candidate.lon };

  const sacrificedStops = [];
  const degradedStops = [];
  let remainingPlannedToEvaluate = upcomingStops;

  // If candidate was in upcoming stops, remove it from downstream queue (it's being done now)
  if (isAlreadyPlannedStop) {
    remainingPlannedToEvaluate = upcomingStops.filter(s => s.id !== candidate.id && s.name !== candidate.name);
  }

  for (const stop of remainingPlannedToEvaluate) {
    let legTransitMin = 20;
    if (prevLoc.lat && prevLoc.lon && stop.lat && stop.lon) {
      const d = distKm(prevLoc.lat, prevLoc.lon, stop.lat, stop.lon);
      legTransitMin = Math.max(5, Math.round(d * 2.2));
    }

    const simArrivalMin = simCursor + legTransitMin;
    const plannedDuration = Number(stop.plannedDurationMinutes || stop.visitMinutes || 45);
    const simDepartureMin = simArrivalMin + plannedDuration;

    let stopSacrificed = false;

    // Check Day End Exceeded
    if (simArrivalMin >= dayEndMinute - 15) {
      sacrificedStops.push({
        stopId: stop.id,
        name: stop.name,
        category: stop.category || stop.cat,
        reason: 'DAY_END_EXCEEDED',
        description: `Cannot be reached before day end (${m2t(dayEndMinute)})`,
        projectedArrival: m2t(simArrivalMin),
      });
      stopSacrificed = true;
    }

    // Check Opening Hours Constraint
    if (!stopSacrificed && stop.ct) {
      const closeMin = t2m(stop.ct);
      if (closeMin && simArrivalMin >= closeMin) {
        sacrificedStops.push({
          stopId: stop.id,
          name: stop.name,
          category: stop.category || stop.cat,
          reason: 'ARRIVES_AFTER_CLOSING',
          description: `Will arrive at ${m2t(simArrivalMin)}, after closing time ${stop.ct}`,
          projectedArrival: m2t(simArrivalMin),
          closeTime: stop.ct,
        });
        stopSacrificed = true;
      } else if (closeMin && simDepartureMin > closeMin) {
        degradedStops.push({
          stopId: stop.id,
          name: stop.name,
          category: stop.category || stop.cat,
          reason: 'SHORTENED_VISIT',
          description: `Visit truncated to ${Math.max(15, closeMin - simArrivalMin)}m before closing at ${stop.ct}`,
          lostMinutes: simDepartureMin - closeMin,
        });
      }
    }

    // Check Sunset / Scenic Visibility
    if (!stopSacrificed && solarTimes?.sunsetMin) {
      const isScenicOutdoor = !['museum', 'food', 'restaurant', 'shopping', 'cafe'].includes(String(stop.category || stop.cat).toLowerCase());
      if (isScenicOutdoor && simArrivalMin >= solarTimes.sunsetMin + 30) {
        degradedStops.push({
          stopId: stop.id,
          name: stop.name,
          category: stop.category || stop.cat,
          reason: 'DARKNESS_DEGRADED',
          description: `Will arrive in darkness (${m2t(simArrivalMin)}) after sunset (${m2t(solarTimes.sunsetMin)})`,
        });
      }
    }

    // Advance cursor for next stop simulation
    simCursor = simDepartureMin;
    prevLoc = { lat: stop.lat, lon: stop.lon };
  }

  // Calculate Opportunity Cost Level & Penalty
  let opportunityCostLevel = 'NONE';
  let penaltyScore = 0;

  if (sacrificedStops.length >= 2) {
    opportunityCostLevel = 'PROHIBITIVE';
    penaltyScore = 45;
  } else if (sacrificedStops.length === 1) {
    opportunityCostLevel = 'HIGH';
    penaltyScore = 28;
  } else if (degradedStops.length >= 2) {
    opportunityCostLevel = 'MODERATE';
    penaltyScore = 15;
  } else if (degradedStops.length === 1) {
    opportunityCostLevel = 'LOW';
    penaltyScore = 8;
  } else {
    opportunityCostLevel = 'NONE';
    penaltyScore = 0;
  }

  // Generate deterministic tradeoff explanation
  let tradeoffSummary = 'No planned stops sacrificed; fits comfortably within usable schedule.';
  if (sacrificedStops.length > 0) {
    const names = sacrificedStops.map(s => s.name).join(', ');
    tradeoffSummary = `Requires sacrificing: ${names} (${sacrificedStops[0].description}).`;
  } else if (degradedStops.length > 0) {
    const names = degradedStops.map(s => s.name).join(', ');
    tradeoffSummary = `May squeeze remaining visits: ${names} (${degradedStops[0].description}).`;
  }

  return {
    candidateId: candidate.id,
    timeConsumedMinutes: timeConsumedByCandidate,
    transitToCandidateMin,
    candidateStayMin,
    opportunityCostLevel,
    penaltyScore,
    sacrificedStops,
    degradedStops,
    sacrificedCount: sacrificedStops.length,
    degradedCount: degradedStops.length,
    isAlreadyPlannedStop,
    tradeoffSummary,
  };
}

module.exports = {
  evaluateOpportunityCost,
};
