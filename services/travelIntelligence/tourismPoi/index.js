'use strict';

/**
 * Tourism POI module — public API.
 *
 * Primary entry: filterEligibleCandidates / evaluateCandidate
 */

const {
  evaluateCandidate,
  filterEligibleCandidates,
  isTourismEligible,
  tierRank,
  TIERS,
  TOURISM_CLASSES,
} = require('./tourismEligibilityEngine');

const { isBlacklistedEntity, isLocalityOnlyName } = require('./tourismBlacklist');
const { resolveWhitelist, isVerifiedShoppingDestination, VIZAG_WHITELIST, getCityWhitelist, listSupportedCities, CITY_WHITELISTS } = require('./tourismWhitelist');
const {
  classifyTourismCategory,
  isRejectClass,
  toProductCategory,
} = require('./tourismCategoryClassifier');
const { computeTourismQualityScore, bayesianRating } = require('./tourismQualityScore');

module.exports = {
  // Core gate
  evaluateCandidate,
  filterEligibleCandidates,
  isTourismEligible,
  // Classification & scoring
  classifyTourismCategory,
  computeTourismQualityScore,
  bayesianRating,
  toProductCategory,
  isRejectClass,
  // Lists
  isBlacklistedEntity,
  isLocalityOnlyName,
  resolveWhitelist,
  isVerifiedShoppingDestination,
  VIZAG_WHITELIST,
  getCityWhitelist,
  listSupportedCities,
  CITY_WHITELISTS,
  // Constants
  TIERS,
  TOURISM_CLASSES,
  tierRank,
};
