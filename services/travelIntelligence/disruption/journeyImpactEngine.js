'use strict';

/**
 * services/travelIntelligence/disruption/journeyImpactEngine.js
 *
 * India In-Time v3.0 — Disruption Journey Impact Evaluator
 *
 * Evaluates: "Something changed on the route. What does that change mean for THIS traveler?"
 * Evaluates impact on:
 * - Arrival feasibility & Opening hours
 * - Scenic & Daylight / Sunset windows
 * - Hard Return deadlines (train, flight, hotel checkout)
 * - Pacing & Fatigue for traveler profile
 *
 * Classifies into:
 *   NO_IMPACT, LOW_IMPACT, MODERATE_IMPACT, HIGH_IMPACT, CRITICAL_IMPACT
 */

const { t2m, m2t } = require('../timeEngine');

const JOURNEY_IMPACT_STATES = Object.freeze({
  NO_IMPACT: 'NO_IMPACT',
  LOW_IMPACT: 'LOW_IMPACT',
  MODERATE_IMPACT: 'MODERATE_IMPACT',
  HIGH_IMPACT: 'HIGH_IMPACT',
  CRITICAL_IMPACT: 'CRITICAL_IMPACT',
});

/**
 * Evaluates the impact of a disruption on an active journey.
 *
 * @param {Object} input
 * @param {Object} input.journeyState - Authoritative journey state
 * @param {Object} input.disruption - Structured disruption entity
 * @param {Object} [input.travelerDna] - Traveler preferences and constraints
 * @param {Object} [input.context] - Unified context
 * @returns {Object} Journey Impact Evaluation
 */
function evaluateJourneyImpact({
  journeyState = {},
  disruption = {},
  travelerDna = {},
  _context = {},
} = {}) {
  const currentMinute = Number(journeyState.currentMinute || 600);
  const existingLag = Number(journeyState.pacingLagMinutes || 0);
  const delayMinutes = Number(disruption.estimatedDelay || 0);
  const totalProjectedDelay = existingLag + delayMinutes;

  const upcomingStops = Array.isArray(journeyState.upcomingStops) && journeyState.upcomingStops.length > 0
    ? journeyState.upcomingStops
    : (Array.isArray(journeyState.stops) ? journeyState.stops.filter(s => s.status === 'PLANNED') : []);

  const completedStops = Array.isArray(journeyState.completedStops) && journeyState.completedStops.length > 0
    ? journeyState.completedStops
    : (Array.isArray(journeyState.stops) ? journeyState.stops.filter(s => s.status === 'COMPLETED') : []);

  const affectedStops = [];
  const threatenedWindows = [];
  const breachedConstraints = [];

  let cursorMinute = currentMinute + totalProjectedDelay;

  // Check each upcoming stop against the new delayed timeline
  for (const stop of upcomingStops) {
    const plannedDuration = Number(stop.plannedDurationMinutes || stop.durationMinutes || 45);
    const transitTime = 20; // Nominal transit
    const projectedArrival = cursorMinute + transitTime;
    const projectedDeparture = projectedArrival + plannedDuration;

    let isStopCompromised = false;
    let compromiseReason = null;

    // 1. Opening hours check
    const closeMin = stop.close_time ? t2m(stop.close_time) : (stop.openingHours?.close ? t2m(stop.openingHours.close) : null);
    if (closeMin != null) {
      if (projectedArrival >= closeMin) {
        isStopCompromised = true;
        compromiseReason = `Arrival at ${m2t(projectedArrival)} is after closing time (${m2t(closeMin)})`;
        breachedConstraints.push({
          stopId: stop.id,
          stopName: stop.name,
          type: 'OPENING_HOURS_BREACH',
          detail: compromiseReason,
        });
      } else if (closeMin - projectedArrival < 20) {
        threatenedWindows.push({
          stopId: stop.id,
          stopName: stop.name,
          type: 'COMPRESSED_DWELL_TIME',
          detail: `Less than 20 minutes remaining before closing (${m2t(closeMin)})`,
        });
      }
    }

    // 2. Scenic / Sunset window check
    const isSunsetSpot = stop.is_sunset_spot || stop.category === 'viewpoint' || /sunset|viewpoint|peak|panoramic/i.test(stop.name || '');
    const sunsetMinute = 18 * 60; // 18:00 typical India golden hour / sunset
    if (isSunsetSpot) {
      if (projectedArrival > sunsetMinute + 15) {
        threatenedWindows.push({
          stopId: stop.id,
          stopName: stop.name,
          type: 'SUNSET_WINDOW_MISSED',
          detail: `Projected arrival at ${m2t(projectedArrival)} misses sunset golden hour (~17:30–18:15)`,
        });
      }
    }

    // 3. Ghat night driving hazard
    const isGhat = stop.elevationM > 600 || /araku|ghat|valley|hill/i.test(stop.name || '');
    if (isGhat && projectedDeparture >= 18 * 60 + 30) {
      threatenedWindows.push({
        stopId: stop.id,
        stopName: stop.name,
        type: 'NIGHT_GHAT_TRANSIT_RISK',
        detail: 'Mountain descent pushed into dark hours with unlit hairpins and fog',
      });
    }

    if (isStopCompromised || delayMinutes >= 25) {
      affectedStops.push({
        id: stop.id,
        name: stop.name,
        category: stop.category,
        projectedArrival: m2t(projectedArrival),
        isCompromised: isStopCompromised,
        reason: compromiseReason,
      });
    }

    cursorMinute = projectedDeparture;
  }

  // 4. Check Hard Return Deadline (e.g., flight, train, or strict curfew)
  const returnDeadlineMin = travelerDna.hardDeadlineMinute || (travelerDna.deadlineTime ? t2m(travelerDna.deadlineTime) : null);
  let deadlineBreached = false;
  if (returnDeadlineMin != null && cursorMinute > returnDeadlineMin) {
    deadlineBreached = true;
    breachedConstraints.push({
      type: 'HARD_DEADLINE_BREACH',
      detail: `Final journey completion (${m2t(cursorMinute)}) breaches hard return deadline (${m2t(returnDeadlineMin)}) by ${cursorMinute - returnDeadlineMin} min`,
    });
  }

  // 5. Synthesize Journey Impact State
  let impactState = JOURNEY_IMPACT_STATES.NO_IMPACT;
  if (disruption.eventType === 'ROAD_CLOSURE' || deadlineBreached || breachedConstraints.length > 0) {
    impactState = JOURNEY_IMPACT_STATES.CRITICAL_IMPACT;
  } else if (threatenedWindows.length > 0 || totalProjectedDelay >= 45) {
    impactState = JOURNEY_IMPACT_STATES.HIGH_IMPACT;
  } else if (totalProjectedDelay >= 20 || affectedStops.length > 0) {
    impactState = JOURNEY_IMPACT_STATES.MODERATE_IMPACT;
  } else if (totalProjectedDelay >= 8) {
    impactState = JOURNEY_IMPACT_STATES.LOW_IMPACT;
  } else {
    impactState = JOURNEY_IMPACT_STATES.NO_IMPACT;
  }

  return {
    impactState,
    totalProjectedDelay,
    delayMinutes,
    pacingLagMinutes: existingLag,
    affectedStops,
    threatenedWindows,
    breachedConstraints,
    hasHardViolations: breachedConstraints.length > 0,
    preservedStopsCount: completedStops.length,
    remainingStopsCount: upcomingStops.length,
    projectedJourneyEnd: m2t(cursorMinute),
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = {
  JOURNEY_IMPACT_STATES,
  evaluateJourneyImpact,
};
