'use strict';

/**
 * services/travelIntelligence/disruption/eventIntelligence.js
 *
 * India In-Time v3.0 — Planned Event Intelligence Layer
 *
 * Maintains known scheduled events (cricket matches, religious processions, festivals,
 * political rallies, concerts, VIP movements, and planned roadworks).
 *
 * Principles:
 * 1. Event existence and traffic impact are SEPARATE states.
 * 2. Planned event becomes a disruption explanation only when traffic evidence supports it.
 * 3. Supports proactive upcoming warnings before traveler reaches the corridor.
 * 4. Strictly labels data states: PLANNED_EVENT vs LIVE_OBSERVED vs INFERRED.
 */

const { distKm } = require('../../../utils/geo');

const EVENT_TYPES = Object.freeze({
  SPORTS_EVENT: 'SPORTS_EVENT',
  CRICKET_MATCH: 'CRICKET_MATCH',
  RELIGIOUS_PROCESSION: 'RELIGIOUS_PROCESSION',
  FESTIVAL: 'FESTIVAL',
  TEMPLE_EVENT: 'TEMPLE_EVENT',
  CONCERT: 'CONCERT',
  POLITICAL_RALLY: 'POLITICAL_RALLY',
  VIP_MOVEMENT: 'VIP_MOVEMENT',
  POLICE_DIVERSION: 'POLICE_DIVERSION',
  CONSTRUCTION: 'CONSTRUCTION',
  ROAD_CLOSURE: 'ROAD_CLOSURE',
});

const SOURCE_CLASSIFICATIONS = Object.freeze({
  OFFICIAL_SCHEDULE: 'OFFICIAL_SCHEDULE',
  VERIFIED_EVENT: 'VERIFIED_EVENT',
  STATIC_KNOWLEDGE: 'STATIC_KNOWLEDGE',
  SIMULATED: 'SIMULATED',
});

const EVENT_STATES = Object.freeze({
  EVENT_SCHEDULED: 'EVENT_SCHEDULED',
  TRAFFIC_IMPACT_OBSERVED: 'TRAFFIC_IMPACT_OBSERVED',
  EVENT_CAUSED_TRAFFIC: 'EVENT_CAUSED_TRAFFIC',
  PLANNED_VIP_EVENT: 'PLANNED_VIP_EVENT',
});

// Canonical Indian Regional and Metro Events Catalog
const CANONICAL_PLANNED_EVENTS = [
  {
    eventId: 'evt_vskp_cricket_01',
    eventType: EVENT_TYPES.CRICKET_MATCH,
    name: 'India vs Australia T20 / IPL Match',
    location: {
      name: 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium',
      lat: 17.7972,
      lon: 83.3533,
      radiusKm: 4.5,
    },
    affectedCorridors: ['NH16 PM Palem Stretch', 'Madhurawada Highway Corridor', 'Beach Road North'],
    startTime: '16:30',
    endTime: '22:30',
    source: 'OFFICIAL_STADIUM_SCHEDULE',
    sourceType: 'BCCI / ACA Official Calendar',
    sourceClassification: SOURCE_CLASSIFICATIONS.OFFICIAL_SCHEDULE,
    eventScheduleState: EVENT_STATES.EVENT_SCHEDULED,
    confidence: 'HIGH',
    expectedDelayMinutes: 55,
    estimatedImpact: {
      delayMinutesRange: [45, 65],
      basis: 'HISTORICAL_STADIUM_PRIOR',
      modelVersion: 'event-prior-v1',
      heuristic: true,
    },
    expectedImpact: 'HEAVY_CORRIDOR_CONGESTION',
  },
  {
    eventId: 'evt_vskp_simhachalam_01',
    eventType: EVENT_TYPES.RELIGIOUS_PROCESSION,
    name: 'Simhachalam Giri Pradakshina Pilgrimage Circumambulation',
    location: {
      name: 'Simhachalam Foothills to Adavivaram Corridor',
      lat: 17.7667,
      lon: 83.2500,
      radiusKm: 6.0,
    },
    affectedCorridors: ['Simhachalam Hill Road', 'Gopalapatnam Arterial', 'Adavivaram BRTS'],
    startTime: '14:00',
    endTime: '23:59',
    source: 'DEVASTHANAM_OFFICIAL_CALENDAR',
    sourceType: 'Endowments Department / City Police Advisory',
    sourceClassification: SOURCE_CLASSIFICATIONS.OFFICIAL_SCHEDULE,
    eventScheduleState: EVENT_STATES.EVENT_SCHEDULED,
    confidence: 'HIGH',
    expectedDelayMinutes: 45,
    estimatedImpact: {
      delayMinutesRange: [30, 50],
      basis: 'FESTIVAL_CALENDAR_PRIOR',
      modelVersion: 'event-prior-v1',
      heuristic: true,
    },
    expectedImpact: 'FOOT_PROCESSION_ROAD_DIVERSION',
  },
  {
    eventId: 'evt_tirupati_brahmotsavam_01',
    eventType: EVENT_TYPES.TEMPLE_EVENT,
    name: 'Tirumala Srivari Brahmotsavam Garuda Seva',
    location: {
      name: 'Tirumala Ghat & Alipiri Tollgate',
      lat: 13.6833,
      lon: 79.3500,
      radiusKm: 8.0,
    },
    affectedCorridors: ['Alipiri Checkpost to First Ghat Road', 'Tirupati By-Pass NH716'],
    startTime: '17:00',
    endTime: '23:30',
    source: 'TTD_OFFICIAL_CALENDAR',
    sourceType: 'Tirumala Tirupati Devasthanams Advisory',
    sourceClassification: SOURCE_CLASSIFICATIONS.OFFICIAL_SCHEDULE,
    eventScheduleState: EVENT_STATES.EVENT_SCHEDULED,
    confidence: 'HIGH',
    expectedDelayMinutes: 70,
    estimatedImpact: {
      delayMinutesRange: [40, 70],
      basis: 'DEVASTHANAM_CALENDAR_PRIOR',
      modelVersion: 'event-prior-v1',
      heuristic: true,
    },
    expectedImpact: 'PILGRIM_SURGE_GHAT_CONGESTION',
  },
  {
    eventId: 'evt_mumbai_wankhede_01',
    eventType: EVENT_TYPES.CRICKET_MATCH,
    name: 'IPL Match Wankhede Stadium',
    location: {
      name: 'Marine Drive / Churchgate',
      lat: 18.9389,
      lon: 72.8258,
      radiusKm: 3.0,
    },
    affectedCorridors: ['Marine Drive', 'Madam Cama Road', 'Veer Nariman Road'],
    startTime: '17:00',
    endTime: '23:30',
    source: 'MUMBAI_TRAFFIC_POLICE',
    sourceType: 'Official Police Circular',
    sourceClassification: SOURCE_CLASSIFICATIONS.OFFICIAL_SCHEDULE,
    eventScheduleState: EVENT_STATES.EVENT_SCHEDULED,
    confidence: 'HIGH',
    expectedDelayMinutes: 60,
    estimatedImpact: {
      delayMinutesRange: [45, 65],
      basis: 'HISTORICAL_STADIUM_PRIOR',
      modelVersion: 'event-prior-v1',
      heuristic: true,
    },
    expectedImpact: 'SOUTH_MUMBAI_ARTERIAL_DIVERSION',
  },
  {
    eventId: 'evt_delhi_kartavya_rally_01',
    eventType: EVENT_TYPES.VIP_MOVEMENT,
    name: 'State Dignitary Convoy & Ceremonial Rehearsal',
    location: {
      name: 'Kartavya Path / India Gate Circle',
      lat: 28.6129,
      lon: 77.2295,
      radiusKm: 3.5,
    },
    affectedCorridors: ['C-Hexagon India Gate', 'Tilak Marg', 'Ashoka Road'],
    startTime: '08:00',
    endTime: '12:00',
    source: 'DELHI_TRAFFIC_POLICE',
    sourceType: 'Special Traffic Notification',
    sourceClassification: SOURCE_CLASSIFICATIONS.OFFICIAL_SCHEDULE,
    eventScheduleState: EVENT_STATES.PLANNED_VIP_EVENT,
    confidence: 'HIGH',
    expectedDelayMinutes: 50,
    estimatedImpact: {
      delayMinutesRange: [30, 50],
      basis: 'VIP_CONVOY_PROTOCOL_PRIOR',
      modelVersion: 'event-prior-v1',
      heuristic: true,
    },
    expectedImpact: 'POTENTIAL_DISRUPTION',
  },
];

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * Finds planned events that overlap geographically and temporally with a corridor or stop.
 *
 * @param {Object} input
 * @param {Array<number>} [input.coords] - [lat, lon]
 * @param {string} [input.corridorName] - Name of corridor/highway
 * @param {number} [input.targetMinute] - Minute of day (0-1439) when traveler traverses area
 * @param {Array<Object>} [input.customEvents] - Injected events for dynamic scenarios or tests
 * @returns {Array<Object>} Correlated planned events
 */
function queryPlannedEvents({
  coords = null,
  corridorName = null,
  targetMinute = null,
  customEvents = null,
} = {}) {
  const catalog = Array.isArray(customEvents) && customEvents.length > 0
    ? [...customEvents, ...CANONICAL_PLANNED_EVENTS]
    : CANONICAL_PLANNED_EVENTS;

  const matchedEvents = [];

  for (const event of catalog) {
    let spatialMatch = false;
    let distanceKm = null;

    if (coords && Number.isFinite(coords[0]) && Number.isFinite(coords[1]) && event.location) {
      distanceKm = distKm(coords[0], coords[1], event.location.lat, event.location.lon);
      if (distanceKm <= (event.location.radiusKm || 5.0)) {
        spatialMatch = true;
      }
    }

    if (!spatialMatch && corridorName && Array.isArray(event.affectedCorridors)) {
      const lowerCorridor = corridorName.toLowerCase();
      spatialMatch = event.affectedCorridors.some(c =>
        c.toLowerCase().includes(lowerCorridor) || lowerCorridor.includes(c.toLowerCase())
      );
    }

    if (!spatialMatch) continue;

    if (targetMinute == null) {
      matchedEvents.push({
        ...event,
        spatialMatch: true,
        distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
        isCurrentlyActive: false,
        isUpcoming: true,
        minutesUntilImpact: 0,
        dataState: 'PLANNED_EVENT',
      });
      continue;
    }

    // Temporal Window Matching: Event start minus 60m pre-event crowd buildup
    const startMin = parseTimeToMinutes(event.startTime);
    const endMin = parseTimeToMinutes(event.endTime);
    const impactStartMin = Math.max(0, startMin - 60); // Crowd builds 1 hour prior
    const impactEndMin = Math.min(1439, endMin + 30);

    const isCurrentlyActive = targetMinute >= startMin && targetMinute <= endMin;
    const isUpcoming = targetMinute < startMin && (impactStartMin - targetMinute <= 120);

    if (isCurrentlyActive || isUpcoming || (targetMinute >= impactStartMin && targetMinute <= impactEndMin)) {
      matchedEvents.push({
        ...event,
        spatialMatch: true,
        distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
        isCurrentlyActive,
        isUpcoming,
        minutesUntilImpact: targetMinute < startMin ? Math.max(0, startMin - targetMinute) : 0,
        dataState: 'PLANNED_EVENT',
      });
    }
  }

  return matchedEvents;
}

/**
 * Correlates planned events with live traffic anomaly signals.
 *
 * Rules:
 * - If event exists + route overlap + live traffic anomaly exists:
 *     Strong event-linked disruption explanation (`disruptionConfidence: HIGH`, `causeConfidence: HIGH`).
 * - If event exists + route overlap, but NO traffic anomaly exists yet:
 *     `POSSIBLE_EVENT_IMPACT` (proactive warning: `disruptionConfidence: MEDIUM`, `causeConfidence: HIGH`).
 *
 * @param {Object} input
 * @param {Object} input.trafficAnomaly - Result from detectTrafficAnomaly
 * @param {Array<number>} [input.coords] - Current/Target coordinates
 * @param {string} [input.corridorName] - Name of corridor
 * @param {number} [input.targetMinute] - Expected traverse minute
 * @param {Array<Object>} [input.customEvents] - Injected events
 * @returns {Object} Correlation result
 */
function correlateEventWithTraffic({
  trafficAnomaly = {},
  coords = null,
  corridorName = null,
  targetMinute = 720,
  customEvents = null,
} = {}) {
  const events = queryPlannedEvents({
    coords,
    corridorName,
    targetMinute,
    customEvents,
  });

  if (events.length === 0) {
    return {
      hasCorrelatedEvent: false,
      event: null,
      correlationType: 'NO_EVENT_FOUND',
      trafficObservedState: trafficAnomaly.isDisruption ? EVENT_STATES.TRAFFIC_IMPACT_OBSERVED : 'NO_ANOMALY_OBSERVED',
      causalState: 'NO_EVENT_FOUND',
      causeConfidence: 'LOW',
    };
  }

  const primaryEvent = events[0];
  const hasTrafficDisruption = Boolean(trafficAnomaly.isDisruption);

  if (hasTrafficDisruption && (primaryEvent.isCurrentlyActive || primaryEvent.isUpcoming)) {
    return {
      hasCorrelatedEvent: true,
      event: primaryEvent,
      correlationType: 'CONFIRMED_EVENT_CONGESTION',
      trafficObservedState: EVENT_STATES.TRAFFIC_IMPACT_OBSERVED,
      causalState: EVENT_STATES.EVENT_CAUSED_TRAFFIC,
      causeConfidence: 'HIGH',
      disruptionConfidence: 'HIGH',
      dataState: 'LIVE_OBSERVED_DISRUPTION',
      explanation: `Observed corridor delay matches scheduled ${primaryEvent.name} at ${primaryEvent.location?.name || 'event venue'}.`,
    };
  }

  if (primaryEvent.isUpcoming) {
    return {
      hasCorrelatedEvent: true,
      event: primaryEvent,
      correlationType: 'UPCOMING_EVENT_RISK',
      trafficObservedState: 'NO_ANOMALY_OBSERVED',
      causalState: EVENT_STATES.EVENT_SCHEDULED,
      causeConfidence: 'HIGH',
      disruptionConfidence: 'MEDIUM',
      dataState: 'PLANNED_EVENT',
      explanation: `Upcoming ${primaryEvent.name} scheduled for ${primaryEvent.startTime} will affect planned corridor traversal; corridor currently flows without confirmed disruption.`,
    };
  }

  return {
    hasCorrelatedEvent: true,
    event: primaryEvent,
    correlationType: 'PLANNED_EVENT_ADVISORY',
    trafficObservedState: 'NO_ANOMALY_OBSERVED',
    causalState: EVENT_STATES.EVENT_SCHEDULED,
    causeConfidence: 'MEDIUM',
    disruptionConfidence: 'LOW',
    dataState: 'PLANNED_EVENT',
    explanation: `${primaryEvent.name} is active in area catalog, though live corridor telemetry does not reflect bottleneck.`,
  };
}

module.exports = {
  EVENT_TYPES,
  SOURCE_CLASSIFICATIONS,
  EVENT_STATES,
  CANONICAL_PLANNED_EVENTS,
  queryPlannedEvents,
  correlateEventWithTraffic,
};
