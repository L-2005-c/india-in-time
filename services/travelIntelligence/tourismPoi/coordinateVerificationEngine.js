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
  const confidence = verified
    ? (distanceFromCandidateMeters != null && distanceFromCandidateMeters < 300 ? 'HIGH' : 'MEDIUM')
    : (conflict ? 'LOW' : null);

  const navAndEnt = resolveNavigationAndEntrancePoints(cleanName, city, [integrity.lat, integrity.lon]);

  return {
    verified,
    verificationStatus,
    confidence,
    canonicalCoordinates: [integrity.lat, integrity.lon],
    navigationPoint: navAndEnt.navigationPoint,
    entrancePoint: navAndEnt.entrancePoint,
    source: provider,
    evidence,
    evidenceCount: evidence.length,
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

/**
 * Deterministic Place Identity Matching Formula (Phase 3 Specification).
 * Weighted scoring:
 * identityScore =
 *   0.35 * providerIdentity +
 *   0.20 * nameSimilarity +
 *   0.15 * addressSimilarity +
 *   0.10 * localityMatch +
 *   0.15 * spatialConsistency +
 *   0.05 * categoryConsistency
 */
function computeIdentityScore(candidate = {}, target = {}, options = {}) {
  const cName = String(candidate.name || candidate.canonicalName || '').trim();
  const tName = String(target.name || target.placeName || target.canonicalName || '').trim();
  const cAddress = String(candidate.address?.area || candidate.address || '').toLowerCase().trim();
  const tAddress = String(target.address?.area || target.address || '').toLowerCase().trim();
  const cLocality = String(candidate.locality || candidate.district || '').toLowerCase().trim();
  const tLocality = String(target.locality || target.district || '').toLowerCase().trim();
  const cCat = String(candidate.category || candidate.cat || 'scenic').toLowerCase().trim();
  const tCat = String(target.category || target.cat || 'scenic').toLowerCase().trim();

  // 1. Provider Identity (0.35)
  let providerIdentity = 0.0;
  if (candidate.providerPlaceId && target.providerPlaceId && candidate.providerPlaceId === target.providerPlaceId) {
    providerIdentity = 1.0;
  } else if (candidate.providerPlaceId || candidate.id || candidate.osm_id) {
    providerIdentity = 0.6;
  }

  // 2. Name Similarity (0.20)
  const nameSim = computeStringSimilarity(cName, tName);

  // 3. Address Similarity (0.15)
  let addressSim = 0.5;
  if (cAddress && tAddress) {
    addressSim = computeStringSimilarity(cAddress, tAddress);
  } else if (!cAddress && !tAddress) {
    addressSim = 0.7;
  }

  // 4. Locality Match (0.10)
  let localityMatch = 0.5;
  if (cLocality && tLocality) {
    localityMatch = cLocality === tLocality ? 1.0 : (cLocality.includes(tLocality) || tLocality.includes(cLocality) ? 0.8 : 0.0);
  }

  // 5. Spatial Consistency (0.15)
  let spatialConsistency = 0.8;
  const cLat = candidate.lat ?? candidate.latitude ?? candidate.coords?.[0];
  const cLon = candidate.lon ?? candidate.longitude ?? candidate.coords?.[1];
  const tLat = target.lat ?? target.latitude ?? target.coords?.[0];
  const tLon = target.lon ?? target.longitude ?? target.coords?.[1];

  if (Number.isFinite(Number(cLat)) && Number.isFinite(Number(tLat))) {
    const dKm = distKm(Number(cLat), Number(cLon), Number(tLat), Number(tLon));
    if (dKm <= 0.2) spatialConsistency = 1.0;
    else if (dKm <= 0.8) spatialConsistency = 0.8;
    else if (dKm <= 2.0) spatialConsistency = 0.5;
    else spatialConsistency = 0.1;
  }

  // 6. Category Consistency (0.05)
  let categoryConsistency = 0.3;
  if (cCat === tCat) {
    categoryConsistency = 1.0;
  } else if (['scenic', 'viewpoint', 'hill', 'park'].includes(cCat) && ['scenic', 'viewpoint', 'hill', 'park'].includes(tCat)) {
    categoryConsistency = 0.8;
  } else if (['temple', 'heritage', 'monument'].includes(cCat) && ['temple', 'heritage', 'monument'].includes(tCat)) {
    categoryConsistency = 0.7;
  }

  const rawScore = (
    0.35 * providerIdentity +
    0.20 * nameSim +
    0.15 * addressSim +
    0.10 * localityMatch +
    0.15 * spatialConsistency +
    0.05 * categoryConsistency
  );

  const normalizedScore = Math.min(100, Math.max(0, Math.round(rawScore * 100)));

  return {
    score: normalizedScore,
    weights: {
      providerIdentity: Math.round(providerIdentity * 35),
      nameSimilarity: Math.round(nameSim * 20),
      addressSimilarity: Math.round(addressSim * 15),
      localityMatch: Math.round(localityMatch * 10),
      spatialConsistency: Math.round(spatialConsistency * 15),
      categoryConsistency: Math.round(categoryConsistency * 5),
    },
  };
}

// Curated Entrance and Navigation Drop-off Points for large Indian destinations
const KNOWN_NAVIGATION_POINTS = {
  // Visakhapatnam
  'kailasagiri': { nav: [17.7478, 83.3402], entrance: [17.7478, 83.3402] },
  'ramakrishna beach': { nav: [17.7142, 83.3237], entrance: [17.7142, 83.3237] },
  'ins kursura submarine museum': { nav: [17.7170, 83.3300], entrance: [17.7172, 83.3301] },
  'simhachalam': { nav: [17.7660, 83.2505], entrance: [17.7666, 83.2501] },
  'indira gandhi zoological park': { nav: [17.7662, 83.3485], entrance: [17.7662, 83.3485] },
  // Tirupati
  'sri venkateswara swamy temple': { nav: [13.6833, 79.3482], entrance: [13.6833, 79.3482] },
  'tirumala': { nav: [13.6833, 79.3482], entrance: [13.6833, 79.3482] },
  // Hyderabad
  'golconda fort': { nav: [17.3828, 78.4018], entrance: [17.3828, 78.4018] },
  'charminar': { nav: [17.3614, 78.4745], entrance: [17.3614, 78.4745] },
  'salar jung museum': { nav: [17.3710, 78.4800], entrance: [17.3713, 78.4804] },
  'ramoji film city': { nav: [17.2540, 78.6800], entrance: [17.2543, 78.6808] },
  // Jaipur
  'amber palace': { nav: [26.9855, 75.8513], entrance: [26.9855, 75.8513] },
  'city palace': { nav: [26.9258, 75.8236], entrance: [26.9258, 75.8236] },
  'hawa mahal': { nav: [26.9238, 75.8266], entrance: [26.9239, 75.8267] },
  // Mumbai
  'gateway of india': { nav: [18.9220, 72.8347], entrance: [18.9220, 72.8347] },
  'chhatrapati shivaji maharaj terminus': { nav: [18.9401, 72.8353], entrance: [18.9401, 72.8353] },
  // Delhi
  'red fort': { nav: [28.6558, 77.2385], entrance: [28.6558, 77.2385] },
  'qutub minar': { nav: [28.5245, 77.1855], entrance: [28.5245, 77.1855] },
  // Kolkata
  'victoria memorial': { nav: [22.5448, 88.3426], entrance: [22.5448, 88.3426] },
  // Agra
  'taj mahal': { nav: [27.1751, 78.0421], entrance: [27.1751, 78.0421] },
  // Mysuru
  'mysore palace': { nav: [12.3051, 76.6551], entrance: [12.3051, 76.6551] },
  // Madurai
  'meenakshi temple': { nav: [9.9195, 78.1193], entrance: [9.9195, 78.1193] },
  // Amritsar
  'golden temple': { nav: [31.6200, 74.8765], entrance: [31.6200, 74.8765] },
  // Puri
  'konark sun temple': { nav: [19.8876, 86.0945], entrance: [19.8876, 86.0945] },
  'jagannath temple': { nav: [19.8048, 85.8179], entrance: [19.8048, 85.8179] },
};

function resolveNavigationAndEntrancePoints(placeName, _city, coords) {
  if (!placeName) return { navigationPoint: coords, entrancePoint: coords };
  const clean = String(placeName).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  for (const [k, v] of Object.entries(KNOWN_NAVIGATION_POINTS)) {
    if (clean.includes(k) || k.includes(clean)) {
      return {
        navigationPoint: v.nav,
        entrancePoint: v.entrance,
      };
    }
  }
  return {
    navigationPoint: coords || null,
    entrancePoint: coords || null,
  };
}

module.exports = {
  CATEGORY_TOLERANCES_METERS,
  computeStringSimilarity,
  scoreCandidateMatch,
  computeIdentityScore,
  resolveNavigationAndEntrancePoints,
  verifyAttractionCoordinates,
  isQuarantinedPoi,
};
