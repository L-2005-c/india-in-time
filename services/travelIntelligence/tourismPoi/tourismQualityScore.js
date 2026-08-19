'use strict';

/**
 * tourismQualityScore.js
 * Calculates the multi-factor Tourism Quality Score (0–100) and assigns Tourism Priority Tiers.
 *
 * Factors:
 * 1. Bayesian log-weighted rating & review volume (avoids 4.8 / 10 reviews beating 4.6 / 8,000 reviews)
 * 2. Category significance & iconicity (signature beaches, museums, viewpoints vs minor spots)
 * 3. Cultural / historical / scenic significance
 * 4. Data-source authority & verification level
 * 5. Metadata completeness (accurate opening hours, coordinates, visit duration)
 */

const { resolveSourceAuthority } = require('./tourismAuthorityResolver');

// Tourism Priority Tiers
const TOURISM_TIERS = {
  TIER_S: 'TIER_S', // Iconic / Must-Consider (90-100)
  TIER_A: 'TIER_A', // High-Value Tourist Attraction (75-89)
  TIER_B: 'TIER_B', // Good Tourist Attraction (60-74)
  TIER_C: 'TIER_C', // Niche / Local Experience (45-59)
  TIER_D: 'TIER_D', // Low Confidence / Insufficient Evidence (30-44)
  REJECT: 'REJECT', // Not a Tourist Destination (< 30)
};

/**
 * Calculates a Bayesian log-scaled popularity score from rating (1-5) and review volume.
 * @param {number} rating - User rating (1.0 to 5.0)
 * @param {number} reviewCount - Number of user reviews
 * @returns {number} 0 to 100 popularity score
 */
function calculatePopularityScore(rating = 4.0, reviewCount = 100) {
  const r = Math.max(1.0, Math.min(5.0, Number(rating) || 4.0));
  const c = Math.max(0, Number(reviewCount) || 50);

  // Bayesian prior: mean rating 4.0 with confidence weight m = 50 reviews
  const priorRating = 4.0;
  const m = 50;
  const bayesianRating = (c * r + m * priorRating) / (c + m);

  // Rating contribution (0-60 points) based on Bayesian adjusted rating
  const ratingPoints = ((bayesianRating - 1.0) / 4.0) * 60;

  // Review volume log scale (0-40 points): 10 reviews -> 10 pts, 100 reviews -> 20 pts, 1000 reviews -> 30 pts, 10000+ reviews -> 40 pts
  const logReviews = c > 0 ? Math.log10(c + 1) : 0;
  const reviewPoints = Math.min(40, (logReviews / 4.0) * 40);

  return Math.max(0, Math.min(100, Math.round(ratingPoints + reviewPoints)));
}

/**
 * Calculates the comprehensive Tourism Quality Score (0–100).
 * @param {object} candidate - Place candidate with metadata
 * @param {object} classification - Category classification result from tourismCategoryClassifier
 * @returns {{ qualityScore: number, tier: string, components: object, breakdown: string[] }}
 */
function calculateTourismQuality(candidate = {}, classification = {}) {
  // If classified as invalid/locality or blacklisted, immediate REJECT
  if (!classification.isTourismValid) {
    return {
      qualityScore: 0,
      tier: TOURISM_TIERS.REJECT,
      components: { popularity: 0, categoryWeight: 0, authority: 0, completeness: 0 },
      breakdown: ['Disqualified: Non-tourist category or blacklisted locality'],
    };
  }

  const name = String(candidate.name || '').toLowerCase();
  const rawRating = candidate.rating ?? candidate.userRating ?? 4.2;
  const rawReviews = candidate.reviews ?? candidate.reviewCount ?? candidate.user_ratings_total ?? (candidate.isCurated ? 1200 : 150);
  const importance = String(candidate.importance || candidate.significance || '').toLowerCase();

  // 1. Popularity & Rating component (35% weight)
  const popularity = calculatePopularityScore(rawRating, rawReviews);

  // 2. Category & Iconicity component (30% weight)
  let categoryPoints = 70; // baseline for valid tourist POIs
  if (importance === 'must_see' || candidate.isMustSee || candidate.is_signature) {
    categoryPoints = 100;
  } else if (importance === 'famous' || candidate.isFamous) {
    categoryPoints = 85;
  } else if (/submarine|kailasagiri|rushikonda|ramakrishna beach|charminar|golconda|red fort|india gate|hawa mahal|amber fort|gateway of india|taj mahal|qutub minar/i.test(name)) {
    categoryPoints = 100; // iconic national landmarks
  } else if (/beach|museum|fort|palace|waterfall|viewpoint|aquarium|sanctuary|zoo/i.test(name)) {
    categoryPoints = 80;
  } else if (/mall|inorbit|cmr central/i.test(name)) {
    categoryPoints = 78;
  }

  // 3. Source Authority component (20% weight)
  const sourceAuth = resolveSourceAuthority(candidate);
  const authorityPoints = Math.round(sourceAuth.weight * 100);

  // 4. Metadata Completeness & Verification (15% weight)
  let completenessPoints = 60;
  if (Array.isArray(candidate.coords) && candidate.coords.length === 2 && Number.isFinite(candidate.coords[0])) {
    completenessPoints += 15;
  }
  if (candidate.ot && candidate.ct) completenessPoints += 15;
  if (candidate.vt || candidate.visit_minutes) completenessPoints += 10;
  completenessPoints = Math.min(100, completenessPoints);

  // Weighted Total Quality Score (0–100)
  const qualityScore = Math.max(0, Math.min(100, Math.round(
    popularity * 0.35 +
    categoryPoints * 0.30 +
    authorityPoints * 0.20 +
    completenessPoints * 0.15
  )));

  // Determine Tier
  let tier = TOURISM_TIERS.TIER_B;
  if (qualityScore >= 90 || categoryPoints === 100) {
    tier = TOURISM_TIERS.TIER_S;
  } else if (qualityScore >= 75) {
    tier = TOURISM_TIERS.TIER_A;
  } else if (qualityScore >= 60) {
    tier = TOURISM_TIERS.TIER_B;
  } else if (qualityScore >= 45) {
    tier = TOURISM_TIERS.TIER_C;
  } else if (qualityScore >= 30) {
    tier = TOURISM_TIERS.TIER_D;
  } else {
    tier = TOURISM_TIERS.REJECT;
  }

  const breakdown = [
    `Popularity: ${popularity}/100 (Rating ${rawRating}, Reviews ${rawReviews})`,
    `Category Iconicity: ${categoryPoints}/100 (${classification.category})`,
    `Source Authority: ${authorityPoints}/100 (${sourceAuth.label})`,
    `Metadata Completeness: ${completenessPoints}/100`,
  ];

  return {
    qualityScore,
    tier,
    components: {
      popularity,
      categoryWeight: categoryPoints,
      authority: authorityPoints,
      completeness: completenessPoints,
    },
    breakdown,
  };
}

module.exports = {
  calculateTourismQuality,
  calculatePopularityScore,
  TOURISM_TIERS,
};
