'use strict';

/**
 * services/travelIntelligence/tourismPoi/coordinateVerificationEngine.js
 *
 * Attraction-Level Coordinate Verification & Multi-Signal Candidate Scoring Engine.
 * Enforces Zero-Trust geographic integrity:
 * 1. Multi-signal candidate scoring (Name 30, Entity 25, City 15, Category 10, Provider 10, Address 5, Coords 5).
 * 2. Category-specific coordinate tolerance radii (Beaches 1500m, Temples 600m, Museums 500m, etc.).
 * 3. Cross-provider consensus & conflict detection.
 * 4. Automatic quarantine for ambiguous, conflicted, or locality-leakage POIs.
 */

const { distKm } = require('../../../utils/geo');
const { validatePoiCoordinates } = require('./coordinateIntegrity');
const { isBlacklistedEntity, isLocalityOnlyName } = require('./tourismBlacklist');

const CATEGORY_TOLERANCES_METERS = Object.freeze({
  beach: 1500,
  park: 1000,
  garden: 1000,
  zoo: 1200,
  wildlife: 2500,
  scenic: 1000,
  viewpoint: 600,
  hill: 1000,
  monument: 800,
  fort: 900,
  heritage: 800,
  temple: 600,
  museum: 500,
  food: 400,
  restaurant: 400,
  shopping: 600,
  market: 700,
  default: 800,
});

/**
 * Calculates string similarity ratio (0 to 1.0) using token overlap and normalized containment.
 */
function computeStringSimilarity(strA, strB) {
  if (!strA || !strB) return 0;
  const a = String(strA).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const b = String(strB).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  if (a === b) return 1.0;

  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  const tokenJaccard = intersection / union;

  // Substring containment boost
  const containment = (a.includes(b) || b.includes(a)) ? 0.3 : 0;
  return Math.min(1.0, tokenJaccard * 0.7 + containment);
}

/**
 * Scores a candidate match across 7 transparent dimensions (0 to 100 points).
 */
function scoreCandidateMatch(candidate = {}, target = {}, options = {}) {
  const cName = String(candidate.name || candidate.canonicalName || '').trim();
  const tName = String(target.name || target.placeName || '').trim();
  const cCity = String(candidate.city || options.cityHint || '').toLowerCase().trim();
  const tCity = String(target.city || options.cityHint || '').toLowerCase().trim();
  const cCat = String(candidate.category || candidate.cat || 'scenic').toLowerCase().trim();
  const tCat = String(target.category || target.cat || 'scenic').toLowerCase().trim();

  // 1. Name similarity: 30 points max
  const sim = computeStringSimilarity(cName, tName);
  const nameScore = Math.round(sim * 30);

  // 2. Entity-type match: 25 points max (Heavy penalty if locality/colony/street/road)
  let entityScore = 25;
  const localityCheck = isLocalityOnlyName(cName);
  const blCheck = isBlacklistedEntity(candidate);
  const isRoadOrColony = /\b(colony|road|street|nagar|junction|layout|ward|suburb|circle|bypass|extension)\b/i.test(cName) &&
                        !/\b(fort|palace|temple|museum|beach|lake|park|hill|garden|zoo|aquarium|waterfall|bazaar)\b/i.test(cName);

  if (localityCheck || blCheck.rejected || isRoadOrColony) {
    entityScore = 0; // Locality / residential area cannot masquerade as attraction
  } else if (candidate.type === 'tourism' || candidate.type === 'attraction' || candidate.class === 'tourism') {
    entityScore = 25;
  } else {
    entityScore = 18;
  }

  // 3. City match: 15 points max
  let cityScore = 0;
  if (cCity && tCity && (cCity === tCity || cCity.includes(tCity) || tCity.includes(cCity))) {
    cityScore = 15;
  } else if (!tCity || tCity === 'unknown') {
    cityScore = 8;
  }

  // 4. Category match: 10 points max
  let categoryScore = 0;
  if (cCat === tCat || (['viewpoint', 'scenic', 'hill'].includes(cCat) && ['viewpoint', 'scenic', 'hill'].includes(tCat))) {
    categoryScore = 10;
  } else if (cCat && tCat) {
    categoryScore = 4;
  }

  // 5. Provider identity match: 10 points max
  const providerScore = (candidate.osm_id || candidate.place_id || candidate.id) ? 10 : 5;

  // 6. Address consistency: 5 points max
  const addressScore = candidate.address ? 5 : 2;

  // 7. Coordinate consistency: 5 points max
  const cLat = candidate.lat ?? candidate.latitude ?? candidate.coords?.[0];
  const cLon = candidate.lon ?? candidate.longitude ?? candidate.coords?.[1];
  const coordValid = cLat != null && cLon != null && Number.isFinite(Number(cLat)) && Number.isFinite(Number(cLon));
  const coordScore = coordValid ? 5 : 0;

  const totalScore = nameScore + entityScore + cityScore + categoryScore + providerScore + addressScore + coordScore;

  return {
    totalScore: Math.min(100, Math.max(0, totalScore)),
    isLocalityConflict: localityCheck || isRoadOrColony,
    breakdown: {
      nameSimilarity: nameScore,
      entityTypeMatch: entityScore,
      cityMatch: cityScore,
      categoryMatch: categoryScore,
      providerIdentity: providerScore,
      addressConsistency: addressScore,
      coordinateConsistency: coordScore,
    },
  };
}

/**
 * Attraction-Level Coordinate Verification Pipeline.
 */
function verifyAttractionCoordinates(params = {}) {
  const {
    placeName,
    city,
    _state,
    category = 'scenic',
    candidateCoords,
    referenceCoords = null,
    providerCandidates = [],
    provider = 'unknown',
  } = params;

  const evidence = [];
  const rejectionReason = null;
  let quarantineReason = null;
  let conflict = false;

  // 1. Initial name validation
  if (!placeName || typeof placeName !== 'string' || placeName.trim().length < 2) {
    return {
      verified: false,
      verificationStatus: 'REJECTED',
      confidence: 0,
      canonicalCoordinates: null,
      source: provider,
      evidence: ['Invalid place name provided'],
      distanceFromCandidateMeters: null,
      candidateScores: [],
      conflict: false,
      rejectionReason: 'INVALID_NAME',
      quarantineReason: null,
    };
  }

  const cleanName = placeName.trim();

  // 2. Locality rejection check
  if (isLocalityOnlyName(cleanName)) {
    return {
      verified: false,
      verificationStatus: 'REJECTED',
      confidence: 0,
      canonicalCoordinates: null,
      source: provider,
      evidence: [`${cleanName} is a residential locality, not an attraction`],
      distanceFromCandidateMeters: null,
      candidateScores: [],
      conflict: false,
      rejectionReason: 'LOCALITY_REJECTED',
      quarantineReason: null,
    };
  }

  // 3. Coordinate validation
  if (!candidateCoords || !Array.isArray(candidateCoords) || candidateCoords.length < 2) {
    return {
      verified: false,
      verificationStatus: 'QUARANTINED',
      confidence: 0,
      canonicalCoordinates: null,
      source: provider,
      evidence: ['Missing candidate coordinates'],
      distanceFromCandidateMeters: null,
      candidateScores: [],
      conflict: false,
      rejectionReason: null,
      quarantineReason: 'MISSING_COORDINATES',
    };
  }

  const [lat, lon] = candidateCoords;
  const integrity = validatePoiCoordinates(lat, lon, { cityHint: city, category });

  if (!integrity.valid) {
    return {
      verified: false,
      verificationStatus: 'REJECTED',
      confidence: 0,
      canonicalCoordinates: null,
      source: provider,
      evidence: [integrity.reason || 'Invalid coordinate values'],
      distanceFromCandidateMeters: null,
      candidateScores: [],
      conflict: false,
      rejectionReason: integrity.reason || 'INVALID_COORDINATES',
      quarantineReason: null,
    };
  }

  evidence.push('Passed Indian bounding box and city radius sanity checks');
  if (integrity.wasSwapped) {
    evidence.push('Inverted latitude/longitude automatically rectified');
  }

  // 4. Tolerance check against reference coordinates (if available)
  const categoryToleranceMeters = CATEGORY_TOLERANCES_METERS[category] || CATEGORY_TOLERANCES_METERS.default;
  let distanceFromCandidateMeters = null;

  if (referenceCoords && Array.isArray(referenceCoords) && referenceCoords.length >= 2) {
    const dKm = distKm(lat, lon, referenceCoords[0], referenceCoords[1]);
    distanceFromCandidateMeters = Math.round(dKm * 1000);

    if (distanceFromCandidateMeters > categoryToleranceMeters) {
      conflict = true;
      quarantineReason = `Diverges from reference survey by ${distanceFromCandidateMeters}m (tolerance: ${categoryToleranceMeters}m)`;
      evidence.push(quarantineReason);
    } else {
      evidence.push(`Within ${categoryToleranceMeters}m category tolerance of reference survey (${distanceFromCandidateMeters}m)`);
    }
  }

  // 5. Multi-candidate scoring (if provider candidates provided)
  const candidateScores = [];
  if (Array.isArray(providerCandidates) && providerCandidates.length > 0) {
    for (const cand of providerCandidates) {
      const score = scoreCandidateMatch(cand, { name: cleanName, city, category }, { cityHint: city });
      candidateScores.push({ candidate: cand, ...score });
    }

    candidateScores.sort((a, b) => b.totalScore - a.totalScore);

    const bestMatch = candidateScores[0];
    if (bestMatch && bestMatch.totalScore < 60) {
      quarantineReason = `Best candidate match score (${bestMatch.totalScore}/100) below acceptable threshold`;
      conflict = true;
    }
  }

  const verified = !conflict && !rejectionReason && !quarantineReason;
  const verificationStatus = verified ? 'AUTO_VALIDATED' : (conflict || quarantineReason ? 'QUARANTINED' : 'REJECTED');
  const confidence = verified ? (distanceFromCandidateMeters != null && distanceFromCandidateMeters < 300 ? 95 : 85) : 30;

  return {
    verified,
    verificationStatus,
    confidence,
    canonicalCoordinates: [integrity.lat, integrity.lon],
    source: provider,
    evidence,
    distanceFromCandidateMeters,
    candidateScores,
    conflict,
    rejectionReason,
    quarantineReason,
  };
}

/**
 * Returns true if the POI is quarantined or rejected.
 */
function isQuarantinedPoi(poi) {
  if (!poi) return true;
  const status = String(poi.verificationStatus || '').toUpperCase();
  return status === 'QUARANTINED' || status === 'REJECTED' || status === 'INVALID_COORDINATES';
}

module.exports = {
  CATEGORY_TOLERANCES_METERS,
  computeStringSimilarity,
  scoreCandidateMatch,
  verifyAttractionCoordinates,
  isQuarantinedPoi,
};
