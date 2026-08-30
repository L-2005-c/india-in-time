'use strict';

/**
 * services/travelIntelligence/tourismPoi/canonicalPlaceModel.js
 *
 * Defines the authoritative Canonical Tourist Place model and data-quality score.
 * Enforces unified representations across Search, Map, Routing, and Itinerary optimizer.
 */

const { isValidCoordPair } = require('../../routing/coordinateValidator');

/**
 * Creates a Canonical Tourist Place record.
 *
 * @param {Object} params
 * @returns {CanonicalTouristPlace}
 */
function createCanonicalPlace({
  id,
  canonicalName,
  displayName,
  aliases = [],
  category = 'scenic',
  latitude,
  longitude,
  address = null,
  city = 'Unknown',
  state = 'Unknown',
  country = 'India',
  tourismStatus = 'VERIFIED_ATTRACTION',
  coordinateSource = 'AUTHORITATIVE_SURVEY',
  nameSource = 'CURATED_WHITELIST',
  verificationStatus = 'VERIFIED',
  confidence = 95,
  openingHours = null,
  visitMinutes = 60,
  importance = 'famous',
  rating = 4.5,
  isSunriseSpot = false,
  isSunsetSpot = false,
  indoorOutdoor = 'mixed',
  updatedAt = new Date().toISOString(),
}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const validCoords = isValidCoordPair(lat, lon);

  const cleanCanonicalName = String(canonicalName || displayName || 'Unnamed Destination').trim();
  const cleanDisplayName = String(displayName || cleanCanonicalName).trim();
  const normalizedAliases = Array.isArray(aliases)
    ? [...new Set(aliases.map(a => String(a || '').trim()).filter(Boolean))]
    : [];

  const qualityScore = calculatePlaceDataQuality({
    canonicalName: cleanCanonicalName,
    latitude: lat,
    longitude: lon,
    category,
    city,
    coordinateSource,
    verificationStatus,
    updatedAt,
  });

  return {
    id: id || generateDeterministicPlaceId(city, cleanCanonicalName),
    canonicalName: cleanCanonicalName,
    displayName: cleanDisplayName,
    aliases: normalizedAliases,
    category,
    latitude: validCoords ? Math.round(lat * 1e6) / 1e6 : null,
    longitude: validCoords ? Math.round(lon * 1e6) / 1e6 : null,
    coords: validCoords ? [Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6] : null,
    address: address && typeof address === 'object' ? {
      area: address.area || '',
      city: address.city || city,
      district: address.district || '',
      state: address.state || state,
      country: address.country || country,
    } : {
      area: '',
      city,
      district: '',
      state,
      country,
    },
    city,
    state,
    country,
    tourismStatus,
    coordinateSource,
    nameSource,
    verificationStatus: validCoords ? verificationStatus : 'INVALID_COORDINATES',
    confidence: validCoords ? confidence : null,
    qualityScore,
    openingHours: openingHours || { openTime: '06:00', closeTime: '20:00' },
    visitMinutes: Number(visitMinutes) || 60,
    importance,
    rating: Number(rating) || 4.5,
    isSunriseSpot: Boolean(isSunriseSpot),
    isSunsetSpot: Boolean(isSunsetSpot),
    indoorOutdoor,
    updatedAt,
  };
}

/**
 * Calculates a dedicated Data Quality Score (0-100) separate from user recommendation rank.
 */
function calculatePlaceDataQuality({
  canonicalName,
  latitude,
  longitude,
  category,
  city,
  coordinateSource,
  verificationStatus: _verificationStatus,
  updatedAt,
}) {
  // 1. Name validity
  let nameValidity = 100;
  if (!canonicalName || canonicalName.length < 3) nameValidity = 20;
  else if (/\b(colony|nagar|layout|ward|suburb|junction|street)\b/i.test(canonicalName)) nameValidity = 40;
  else if (canonicalName.length > 80) nameValidity = 70;

  // 2. Coordinate validity
  let coordinateValidity = 100;
  if (!isValidCoordPair(latitude, longitude)) {
    coordinateValidity = 0;
  } else if (latitude < 6.0 || latitude > 38.0 || longitude < 68.0 || longitude > 98.0) {
    coordinateValidity = 10; // Outside India bounds
  }

  // 3. Category validity
  const validCategories = new Set(['scenic', 'temple', 'beach', 'food', 'shopping', 'museum', 'park', 'heritage', 'monument', 'viewpoint', 'zoo', 'aquarium', 'wildlife', 'entertainment', 'trekking']);
  const categoryValidity = validCategories.has(category) ? 100 : 50;

  // 4. City match
  const cityMatch = (city && city !== 'Unknown') ? 100 : 50;

  // 5. Source quality
  let sourceQuality = 70;
  if (coordinateSource === 'AUTHORITATIVE_SURVEY') sourceQuality = 100;
  else if (coordinateSource === 'CURATED_WHITELIST') sourceQuality = 95;
  else if (coordinateSource === 'HIGH_CONFIDENCE_GEOCODER') sourceQuality = 85;
  else if (coordinateSource === 'HEURISTIC_FALLBACK') sourceQuality = 40;

  // 6. Freshness (decay over 180 days)
  let freshness = 95;
  if (updatedAt) {
    const ageMs = Date.now() - new Date(updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    freshness = Math.max(50, Math.round(100 - Math.min(50, ageDays * 0.2)));
  }

  const overall = Math.round(
    nameValidity * 0.25 +
    coordinateValidity * 0.25 +
    categoryValidity * 0.15 +
    cityMatch * 0.10 +
    sourceQuality * 0.15 +
    freshness * 0.10
  );

  return {
    nameValidity,
    coordinateValidity,
    categoryValidity,
    cityMatch,
    sourceQuality,
    freshness,
    overall,
  };
}

/**
 * Deterministically generates a URL/system-safe place ID.
 */
function generateDeterministicPlaceId(city, name) {
  const c = String(city || 'in').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const n = String(name || 'place').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${c}_${n}`;
}

module.exports = {
  createCanonicalPlace,
  calculatePlaceDataQuality,
  generateDeterministicPlaceId,
};
