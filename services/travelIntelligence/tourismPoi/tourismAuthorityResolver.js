'use strict';

/**
 * tourismAuthorityResolver.js
 * Enforces data source hierarchy and computes provenance authority weights.
 *
 * Source Hierarchy:
 * 1. Official tourism authority / official venue (1.0)
 * 2. Curated verified internal dataset (0.95)
 * 3. Trusted structured place provider (0.85)
 * 4. High-quality mapping provider (0.75)
 * 5. Aggregated rating/review provider (0.65)
 * 6. Open map data (0.50)
 * 7. LLM-generated suggestions ONLY as discovery candidates (0.35)
 */

const SOURCE_AUTHORITY = {
  OFFICIAL_AUTHORITY: { key: 'official_authority', weight: 1.0, label: 'Official Tourism Board / Venue Data' },
  CURATED_INTERNAL: { key: 'curated_internal', weight: 0.95, label: 'Curated Verified Tourism Dataset' },
  TRUSTED_PLACE_API: { key: 'trusted_place_api', weight: 0.85, label: 'Verified Place Intelligence API' },
  HIGH_QUALITY_MAPPING: { key: 'high_quality_mapping', weight: 0.75, label: 'High-Accuracy Geospatial Provider' },
  AGGREGATED_REVIEWS: { key: 'aggregated_reviews', weight: 0.65, label: 'Aggregated Tourism Reviews' },
  OPEN_MAP_DATA: { key: 'open_map_data', weight: 0.50, label: 'OpenStreetMap / Public Map Registry' },
  LLM_DISCOVERY: { key: 'llm_discovery', weight: 0.35, label: 'AI Discovery Candidate (Unverified)' },
};

/**
 * Resolves the authority tier, weight, and label for a candidate's data source.
 * @param {object} candidate - Place candidate with source information
 * @returns {{ sourceKey: string, weight: number, label: string, isCuratedOrOfficial: boolean }}
 */
function resolveSourceAuthority(candidate = {}) {
  const src = String(candidate.source || candidate.dataSource || candidate.sourceType || '').toLowerCase().trim();

  if (src === 'official' || src.includes('tourism_board') || src.includes('official_authority')) {
    const s = SOURCE_AUTHORITY.OFFICIAL_AUTHORITY;
    return { sourceKey: s.key, weight: s.weight, label: s.label, isCuratedOrOfficial: true };
  }

  if (src === 'curated' || src.includes('seed') || src.includes('internal') || candidate.isCurated) {
    const s = SOURCE_AUTHORITY.CURATED_INTERNAL;
    return { sourceKey: s.key, weight: s.weight, label: s.label, isCuratedOrOfficial: true };
  }

  if (src.includes('places_api') || src.includes('google_places') || src.includes('foursquare')) {
    const s = SOURCE_AUTHORITY.TRUSTED_PLACE_API;
    return { sourceKey: s.key, weight: s.weight, label: s.label, isCuratedOrOfficial: false };
  }

  if (src.includes('nominatim') || src.includes('photon') || src.includes('map_provider')) {
    const s = SOURCE_AUTHORITY.HIGH_QUALITY_MAPPING;
    return { sourceKey: s.key, weight: s.weight, label: s.label, isCuratedOrOfficial: false };
  }

  if (src.includes('tripadvisor') || src.includes('reviews') || src.includes('aggregated')) {
    const s = SOURCE_AUTHORITY.AGGREGATED_REVIEWS;
    return { sourceKey: s.key, weight: s.weight, label: s.label, isCuratedOrOfficial: false };
  }

  if (src.includes('osm') || src.includes('openstreetmap') || src.includes('wiki')) {
    const s = SOURCE_AUTHORITY.OPEN_MAP_DATA;
    return { sourceKey: s.key, weight: s.weight, label: s.label, isCuratedOrOfficial: false };
  }

  // Default for AI/LLM discovery candidates
  const s = SOURCE_AUTHORITY.LLM_DISCOVERY;
  return { sourceKey: s.key, weight: s.weight, label: s.label, isCuratedOrOfficial: false };
}

module.exports = {
  resolveSourceAuthority,
  SOURCE_AUTHORITY,
};
