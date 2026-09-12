'use strict';

/**
 * services/travelIntelligence/tourismPoi/coordinateIntegrity.js
 *
 * Provides comprehensive coordinate validation, Indian bounding box checks,
 * swapped coordinate auto-correction, Null Island rejection, and city radius verification.
 */

const { distKm } = require('../../../utils/geo');
const { normalizeAndValidateCoords } = require('../../routing/coordinateValidator');

// Primary Indian geographic bounding box
const INDIA_GEO_BOUNDS = {
  minLat: 6.5,
  maxLat: 37.5,
  minLon: 68.0,
  maxLon: 97.5,
};

// Known city center centroids for sanity checks
const CITY_CENTROIDS = {
  visakhapatnam: { lat: 17.72, lon: 83.30, maxRadiusKm: 95 },
  vizag: { lat: 17.72, lon: 83.30, maxRadiusKm: 95 },
  hyderabad: { lat: 17.385, lon: 78.486, maxRadiusKm: 75 },
  bengaluru: { lat: 12.9716, lon: 77.5946, maxRadiusKm: 60 },
  bangalore: { lat: 12.9716, lon: 77.5946, maxRadiusKm: 60 },
  mumbai: { lat: 18.96, lon: 72.82, maxRadiusKm: 85 },
  delhi: { lat: 28.6139, lon: 77.2090, maxRadiusKm: 55 },
  jaipur: { lat: 26.9124, lon: 75.7873, maxRadiusKm: 45 },
  goa: { lat: 15.2993, lon: 74.1240, maxRadiusKm: 70 },
  chennai: { lat: 13.0827, lon: 80.2707, maxRadiusKm: 60 },
  madras: { lat: 13.0827, lon: 80.2707, maxRadiusKm: 60 },
  kochi: { lat: 9.965, lon: 76.25, maxRadiusKm: 60 },
  cochin: { lat: 9.965, lon: 76.25, maxRadiusKm: 60 },
  paderu: { lat: 18.0833, lon: 82.6667, maxRadiusKm: 65 },
  araku: { lat: 18.0833, lon: 82.6667, maxRadiusKm: 65 },
  lambasingi: { lat: 18.0833, lon: 82.6667, maxRadiusKm: 65 },
  tirupati: { lat: 13.6288, lon: 79.4192, maxRadiusKm: 55 },
  tirumala: { lat: 13.6833, lon: 79.3472, maxRadiusKm: 45 },
  vijayawada: { lat: 16.5062, lon: 80.6480, maxRadiusKm: 75 },
  bezawada: { lat: 16.5062, lon: 80.6480, maxRadiusKm: 75 },
  kolkata: { lat: 22.5726, lon: 88.3639, maxRadiusKm: 50 },
  pune: { lat: 18.5204, lon: 73.8567, maxRadiusKm: 50 },
  udaipur: { lat: 24.5854, lon: 73.7125, maxRadiusKm: 50 },
  agra: { lat: 27.1767, lon: 78.0081, maxRadiusKm: 50 },
  varanasi: { lat: 25.3176, lon: 82.9739, maxRadiusKm: 50 },
  mysore: { lat: 12.2958, lon: 76.6394, maxRadiusKm: 50 },
  mysuru: { lat: 12.2958, lon: 76.6394, maxRadiusKm: 50 },
  munnar: { lat: 10.0889, lon: 77.0595, maxRadiusKm: 50 },
};

/**
 * Validates a coordinate pair for production correctness.
 *
 * @param {number|string} rawLat
 * @param {number|string} rawLon
 * @param {Object} [options]
 * @param {string} [options.cityHint]
 * @param {string} [options.category]
 * @returns {{ valid: boolean, lat: number|null, lon: number|null, wasSwapped: boolean, reason?: string, confidence: number }}
 */
function validatePoiCoordinates(rawLat, rawLon, options = {}) {
  const norm = normalizeAndValidateCoords({ lat: rawLat, lon: rawLon });

  if (!norm.valid || norm.lat === null || norm.lon === null) {
    return {
      valid: false,
      lat: null,
      lon: null,
      wasSwapped: false,
      reason: 'INVALID_NUMERIC_COORDINATES',
      confidence: 0,
    };
  }

  const { lat, lon, wasSwapped } = norm;

  // 1. Indian boundary check
  const isWithinIndia = (
    lat >= INDIA_GEO_BOUNDS.minLat && lat <= INDIA_GEO_BOUNDS.maxLat &&
    lon >= INDIA_GEO_BOUNDS.minLon && lon <= INDIA_GEO_BOUNDS.maxLon
  );

  if (!isWithinIndia) {
    return {
      valid: false,
      lat,
      lon,
      wasSwapped,
      reason: 'OUTSIDE_INDIA_BOUNDS',
      confidence: 10,
    };
  }

  // 2. City proximity check (if cityHint provided)
  const cityKey = String(options.cityHint || '').toLowerCase().trim();
  const centroid = CITY_CENTROIDS[cityKey];

  if (centroid) {
    const dKm = distKm(centroid.lat, centroid.lon, lat, lon);
    const maxAllowed = options.category === 'food' ? Math.min(25, centroid.maxRadiusKm) : centroid.maxRadiusKm;

    if (dKm > maxAllowed) {
      return {
        valid: false,
        lat,
        lon,
        wasSwapped,
        reason: `EXCEEDS_CITY_RADIUS (${Math.round(dKm)}km > ${maxAllowed}km)`,
        confidence: 25,
      };
    }
  }

  // 3. Coastal water / offshore check
  if (isOffshoreOrWaterCoordinate(lat, lon, cityKey)) {
    return {
      valid: false,
      lat,
      lon,
      wasSwapped,
      reason: 'OFFSHORE_WATER_COORDINATES',
      confidence: 0,
    };
  }

  // 4. Coordinate precision check (must have at least 3 decimal places for tourism accuracy)
  const latDecimals = (String(rawLat).split('.')[1] || '').length;
  const lonDecimals = (String(rawLon).split('.')[1] || '').length;
  const precisionConfidence = (latDecimals >= 4 && lonDecimals >= 4) ? 100 : (latDecimals >= 3 ? 85 : 60);

  return {
    valid: true,
    lat,
    lon,
    wasSwapped,
    confidence: wasSwapped ? Math.min(80, precisionConfidence) : precisionConfidence,
  };
}

/**
 * Detects coordinates located offshore in the sea or ocean for coastal cities.
 */
function isOffshoreOrWaterCoordinate(lat, lon, cityHint = '') {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  const city = String(cityHint || '').toLowerCase().trim();

  // Visakhapatnam / Vizag coastal water boundary (Bay of Bengal is to the East)
  if (city === 'visakhapatnam' || city === 'vizag') {
    if (lat < 17.65 && lon > 83.275) return true;
    if (lat >= 17.65 && lat < 17.68 && lon > 83.298) return true;
    if (lat >= 17.68 && lat < 17.705 && lon > 83.305) return true;
    if (lat >= 17.705 && lat < 17.725 && lon > 83.3312) return true;
    if (lat >= 17.725 && lat < 17.740 && lon > 83.3445) return true;
    if (lat >= 17.740 && lat < 17.755 && lon > 83.3515) return true;
    if (lat >= 17.755 && lat < 17.770 && lon > 83.3685) return true;
    if (lat >= 17.770 && lat < 17.790 && lon > 83.3880) return true;
    if (lat >= 17.790 && lat < 17.840 && lon > 83.4210) return true;
    if (lat >= 17.840 && lat < 17.870 && lon > 83.4390) return true;
    if (lat >= 17.870 && lat < 17.885 && lon > 83.4380) return true;
    if (lat >= 17.885 && lat < 17.910 && lon > 83.4560) return true;
  }

  // Mumbai (Arabian Sea to the West)
  if (city === 'mumbai' || city === 'bombay') {
    if (lat >= 18.85 && lat <= 19.30 && lon < 72.78) return true;
  }

  // Chennai (Bay of Bengal to the East)
  if (city === 'chennai' || city === 'madras') {
    if (lat >= 12.95 && lat <= 13.15 && lon > 80.290) return true;
  }

  return false;
}

/**
 * Checks whether a candidate coordinate is within acceptable tolerance of a ground-truth point.
 *
 * @param {[number, number]} candidateCoords - [lat, lon]
 * @param {[number, number]} goldenCoords - [lat, lon]
 * @param {number} [toleranceMeters=800]
 * @returns {{ withinTolerance: boolean, distanceMeters: number }}
 */
function checkCoordinateTolerance(candidateCoords, goldenCoords, toleranceMeters = 800) {
  if (!candidateCoords || !goldenCoords || candidateCoords.length < 2 || goldenCoords.length < 2) {
    return { withinTolerance: false, distanceMeters: Infinity };
  }

  const dKm = distKm(candidateCoords[0], candidateCoords[1], goldenCoords[0], goldenCoords[1]);
  const distanceMeters = Math.round(dKm * 1000);

  return {
    withinTolerance: distanceMeters <= toleranceMeters,
    distanceMeters,
  };
}

module.exports = {
  INDIA_GEO_BOUNDS,
  CITY_CENTROIDS,
  validatePoiCoordinates,
  checkCoordinateTolerance,
  isOffshoreOrWaterCoordinate,
};
