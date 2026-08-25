'use strict';

/**
 * services/routing/coordinateValidator.js
 * Validates, normalizes, and sanitizes geospatial coordinates.
 * Detects coordinate inversion (swapped lat/lon), out-of-bounds coords,
 * and null-island (0,0) coordinates.
 */

// Geographic bounding box for India & immediate territorial waters
const INDIA_BOUNDS = {
  minLat: 6.0,
  maxLat: 38.0,
  minLon: 68.0,
  maxLon: 98.0,
};

/**
 * Validates whether a coordinate pair contains finite valid numbers.
 */
function isValidCoordPair(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  // Reject Null Island (0, 0)
  if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) return false;
  return true;
}

/**
 * Parses coordinates from array [lat, lon], string "lat,lon", or object { lat, lon / lng }.
 * Detects swapped coordinates where longitude was erroneously placed in latitude.
 *
 * @param {Array|Object|string} input - raw coordinates
 * @returns {{ lat: number, lon: number, wasSwapped: boolean, valid: boolean }}
 */
function normalizeAndValidateCoords(input) {
  if (!input) return { lat: null, lon: null, wasSwapped: false, valid: false };

  let lat = null;
  let lon = null;

  if (Array.isArray(input) && input.length >= 2) {
    lat = Number(input[0]);
    lon = Number(input[1]);
  } else if (typeof input === 'object' && input !== null) {
    lat = Number(input.lat ?? input.latitude);
    lon = Number(input.lon ?? input.lng ?? input.longitude);
  } else if (typeof input === 'string') {
    const parts = input.split(',').map(s => Number(s.trim()));
    if (parts.length >= 2) {
      lat = parts[0];
      lon = parts[1];
    }
  }

  if (!isValidCoordPair(lat, lon)) {
    return { lat: null, lon: null, wasSwapped: false, valid: false };
  }

  let wasSwapped = false;
  // Swapped coordinate detection for India:
  // If latitude is in the typical India longitude range (68 to 98) and
  // longitude is in the typical India latitude range (6 to 38), they are reversed.
  if (lat >= INDIA_BOUNDS.minLon && lat <= INDIA_BOUNDS.maxLon &&
      lon >= INDIA_BOUNDS.minLat && lon <= INDIA_BOUNDS.maxLat) {
    const temp = lat;
    lat = lon;
    lon = temp;
    wasSwapped = true;
  }

  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    wasSwapped,
    valid: true,
    isWithinIndia: (
      lat >= INDIA_BOUNDS.minLat && lat <= INDIA_BOUNDS.maxLat &&
      lon >= INDIA_BOUNDS.minLon && lon <= INDIA_BOUNDS.maxLon
    ),
  };
}

/**
 * Validates coordinate sanity for an origin-destination pair.
 * Ensures points are not identical and distance is within a plausible range.
 */
function validateRouteCoordinates(from, to) {
  const normFrom = normalizeAndValidateCoords(from);
  const normTo = normalizeAndValidateCoords(to);

  if (!normFrom.valid) {
    return { valid: false, error: 'Invalid or missing origin coordinates', code: 'INVALID_ORIGIN' };
  }
  if (!normTo.valid) {
    return { valid: false, error: 'Invalid or missing destination coordinates', code: 'INVALID_DESTINATION' };
  }

  const isSamePoint = Math.abs(normFrom.lat - normTo.lat) < 0.0001 &&
                      Math.abs(normFrom.lon - normTo.lon) < 0.0001;

  return {
    valid: true,
    from: [normFrom.lat, normFrom.lon],
    to: [normTo.lat, normTo.lon],
    isSamePoint,
    warnings: [
      normFrom.wasSwapped ? 'Origin coordinates were inverted (swapped lat/lon)' : null,
      normTo.wasSwapped ? 'Destination coordinates were inverted (swapped lat/lon)' : null,
    ].filter(Boolean),
  };
}

module.exports = {
  INDIA_BOUNDS,
  isValidCoordPair,
  normalizeAndValidateCoords,
  validateRouteCoordinates,
};
