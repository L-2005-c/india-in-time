'use strict';

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function tourismQualityScore(place = {}, tourismClass, authority) {
  const categoryValid = tourismClass !== 'UNKNOWN_MAP_ENTITY' ? 1 : 0;
  const official = place.officialTourism === true || place.officialVenue === true ? 1 : 0;
  const curated = place.curated === true || place.fallbackSource === 'static_city_seed' ? 1 : 0;
  const rating = Number(place.rating);
  const reviews = Number(place.reviewCount ?? place.review_count ?? place.reviews);
  const ratingScore = Number.isFinite(rating) ? clamp((rating / 5) * 100) : 45;
  const reviewScore = Number.isFinite(reviews) ? clamp(Math.log10(Math.max(1, reviews) + 1) / 4 * 100) : 20;
  const tourismRelevance = Number.isFinite(Number(place.tourismRelevance))
    ? clamp(place.tourismRelevance)
    : categoryValid ? 78 : 10;
  const evidence = Number.isFinite(Number(place.evidenceScore)) ? clamp(place.evidenceScore) : authority.confidence;
  const repeated = Number.isFinite(Number(place.sourceCount))
    ? clamp(Math.min(100, Number(place.sourceCount) * 25))
    : 0;

  // Explicit verified/curated provenance carries more weight than a tiny rating.
  const score =
    categoryValid * 18 +
    official * 18 +
    curated * 12 +
    ratingScore * 0.12 +
    reviewScore * 0.08 +
    tourismRelevance * 0.22 +
    evidence * 0.18 +
    repeated * 0.02;

  return Math.round(clamp(score));
}

function tourismTier(score) {
  if (score >= 90) return 'S';
  if (score >= 78) return 'A';
  if (score >= 62) return 'B';
  if (score >= 45) return 'C';
  if (score >= 30) return 'D';
  return 'REJECT';
}

module.exports = { tourismQualityScore, tourismTier, clamp };
