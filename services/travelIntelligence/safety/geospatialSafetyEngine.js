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
 *
 * Implements:
 * - Precise CAP polygon ray-casting intersection
 * - CAP circle geometry matching
 * - Canonical relationships: DIRECT_ROUTE_INTERSECTION, NEAR_ROUTE, NEAR_STOP, OUTSIDE_JOURNEY
 */

const { distKm } = require('../../../utils/geo');

const EXPOSURE_LEVELS = Object.freeze({
  NONE: 'NONE',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  DIRECT_INTERSECTION: 'DIRECT_INTERSECTION',
});

const GEOSPATIAL_RELATIONSHIPS = Object.freeze({
  DIRECT_ROUTE_INTERSECTION: 'DIRECT_ROUTE_INTERSECTION',
  NEAR_STOP: 'NEAR_STOP',
  NEAR_ROUTE: 'NEAR_ROUTE',
  OUTSIDE_JOURNEY: 'OUTSIDE_JOURNEY',
});

/**
 * Tests if a coordinate [lat, lon] is inside a polygon using ray-casting.
 * @param {[number, number]} point - [lat, lon]
 * @param {Array<[number, number]>} vs - Array of [lat, lon] polygon vertices
 */
function isPointInPolygon(point, vs) {
  if (!point || !Array.isArray(vs) || vs.length < 3) return false;
  const [x, y] = point; // x=lat, y=lon
  let inside = false;

  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0];
    const yi = vs[i][1];
    const xj = vs[j][0];
    const yj = vs[j][1];

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Parses CAP polygon string e.g. "18.23,82.91 18.28,82.95 18.25,83.00 18.23,82.91"
 */
function parseCapPolygon(polyStr) {
  if (!polyStr || typeof polyStr !== 'string') return null;
  const pairs = polyStr.trim().split(/\s+/);
  const vertices = [];

  for (const pair of pairs) {
    const parts = pair.split(',').map(p => parseFloat(p.trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      vertices.push([parts[0], parts[1]]);
    }
  }

  return vertices.length >= 3 ? vertices : null;
}

/**
 * Parses CAP circle string e.g. "18.23,82.91 15.0" (lat,lon radius_km)
 */
function parseCapCircle(circleStr) {
  if (!circleStr || typeof circleStr !== 'string') return null;
  const parts = circleStr.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const latLon = parts[0].split(',').map(p => parseFloat(p.trim()));
  const radiusKm = parseFloat(parts[1]);

  if (latLon.length === 2 && Number.isFinite(latLon[0]) && Number.isFinite(latLon[1]) && Number.isFinite(radiusKm)) {
    return { lat: latLon[0], lon: latLon[1], radiusKm };
  }

  return null;
}

/**
 * Evaluates spatial hazard exposure against a journey state.
 */
function evaluateGeospatialExposure({
  signal = {},
  journeyState = {},
  stops = [],
} = {}) {
  const candidateStops = stops.length > 0 ? stops : (journeyState.stops || []);
  const activeStops = candidateStops.filter(s => s.status !== 'COMPLETED');
  const polygonVertices = parseCapPolygon(signal.polygon || signal.geometry?.polygon);
  const circleGeom = parseCapCircle(signal.circle || signal.geometry?.circle);

  // 1. Polygon Geometry Matching (Priority over distance when available)
  if (polygonVertices) {
    const intersectingStops = [];
    for (const s of activeStops) {
      if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) {
        if (isPointInPolygon([s.lat, s.lon], polygonVertices)) {
          intersectingStops.push(s);
        }
      }
    }

    if (intersectingStops.length > 0) {
      return {
        exposureLevel: EXPOSURE_LEVELS.DIRECT_INTERSECTION,
        relationship: GEOSPATIAL_RELATIONSHIPS.DIRECT_ROUTE_INTERSECTION,
        closestStop: { id: intersectingStops[0].id, name: intersectingStops[0].name },
        minDistanceKm: 0,
        isDirectRouteIntersection: true,
        affectedStops: intersectingStops.map(s => s.name),
        affectedSegment: `Hazard Polygon Intersecting ${intersectingStops[0].name}`,
        geometryType: 'POLYGON',
      };
    }
  }

  // 2. Coordinate & Circle Distance Matching
  const hazardCoords = circleGeom
    ? [circleGeom.lat, circleGeom.lon]
    : (signal.location?.coords || null);

  const radiusKm = circleGeom
    ? circleGeom.radiusKm
    : ((Number(signal.radiusMeters) || 5000) / 1000);

  // If no geographic coordinates for hazard, check named corridor overlap
  if (!hazardCoords || !Array.isArray(hazardCoords) || hazardCoords.length < 2) {
    const corridorName = signal.affectedArea || signal.corridor || signal.location?.name || '';
    const matchesCorridor = activeStops.some(s => {
      const sName = (s.name || '').toLowerCase();
      const cName = corridorName.toLowerCase();
      return cName && (sName.includes(cName) || cName.includes(sName));
    });

    return {
      exposureLevel: matchesCorridor ? EXPOSURE_LEVELS.HIGH : EXPOSURE_LEVELS.LOW,
      relationship: matchesCorridor ? GEOSPATIAL_RELATIONSHIPS.NEAR_ROUTE : GEOSPATIAL_RELATIONSHIPS.OUTSIDE_JOURNEY,
      closestStop: null,
      minDistanceKm: matchesCorridor ? 2 : 50,
      isDirectRouteIntersection: matchesCorridor,
      affectedStops: matchesCorridor ? activeStops.map(s => s.name) : [],
      affectedSegment: corridorName || 'Route Corridor',
      geometryType: 'NAMED_AREA',
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
  let relationship = GEOSPATIAL_RELATIONSHIPS.OUTSIDE_JOURNEY;
  const isDirectRouteIntersection = minDistanceKm <= radiusKm;

  if (isDirectRouteIntersection) {
    exposureLevel = EXPOSURE_LEVELS.DIRECT_INTERSECTION;
    relationship = GEOSPATIAL_RELATIONSHIPS.DIRECT_ROUTE_INTERSECTION;
  } else if (minDistanceKm <= 5) {
    exposureLevel = EXPOSURE_LEVELS.HIGH;
    relationship = GEOSPATIAL_RELATIONSHIPS.NEAR_STOP;
  } else if (minDistanceKm <= 12) {
    exposureLevel = EXPOSURE_LEVELS.HIGH;
    relationship = GEOSPATIAL_RELATIONSHIPS.NEAR_ROUTE;
  } else if (minDistanceKm <= 25) {
    exposureLevel = EXPOSURE_LEVELS.MODERATE;
    relationship = GEOSPATIAL_RELATIONSHIPS.NEAR_ROUTE;
  } else if (minDistanceKm <= 45) {
    exposureLevel = EXPOSURE_LEVELS.LOW;
    relationship = GEOSPATIAL_RELATIONSHIPS.OUTSIDE_JOURNEY;
  } else {
    exposureLevel = EXPOSURE_LEVELS.NONE;
    relationship = GEOSPATIAL_RELATIONSHIPS.OUTSIDE_JOURNEY;
  }

  const affectedSegment = closestStop ? `Corridor near ${closestStop.name}` : signal.affectedArea;

  return {
    exposureLevel,
    relationship,
    closestStop: closestStop ? { id: closestStop.id, name: closestStop.name } : null,
    minDistanceKm: Number.isFinite(minDistanceKm) ? Math.round(minDistanceKm * 10) / 10 : null,
    isDirectRouteIntersection,
    affectedStops: exposedStops.map(s => s.name),
    affectedSegment,
    geometryType: circleGeom ? 'CIRCLE' : 'POINT_RADIUS',
  };
}

module.exports = {
  EXPOSURE_LEVELS,
  GEOSPATIAL_RELATIONSHIPS,
  isPointInPolygon,
  parseCapPolygon,
  parseCapCircle,
  evaluateGeospatialExposure,
};
