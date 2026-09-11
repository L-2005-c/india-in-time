/**
 * India In-Time v3.0 - Phase 5: Tourist Trust Intelligence
 * Recommendation Trust Engine
 *
 * Evaluates the confidence and evidential grounding of system recommendations.
 * Separates algorithmic confidence from safety directives.
 *
 * Invariants:
 * - Safety is NOT confidence: An unsafe activity is REJECTED by Phase 3 Safety,
 *   not merely downscored here.
 * - An ungrounded recommendation cannot achieve HIGH_CONFIDENCE.
 * - Every recommendation must state known unknowns, failure modes, and assumptions.
 */

const RECOMMENDATION_TRUST_STATES = Object.freeze({
  HIGH_CONFIDENCE: 'HIGH_CONFIDENCE',
  SUPPORTED: 'SUPPORTED',
  CONDITIONAL: 'CONDITIONAL',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

class RecommendationTrustEngine {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Evaluates recommendation grounding and confidence.
   * @param {Object} recommendation
   * @param {string} recommendation.id
   * @param {string} recommendation.title
   * @param {Object} [recommendation.candidate] - Experience or place candidate
   * @param {Object} [recommendation.placeTrust] - Place trust assessment
   * @param {Object} [recommendation.providerTrust] - Provider trust assessment
   * @param {Object} [recommendation.priceTrust] - Price trust assessment
   * @param {Object} [recommendation.routeTrust] - Route trust assessment
   * @param {Array<Object>} [recommendation.evidenceItems] - Explicit evidence claims
   * @param {Object} [context] - Traveler constraints & preferences
   * @returns {Object} recommendation trust assessment
   */
  evaluateRecommendation(recommendation = {}, context = {}) {
    if (!recommendation || (!recommendation.title && !recommendation.id)) {
      return {
        trustState: RECOMMENDATION_TRUST_STATES.INSUFFICIENT_DATA,
        confidenceScore: 0.1,
        groundingSummary: 'Insufficient recommendation details provided.',
        supportingEvidence: [],
        knownUnknowns: ['No candidate metadata supplied.'],
        failureModes: ['Missing operational context.'],
        assumptions: [],
        alternativeOptions: []
      };
    }

    const supportingEvidence = [];
    const knownUnknowns = [];
    const failureModes = [];
    const assumptions = [];
    let groundedPoints = 0;
    let totalAssessedPoints = 0;

    // 1. Evaluate Evidence Items
    const evidenceItems = Array.isArray(recommendation.evidenceItems) ? recommendation.evidenceItems : [];
    for (const item of evidenceItems) {
      if (item.sourceClass && item.sourceClass !== 'LLM_DERIVED') {
        groundedPoints += 2;
        supportingEvidence.push({
          claim: item.claim,
          sourceClass: item.sourceClass,
          timestamp: item.timestamp || new Date().toISOString()
        });
      } else if (item.sourceClass === 'LLM_DERIVED') {
        // LLM generation alone is NOT factual ground
        knownUnknowns.push(`Claim '${item.claim || 'unspecified'}' relies solely on heuristic LLM derivation without third-party backing.`);
      }
      totalAssessedPoints += 2;
    }

    // 2. Evaluate Sub-Dimension Trust Inputs
    const placeTrust = recommendation.placeTrust;
    if (placeTrust) {
      totalAssessedPoints += 2;
      if (['TRUSTED', 'SUPPORTED', 'EXACT_MATCH'].includes(placeTrust.trustState || placeTrust.matchState)) {
        groundedPoints += 2;
        supportingEvidence.push({
          claim: 'Place identity and physical location corroborated by official/geo databases.',
          sourceClass: 'GEO_DATABASE'
        });
      } else if (placeTrust.trustState === 'CONFLICTED') {
        knownUnknowns.push('Place identity has ambiguous geographic or naming matches.');
      } else {
        knownUnknowns.push('Place registry verification incomplete or unindexed.');
      }
    }

    const providerTrust = recommendation.providerTrust;
    if (providerTrust) {
      totalAssessedPoints += 2;
      if (providerTrust.trustState === 'LEGITIMATE_SUPPORTED') {
        groundedPoints += 2;
        supportingEvidence.push({
          claim: `Provider '${providerTrust.providerName}' is verified in official registry (NIDHI+/FSSAI/GST).`,
          sourceClass: 'GOVERNMENT_REGISTRY'
        });
      } else if (providerTrust.trustState === 'PARTIALLY_VERIFIED') {
        groundedPoints += 1;
        supportingEvidence.push({
          claim: 'Provider established through verifiable operational signals.',
          sourceClass: 'OPERATIONAL_TELEMETRY'
        });
      } else if (providerTrust.trustState === 'CONFLICTED') {
        knownUnknowns.push('Provider registration credentials have unresolved discrepancies.');
      }
    }

    const priceTrust = recommendation.priceTrust;
    if (priceTrust) {
      totalAssessedPoints += 2;
      if (priceTrust.transparencyTier === 'HIGH') {
        groundedPoints += 2;
        supportingEvidence.push({
          claim: 'Pricing is fully itemized and transparent.',
          sourceClass: 'COMMERCIAL_PLATFORM'
        });
      } else if (priceTrust.transparencyTier === 'LOW') {
        knownUnknowns.push('Only lump-sum pricing provided; on-site ancillary charges may apply.');
      }
    }

    const routeTrust = recommendation.routeTrust;
    if (routeTrust) {
      totalAssessedPoints += 2;
      if (routeTrust.isPassable && routeTrust.trustState === 'VERIFIED_PASSABLE') {
        groundedPoints += 2;
        supportingEvidence.push({
          claim: 'Access route confirmed open by live traffic and authority feeds.',
          sourceClass: 'OFFICIAL_SAFETY_ALERT'
        });
      } else if (routeTrust.trustState === 'CONDITIONALLY_PASSABLE') {
        groundedPoints += 1;
        failureModes.push('Route requires special high-clearance vehicle or is subject to pass timing.');
      } else if (routeTrust.trustState === 'ROUTE_CONFLICT') {
        failureModes.push('Access route has conflicting map vs official closure notices.');
      }
    }

    // Standard Contextual Failure Modes & Assumptions
    failureModes.push('Severe weather or sudden rainfall may temporarily alter outdoor experience value.');
    failureModes.push('Local gazetted public holidays may affect queue times or operating hours.');

    assumptions.push('Traveler adheres to recommended departure windows.');
    if (context.hasVehicle) {
      assumptions.push('Private or pre-booked taxi transport is utilized.');
    } else {
      assumptions.push('Local transit or point-to-point app cabs are readily available.');
    }

    // Determine Final Recommendation Confidence & State
    const ratio = totalAssessedPoints > 0 ? (groundedPoints / totalAssessedPoints) : 0.5;
    let trustState = RECOMMENDATION_TRUST_STATES.SUPPORTED;
    const confidenceScore = Number(ratio.toFixed(2));
    let groundingSummary = '';

    if (ratio >= 0.85 && supportingEvidence.length >= 2) {
      trustState = RECOMMENDATION_TRUST_STATES.HIGH_CONFIDENCE;
      groundingSummary = 'Strong multi-source factual corroboration across location, provider, and operational telemetry.';
    } else if (ratio >= 0.60) {
      trustState = RECOMMENDATION_TRUST_STATES.SUPPORTED;
      groundingSummary = 'Grounded by verifiable operational indicators and consistent visitor signals.';
    } else if (failureModes.some(f => f.includes('Route requires') || f.includes('timing'))) {
      trustState = RECOMMENDATION_TRUST_STATES.CONDITIONAL;
      groundingSummary = 'Recommendation valid subject to route conditions and vehicle suitability.';
    } else if (ratio < 0.35) {
      trustState = RECOMMENDATION_TRUST_STATES.LOW_CONFIDENCE;
      groundingSummary = 'Limited independent evidential corroboration. Treat as exploratory recommendation.';
    } else {
      trustState = RECOMMENDATION_TRUST_STATES.SUPPORTED;
      groundingSummary = 'Reasonably supported recommendation with documented operational assumptions.';
    }

    return {
      recommendationId: recommendation.id || `rec_${Date.now()}`,
      title: recommendation.title || 'Travel Recommendation',
      trustState,
      confidenceScore,
      groundingSummary,
      supportingEvidence,
      knownUnknowns,
      failureModes,
      assumptions,
      alternativeOptions: recommendation.alternativeOptions || [],
      evaluatedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  RecommendationTrustEngine,
  RECOMMENDATION_TRUST_STATES
};
