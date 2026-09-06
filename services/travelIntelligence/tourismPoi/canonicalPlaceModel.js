'use strict';

/**
 * services/travelIntelligence/tourismPoi/canonicalPlaceModel.js
 *
 * Defines the authoritative Canonical Tourist Place model and data-quality score.
 * Enforces unified representations across Search, Map, Routing, and Itinerary optimizer.
 */

const { isValidCoordPair } = require('../../routing/coordinateValidator');

const VERIFICATION_STATUSES = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  CANDIDATE: 'CANDIDATE',
  AUTO_VALIDATED: 'AUTO_VALIDATED',
  PROVIDER_VERIFIED: 'PROVIDER_VERIFIED',
  HUMAN_VERIFIED: 'HUMAN_VERIFIED',
  QUARANTINED: 'QUARANTINED',
  REJECTED: 'REJECTED',
  // Backwards compatibility mappings
  VERIFIED: 'VERIFIED',
  INVALID_COORDINATES: 'REJECTED',
});

const COORDINATE_SOURCES = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  PROVIDER: 'PROVIDER',
  CURATED_REFERENCE: 'CURATED_REFERENCE',
  CROSS_PROVIDER_CONSENSUS: 'CROSS_PROVIDER_CONSENSUS',
  HUMAN_VERIFIED: 'HUMAN_VERIFIED',
  USER_SUBMITTED: 'USER_SUBMITTED',
  // Backwards compatibility mappings
  AUTHORITATIVE_SURVEY: 'AUTHORITATIVE_SURVEY',
  CURATED_BENCHMARK: 'AUTHORITATIVE_SURVEY',
  CURATED_WHITELIST: 'CURATED_WHITELIST',
  HIGH_CONFIDENCE_GEOCODER: 'PROVIDER',
  HEURISTIC_FALLBACK: 'UNKNOWN',
  CURATED: 'CURATED_REFERENCE',
});

/**
 * Normalizes coordinate source to standard Phase 1 taxonomy.
 */
function normalizeCoordinateSource(src) {
  if (!src) return COORDINATE_SOURCES.UNKNOWN;
  const upper = String(src).toUpperCase();
  return COORDINATE_SOURCES[upper] || COORDINATE_SOURCES.UNKNOWN;
}

/**
 * Normalizes verification status to standard Phase 1 taxonomy.
 */
function normalizeVerificationStatus(status) {
  if (!status) return VERIFICATION_STATUSES.UNVERIFIED;
  const upper = String(status).toUpperCase();
  return VERIFICATION_STATUSES[upper] || VERIFICATION_STATUSES.UNVERIFIED;
}

/**
 * Creates a Canonical Tourist Place record without dangerous auto-verified defaults.
 *
 * @param {Object} params
 * @returns {CanonicalTouristPlace}
 */
function createCanonicalPlace({
  id,
  canonicalPlaceId,
  canonicalName,
  displayName,
  aliases = [],
  entityType = 'tourist_attraction',
  category = 'scenic',
  latitude,
  longitude,
  address = null,
  city = 'Unknown',
  district = '',
  state = 'Unknown',
  country = 'India',
  providerIds = {},
  source = 'unknown',
  sourceType = 'REFERENCE',
  tourismStatus = 'UNVERIFIED',
  coordinateSource = 'UNKNOWN',
  nameSource = 'UNKNOWN',
  verificationStatus = 'UNVERIFIED',
  verificationMethod = 'HEURISTIC_CHECK',
  verificationTimestamp = new Date().toISOString(),
  confidence = null,
  evidence = [],
  lastValidatedAt = new Date().toISOString(),
  openingHours = null,
  visitMinutes = 60,
  importance = 'moderate',
  rating = 4.2,
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

  const normCoordSource = normalizeCoordinateSource(coordinateSource);
  let normVerificationStatus = normalizeVerificationStatus(verificationStatus);
  if (!validCoords) {
    normVerificationStatus = VERIFICATION_STATUSES.REJECTED;
  }

  const cleanDistrict = String(district || (address && address.district) || '').trim();
  const placeId = canonicalPlaceId || id || generateDeterministicPlaceId(city, cleanCanonicalName);

  const qualityScore = calculatePlaceDataQuality({
    canonicalName: cleanCanonicalName,
    latitude: lat,
    longitude: lon,
    category,
    city,
    coordinateSource: normCoordSource,
    verificationStatus: normVerificationStatus,
    updatedAt,
  });

  return {
    id: placeId,
    canonicalPlaceId: placeId,
    canonicalName: cleanCanonicalName,
    displayName: cleanDisplayName,
    aliases: normalizedAliases,
    entityType: String(entityType || 'tourist_attraction'),
    category,
    latitude: validCoords ? Math.round(lat * 1e6) / 1e6 : null,
    longitude: validCoords ? Math.round(lon * 1e6) / 1e6 : null,
    coords: validCoords ? [Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6] : null,
    address: address && typeof address === 'object' ? {
      area: address.area || '',
      city: address.city || city,
      district: cleanDistrict,
      state: address.state || state,
      country: address.country || country,
    } : {
      area: '',
      city,
      district: cleanDistrict,
      state,
      country,
    },
    city,
    district: cleanDistrict,
    state,
    country,
    providerIds: typeof providerIds === 'object' && providerIds !== null ? { ...providerIds } : {},
    source: String(source || 'unknown'),
    sourceType: String(sourceType || 'REFERENCE'),
    tourismStatus,
    coordinateSource: normCoordSource,
    nameSource,
    verificationStatus: normVerificationStatus,
    verificationMethod: String(verificationMethod || 'HEURISTIC_CHECK'),
    verificationTimestamp: verificationTimestamp || new Date().toISOString(),
    confidence: validCoords ? (typeof confidence === 'string' ? confidence : (confidence != null ? (confidence >= 80 ? 'HIGH' : confidence >= 50 ? 'MEDIUM' : 'LOW') : null)) : null,
    evidence: Array.isArray(evidence) ? [...evidence] : (evidence ? [evidence] : []),
    lastValidatedAt: lastValidatedAt || updatedAt || new Date().toISOString(),
    qualityScore,
    openingHours: openingHours || { openTime: '06:00', closeTime: '20:00' },
    visitMinutes: Number(visitMinutes) || 60,
    importance,
    rating: Number(rating) || 4.2,
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
  verificationStatus,
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
  let sourceQuality = 40;
  if (coordinateSource === 'AUTHORITATIVE_SURVEY' || coordinateSource === 'HUMAN_VERIFIED') sourceQuality = 100;
  else if (coordinateSource === 'CURATED_WHITELIST' || coordinateSource === 'CURATED_BENCHMARK') sourceQuality = 95;
  else if (coordinateSource === 'HIGH_CONFIDENCE_GEOCODER' || coordinateSource === 'PROVIDER') sourceQuality = 80;
  else if (coordinateSource === 'UNKNOWN') sourceQuality = 30;

  // 6. Freshness (decay over 180 days)
  let freshness = 95;
  if (updatedAt) {
    const ageMs = Date.now() - new Date(updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    freshness = Math.max(50, Math.round(100 - Math.min(50, ageDays * 0.2)));
  }

  let overall = Math.round(
    nameValidity * 0.25 +
    coordinateValidity * 0.25 +
    categoryValidity * 0.15 +
    cityMatch * 0.10 +
    sourceQuality * 0.15 +
    freshness * 0.10
  );

  if (verificationStatus === 'QUARANTINED' || verificationStatus === 'REJECTED' || verificationStatus === 'INVALID_COORDINATES') {
    overall = Math.min(overall, 25);
  }

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
  VERIFICATION_STATUSES,
  COORDINATE_SOURCES,
  createCanonicalPlace,
  calculatePlaceDataQuality,
  generateDeterministicPlaceId,
};
