'use strict';

/**
 * services/travelIntelligence/journey/journeyStateEngine.js
 *
 * Canonical Journey State Engine for India In-Time v3.0.
 * Authoritative single source of truth for active trip execution.
 *
 * Enforces Architectural Invariants:
 * 1. COMPLETED STOPS ARE IMMUTABLE (cannot be deleted, modified, or dropped during replan).
 * 2. Real-time pacing lag propagation (shifts remaining stops without touching completed history).
 * 3. Authoritative tracking across PLANNED, ACTIVE, COMPLETED, and SKIPPED states.
 */

const STOP_STATUSES = Object.freeze({
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
});

const TRIP_HEALTH_STATES = Object.freeze({
  ON_TRACK: 'ON_TRACK',
  WATCH: 'WATCH',
  SUBOPTIMAL: 'SUBOPTIMAL',
  REPLAN_RECOMMENDED: 'REPLAN_RECOMMENDED',
  CRITICAL: 'CRITICAL',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
});

/**
 * Creates an authoritative JourneyState instance from an itinerary plan.
 */
function createJourneyState({
  tripId,
  travelerId = null,
  plan = {},
  initialLocation = null,
  startTimeMinutes = 540, // 09:00 AM IST
} = {}) {
  if (!tripId) throw new Error('tripId is required to create a JourneyState');

  const rawStops = Array.isArray(plan.stops) ? plan.stops : (Array.isArray(plan) ? plan : []);

  const stops = rawStops.map((s, idx) => {
    const stopId = String(s.id || s.place_id || `stop_${idx + 1}`);
    return {
      id: stopId,
      name: s.name || s.canonicalName || `Stop ${idx + 1}`,
      category: s.cat || s.category || 'attraction',
      lat: Number(s.lat || s.latitude || s.coords?.[0]),
      lon: Number(s.lon || s.longitude || s.coords?.[1]),
      elevationM: s.elevationM || s.elevation || null,
      orderIndex: idx,
      plannedArrivalMinute: s.arrivalMinute ?? (startTimeMinutes + idx * 90),
      plannedDurationMinutes: s.visitMinutes || s.visit_minutes || 60,
      plannedDepartureMinute: s.departureMinute ?? (startTimeMinutes + idx * 90 + 60),
      status: s.status || (idx === 0 ? STOP_STATUSES.ACTIVE : STOP_STATUSES.PLANNED),
      openingHours: s.openingHours || (s.open_time && s.close_time ? { open: s.open_time, close: s.close_time } : null),
      actualArrivalMinute: idx === 0 ? startTimeMinutes : null,
      actualDepartureMinute: null,
      actualVisitMinutes: null,
      notes: [],
    };
  });

  const completedStops = stops.filter(s => s.status === STOP_STATUSES.COMPLETED);
  const activeStop = stops.find(s => s.status === STOP_STATUSES.ACTIVE) ||
    stops.find(s => s.status === STOP_STATUSES.PLANNED) || null;
  const upcomingStops = stops.filter(s => s.status === STOP_STATUSES.PLANNED);
  const skippedStops = stops.filter(s => s.status === STOP_STATUSES.SKIPPED);

  return {
    tripId: String(tripId),
    travelerId: travelerId ? String(travelerId) : null,
    tripHealth: TRIP_HEALTH_STATES.ON_TRACK,
    activePlanVersion: 1,
    currentMinute: startTimeMinutes,
    currentLocation: initialLocation || (activeStop ? { lat: activeStop.lat, lon: activeStop.lon } : null),
    pacingLagMinutes: 0,
    stops,
    completedStops,
    activeStop,
    upcomingStops,
    skippedStops,
    activeHazards: [],
    lastAdaptation: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Advances progress of a stop (START, COMPLETE, or SKIP).
 * IMMUTABILITY GUARANTEE: Completed stops cannot be reverted or altered.
 */
function advanceJourneyProgress(journeyState, {
  stopId,
  action = 'COMPLETE',
  currentMinute = null,
  actualVisitMinutes = null,
  currentLocation = null,
  reason = null,
} = {}) {
  if (!journeyState || !Array.isArray(journeyState.stops)) {
    throw new Error('Invalid journeyState provided');
  }

  const state = JSON.parse(JSON.stringify(journeyState));
  const targetStop = state.stops.find(s => s.id === String(stopId));

  if (!targetStop) {
    throw new Error(`Stop '${stopId}' not found in journey plan`);
  }

  // Enforce Immutability: A completed stop cannot be overwritten
  if (targetStop.status === STOP_STATUSES.COMPLETED) {
    throw new Error(`Stop '${targetStop.name}' (${stopId}) is already COMPLETED and cannot be modified.`);
  }

  const nowMin = currentMinute != null ? Number(currentMinute) : (state.currentMinute || 540);
  state.currentMinute = nowMin;
  if (currentLocation) state.currentLocation = currentLocation;

  if (action === 'START') {
    targetStop.status = STOP_STATUSES.ACTIVE;
    targetStop.actualArrivalMinute = nowMin;
    state.activeStop = targetStop;
  } else if (action === 'COMPLETE') {
    targetStop.status = STOP_STATUSES.COMPLETED;
    targetStop.actualDepartureMinute = nowMin;
    targetStop.actualVisitMinutes = actualVisitMinutes != null
      ? Number(actualVisitMinutes)
      : (targetStop.actualArrivalMinute != null ? Math.max(15, nowMin - targetStop.actualArrivalMinute) : targetStop.plannedDurationMinutes);

    // Calculate pacing delta compared to original plan
    const departureDelta = targetStop.actualDepartureMinute - targetStop.plannedDepartureMinute;
    state.pacingLagMinutes = Math.max(-60, Math.min(240, departureDelta));

    // Shift next planned stop to ACTIVE if available
    const nextPlanned = state.stops.find(s => s.status === STOP_STATUSES.PLANNED);
    if (nextPlanned) {
      nextPlanned.status = STOP_STATUSES.ACTIVE;
      nextPlanned.actualArrivalMinute = nowMin + 20; // Estimated transit
      state.activeStop = nextPlanned;
    } else {
      state.activeStop = null;
    }
  } else if (action === 'SKIP') {
    targetStop.status = STOP_STATUSES.SKIPPED;
    targetStop.notes.push(reason || 'Skipped by traveler');

    const nextPlanned = state.stops.find(s => s.status === STOP_STATUSES.PLANNED);
    if (nextPlanned) {
      nextPlanned.status = STOP_STATUSES.ACTIVE;
      state.activeStop = nextPlanned;
    } else {
      state.activeStop = null;
    }
  }

  // Refresh canonical partition arrays
  state.completedStops = state.stops.filter(s => s.status === STOP_STATUSES.COMPLETED);
  state.upcomingStops = state.stops.filter(s => s.status === STOP_STATUSES.PLANNED);
  state.skippedStops = state.stops.filter(s => s.status === STOP_STATUSES.SKIPPED);
  state.updatedAt = new Date().toISOString();

  // Recalculate remaining schedule timing under pacing lag
  recalculateUpcomingTimeline(state);

  return state;
}

/**
 * Propagates accumulated pacing lag to upcoming stops while leaving completed stops untouched.
 */
function recalculateUpcomingTimeline(journeyState) {
  const lag = journeyState.pacingLagMinutes || 0;
  let cursor = journeyState.currentMinute;

  for (const stop of journeyState.stops) {
    if (stop.status === STOP_STATUSES.PLANNED || stop.status === STOP_STATUSES.ACTIVE) {
      if (stop.status === STOP_STATUSES.PLANNED) {
        stop.projectedArrivalMinute = stop.plannedArrivalMinute + lag;
        stop.projectedDepartureMinute = stop.plannedDepartureMinute + lag;
      } else {
        stop.projectedArrivalMinute = stop.actualArrivalMinute || cursor;
        stop.projectedDepartureMinute = stop.projectedArrivalMinute + stop.plannedDurationMinutes;
      }
      cursor = stop.projectedDepartureMinute + 25; // 25 min default travel buffer
    }
  }
}

module.exports = {
  STOP_STATUSES,
  TRIP_HEALTH_STATES,
  createJourneyState,
  advanceJourneyProgress,
  recalculateUpcomingTimeline,
};
