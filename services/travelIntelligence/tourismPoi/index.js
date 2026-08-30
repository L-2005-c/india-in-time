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
const { createCanonicalPlace, calculatePlaceDataQuality, generateDeterministicPlaceId } = require('./canonicalPlaceModel');
const { validatePoiCoordinates, checkCoordinateTolerance, INDIA_GEO_BOUNDS } = require('./coordinateIntegrity');
const { resolveCanonicalPlace, normalizePlaceName, dedupeCanonicalPlaces } = require('./canonicalPlaceResolver');

module.exports = {
  // Core gate
  evaluateCandidate,
  filterEligibleCandidates,
  isTourismEligible,
  // Canonical place resolution & model
  createCanonicalPlace,
  calculatePlaceDataQuality,
  generateDeterministicPlaceId,
  resolveCanonicalPlace,
  normalizePlaceName,
  dedupeCanonicalPlaces,
  // Coordinate integrity
  validatePoiCoordinates,
  checkCoordinateTolerance,
  INDIA_GEO_BOUNDS,
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
