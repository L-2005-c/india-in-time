'use strict';

/**
 * Tourism Quality Score (0–100) and Priority Tiers.
 *
 * A place with 4.8 / 10 reviews must NOT automatically outrank
 * 4.6 / 8,000 reviews. Volume, authority, category validity, and
 * multi-source confirmation all contribute.
 */

const TIERS = Object.freeze({
  S: 'S', // Iconic / must-consider
  A: 'A', // High-value tourist attraction
  B: 'B', // Good tourist attraction
  C: 'C', // Niche / local experience
  D: 'D', // Low confidence
  REJECT: 'REJECT',
});

/**
 * Bayesian-smoothed rating that balances average rating with review volume.
 * Uses a prior of 3.5 stars with strength equivalent to 20 reviews.
 */
function bayesianRating(rating, reviewCount, priorMean = 3.5, priorStrength = 20) {
  const r = Number(rating);
  const n = Math.max(0, Number(reviewCount) || 0);
  if (!Number.isFinite(r) || r <= 0) {
    // No rating — weak prior only
    return { smoothed: priorMean, confidence: Math.min(0.3, n / (n + priorStrength)) };
  }
  const smoothed = (priorStrength * priorMean + n * r) / (priorStrength + n);
  const confidence = n / (n + priorStrength);
  return { smoothed, confidence };
}

/**
 * Source hierarchy confidence (0–1).
 * Higher = more trusted provenance.
 */
function sourceConfidence(place) {
  const src = String(place.source || place.dataSource || place.fallbackSource || '').toLowerCase();
  if (place._whitelistMatch || src === 'curated' || src === 'whitelist') return 0.98;
  if (src.includes('official') || src.includes('tourism_board')) return 0.95;
  if (src.includes('wikipedia') || src.includes('wiki')) return 0.85;
  if (src.includes('gemini') || src.includes('ai')) return 0.55;
  if (src.includes('nominatim') || src.includes('osm')) return 0.5;
  if (src.includes('seed') || src === 'city-seeds') return 0.9;
  if (place.importance === 'must_see') return 0.88;
  if (place.importance === 'famous') return 0.75;
  if (place.importance === 'local') return 0.55;
  return 0.4;
}

/**
 * Category validity boost — confirmed tourist categories score higher.
 */
function categoryValidityScore(tourismClass, isTourist) {
  if (!isTourist) return 0;
  const high = new Set([
    'BEACH', 'TEMPLE', 'MUSEUM', 'VIEWPOINT', 'SCENIC_LOCATION',
    'HERITAGE_SITE', 'FORT', 'PALACE', 'MONUMENT', 'ZOO', 'AQUARIUM',
    'SHOPPING_MALL', 'WATERFALL', 'WILDLIFE',
  ]);
  const mid = new Set([
    'PARK', 'GARDEN', 'FOOD_DESTINATION', 'SHOPPING_DESTINATION',
    'TOURIST_ATTRACTION', 'CULTURAL_SITE', 'RELIGIOUS_ATTRACTION',
    'HISTORICAL_SITE', 'NATURE', 'ENTERTAINMENT', 'PHOTOGRAPHY_SPOT',
  ]);
  if (high.has(tourismClass)) return 95;
  if (mid.has(tourismClass)) return 80;
  return 55;
}

/**
 * Compute tourismQualityScore 0–100 and tier.
 *
 * @param {object} place
 * @param {object} classification - from classifyTourismCategory
 * @param {object} [opts]
 * @returns {{ score: number, tier: string, factors: object }}
 */
function computeTourismQualityScore(place, classification, _opts = {}) {
  if (!classification || !classification.isTourist) {
    return {
      score: 0,
      tier: TIERS.REJECT,
      factors: { reason: 'not_tourist', class: classification?.class },
    };
  }

  const rating = Number(place.rating ?? place.userRating ?? place.stars);
  const reviewCount = Number(place.reviewCount ?? place.user_ratings_total ?? place.reviews ?? 0);
  const { smoothed, confidence: ratingConf } = bayesianRating(rating, reviewCount);

  // Factor weights (sum ≈ 100)
  const w = {
    category: 22,
    rating: 20,
    volume: 12,
    authority: 18,
    uniqueness: 8,
    evidence: 10,
    multiSource: 10,
  };

  const categoryScore = categoryValidityScore(classification.class, true);

  // Rating component: map smoothed 1–5 → 0–100
  const ratingScore = Number.isFinite(smoothed)
    ? Math.max(0, Math.min(100, ((smoothed - 1) / 4) * 100))
    : 50;

  // Volume component: log scale, saturates around 5000 reviews
  const volumeScore = Math.min(100, (Math.log10(Math.max(1, reviewCount) + 1) / Math.log10(5001)) * 100);

  const authorityScore = sourceConfidence(place) * 100;

  // Uniqueness / importance
  let uniquenessScore = 50;
  if (place.importance === 'must_see' || place.tourismTier === 'S') uniquenessScore = 98;
  else if (place.importance === 'famous' || place.tourismTier === 'A') uniquenessScore = 85;
  else if (place.importance === 'local' || place.tourismTier === 'C') uniquenessScore = 60;
  if (place.is_sunrise_spot || place.is_sunset_spot) uniquenessScore = Math.min(100, uniquenessScore + 8);

  // Evidence: description, images, opening hours
  let evidenceScore = 40;
  if (place.description && String(place.description).length > 40) evidenceScore += 20;
  if (place.open_time || place.openingHours || place.openTime) evidenceScore += 15;
  if (place.image || place.photo || place.thumbnail) evidenceScore += 15;
  if (place.visit_minutes || place.averageVisitDuration) evidenceScore += 10;
  evidenceScore = Math.min(100, evidenceScore);

  // Multi-source confirmation
  let multiSourceScore = 30;
  if (place._whitelistMatch) multiSourceScore = 100;
  else if (place.nominatimFixed && place.wikiMatch) multiSourceScore = 90;
  else if (place.wikiMatch || place.wikipedia) multiSourceScore = 75;
  else if (place.nominatimFixed || place.fallbackSource) multiSourceScore = 50;
  if (place.sourceConfidence != null) {
    multiSourceScore = Math.max(multiSourceScore, Number(place.sourceConfidence) * 100);
  }

  const raw =
    (categoryScore * w.category +
      ratingScore * w.rating +
      volumeScore * w.volume +
      authorityScore * w.authority +
      uniquenessScore * w.uniqueness +
      evidenceScore * w.evidence +
      multiSourceScore * w.multiSource) /
    100;

  // Classification confidence dampens score when category is uncertain
  const classConf = Number(classification.confidence) || 0.5;
  const score = Math.round(Math.max(0, Math.min(100, raw * (0.7 + 0.3 * classConf))));

  const tier = scoreToTier(score, place, classification);

  return {
    score,
    tier,
    factors: {
      categoryScore: Math.round(categoryScore),
      ratingScore: Math.round(ratingScore),
      volumeScore: Math.round(volumeScore),
      authorityScore: Math.round(authorityScore),
      uniquenessScore: Math.round(uniquenessScore),
      evidenceScore: Math.round(evidenceScore),
      multiSourceScore: Math.round(multiSourceScore),
      bayesianRating: Math.round(smoothed * 100) / 100,
      reviewCount,
      ratingConfidence: Math.round(ratingConf * 100) / 100,
      classConfidence: classConf,
    },
  };
}

function scoreToTier(score, place, classification) {
  if (!classification?.isTourist) return TIERS.REJECT;
  // Explicit curated tier wins when present and high
  if (place.tourismTier === 'S' || place.importance === 'must_see') return TIERS.S;
  if (place.tourismTier === 'A') return score >= 55 ? TIERS.A : TIERS.B;
  if (place._whitelistMatch && place.tourismTier) return place.tourismTier;

  if (score >= 88) return TIERS.S;
  if (score >= 72) return TIERS.A;
  if (score >= 55) return TIERS.B;
  if (score >= 40) return TIERS.C;
  if (score >= 25) return TIERS.D;
  return TIERS.REJECT;
}

module.exports = {
  TIERS,
  bayesianRating,
  sourceConfidence,
  computeTourismQualityScore,
  scoreToTier,
};
