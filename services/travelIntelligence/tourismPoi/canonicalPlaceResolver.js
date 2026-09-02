'use strict';

/**
 * services/travelIntelligence/tourismPoi/canonicalPlaceResolver.js
 *
 * Single Canonical Place Resolution Pipeline:
 * USER QUERY / DISCOVERY POI
 *      ↓
 * NAME NORMALIZATION
 *      ↓
 * ALIAS & GOLDEN DATASET MATCH
 *      ↓
 * LOCALITY / NOISE FILTER
 *      ↓
 * COORDINATE INTEGRITY & TOLERANCE
 *      ↓
 * CANONICAL TOURIST PLACE ENTITY
 */

const { findGoldenPoi } = require('../../../data/goldenPoiDataset');
const { resolveWhitelist } = require('./tourismWhitelist');
const { isBlacklistedEntity, isLocalityOnlyName } = require('./tourismBlacklist');
const { createCanonicalPlace } = require('./canonicalPlaceModel');
const { classifyTourismCategory } = require('./tourismCategoryClassifier');
const { distKm } = require('../../../utils/geo');

const { verifyAttractionCoordinates } = require('./coordinateVerificationEngine');

/**
 * Normalizes raw name strings (removes excess punctuation, normalizes spacing).
 */
function normalizePlaceName(rawName) {
  if (!rawName) return '';
  return String(rawName)
    .replace(/\s+/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim();
}

/**
 * Resolves a raw candidate or search query into a Canonical Tourist Place.
 *
 * @param {Object|string} input - raw place object or string search query
 * @param {Object} [options]
 * @param {string} [options.cityHint]
 * @param {string} [options.categoryHint]
 * @returns {CanonicalTouristPlace|null}
 */
function resolveCanonicalPlace(input, options = {}) {
  if (!input) return null;

  const rawObj = typeof input === 'string' ? { name: input } : input;
  const rawName = normalizePlaceName(rawObj.name || rawObj.canonicalName || rawObj.displayName);
  if (!rawName || rawName.length < 2) return null;

  const cityHint = options.cityHint || rawObj.city || 'Unknown';
  const categoryHint = options.categoryHint || rawObj.category || rawObj.cat || 'scenic';

  // 1. Locality & Noise Guard: Reject purely residential / administrative localities, roads, colonies
  const endsWithInfra = /\b(colony|road|rd|street|nagar|junction|layout|ward|suburb|circle|bypass|extension|area)\s*$/i.test(rawName);
  const isRoadOrColony = (
    endsWithInfra ||
    (/\b(colony|road|street|nagar|junction|layout|ward|suburb|circle|bypass|extension)\b/i.test(rawName) &&
     !/\b(fort|palace|temple|museum|beach|lake|park|hill|garden|zoo|aquarium|waterfall|bazaar|mandir|church|cathedral|mosque|dargah|memorial)\b/i.test(rawName))
  );

  const blacklistCheck = isBlacklistedEntity({ name: rawName, type: rawObj.type, class: rawObj.class });
  if (isLocalityOnlyName(rawName) || blacklistCheck.rejected || isRoadOrColony) {
    return null;
  }

  // 2. Check Golden Benchmark Dataset (Highest priority authoritative survey)
  const goldenMatch = findGoldenPoi(rawName, cityHint);
  if (goldenMatch) {
    return createCanonicalPlace({
      id: goldenMatch.id,
      canonicalName: goldenMatch.canonicalName,
      displayName: goldenMatch.displayName,
      aliases: goldenMatch.aliases,
      category: goldenMatch.category,
      latitude: goldenMatch.latitude,
      longitude: goldenMatch.longitude,
      city: goldenMatch.city,
      state: goldenMatch.state,
      country: goldenMatch.country,
      tourismStatus: goldenMatch.tourismStatus,
      coordinateSource: 'AUTHORITATIVE_SURVEY',
      nameSource: 'GOLDEN_BENCHMARK',
      verificationStatus: 'VERIFIED',
      confidence: 99,
      visitMinutes: rawObj.visitMinutes || rawObj.visit_minutes || 60,
      openingHours: rawObj.openingHours || (rawObj.open_time && rawObj.close_time ? { openTime: rawObj.open_time, closeTime: rawObj.close_time } : null),
      isSunriseSpot: Boolean(rawObj.isSunriseSpot || rawObj.is_sunrise_spot),
      isSunsetSpot: Boolean(rawObj.isSunsetSpot || rawObj.is_sunset_spot),
      indoorOutdoor: rawObj.indoorOutdoor || rawObj.indoor_outdoor || 'mixed',
    });
  }

  // 3. Check Multi-City Whitelist
  const whitelistMatch = resolveWhitelist({ name: rawName, category: categoryHint }, cityHint);
  if (whitelistMatch) {
    return createCanonicalPlace({
      id: whitelistMatch.id,
      canonicalName: whitelistMatch.canonicalName || whitelistMatch.name,
      displayName: whitelistMatch.name,
      aliases: whitelistMatch.aliases || [],
      category: whitelistMatch.category || categoryHint,
      latitude: whitelistMatch.lat,
      longitude: whitelistMatch.lon,
      city: cityHint !== 'Unknown' ? cityHint : (whitelistMatch.city || 'Visakhapatnam'),
      state: whitelistMatch.state || 'Andhra Pradesh',
      tourismStatus: 'VERIFIED_ATTRACTION',
      coordinateSource: 'CURATED_WHITELIST',
      nameSource: 'CURATED_WHITELIST',
      verificationStatus: 'VERIFIED',
      confidence: 95,
      visitMinutes: rawObj.visitMinutes || rawObj.visit_minutes || 60,
      openingHours: rawObj.openingHours || (rawObj.open_time && rawObj.close_time ? { openTime: rawObj.open_time, closeTime: rawObj.close_time } : null),
      isSunriseSpot: Boolean(rawObj.isSunriseSpot || rawObj.is_sunrise_spot),
      isSunsetSpot: Boolean(rawObj.isSunsetSpot || rawObj.is_sunset_spot),
      indoorOutdoor: rawObj.indoorOutdoor || rawObj.indoor_outdoor || 'mixed',
    });
  }

  // 4. Fallback / Discovery Resolution with Coordinate Integrity & Zero-Trust Validation
  const rawLat = rawObj.latitude ?? rawObj.lat ?? rawObj.coords?.[0];
  const rawLon = rawObj.longitude ?? rawObj.lon ?? rawObj.coords?.[1];

  const categoryResult = classifyTourismCategory({
    name: rawName,
    type: rawObj.type,
    category: categoryHint,
  });
  const prodCategory = categoryResult.productCategory || categoryHint;

  const verification = verifyAttractionCoordinates({
    placeName: rawName,
    city: cityHint,
    state: rawObj.state || 'Unknown',
    category: prodCategory,
    candidateCoords: [rawLat, rawLon],
    provider: rawObj.source || 'discovery',
  });

  if (!verification.verified && verification.verificationStatus === 'REJECTED') {
    return null; // Reject candidate if coordinates cannot be validated or locality rejected
  }

  const verifiedCoords = verification.canonicalCoordinates || [rawLat, rawLon];

  return createCanonicalPlace({
    id: rawObj.id,
    canonicalName: rawName,
    displayName: rawName,
    aliases: rawObj.aliases || [],
    category: prodCategory,
    latitude: verifiedCoords[0],
    longitude: verifiedCoords[1],
    city: cityHint,
    state: rawObj.state || 'Unknown',
    tourismStatus: verification.verified ? 'VERIFIED_ATTRACTION' : 'ESTIMATED_ATTRACTION',
    coordinateSource: rawObj.source === 'nominatim' ? 'HIGH_CONFIDENCE_GEOCODER' : 'HEURISTIC_FALLBACK',
    nameSource: rawObj.nameSource || 'DISCOVERY_SERVICE',
    verificationStatus: verification.verificationStatus || 'AUTO_VALIDATED',
    confidence: verification.confidence,
    visitMinutes: rawObj.visitMinutes || rawObj.visit_minutes || 60,
    openingHours: rawObj.openingHours || (rawObj.open_time && rawObj.close_time ? { openTime: rawObj.open_time, closeTime: rawObj.close_time } : null),
    isSunriseSpot: Boolean(rawObj.isSunriseSpot || rawObj.is_sunrise_spot),
    isSunsetSpot: Boolean(rawObj.isSunsetSpot || rawObj.is_sunset_spot),
    indoorOutdoor: rawObj.indoorOutdoor || rawObj.indoor_outdoor || 'mixed',
  });
}

/**
 * Deduplicates an array of canonical places by deterministic ID and spatial proximity (< 180m).
 *
 * @param {Array<CanonicalTouristPlace>} places
 * @returns {Array<CanonicalTouristPlace>}
 */
function dedupeCanonicalPlaces(places) {
  if (!Array.isArray(places)) return [];

  const seenIds = new Set();
  const deduped = [];

  for (const p of places) {
    if (!p || !p.canonicalName) continue;
    if (seenIds.has(p.id)) continue;

    // Check spatial proximity duplicate (< 180m and sharing tokens)
    const isSpatialDup = deduped.some(existing => {
      if (!existing.latitude || !existing.longitude || !p.latitude || !p.longitude) return false;
      const dKm = distKm(existing.latitude, existing.longitude, p.latitude, p.longitude);
      if (dKm > 0.18) return false;

      // Check if they share name words or category
      const pWords = p.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 4);
      const eWords = existing.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 4);
      return pWords.some(w => eWords.includes(w)) || p.category === existing.category;
    });

    if (!isSpatialDup) {
      seenIds.add(p.id);
      deduped.push(p);
    }
  }

  return deduped;
}

module.exports = {
  normalizePlaceName,
  resolveCanonicalPlace,
  dedupeCanonicalPlaces,
};
