'use strict';

/**
 * Resolves provenance without pretending an unverified map result is official.
 */
function resolveAuthority(place = {}) {
  if (place.sourceConfidence != null && place.source) {
    return { source: place.source, confidence: Number(place.sourceConfidence) || 0, tier: 'provided' };
  }
  if (place.officialTourism === true || place.officialVenue === true) {
    return { source: place.source || 'official', confidence: 95, tier: 'official' };
  }
  if (place.curated === true || place.fallbackSource === 'static_city_seed') {
    return { source: place.source || place.fallbackSource || 'curated_internal', confidence: 82, tier: 'curated' };
  }
  if (place.provider || place.googlePlaceId || place.osmId) {
    return { source: place.source || place.provider || 'structured_place_provider', confidence: 62, tier: 'structured' };
  }
  return { source: place.source || 'unverified_map_data', confidence: 35, tier: 'map' };
}

module.exports = { resolveAuthority };
