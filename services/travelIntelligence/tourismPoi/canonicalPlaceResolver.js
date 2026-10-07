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
const { staticCityPlaces, resolveCityKey } = require('../../../data/city-seeds');
const { isBlacklistedEntity, isLocalityOnlyName } = require('./tourismBlacklist');
const { createCanonicalPlace } = require('./canonicalPlaceModel');
const { classifyTourismCategory } = require('./tourismCategoryClassifier');
const { distKm } = require('../../../utils/geo');

const { verifyAttractionCoordinates } = require('./coordinateVerificationEngine');

function findCitySeedMatch(rawName, cityHint) {
  if (!rawName) return null;
  const q = String(rawName).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  if (!q || q.length < 2) return null;

  const qClean = q.replace(/\b(temple|beach|museum|park|fort|palace|lake|falls|waterfalls|garden|viewpoint|sanctuary|restaurant|hotel|bazaar|market|promenade|complex)\b/g, '').trim();

  const candidateCities = [];
  if (cityHint && cityHint !== 'Unknown') {
    const k = resolveCityKey(cityHint);
    if (k) candidateCities.push(k);
  }

  for (const cKey of candidateCities) {
    const places = staticCityPlaces(cKey) || [];
    for (const p of places) {
      const pName = String(p.name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      if (pName === q) return { ...p, city: cKey };
      if (pName.includes(q) || q.includes(pName)) return { ...p, city: cKey };
      if (qClean && qClean.length >= 4 && pName.includes(qClean)) return { ...p, city: cKey };
    }
  }
  return null;
}

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

  const cityHint = options.cityHint || options.city || rawObj.city || rawObj.cityHint || 'Unknown';
  const categoryHint = options.categoryHint || options.category || rawObj.category || rawObj.cat || 'scenic';

  // 1. Locality & Noise Guard: Reject purely residential / administrative localities, roads, colonies
  const endsWithInfra = /\b(colony|road|rd|street|nagar|junction|layout|ward|suburb|circle|bypass|extension|area)\s*$/i.test(rawName);
  const isRoadOrColony = (
    endsWithInfra ||
    (/\b(colony|road|street|nagar|junction|layout|ward|suburb|circle|bypass|extension)\b/i.test(rawName) &&
     !/\b(fort|palace|temple|museum|beach|lake|park|hill|garden|zoo|aquarium|waterfall|bazaar|mandir|church|cathedral|mosque|dargah|memorial)\b/i.test(rawName))
  );

  const blacklistCheck = isBlacklistedEntity({ ...rawObj, name: rawName, type: rawObj.type, class: rawObj.class });
  if (isLocalityOnlyName(rawName) || blacklistCheck.rejected || isRoadOrColony) {
    return null;
  }

  // 2. Check Golden Benchmark Dataset (Reference Candidate — requires verification)
  const goldenMatch = findGoldenPoi(rawName, cityHint);
  if (goldenMatch) {
    const verification = verifyAttractionCoordinates({
      placeName: goldenMatch.canonicalName,
      city: goldenMatch.city || cityHint,
      state: goldenMatch.state || 'Unknown',
      category: goldenMatch.category,
      candidateCoords: [goldenMatch.latitude, goldenMatch.longitude],
      provider: 'GOLDEN_BENCHMARK',
    });

    if (!verification.verified && verification.verificationStatus === 'REJECTED') {
      return null;
    }

    return createCanonicalPlace({
      id: goldenMatch.id,
      canonicalPlaceId: goldenMatch.id,
      canonicalName: goldenMatch.canonicalName,
      displayName: goldenMatch.displayName,
      aliases: goldenMatch.aliases,
      category: goldenMatch.category,
      latitude: verification.canonicalCoordinates ? verification.canonicalCoordinates[0] : goldenMatch.latitude,
      longitude: verification.canonicalCoordinates ? verification.canonicalCoordinates[1] : goldenMatch.longitude,
      navigationLatitude: verification.navigationPoint ? verification.navigationPoint[0] : (verification.canonicalCoordinates ? verification.canonicalCoordinates[0] : goldenMatch.latitude),
      navigationLongitude: verification.navigationPoint ? verification.navigationPoint[1] : (verification.canonicalCoordinates ? verification.canonicalCoordinates[1] : goldenMatch.longitude),
      entranceLatitude: verification.entrancePoint ? verification.entrancePoint[0] : null,
      entranceLongitude: verification.entrancePoint ? verification.entrancePoint[1] : null,
      city: goldenMatch.city,
      state: goldenMatch.state,
      country: goldenMatch.country,
      provider: 'GOLDEN_BENCHMARK',
      providerPlaceId: goldenMatch.id,
      tourismStatus: goldenMatch.tourismStatus || 'VERIFIED_ATTRACTION',
      coordinateSource: 'AUTHORITATIVE_SURVEY',
      source: 'golden_poi_dataset',
      sourceType: 'AUTHORITATIVE_SURVEY',
      nameSource: 'GOLDEN_BENCHMARK',
      verificationStatus: verification.verified ? 'VERIFIED' : verification.verificationStatus,
      verificationMethod: 'AUTHORITATIVE_GROUND_SURVEY',
      confidence: verification.verified ? 'HIGH' : (verification.verificationStatus === 'QUARANTINED' ? 'LOW' : null),
      evidence: [
        'Curated benchmark reference candidate',
        ...(verification.evidence || []),
      ],
      lastValidatedAt: new Date().toISOString(),
      visitMinutes: rawObj.visitMinutes || rawObj.visit_minutes || 60,
      openingHours: rawObj.openingHours || (rawObj.open_time && rawObj.close_time ? { openTime: rawObj.open_time, closeTime: rawObj.close_time } : null),
      isSunriseSpot: Boolean(rawObj.isSunriseSpot || rawObj.is_sunrise_spot),
      isSunsetSpot: Boolean(rawObj.isSunsetSpot || rawObj.is_sunset_spot),
      indoorOutdoor: rawObj.indoorOutdoor || rawObj.indoor_outdoor || 'mixed',
    });
  }

  // 3. Check Multi-City Whitelist (Reference Candidate — requires verification)
  const whitelistMatch = resolveWhitelist({ name: rawName, category: categoryHint }, cityHint);
  if (whitelistMatch) {
    const targetCity = cityHint !== 'Unknown' ? cityHint : (whitelistMatch.city || 'Visakhapatnam');
    const verification = verifyAttractionCoordinates({
      placeName: whitelistMatch.canonicalName || whitelistMatch.name,
      city: targetCity,
      state: whitelistMatch.state || 'Andhra Pradesh',
      category: whitelistMatch.category || categoryHint,
      candidateCoords: [whitelistMatch.lat, whitelistMatch.lon],
      provider: 'TOURISM_WHITELIST',
    });

    if (!verification.verified && verification.verificationStatus === 'REJECTED') {
      return null;
    }

    return createCanonicalPlace({
      id: whitelistMatch.id,
      canonicalPlaceId: whitelistMatch.id,
      canonicalName: whitelistMatch.canonicalName || whitelistMatch.name,
      displayName: whitelistMatch.name,
      aliases: whitelistMatch.aliases || [],
      category: whitelistMatch.category || categoryHint,
      latitude: verification.canonicalCoordinates ? verification.canonicalCoordinates[0] : whitelistMatch.lat,
      longitude: verification.canonicalCoordinates ? verification.canonicalCoordinates[1] : whitelistMatch.lon,
      navigationLatitude: verification.navigationPoint ? verification.navigationPoint[0] : null,
      navigationLongitude: verification.navigationPoint ? verification.navigationPoint[1] : null,
      entranceLatitude: verification.entrancePoint ? verification.entrancePoint[0] : null,
      entranceLongitude: verification.entrancePoint ? verification.entrancePoint[1] : null,
      city: targetCity,
      state: whitelistMatch.state || 'Andhra Pradesh',
      provider: 'TOURISM_WHITELIST',
      providerPlaceId: whitelistMatch.id,
      tourismStatus: 'VERIFIED_ATTRACTION',
      coordinateSource: 'CURATED_WHITELIST',
      source: 'tourism_whitelist',
      sourceType: 'CURATED_WHITELIST',
      nameSource: 'CURATED_WHITELIST',
      verificationStatus: verification.verified ? 'VERIFIED' : verification.verificationStatus,
      verificationMethod: 'MULTI_SIGNAL_WHITELIST_CHECK',
      confidence: verification.verified ? 'HIGH' : (verification.verificationStatus === 'QUARANTINED' ? 'LOW' : null),
      evidence: [
        'Curated tourism whitelist candidate',
        ...(verification.evidence || []),
      ],
      lastValidatedAt: new Date().toISOString(),
      visitMinutes: rawObj.visitMinutes || rawObj.visit_minutes || 60,
      openingHours: rawObj.openingHours || (rawObj.open_time && rawObj.close_time ? { openTime: rawObj.open_time, closeTime: rawObj.close_time } : null),
      isSunriseSpot: Boolean(rawObj.isSunriseSpot || rawObj.is_sunrise_spot),
      isSunsetSpot: Boolean(rawObj.isSunsetSpot || rawObj.is_sunset_spot),
    });
  }

  // 3.5. Check Curated City Seeds Dataset (1000+ hand-surveyed municipal landmarks)
  const seedMatch = findCitySeedMatch(rawName, cityHint);
  if (seedMatch && Array.isArray(seedMatch.coords) && seedMatch.coords.length >= 2) {
    const targetCity = cityHint !== 'Unknown' ? cityHint : seedMatch.city;
    const sLat = seedMatch.coords[0];
    const sLon = seedMatch.coords[1];
    const verification = verifyAttractionCoordinates({
      placeName: seedMatch.name,
      city: targetCity,
      state: 'India',
      category: seedMatch.cat || categoryHint,
      candidateCoords: [sLat, sLon],
      provider: 'CURATED_CITY_SEEDS',
    });

    if (verification.verified || verification.verificationStatus !== 'REJECTED') {
      return createCanonicalPlace({
        id: seedMatch.id || `seed_${seedMatch.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        canonicalPlaceId: seedMatch.id,
        canonicalName: seedMatch.name,
        displayName: seedMatch.name,
        aliases: [rawName],
        category: seedMatch.cat || categoryHint,
        latitude: verification.canonicalCoordinates ? verification.canonicalCoordinates[0] : sLat,
        longitude: verification.canonicalCoordinates ? verification.canonicalCoordinates[1] : sLon,
        navigationLatitude: verification.navigationPoint ? verification.navigationPoint[0] : null,
        navigationLongitude: verification.navigationPoint ? verification.navigationPoint[1] : null,
        entranceLatitude: verification.entrancePoint ? verification.entrancePoint[0] : null,
        entranceLongitude: verification.entrancePoint ? verification.entrancePoint[1] : null,
        city: targetCity,
        state: 'India',
        provider: 'CURATED_CITY_SEEDS',
        providerPlaceId: seedMatch.id,
        tourismStatus: 'VERIFIED_ATTRACTION',
        coordinateSource: 'CURATED_SEEDS',
        source: 'city_seeds',
        sourceType: 'CURATED_SEED',
        nameSource: 'CURATED_SEED',
        verificationStatus: verification.verified ? 'VERIFIED' : verification.verificationStatus,
        verificationMethod: 'CURATED_SEED_VERIFICATION',
        confidence: 'HIGH',
        evidence: [
          'Curated city seed candidate',
          ...(verification.evidence || []),
        ],
        lastValidatedAt: new Date().toISOString(),
        visitMinutes: seedMatch.vt || rawObj.visitMinutes || rawObj.visit_minutes || 60,
        openingHours: (seedMatch.ot && seedMatch.ct) ? { openTime: seedMatch.ot, closeTime: seedMatch.ct } : (rawObj.open_time && rawObj.close_time ? { openTime: rawObj.open_time, closeTime: rawObj.close_time } : null),
        isSunriseSpot: Boolean(rawObj.isSunriseSpot || rawObj.is_sunrise_spot),
        isSunsetSpot: Boolean(rawObj.isSunsetSpot || rawObj.is_sunset_spot),
        indoorOutdoor: rawObj.indoorOutdoor || rawObj.indoor_outdoor || 'mixed',
      });
    }
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

  if (!verification.verified && (verification.verificationStatus === 'REJECTED' || (!options.allowQuarantined && verification.verificationStatus === 'QUARANTINED'))) {
    return null; // Reject candidate if coordinates cannot be validated or locality rejected
  }

  const verifiedCoords = verification.canonicalCoordinates || [rawLat, rawLon];

  return createCanonicalPlace({
    id: rawObj.id,
    canonicalPlaceId: rawObj.id,
    canonicalName: rawName,
    displayName: rawName,
    aliases: rawObj.aliases || [],
    category: prodCategory,
    latitude: verifiedCoords[0],
    longitude: verifiedCoords[1],
    navigationLatitude: verification.navigationPoint ? verification.navigationPoint[0] : null,
    navigationLongitude: verification.navigationPoint ? verification.navigationPoint[1] : null,
    entranceLatitude: verification.entrancePoint ? verification.entrancePoint[0] : null,
    entranceLongitude: verification.entrancePoint ? verification.entrancePoint[1] : null,
    city: cityHint,
    state: rawObj.state || 'Unknown',
    provider: rawObj.source || 'discovery_service',
    providerPlaceId: rawObj.id,
    tourismStatus: verification.verified ? 'VERIFIED_ATTRACTION' : 'ESTIMATED_ATTRACTION',
    coordinateSource: rawObj.source === 'nominatim' ? 'PROVIDER' : 'UNKNOWN',
    source: rawObj.source || 'discovery_service',
    sourceType: 'PROVIDER',
    nameSource: rawObj.nameSource || 'DISCOVERY_SERVICE',
    verificationStatus: verification.verificationStatus || 'AUTO_VALIDATED',
    verificationMethod: 'MULTI_SIGNAL_DISCOVERY_CHECK',
    confidence: verification.confidence,
    evidence: verification.evidence || [],
    lastValidatedAt: new Date().toISOString(),
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
