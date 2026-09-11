/**
 * India In-Time v3.0 - Phase 5: Tourist Trust Intelligence
 * Central Barrel Export
 */

const { TrustEntityResolver, MATCH_STATES } = require('./trustEntityResolver');
const {
  TrustEvidenceGraph,
  SOURCE_CLASSES,
  CLAIM_STATUSES,
  FRESHNESS_STATES
} = require('./trustEvidenceGraph');
const {
  nidhiAdapter,
  fssaiAdapter,
  gstinAdapter,
  consumerHelplineAdapter,
  REGISTRY_STATUSES
} = require('./officialRegistryAdapters');
const {
  ProviderLegitimacyEngine,
  PROVIDER_TYPES,
  PROVIDER_TRUST_STATES,
  RECOGNIZED_ASSOCIATIONS
} = require('./providerLegitimacyEngine');
const {
  PriceTrustEngine,
  TRANSPARENCY_TIERS,
  PRICE_FRESHNESS,
  PRICE_TRUST_STATES
} = require('./priceTrustEngine');
const {
  ReviewTrustEngine,
  REVIEW_TRUST_STATES
} = require('./reviewTrustEngine');
const {
  RouteTrustEngine,
  ROUTE_TRUST_STATES
} = require('./routeTrustEngine');
const {
  RecommendationTrustEngine,
  RECOMMENDATION_TRUST_STATES
} = require('./recommendationTrustEngine');
const {
  TouristTrustEngine,
  OBJECT_TYPES,
  TRUST_STATES
} = require('./touristTrustEngine');
const {
  TrustOutcomeTracker,
  trustOutcomeTracker,
  OUTCOME_TYPES
} = require('./trustOutcomeTracker');
const {
  TrustObservability,
  trustObservability
} = require('./trustObservability');

const touristTrustEngine = new TouristTrustEngine();

module.exports = {
  // Engines & Singletons
  TouristTrustEngine,
  touristTrustEngine,
  TrustEntityResolver,
  TrustEvidenceGraph,
  ProviderLegitimacyEngine,
  PriceTrustEngine,
  ReviewTrustEngine,
  RouteTrustEngine,
  RecommendationTrustEngine,
  TrustOutcomeTracker,
  trustOutcomeTracker,
  TrustObservability,
  trustObservability,

  // Official Registry Adapters
  nidhiAdapter,
  fssaiAdapter,
  gstinAdapter,
  consumerHelplineAdapter,

  // Constants & Enums
  OBJECT_TYPES,
  TRUST_STATES,
  MATCH_STATES,
  SOURCE_CLASSES,
  CLAIM_STATUSES,
  FRESHNESS_STATES,
  REGISTRY_STATUSES,
  PROVIDER_TYPES,
  PROVIDER_TRUST_STATES,
  RECOGNIZED_ASSOCIATIONS,
  TRANSPARENCY_TIERS,
  PRICE_FRESHNESS,
  PRICE_TRUST_STATES,
  REVIEW_TRUST_STATES,
  ROUTE_TRUST_STATES,
  RECOMMENDATION_TRUST_STATES,
  OUTCOME_TYPES
};
