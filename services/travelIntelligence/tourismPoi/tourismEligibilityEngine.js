'use strict';

/**
 * tourismEligibilityEngine.js
 * Master orchestrator for Tourism POI Eligibility, Quality Scoring, Tier Classification,
 * and Blacklist Enforcement.
 *
 * Core Guarantee:
 * - A geographic entity existing on a map does NOT make it a tourist attraction.
 * - Localities, residential colonies, junctions, bus stands, and generic map entities
 *   (e.g., "Marripalem", "Seethammadhara") are strictly REJECTED with explicit audit reasons.
 * - Eligible candidates are enriched with Tourism Quality Scores (0-100), Tiers, and Canonical Categories.
 */

const { classifyCategory, TOURISM_CATEGORIES, NON_TOURISM_CATEGORIES } = require('./tourismCategoryClassifier');
const { calculateTourismQuality, TOURISM_TIERS } = require('./tourismQualityScore');
const { validateTourismData } = require('./tourismDataValidator');
const { resolveSourceAuthority } = require('./tourismAuthorityResolver');
const { isBlacklisted } = require('./tourismBlacklist');
const { isWhitelistedLandmark } = require('./tourismWhitelist');

/**
 * Evaluates a single candidate POI for tourism eligibility.
 * @param {object} candidate - Raw place candidate { name, cat, coords, ot, ct, ... }
 * @param {object} [context] - Execution context { city, cityName, userPreferences, cityLat, cityLon, ... }
 * @returns {object} Full evaluation result with eligibility status, quality score, tier, and reasons.
 */
function evaluateTourismEligibility(candidate = {}, context = {}) {
  const name = String(candidate.name || '').trim();

  // 1. Data sanity check
  const dataValidation = validateTourismData(candidate, context);
  if (!dataValidation.isValid) {
    return {
      isEligible: false,
      tier: TOURISM_TIERS.REJECT,
      qualityScore: 0,
      category: NON_TOURISM_CATEGORIES.UNKNOWN_MAP_ENTITY,
      canonicalCategory: 'invalid',
      rejectionReason: `Data validation failed: ${dataValidation.errors.join('; ')}`,
      candidate,
    };
  }

  // 2. Blacklist check (explicit localities, colonies, non-tourist infrastructure)
  const blacklistCheck = isBlacklisted(name, { ...context, ...candidate });
  if (blacklistCheck.isBlacklisted && !isWhitelistedLandmark(name)) {
    return {
      isEligible: false,
      tier: TOURISM_TIERS.REJECT,
      qualityScore: 0,
      category: NON_TOURISM_CATEGORIES.LOCALITY,
      canonicalCategory: 'invalid',
      rejectionReason: blacklistCheck.reason,
      candidate,
    };
  }

  // 3. Category classification
  const classification = classifyCategory(candidate, context);
  if (!classification.isTourismValid) {
    return {
      isEligible: false,
      tier: TOURISM_TIERS.REJECT,
      qualityScore: 0,
      category: classification.category,
      canonicalCategory: 'invalid',
      rejectionReason: classification.rejectionReason || 'Classified as non-tourism category',
      candidate,
    };
  }

  // 4. Tourism Quality Scoring & Tier Assignment
  const quality = calculateTourismQuality(candidate, classification);
  if (quality.tier === TOURISM_TIERS.REJECT) {
    return {
      isEligible: false,
      tier: TOURISM_TIERS.REJECT,
      qualityScore: quality.qualityScore,
      category: classification.category,
      canonicalCategory: classification.canonicalCategory,
      rejectionReason: quality.breakdown[0] || 'Tourism quality score below minimum threshold',
      candidate,
    };
  }

  // 5. Source authority resolution
  const sourceAuth = resolveSourceAuthority(candidate);

  // Return full enriched eligible tourism POI
  return {
    isEligible: true,
    tier: quality.tier,
    qualityScore: quality.qualityScore,
    category: classification.category,
    canonicalCategory: classification.canonicalCategory,
    sourceAuthority: sourceAuth,
    components: quality.components,
    breakdown: quality.breakdown,
    rejectionReason: null,
    enrichedCandidate: {
      ...candidate,
      name,
      cat: candidate.cat || classification.canonicalCategory,
      category: candidate.category || classification.canonicalCategory,
      tourismCategory: classification.category,
      tourismQualityScore: quality.qualityScore,
      tourismTier: quality.tier,
      sourceAuthority: sourceAuth.sourceKey,
      sourceLabel: sourceAuth.label,
      isVerifiedTouristPoi: true,
    },
  };
}

/**
 * Filters a list of candidate places, returning only eligible tourism POIs and auditing rejections.
 * @param {Array<object>} candidates - List of candidate place objects
 * @param {object} [context] - Context with city and request info
 * @returns {{ eligible: Array<object>, rejected: Array<object>, stats: object }}
 */
function filterEligibleTourismCandidates(candidates = [], context = {}) {
  const eligible = [];
  const rejected = [];

  const list = Array.isArray(candidates) ? candidates : [];

  for (const c of list) {
    const evalResult = evaluateTourismEligibility(c, context);
    if (evalResult.isEligible && evalResult.enrichedCandidate) {
      eligible.push(evalResult.enrichedCandidate);
    } else {
      rejected.push({
        name: c.name || 'Unnamed Candidate',
        rawCategory: c.cat || c.category || 'unknown',
        tier: evalResult.tier,
        reason: evalResult.rejectionReason,
      });
    }
  }

  // Sort eligible candidates by tourism tier and quality score
  const tierRank = { [TOURISM_TIERS.TIER_S]: 5, [TOURISM_TIERS.TIER_A]: 4, [TOURISM_TIERS.TIER_B]: 3, [TOURISM_TIERS.TIER_C]: 2, [TOURISM_TIERS.TIER_D]: 1 };
  eligible.sort((a, b) => {
    const rA = tierRank[a.tourismTier] || 0;
    const rB = tierRank[b.tourismTier] || 0;
    if (rB !== rA) return rB - rA;
    return (b.tourismQualityScore || 0) - (a.tourismQualityScore || 0);
  });

  return {
    eligible,
    rejected,
    stats: {
      totalCandidates: list.length,
      eligibleCount: eligible.length,
      rejectedCount: rejected.length,
      tierDistribution: eligible.reduce((acc, p) => {
        acc[p.tourismTier] = (acc[p.tourismTier] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

module.exports = {
  evaluateTourismEligibility,
  filterEligibleTourismCandidates,
  TOURISM_CATEGORIES,
  NON_TOURISM_CATEGORIES,
  TOURISM_TIERS,
};
