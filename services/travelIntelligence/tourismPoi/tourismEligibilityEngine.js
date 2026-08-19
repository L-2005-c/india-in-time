'use strict';

const { classifyTourismCandidate } = require('./tourismCategoryClassifier');
const { resolveAuthority } = require('./tourismAuthorityResolver');
const { tourismQualityScore, tourismTier } = require('./tourismQualityScore');
const { TYPE_REJECTS, looksLikeRejectedName, hasTourismNameSignal } = require('./tourismBlacklist');

const ATTR_ACTIONABLE = new Set([
  'TOURIST_ATTRACTION', 'CULTURAL_SITE', 'TEMPLE_RELIGIOUS_ATTRACTION', 'SCENIC_LOCATION',
  'VIEWPOINT', 'BEACH', 'WATERFALL', 'PARK_GARDEN', 'MUSEUM', 'HISTORICAL_SITE',
  'MONUMENT', 'FORT_PALACE', 'HERITAGE_SITE', 'WILDLIFE_NATURE', 'ZOO_AQUARIUM',
  'ENTERTAINMENT', 'FAMILY_ATTRACTION', 'ADVENTURE', 'PHOTOGRAPHY_SPOT',
]);
const FOOD = new Set(['FOOD_DESTINATION']);
const SHOPPING = new Set(['SHOPPING_DESTINATION', 'MARKET_DESTINATION']);
const ALWAYS_REJECT = new Set(['LOCALITY', 'RESIDENTIAL_AREA', 'NEIGHBORHOOD', 'COLONY', 'STREET', 'ROAD', 'JUNCTION', 'BUS_STOP', 'ORDINARY_BUILDING', 'OFFICE', 'SCHOOL', 'HOSPITAL', 'POLICE_STATION', 'BANK', 'ATM', 'GENERIC_SERVICE', 'GENERIC_COMMERCIAL_AREA', 'UNKNOWN_MAP_ENTITY']);

function hasExplicitTourismEvidence(place, cls) {
  if (place.verifiedTouristAttraction === true || place.officialTourism === true || place.officialVenue === true || place.curated === true) return true;
  if (ATTR_ACTIONABLE.has(cls) || FOOD.has(cls) || SHOPPING.has(cls)) return true;
  return hasTourismNameSignal(place.name);
}

function evaluateTourismCandidate(place = {}, options = {}) {
  const cls = classifyTourismCandidate(place);
  const authority = resolveAuthority(place);
  const score = tourismQualityScore(place, cls, authority);
  const tier = tourismTier(score);
  const cat = String(place.cat || place.category || '').toLowerCase();
  const requestedFood = options.foodRequested === true || options.preferredCategories?.includes('food') || options.foodFocus === true;
  const requestedShopping = options.shoppingRequested === true || options.preferredCategories?.includes('shopping') || options.preferredCategories?.includes('mall');
  const explicitTourismOnly = options.tourismOnly === true || options.onlyTouristPlaces === true;

  let eligible = true;
  let reason = null;

  if (explicitTourismOnly && (FOOD.has(cls) || SHOPPING.has(cls))) {
    eligible = false;
    reason = 'tourism-only mode excludes food/shopping destinations';
  } else if (ALWAYS_REJECT.has(cls)) {
    eligible = false;
    reason = `rejected map entity type: ${cls}`;
  } else if (TYPE_REJECTS.has(String(place.type || place.placeType || place.place_type || '').toLowerCase())) {
    eligible = false;
    reason = 'rejected non-tourism provider type';
  } else if (looksLikeRejectedName(place.name) && !place.verifiedTouristAttraction) {
    eligible = false;
    reason = 'name resembles locality/infrastructure rather than an attraction';
  } else if (FOOD.has(cls)) {
    eligible = requestedFood;
    reason = eligible ? null : 'food destination not requested';
  } else if (SHOPPING.has(cls)) {
    eligible = requestedShopping;
    reason = eligible ? null : 'shopping destination not requested';
  } else if (!ATTR_ACTIONABLE.has(cls) && !hasExplicitTourismEvidence(place, cls)) {
    eligible = false;
    reason = 'insufficient tourism evidence';
  } else if (explicitTourismOnly && !ATTR_ACTIONABLE.has(cls)) {
    eligible = false;
    reason = 'not a verified tourist attraction';
  } else if (tier === 'REJECT' || (tier === 'D' && options.discoveryMode !== true && !place.verifiedTouristAttraction)) {
    eligible = false;
    reason = `tourism quality too low (${score}/100)`;
  }

  return {
    eligible,
    tourismClass: cls,
    tourismQualityScore: score,
    tourismTier: tier,
    authority,
    reason,
  };
}

function filterTourismCandidates(places, options = {}) {
  const eligible = [];
  const rejected = [];
  for (const place of Array.isArray(places) ? places : []) {
    const result = evaluateTourismCandidate(place, options);
    if (result.eligible) eligible.push({ ...place, tourismClass: result.tourismClass, tourismQualityScore: result.tourismQualityScore, tourismTier: result.tourismTier, tourismAuthority: result.authority });
    else rejected.push({ name: place?.name || null, id: place?.id ?? place?.placeId ?? null, category: place?.cat || place?.category || null, reason: result.reason, tourismClass: result.tourismClass, tourismQualityScore: result.tourismQualityScore, tourismTier: result.tourismTier });
  }
  return { eligible, rejected };
}

module.exports = { evaluateTourismCandidate, filterTourismCandidates };
