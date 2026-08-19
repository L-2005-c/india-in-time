'use strict';

/**
 * tourismDataValidator.js
 * Validates candidate structural integrity, coordinates, opening/closing hour formats,
 * visit durations, and data sanity before itinerary consideration.
 */

const { distKm } = require('../../../utils/geo');

/**
 * Validates a tourism candidate's data fields.
 * @param {object} candidate - Place candidate to validate
 * @param {object} [context] - Context with city coordinates and bounding radius
 * @returns {{ isValid: boolean, errors: string[] }}
 */
function validateTourismData(candidate = {}, context = {}) {
  const errors = [];
  const name = String(candidate.name || '').trim();

  // 1. Name validation
  if (!name || name.length < 2) {
    errors.push('Place name is missing or too short');
  }
  if (/^(\d+|\W+)$/.test(name)) {
    errors.push('Place name is purely numeric or special characters');
  }

  // 2. Coordinate validation
  if (candidate.coords != null) {
    if (!Array.isArray(candidate.coords) || candidate.coords.length < 2) {
      errors.push('Invalid coords format (expected [lat, lon])');
    } else {
      const [lat, lon] = candidate.coords.map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        errors.push(`Coordinates out of bounds: [${lat}, ${lon}]`);
      } else if (context.cityLat != null && context.cityLon != null) {
        const maxDistKm = Number(context.maxRadiusKm) || 75;
        const d = distKm(context.cityLat, context.cityLon, lat, lon);
        if (d > maxDistKm) {
          errors.push(`Place is too far from city center (${Math.round(d)} km > max ${maxDistKm} km)`);
        }
      }
    }
  }

  // 3. Opening hours validation
  const timeFormat = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (candidate.ot && !timeFormat.test(String(candidate.ot).trim())) {
    errors.push(`Invalid opening time format: "${candidate.ot}" (expected HH:MM)`);
  }
  if (candidate.ct && !timeFormat.test(String(candidate.ct).trim())) {
    errors.push(`Invalid closing time format: "${candidate.ct}" (expected HH:MM)`);
  }

  // 4. Visit duration validation
  if (candidate.vt != null || candidate.visit_minutes != null) {
    const vt = Number(candidate.vt ?? candidate.visit_minutes);
    if (!Number.isFinite(vt) || vt < 10 || vt > 480) {
      errors.push(`Implausible visit duration: ${vt} minutes (expected 10-480 min)`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateTourismData,
};
