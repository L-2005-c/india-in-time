'use strict';

/**
 * services/travelIntelligence/trust/trustEvidenceGraph.js
 *
 * Evidence Graph & Claim-Level Provenance Engine for India In-Time v3.0 Phase 5.
 *
 * Core Principles:
 * 1. Provenance is preserved at the CLAIM level, not just entity level.
 * 2. 11 Strict Source Classes. LLM_DERIVED is NEVER treated as factual evidence.
 * 3. Preserves disagreement/conflict across sources without flattening or blind averaging.
 */

const SOURCE_CLASSES = Object.freeze({
  GOVERNMENT_REGISTRY: 'GOVERNMENT_REGISTRY',
  OFFICIAL_SAFETY_ALERT: 'OFFICIAL_SAFETY_ALERT',
  MUNICIPAL_FEED: 'MUNICIPAL_FEED',
  OPERATIONAL_TELEMETRY: 'OPERATIONAL_TELEMETRY',
  COMMERCIAL_PLATFORM: 'COMMERCIAL_PLATFORM',
  INDEPENDENT_AUDIT: 'INDEPENDENT_AUDIT',
  GROUND_VERIFICATION: 'GROUND_VERIFICATION',
  USER_REPORTED: 'USER_REPORTED',
  TRAVELER_CONSENSUS: 'TRAVELER_CONSENSUS',
  MEDIA_REPORT: 'MEDIA_REPORT',
  LLM_DERIVED: 'LLM_DERIVED', // Strictly non-evidence; explanations only

  // Aliases for backwards compatibility
  OFFICIAL_GOVERNMENT: 'GOVERNMENT_REGISTRY',
  OFFICIAL_PROVIDER: 'OPERATIONAL_TELEMETRY',
  AUTHORIZED_PROVIDER: 'COMMERCIAL_PLATFORM',
  DIRECT_ENTITY: 'OPERATIONAL_TELEMETRY',
  FIRST_PARTY: 'GROUND_VERIFICATION',
  STRUCTURED_PARTNER: 'COMMERCIAL_PLATFORM',
  TRUSTED_EXTERNAL: 'INDEPENDENT_AUDIT',
  REVIEW_PLATFORM: 'TRAVELER_CONSENSUS',
  MODEL_DERIVED: 'OPERATIONAL_TELEMETRY',
});

const CLAIM_VERIFICATION_STATES = Object.freeze({
  VERIFIED: 'VERIFIED',
  SUPPORTED: 'SUPPORTED',
  CONDITIONAL: 'CONDITIONAL',
  UNVERIFIED: 'UNVERIFIED',
  CONFLICTED: 'CONFLICTED',
  STALE: 'STALE',
  VERIFICATION_UNAVAILABLE: 'VERIFICATION_UNAVAILABLE',
});

const FRESHNESS_STATES = Object.freeze({
  CURRENT: 'CURRENT',
  AGING: 'AGING',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Calculates freshness state based on observed timestamp and validity duration.
 */
function evaluateClaimFreshness(observedAt, maxAgeHours = 24, validUntil = null) {
  if (!observedAt) return FRESHNESS_STATES.UNKNOWN;
  const now = Date.now();
  const obsTime = new Date(observedAt).getTime();
  if (!Number.isFinite(obsTime)) return FRESHNESS_STATES.UNKNOWN;

  if (validUntil) {
    const untilTime = new Date(validUntil).getTime();
    if (Number.isFinite(untilTime) && now > untilTime) {
      return FRESHNESS_STATES.EXPIRED;
    }
  }

  const ageHours = (now - obsTime) / (1000 * 60 * 60);
  if (ageHours < maxAgeHours * 0.5) return FRESHNESS_STATES.CURRENT;
  if (ageHours < maxAgeHours) return FRESHNESS_STATES.AGING;
  return FRESHNESS_STATES.STALE;
}

/**
 * Creates a normalized Claim record.
 */
function createTrustClaim({
  claimId = null,
  entityId = 'unknown_entity',
  claimType = 'GENERAL',
  claimValue = null,
  source = 'unknown_source',
  sourceType = SOURCE_CLASSES.USER_REPORTED,
  confidence = 0.5,
  verificationState = CLAIM_VERIFICATION_STATES.UNVERIFIED,
  observedAt = new Date().toISOString(),
  validUntil = null,
  evidenceDetails = {},
} = {}) {
  // Enforce LLM boundary invariant
  const normalizedSourceType = SOURCE_CLASSES[sourceType] || SOURCE_CLASSES.USER_REPORTED;
  const effectiveConfidence = normalizedSourceType === SOURCE_CLASSES.LLM_DERIVED ? 0.0 : Math.max(0, Math.min(1.0, confidence));
  const effectiveState = normalizedSourceType === SOURCE_CLASSES.LLM_DERIVED ? CLAIM_VERIFICATION_STATES.UNVERIFIED : verificationState;

  const freshnessState = evaluateClaimFreshness(observedAt, 24, validUntil);

  return {
    claimId: claimId || `claim_${entityId}_${claimType}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    entityId,
    claimType: String(claimType).toUpperCase(),
    claimValue,
    source,
    sourceType: normalizedSourceType,
    confidence: effectiveConfidence,
    verificationState: effectiveState,
    freshnessState,
    observedAt: new Date(observedAt).toISOString(),
    validUntil: validUntil ? new Date(validUntil).toISOString() : null,
    evidenceDetails,
    auditTrail: {
      recordedAt: new Date().toISOString(),
      isLlmDerived: normalizedSourceType === SOURCE_CLASSES.LLM_DERIVED,
    },
  };
}

/**
 * In-memory Trust Evidence Graph.
 * Maintains entities, claims, evidence links, and cross-source conflicts.
 */
class TrustEvidenceGraph {
  constructor() {
    this.entities = new Map(); // entityId -> entityProfile
    this.claims = new Map();   // claimId -> claimRecord
    this.entityClaims = new Map(); // entityId -> Set of claimIds
  }

  registerEntity(entityId, metadata = {}) {
    if (!entityId) return null;
    const existing = this.entities.get(entityId) || { entityId, registeredAt: new Date().toISOString() };
    const updated = {
      ...existing,
      ...metadata,
      entityId,
      updatedAt: new Date().toISOString(),
    };
    this.entities.set(entityId, updated);
    if (!this.entityClaims.has(entityId)) {
      this.entityClaims.set(entityId, new Set());
    }
    return updated;
  }

  addClaim(entityIdOrInput, claimType, claimValue) {
    let claimInput;
    if (typeof entityIdOrInput === 'string') {
      claimInput = {
        entityId: entityIdOrInput,
        claimType,
        claimValue,
        source: 'DIRECT_INPUT',
        sourceType: SOURCE_CLASSES.FIRST_PARTY,
      };
    } else {
      claimInput = entityIdOrInput;
    }
    const claim = createTrustClaim(claimInput);
    claim.id = claim.claimId;
    claim.value = claim.claimValue;
    claim.evidence = [];
    this.claims.set(claim.claimId, claim);

    if (!this.entityClaims.has(claim.entityId)) {
      this.entityClaims.set(claim.entityId, new Set());
    }
    this.entityClaims.get(claim.entityId).add(claim.claimId);

    // Cross-reference existing claims of same type for conflict detection
    this.detectAndFlagConflicts(claim.entityId, claim.claimType);

    return claim;
  }

  addEvidence(claimId, evidenceInput = {}) {
    const claim = this.claims.get(claimId);
    if (!claim) {
      throw new Error(`Claim with ID ${claimId} not found.`);
    }

    const sourceClass = evidenceInput.sourceClass || SOURCE_CLASSES.USER_REPORTED;
    const freshness = evaluateClaimFreshness(evidenceInput.capturedAt || new Date().toISOString(), 24);

    const ev = {
      id: `ev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      claimId,
      sourceClass,
      sourceName: evidenceInput.sourceName || 'Unknown Source',
      freshnessState: freshness,
      capturedAt: evidenceInput.capturedAt || new Date().toISOString(),
      details: evidenceInput.details || {},
    };

    claim.evidence = claim.evidence || [];
    claim.evidence.push(ev);
    return ev;
  }

  isEvidenceVerified(claimId) {
    const claim = this.claims.get(claimId);
    if (!claim || !claim.evidence || claim.evidence.length === 0) return false;
    return claim.evidence.some(e => e.sourceClass && e.sourceClass !== SOURCE_CLASSES.LLM_DERIVED);
  }

  getClaimsForEntity(entityId) {
    const claimIds = this.entityClaims.get(entityId);
    if (!claimIds) return [];
    return Array.from(claimIds).map(id => this.claims.get(id)).filter(Boolean);
  }

  getGraphSummary() {
    return {
      totalEntities: this.entities.size,
      totalClaims: this.claims.size,
      sourceClassesSupported: Object.keys(SOURCE_CLASSES).length,
    };
  }

  /**
   * Detects semantic conflicts across sources for an entity and claimType.
   * E.g. Disputed price or disputed open/closed status.
   */
  detectAndFlagConflicts(entityId, claimType) {
    const claims = this.getClaimsForEntity(entityId).filter(c => c.claimType === claimType);
    if (claims.length < 2) return [];

    const conflicts = [];

    if (claimType === 'PRICE') {
      const prices = claims.map(c => ({
        price: Number(c.claimValue?.knownTotal ?? c.claimValue?.basePrice ?? c.claimValue),
        claim: c,
      })).filter(p => Number.isFinite(p.price));

      if (prices.length >= 2) {
        const minP = Math.min(...prices.map(p => p.price));
        const maxP = Math.max(...prices.map(p => p.price));
        if (minP > 0 && maxP / minP >= 1.25) {
          // Discrepancy >= 25% across sources
          conflicts.push({
            type: 'PRICE_CONFLICT',
            summary: `Price discrepancy detected across sources (Range: ₹${minP} – ₹${maxP}).`,
            claims: prices.map(p => ({
              source: p.claim.source,
              sourceType: p.claim.sourceType,
              price: p.price,
              observedAt: p.claim.observedAt,
            })),
          });
          // Update verification states to CONFLICTED
          for (const p of prices) {
            p.claim.verificationState = CLAIM_VERIFICATION_STATES.CONFLICTED;
          }
        }
      }
    }

    if (claimType === 'ROUTE_PASSABILITY' || claimType === 'ROAD_STATUS') {
      const hasOpen = claims.some(c => String(c.claimValue).toUpperCase() === 'OPEN');
      const hasClosed = claims.some(c => String(c.claimValue).toUpperCase() === 'CLOSED' || String(c.claimValue).toUpperCase() === 'BLOCKED');

      if (hasOpen && hasClosed) {
        conflicts.push({
          type: 'ROUTE_CONFLICT',
          summary: 'Routing provider indicates road open, but an authoritative closure signal indicates blockage.',
          claims: claims.map(c => ({
            source: c.source,
            sourceType: c.sourceType,
            status: c.claimValue,
          })),
        });
        for (const c of claims) {
          c.verificationState = CLAIM_VERIFICATION_STATES.CONFLICTED;
        }
      }
    }

    return conflicts;
  }

  getEntityTrustGraph(entityId) {
    const entity = this.entities.get(entityId) || { entityId };
    const claims = this.getClaimsForEntity(entityId);

    // Group claims by claimType
    const grouped = {};
    for (const c of claims) {
      if (!grouped[c.claimType]) grouped[c.claimType] = [];
      grouped[c.claimType].push(c);
    }

    // Check conflicts across all types
    const allConflicts = [];
    for (const type of Object.keys(grouped)) {
      const confs = this.detectAndFlagConflicts(entityId, type);
      if (confs.length) allConflicts.push(...confs);
    }

    return {
      entity,
      claimCount: claims.length,
      claims,
      groupedClaims: grouped,
      conflicts: allConflicts,
      hasConflicts: allConflicts.length > 0,
    };
  }
}

// Singleton global evidence graph instance
const globalEvidenceGraph = new TrustEvidenceGraph();

module.exports = {
  SOURCE_CLASSES,
  CLAIM_VERIFICATION_STATES,
  FRESHNESS_STATES,
  evaluateClaimFreshness,
  createTrustClaim,
  TrustEvidenceGraph,
  globalEvidenceGraph,
};
