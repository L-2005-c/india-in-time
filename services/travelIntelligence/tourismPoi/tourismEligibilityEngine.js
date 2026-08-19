'use strict';

/**
 * Tourism POI Eligibility Engine
 *
 * Pipeline gate: every candidate must pass eligibility before entering
 * ranking, time intelligence, or itinerary optimization.
 *
 * USER REQUEST → ... → TOURISM POI DISCOVERY → [THIS ENGINE] → quality → geo → time → ...
 */

const { isBlacklistedEntity, isLocalityOnlyName, normalizeName } = require('./tourismBlacklist');
const { resolveWhitelist, isVerifiedShoppingDestination } = require('./tourismWhitelist');
const {
  classifyTourismCategory,
  isRejectClass,
  toProductCategory,
  TOURISM_CLASSES,
} = require('./tourismCategoryClassifier');
const { computeTourismQualityScore, TIERS } = require('./tourismQualityScore');

/**
 * Evaluate a single candidate.
 * @returns {EligibilityResult}
 */
function evaluateCandidate(place, options = {}) {
  const cityHint = options.city || options.cityName || place?.city || null;
  const allowFood = options.allowFood !== false;
  const allowShopping = options.allowShopping !== false;
  const requireTouristOnly = options.requireTouristOnly === true;
  const minTier = options.minTier || null; // e.g. 'B' means B and above

  const result = {
    eligible: false,
    place: place || null,
    tourismClass: TOURISM_CLASSES.UNKNOWN_MAP_ENTITY,
    productCategory: null,
    tourismQualityScore: 0,
    tourismTier: TIERS.REJECT,
    confidence: 0,
    reasons: [],
    rejectReason: null,
    dataSource: place?.source || place?.fallbackSource || place?.dataSource || 'unknown',
    whitelistMatch: null,
  };

  if (!place || typeof place !== 'object') {
    result.rejectReason = 'invalid_place';
    result.reasons.push('Candidate is not a valid place object');
    return result;
  }

  const name = String(place.name || '').trim();
  if (!name) {
    result.rejectReason = 'empty_name';
    result.reasons.push('Missing place name');
    return result;
  }

  // ── Stage 1: Whitelist resolution (highest authority) ──────────────────
  const wl = resolveWhitelist(place, cityHint);
  if (wl) {
    place = {
      ...place,
      _whitelistMatch: true,
      _whitelistCategory: wl.category,
      tourismTier: place.tourismTier || wl.tier,
      category: place.category || place.cat || wl.category,
      cat: place.cat || place.category || wl.category,
      lat: place.lat ?? place.coords?.[0] ?? wl.lat,
      lon: place.lon ?? place.coords?.[1] ?? wl.lon,
      source: place.source || 'curated_whitelist',
    };
    result.whitelistMatch = wl.name;
    result.reasons.push(`Matched curated whitelist: ${wl.name}`);
  }

  // ── Stage 2: Hard blacklist ────────────────────────────────────────────
  // Shopping destinations that are verified must bypass commercial name blocks
  const isShoppingOk = allowShopping && isVerifiedShoppingDestination(name);
  if (!isShoppingOk && !wl) {
    const bl = isBlacklistedEntity(place);
    if (bl.rejected) {
      result.rejectReason = bl.reason;
      result.tourismClass = mapRejectReasonToClass(bl.reason);
      result.reasons.push(`Blacklisted: ${bl.reason}${bl.detail ? ` (${bl.detail})` : ''}`);
      return result;
    }
  }

  // Pure locality name with no attraction attachment
  if (!wl && isLocalityOnlyName(name) && !isShoppingOk) {
    result.rejectReason = 'locality_only';
    result.tourismClass = TOURISM_CLASSES.LOCALITY;
    result.reasons.push(`Name "${name}" is a locality/area, not a tourist attraction`);
    return result;
  }

  // ── Stage 3: Category classification ───────────────────────────────────
  const classification = classifyTourismCategory(place);
  result.tourismClass = classification.class;
  result.confidence = classification.confidence;

  if (isRejectClass(classification.class)) {
    result.rejectReason = `reject_class:${classification.class}`;
    result.reasons.push(`Classified as non-tourist: ${classification.class}`);
    return result;
  }

  // Food gate
  if (classification.class === TOURISM_CLASSES.FOOD_DESTINATION && !allowFood) {
    result.rejectReason = 'food_not_requested';
    result.reasons.push('Food destination excluded (food not requested)');
    return result;
  }

  // Shopping gate — only verified / classified shopping when allowed
  if (
    (classification.class === TOURISM_CLASSES.SHOPPING_MALL ||
      classification.class === TOURISM_CLASSES.SHOPPING_DESTINATION) &&
    !allowShopping
  ) {
    result.rejectReason = 'shopping_not_requested';
    result.reasons.push('Shopping destination excluded (shopping not requested)');
    return result;
  }

  // ── Stage 4: Quality score + tier ──────────────────────────────────────
  const quality = computeTourismQualityScore(place, classification, options);
  result.tourismQualityScore = quality.score;
  result.tourismTier = quality.tier;
  result.productCategory = toProductCategory(classification.class) || place.cat || place.category || null;

  if (quality.tier === TIERS.REJECT) {
    result.rejectReason = 'low_tourism_quality';
    result.reasons.push(`Tourism quality too low (${quality.score}/100)`);
    return result;
  }

  // Optional minimum tier filter
  if (minTier && tierRank(quality.tier) < tierRank(minTier)) {
    result.rejectReason = 'below_min_tier';
    result.reasons.push(`Tier ${quality.tier} below required ${minTier}`);
    return result;
  }

  // requireTouristOnly: drop tier D unless discovery mode
  if (requireTouristOnly && quality.tier === TIERS.D && !options.discoveryMode) {
    result.rejectReason = 'tier_d_requires_discovery';
    result.reasons.push('Tier D requires explicit discovery mode');
    return result;
  }

  // Hard exclusive categories (e.g. "malls only")
  const exclusive = normalizeExclusive(options.exclusiveCategories);
  if (exclusive.length) {
    const productCat = toProductCategory(classification.class) || place.cat || place.category || null;
    const catOk = exclusive.some((c) => matchesExclusive(c, productCat, classification.class, place));
    if (!catOk) {
      result.rejectReason = 'exclusive_category_miss';
      result.reasons.push(`Not in exclusive categories: ${exclusive.join(',')}`);
      return result;
    }
  }

  result.eligible = true;
  result.reasons.push(
    `Eligible as ${classification.class} (tier ${quality.tier}, quality ${quality.score}/100)`
  );
  result.place = enrichPlace(place, result, classification, quality);
  return result;
}

function enrichPlace(place, result, classification, quality) {
  return {
    ...place,
    tourismClass: result.tourismClass,
    tourismQualityScore: result.tourismQualityScore,
    tourismTier: result.tourismTier,
    tourismConfidence: result.confidence,
    cat: result.productCategory || place.cat || place.category,
    category: result.productCategory || place.category || place.cat,
    dataSource: result.dataSource,
    _eligibility: {
      eligible: true,
      tier: result.tourismTier,
      qualityScore: result.tourismQualityScore,
      class: result.tourismClass,
      whitelistMatch: result.whitelistMatch,
      factors: quality.factors,
    },
  };
}

function mapRejectReasonToClass(reason) {
  const map = {
    known_locality: TOURISM_CLASSES.LOCALITY,
    locality_name_pattern: TOURISM_CLASSES.LOCALITY,
    locality_only: TOURISM_CLASSES.LOCALITY,
    generic_area_prefix: TOURISM_CLASSES.LOCALITY,
    reject_osm_class: TOURISM_CLASSES.UNKNOWN_MAP_ENTITY,
    reject_osm_type: TOURISM_CLASSES.UNKNOWN_MAP_ENTITY,
    provider_locality_type: TOURISM_CLASSES.LOCALITY,
  };
  return map[reason] || TOURISM_CLASSES.UNKNOWN_MAP_ENTITY;
}

function tierRank(tier) {
  const order = { S: 5, A: 4, B: 3, C: 2, D: 1, REJECT: 0 };
  return order[tier] ?? 0;
}

/**
 * Filter an array of candidates. Returns { eligible, rejected }.
 */
function filterEligibleCandidates(places, options = {}) {
  const eligible = [];
  const rejected = [];

  for (const place of places || []) {
    const evaluation = evaluateCandidate(place, options);
    if (evaluation.eligible) {
      eligible.push(evaluation.place);
    } else {
      rejected.push({
        name: place?.name || null,
        reason: evaluation.rejectReason,
        tourismClass: evaluation.tourismClass,
        detail: evaluation.reasons,
      });
    }
  }

  // Sort eligible by quality score descending, then tier
  eligible.sort((a, b) => {
    const qs = (b.tourismQualityScore || 0) - (a.tourismQualityScore || 0);
    if (qs !== 0) return qs;
    return tierRank(b.tourismTier) - tierRank(a.tourismTier);
  });

  return { eligible, rejected, stats: { input: (places || []).length, eligible: eligible.length, rejected: rejected.length } };
}

/**
 * Quick boolean check used by hot paths.
 */
function isTourismEligible(place, options = {}) {
  return evaluateCandidate(place, options).eligible;
}


function normalizeExclusive(values) {
  if (!Array.isArray(values)) return [];
  return values.map((v) => String(v || '').toLowerCase().trim()).filter(Boolean);
}

function matchesExclusive(want, productCat, tourismClass, place) {
  const w = String(want || '').toLowerCase();
  const cat = String(productCat || '').toLowerCase();
  const cls = String(tourismClass || '').toUpperCase();
  const name = String(place?.name || '').toLowerCase();
  if (w === cat) return true;
  if (w === 'shopping' || w === 'mall' || w === 'malls') {
    return cat === 'shopping' || cls.includes('SHOPPING') || /\bmall\b/i.test(name);
  }
  if (w === 'beach' || w === 'beaches') return cat === 'beach' || cls === 'BEACH';
  if (w === 'temple' || w === 'temples') return cat === 'temple' || cls.includes('TEMPLE') || cls.includes('RELIGIOUS');
  if (w === 'museum' || w === 'museums') return cat === 'museum' || cls === 'MUSEUM';
  if (w === 'food' || w === 'restaurant') return cat === 'food' || cls === 'FOOD_DESTINATION';
  if (w === 'scenic' || w === 'photography') {
    return ['scenic', 'beach', 'park', 'museum'].includes(cat) || /SCENIC|VIEWPOINT|PHOTO|BEACH|PARK/.test(cls);
  }
  return false;
}

module.exports = {
  evaluateCandidate,
  filterEligibleCandidates,
  isTourismEligible,
  tierRank,
  TIERS,
  TOURISM_CLASSES,
};
