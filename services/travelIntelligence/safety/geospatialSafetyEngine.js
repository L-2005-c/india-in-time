'use strict';

/**
 * services/travelIntelligence/safety/geospatialSafetyEngine.js
 *
 * Geospatial Safety Engine for India In-Time v3.0.
 *
 * Evaluates spatial relationship between safety hazards and:
 * - Current stop location
 * - Route transit segments
 * - Upcoming destinations
 * - Return route
 */

const { distKm } = require('../../../utils/geo');

const EXPOSURE_LEVELS = Object.freeze({
  NONE: 'NONE',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  DIRECT_INTERSECTION: 'DIRECT_INTERSECTION',
});

/**
 * Evaluates spatial hazard exposure against a journey state.
 */
function evaluateGeospatialExposure({
  signal = {},
  journeyState = {},
  stops = [],
} = {}) {
  const hazardCoords = signal.location?.coords;
  const radiusKm = (Number(signal.radiusMeters) || 5000) / 1000;
  const candidateStops = stops.length > 0 ? stops : (journeyState.stops || []);

  // If no geographic coordinates for hazard, check named corridor overlap
  if (!hazardCoords || !Array.isArray(hazardCoords) || hazardCoords.length < 2) {
    const corridorName = signal.affectedArea || signal.corridor || signal.location?.name || '';
    const matchesCorridor = candidateStops.some(s => {
      const sName = (s.name || '').toLowerCase();
      const cName = corridorName.toLowerCase();
      return cName && (sName.includes(cName) || cName.includes(sName));
    });

    return {
      exposureLevel: matchesCorridor ? EXPOSURE_LEVELS.HIGH : EXPOSURE_LEVELS.LOW,
      closestStop: null,
      minDistanceKm: matchesCorridor ? 2 : 50,
      isDirectRouteIntersection: matchesCorridor,
      affectedStops: matchesCorridor ? candidateStops.map(s => s.name) : [],
      affectedSegment: corridorName || 'Route Corridor',
    };
  }

  const [hLat, hLon] = hazardCoords;
  let minDistanceKm = Infinity;
  let closestStop = null;
  const exposedStops = [];

  for (const s of candidateStops) {
    if (s.status === 'COMPLETED') continue; // Completed stops are historical, not future exposure
    if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) {
      const d = distKm(hLat, hLon, s.lat, s.lon);
      if (d < minDistanceKm) {
        minDistanceKm = d;
        closestStop = s;
      }
      if (d <= radiusKm * 1.5) {
        exposedStops.push(s);
      }
    }
  }

  let exposureLevel = EXPOSURE_LEVELS.NONE;
  const isDirectRouteIntersection = minDistanceKm <= radiusKm;

  if (isDirectRouteIntersection) {
    exposureLevel = EXPOSURE_LEVELS.DIRECT_INTERSECTION;
  } else if (minDistanceKm <= 12) {
    exposureLevel = EXPOSURE_LEVELS.HIGH;
  } else if (minDistanceKm <= 25) {
    exposureLevel = EXPOSURE_LEVELS.MODERATE;
  } else if (minDistanceKm <= 45) {
    exposureLevel = EXPOSURE_LEVELS.LOW;
  } else {
    exposureLevel = EXPOSURE_LEVELS.NONE;
  }

  const affectedSegment = closestStop ? `Corridor near ${closestStop.name}` : signal.affectedArea;

  return {
    exposureLevel,
    closestStop: closestStop ? { id: closestStop.id, name: closestStop.name } : null,
    minDistanceKm: Number.isFinite(minDistanceKm) ? Math.round(minDistanceKm * 10) / 10 : null,
    isDirectRouteIntersection,
    affectedStops: exposedStops.map(s => s.name),
    affectedSegment,
  };
}

module.exports = {
  EXPOSURE_LEVELS,
  evaluateGeospatialExposure,
};
