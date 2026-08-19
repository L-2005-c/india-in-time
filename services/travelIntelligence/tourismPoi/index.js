'use strict';

const {
  evaluateTourismEligibility,
  filterEligibleTourismCandidates,
  TOURISM_CATEGORIES,
  NON_TOURISM_CATEGORIES,
  TOURISM_TIERS,
} = require('./tourismEligibilityEngine');

const { calculateTourismQuality, calculatePopularityScore } = require('./tourismQualityScore');
const { classifyCategory } = require('./tourismCategoryClassifier');
const { resolveSourceAuthority, SOURCE_AUTHORITY } = require('./tourismAuthorityResolver');
const { validateTourismData } = require('./tourismDataValidator');
const { isBlacklisted, NON_TOURIST_KEYWORDS, CITY_SPECIFIC_LOCALITIES } = require('./tourismBlacklist');
const { isWhitelistedLandmark, VERIFIED_TOURISM_EXCEPTIONS } = require('./tourismWhitelist');

module.exports = {
  evaluateTourismEligibility,
  filterEligibleTourismCandidates,
  calculateTourismQuality,
  calculatePopularityScore,
  classifyCategory,
  resolveSourceAuthority,
  validateTourismData,
  isBlacklisted,
  isWhitelistedLandmark,
  TOURISM_CATEGORIES,
  NON_TOURISM_CATEGORIES,
  TOURISM_TIERS,
  SOURCE_AUTHORITY,
  NON_TOURIST_KEYWORDS,
  CITY_SPECIFIC_LOCALITIES,
  VERIFIED_TOURISM_EXCEPTIONS,
};
