// utils/geo.js — Shared geospatial utilities
// Extracted from routes/places.js to avoid duplication.

/**
 * Haversine distance between two lat/lon points in kilometres.
 */
function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * India bounding box (generous, includes border areas).
 * lat: 6°N – 37°N,  lon: 68°E – 98°E
 */
const INDIA_BOUNDS = {
  minLat: 6,    maxLat: 37,
  minLon: 68,   maxLon: 98,
};

/**
 * Check if a lat/lon falls roughly within India.
 */
function isInIndia(lat, lon) {
  return (
    lat >= INDIA_BOUNDS.minLat && lat <= INDIA_BOUNDS.maxLat &&
    lon >= INDIA_BOUNDS.minLon && lon <= INDIA_BOUNDS.maxLon
  );
}

/**
 * Check if lat/lon are valid numeric coordinates.
 */
function isValidCoords(lat, lon) {
  return (
    typeof lat === 'number' && typeof lon === 'number' &&
    !Number.isNaN(lat) && !Number.isNaN(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

/**
 * Find closest place from a list to a given coordinate.
 * Each place must have a .coords = [lat, lon] property.
 */
function findClosest(fromLat, fromLon, places) {
  let best = { place: null, distKm: Infinity };
  for (const p of places) {
    if (!p?.coords?.length) continue;
    const d = distKm(fromLat, fromLon, p.coords[0], p.coords[1]);
    if (d < best.distKm) best = { place: p, distKm: d };
  }
  return best;
}

module.exports = { distKm, INDIA_BOUNDS, isInIndia, isValidCoords, findClosest };
