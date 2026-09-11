'use strict';

/**
 * services/travelIntelligence/trust/trustEntityResolver.js
 *
 * Entity Identity Trust & Resolution Engine for India In-Time v3.0 Phase 5.
 *
 * Core Principle:
 * Determines whether multiple records refer to the same real-world entity
 * without naive or aggressive auto-merging.
 *
 * Invariant:
 * Identity errors are more dangerous than missing matches.
 * Never merge two entities solely because names are similar if locations/cities differ.
 * Example: "Hotel Royal Palace" in Hyderabad vs Vizag must remain separate entities.
 */

const { distKm } = require('../../../utils/geo');

const IDENTITY_STATES = Object.freeze({
  EXACT_MATCH: 'EXACT_MATCH',
  HIGH_CONFIDENCE_MATCH: 'HIGH_CONFIDENCE_MATCH',
  POSSIBLE_MATCH: 'POSSIBLE_MATCH',
  CONFLICTED: 'CONFLICTED',
  UNRESOLVED: 'UNRESOLVED',
});

/**
 * Normalizes an entity name by stripping punctuation, extra whitespace,
 * and generic hospitality/tourism descriptors for robust comparison.
 */
function normalizeEntityName(name = '') {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts core distinctive tokens from an entity name,
 * removing generic category stop-words.
 */
function extractCoreTokens(name = '') {
  const stopWords = new Set([
    'hotel', 'resort', 'palace', 'restaurant', 'cafe', 'dhaba', 'inn',
    'lodge', 'travels', 'tours', 'tourism', 'adventures', 'cabs', 'taxi',
    'services', 'pvt', 'ltd', 'private', 'limited', 'and', 'the', 'in', 'at',
  ]);
  const tokens = normalizeEntityName(name).split(' ').filter(t => t.length > 1 && !stopWords.has(t));
  return new Set(tokens);
}

/**
 * Calculates Jaccard token similarity between two name token sets.
 */
function tokenSimilarity(tokensA, tokensB) {
  if (!tokensA.size || !tokensB.size) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Resolves identity relationship between two entity candidate records.
 *
 * @param {Object} entityA
 * @param {Object} entityB
 * @returns {Object} Resolution result with identityState, confidence, matchReasons, and conflicts
 */
function resolveEntityIdentity(entityA = {}, entityB = {}) {
  if (!entityA || !entityB) {
    return {
      identityState: IDENTITY_STATES.UNRESOLVED,
      confidence: 0,
      matchReasons: [],
      conflicts: ['One or both entity records are missing.'],
      sameEntity: false,
    };
  }

  const matchReasons = [];
  const conflicts = [];

  // 1. Direct Identifier Match (Highest Precision)
  const idA = entityA.identifier || entityA.gstin || entityA.fssaiLicense || entityA.nidhiId || entityA.placeId;
  const idB = entityB.identifier || entityB.gstin || entityB.fssaiLicense || entityB.nidhiId || entityB.placeId;

  if (idA && idB && String(idA).trim().toUpperCase() === String(idB).trim().toUpperCase()) {
    matchReasons.push(`Direct official identifier match: ${idA}`);
    return {
      identityState: IDENTITY_STATES.EXACT_MATCH,
      confidence: 1.0,
      matchReasons,
      conflicts: [],
      sameEntity: true,
    };
  }

  // 2. City & Geographical Region Check (Safety Guard against cross-city collisions)
  const cityA = (entityA.city || entityA.district || '').toLowerCase().trim();
  const cityB = (entityB.city || entityB.district || '').toLowerCase().trim();

  if (cityA && cityB && cityA !== cityB) {
    conflicts.push(`Geographical conflict: Entity A is in '${cityA}' while Entity B is in '${cityB}'.`);
    return {
      identityState: IDENTITY_STATES.CONFLICTED,
      confidence: 0.1,
      matchReasons: [],
      conflicts,
      sameEntity: false,
    };
  }

  // 3. Name Similarity
  const nameA = entityA.name || entityA.canonicalName || '';
  const nameB = entityB.name || entityB.canonicalName || '';
  const normA = normalizeEntityName(nameA);
  const normB = normalizeEntityName(nameB);

  const exactNameMatch = normA.length > 0 && normA === normB;
  const tokensA = extractCoreTokens(nameA);
  const tokensB = extractCoreTokens(nameB);
  const simScore = tokenSimilarity(tokensA, tokensB);

  if (exactNameMatch) {
    matchReasons.push('Normalized business names match identically.');
  } else if (simScore >= 0.6) {
    matchReasons.push(`High name token overlap (${Math.round(simScore * 100)}%).`);
  }

  // 4. Coordinate Distance Check
  const latA = Number(entityA.lat || entityA.latitude);
  const lonA = Number(entityA.lon || entityA.longitude);
  const latB = Number(entityB.lat || entityB.latitude);
  const lonB = Number(entityB.lon || entityB.longitude);

  const hasCoordsA = Number.isFinite(latA) && Number.isFinite(lonA);
  const hasCoordsB = Number.isFinite(latB) && Number.isFinite(lonB);

  let coordDistKm = null;
  if (hasCoordsA && hasCoordsB) {
    coordDistKm = distKm(latA, lonA, latB, lonB);
    if (coordDistKm <= 0.2) {
      matchReasons.push(`Coordinates match within ${Math.round(coordDistKm * 1000)}m.`);
    } else if (coordDistKm > 5.0) {
      conflicts.push(`Coordinates diverge by ${Math.round(coordDistKm * 10) / 10}km.`);
    }
  }

  // 5. Contact & Domain Match
  const phoneA = (entityA.phone || '').replace(/\D/g, '');
  const phoneB = (entityB.phone || '').replace(/\D/g, '');
  if (phoneA.length >= 10 && phoneB.length >= 10 && phoneA.slice(-10) === phoneB.slice(-10)) {
    matchReasons.push('Contact telephone numbers match.');
  }

  const webA = (entityA.website || entityA.domain || '').toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  const webB = (entityB.website || entityB.domain || '').toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  if (webA && webB && webA === webB && webA.length > 3) {
    matchReasons.push(`Domain matches: ${webA}`);
  }

  // 6. Synthesize Match Classification
  if (conflicts.length > 0 && coordDistKm != null && coordDistKm > 5.0) {
    return {
      identityState: IDENTITY_STATES.CONFLICTED,
      confidence: 0.15,
      matchReasons,
      conflicts,
      sameEntity: false,
    };
  }

  if ((exactNameMatch || simScore >= 0.65) && coordDistKm != null && coordDistKm <= 0.25) {
    return {
      identityState: IDENTITY_STATES.EXACT_MATCH,
      confidence: 0.98,
      matchReasons,
      conflicts,
      sameEntity: true,
    };
  }

  if (simScore >= 0.5 && coordDistKm != null && coordDistKm <= 0.25) {
    return {
      identityState: IDENTITY_STATES.HIGH_CONFIDENCE_MATCH,
      confidence: 0.90,
      matchReasons,
      conflicts,
      sameEntity: true,
    };
  }

  if (simScore >= 0.6 && (coordDistKm == null || coordDistKm <= 1.0) && matchReasons.length >= 2) {
    return {
      identityState: IDENTITY_STATES.HIGH_CONFIDENCE_MATCH,
      confidence: 0.88,
      matchReasons,
      conflicts,
      sameEntity: true,
    };
  }

  if (simScore >= 0.5 || exactNameMatch) {
    return {
      identityState: IDENTITY_STATES.POSSIBLE_MATCH,
      confidence: 0.60,
      matchReasons,
      conflicts,
      sameEntity: false, // Do not auto-merge on possible alone
    };
  }

  return {
    identityState: IDENTITY_STATES.UNRESOLVED,
    confidence: 0.30,
    matchReasons,
    conflicts: conflicts.length ? conflicts : ['Insufficient shared corroborating attributes.'],
    sameEntity: false,
  };
}

class TrustEntityResolver {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Resolves an input entity against a list of candidate entities.
   * @param {Object} input
   * @param {Array<Object>} candidates
   * @returns {Object} resolution result
   */
  resolveEntity(input = {}, candidates = []) {
    if (!input || !candidates || !candidates.length) {
      return {
        matchState: IDENTITY_STATES.UNRESOLVED,
        matchedEntity: null,
        confidence: 0.1,
        spatialDistanceMeters: null,
        reason: 'No candidate entities provided for resolution.',
        conflicts: [],
      };
    }

    let bestCand = null;
    let bestRes = null;
    let bestDistMeters = null;

    for (const cand of candidates) {
      const res = resolveEntityIdentity(input, cand);

      let distMeters = null;
      const latA = Number(input.lat || input.latitude);
      const lonA = Number(input.lon || input.longitude);
      const latB = Number(cand.lat || cand.latitude);
      const lonB = Number(cand.lon || cand.longitude);
      if (Number.isFinite(latA) && Number.isFinite(lonA) && Number.isFinite(latB) && Number.isFinite(lonB)) {
        distMeters = Math.round(distKm(latA, lonA, latB, lonB) * 1000);
      }

      if (!bestRes || res.confidence > bestRes.confidence) {
        bestRes = res;
        bestCand = cand;
        bestDistMeters = distMeters;
      }
    }

    return {
      matchState: bestRes.identityState,
      matchedEntity: bestRes.sameEntity ? bestCand : null,
      confidence: bestRes.confidence,
      spatialDistanceMeters: bestDistMeters,
      reason: bestRes.matchReasons.join('; ') || (bestRes.conflicts && bestRes.conflicts.join('; ')) || 'Unresolved',
      conflicts: bestRes.conflicts || [],
    };
  }
}

module.exports = {
  TrustEntityResolver,
  MATCH_STATES: IDENTITY_STATES,
  IDENTITY_STATES,
  normalizeEntityName,
  extractCoreTokens,
  tokenSimilarity,
  resolveEntityIdentity,
};
