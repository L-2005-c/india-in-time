/**
 * India In-Time v3.0 - Phase 5: Tourist Trust Intelligence
 * Provider Legitimacy Engine
 *
 * Evaluates provider legitimacy across multiple independent sources:
 * - Official registries (Ministry of Tourism / NIDHI+, FSSAI, GSTIN)
 * - Industry associations (IATO, TAAI, ADTOI, FHRAI)
 * - Operational signals (contact info, address, operating history)
 * - Consumer helpline signals (NCH)
 *
 * Critical Invariant:
 * Unregistered != fraudulent. Missing license != scam.
 * An unregistered small provider is UNVERIFIED, NEVER FRAUD or SCAM.
 */

const {
  nidhiAdapter,
  fssaiAdapter,
  gstinAdapter,
  consumerHelplineAdapter
} = require('./officialRegistryAdapters');

const PROVIDER_TYPES = Object.freeze({
  ACCOMMODATION: 'ACCOMMODATION',
  TOUR_OPERATOR: 'TOUR_OPERATOR',
  LOCAL_GUIDE: 'LOCAL_GUIDE',
  TRANSPORT_PROVIDER: 'TRANSPORT_PROVIDER',
  RESTAURANT: 'RESTAURANT',
  EXPERIENCE_HOST: 'EXPERIENCE_HOST',
  ACTIVITY_OPERATOR: 'ACTIVITY_OPERATOR'
});

const PROVIDER_TRUST_STATES = Object.freeze({
  LEGITIMATE_SUPPORTED: 'LEGITIMATE_SUPPORTED',
  PARTIALLY_VERIFIED: 'PARTIALLY_VERIFIED',
  UNVERIFIED: 'UNVERIFIED',
  CONFLICTED: 'CONFLICTED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

// Known reputable tourism/hospitality associations in India
const RECOGNIZED_ASSOCIATIONS = Object.freeze([
  'IATO', // Indian Association of Tour Operators
  'TAAI', // Travel Agents Association of India
  'ADTOI', // Association of Domestic Tour Operators of India
  'FHRAI', // Federation of Hotel & Restaurant Associations of India
  'HAI', // Hotel Association of India
  'SIHRA', // South India Hotels & Restaurants Association
  'STATE_TOURISM_BOARD'
]);

class ProviderLegitimacyEngine {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Evaluates provider legitimacy.
   * @param {Object} provider
   * @param {string} provider.id
   * @param {string} provider.name
   * @param {string} provider.type - One of PROVIDER_TYPES
   * @param {string} [provider.city]
   * @param {string} [provider.state]
   * @param {string} [provider.address]
   * @param {string} [provider.phone]
   * @param {string} [provider.email]
   * @param {string} [provider.nidhiId]
   * @param {string} [provider.fssaiLicense]
   * @param {string} [provider.gstin]
   * @param {Array<string>} [provider.associations]
   * @param {number} [provider.yearsOperating]
   * @param {Array<Object>} [provider.claimedRegistrations]
   * @returns {Object} legitimacy evaluation
   */
  async evaluateProvider(provider = {}) {
    if (!provider || !provider.name) {
      return {
        providerId: provider?.id || 'unknown',
        providerName: provider?.name || 'Unknown Provider',
        providerType: provider?.type || PROVIDER_TYPES.TOUR_OPERATOR,
        trustState: PROVIDER_TRUST_STATES.INSUFFICIENT_DATA,
        confidence: 0.1,
        summary: 'Insufficient data provided to evaluate provider legitimacy.',
        verifications: [],
        conflicts: [],
        associations: [],
        operationalSignals: { score: 0, details: [] },
        neutralAdvisory: null,
        evaluatedAt: new Date().toISOString()
      };
    }

    const providerType = provider.type || PROVIDER_TYPES.TOUR_OPERATOR;
    const verifications = [];
    const conflicts = [];
    let positiveOfficialMatches = 0;
    let attemptedVerifications = 0;

    // 1. Verify Official Registrations based on provider type
    // Accommodation & Tour Operator & Guide -> NIDHI+
    if (provider.nidhiId) {
      attemptedVerifications++;
      const nidhiResult = await nidhiAdapter.verifyNidhiRegistration(provider.nidhiId, {
        providerName: provider.name,
        category: providerType,
        city: provider.city
      });
      verifications.push(nidhiResult);
      if (nidhiResult.verified) {
        positiveOfficialMatches++;
      }
      if (nidhiResult.conflicts && nidhiResult.conflicts.length > 0) {
        conflicts.push(...nidhiResult.conflicts);
      }
    }

    // Restaurant / Food -> FSSAI
    if (provider.fssaiLicense || providerType === PROVIDER_TYPES.RESTAURANT) {
      if (provider.fssaiLicense) {
        attemptedVerifications++;
        const fssaiResult = await fssaiAdapter.verifyFssaiLicense(provider.fssaiLicense, {
          businessName: provider.name,
          city: provider.city
        });
        verifications.push(fssaiResult);
        if (fssaiResult.verified) {
          positiveOfficialMatches++;
        }
        if (fssaiResult.conflicts && fssaiResult.conflicts.length > 0) {
          conflicts.push(...fssaiResult.conflicts);
        }
      }
    }

    // Commercial entities -> GSTIN
    if (provider.gstin) {
      attemptedVerifications++;
      const gstinResult = await gstinAdapter.verifyGstin(provider.gstin, {
        tradeName: provider.name,
        state: provider.state
      });
      verifications.push(gstinResult);
      if (gstinResult.verified) {
        positiveOfficialMatches++;
      }
      if (gstinResult.conflicts && gstinResult.conflicts.length > 0) {
        conflicts.push(...gstinResult.conflicts);
      }
    }

    // Check for claimed registrations with mismatch
    if (Array.isArray(provider.claimedRegistrations)) {
      for (const claim of provider.claimedRegistrations) {
        if (claim.mismatchDetected) {
          conflicts.push({
            type: 'REGISTRATION_MISMATCH',
            description: `Claimed ${claim.scheme} registration '${claim.id}' resolved to an unrelated entity: '${claim.resolvedName}'.`,
            severity: 'HIGH'
          });
        }
      }
    }

    // 2. Check Consumer Helpline signals
    let grievanceData = null;
    if (provider.name) {
      grievanceData = await consumerHelplineAdapter.checkGrievances(provider.name, {
        city: provider.city
      });
      if (grievanceData.hasPendingGrievances && grievanceData.pendingCount > 5) {
        conflicts.push({
          type: 'HIGH_GRIEVANCE_VOLUME',
          description: `Consumer helpline records show ${grievanceData.pendingCount} active unaddressed consumer complaints.`,
          severity: 'MEDIUM'
        });
      }
    }

    // 3. Industry Associations
    const verifiedAssociations = [];
    if (Array.isArray(provider.associations)) {
      for (const assoc of provider.associations) {
        const normalizedAssoc = String(assoc).toUpperCase().trim();
        if (RECOGNIZED_ASSOCIATIONS.includes(normalizedAssoc)) {
          verifiedAssociations.push(normalizedAssoc);
        }
      }
    }

    // 4. Operational Signals
    const operationalDetails = [];
    let operationalScore = 0;

    if (provider.phone && /^[+0-9\s-]{10,15}$/.test(provider.phone.trim())) {
      operationalScore += 20;
      operationalDetails.push('Active verified contact telephone number');
    }
    if (provider.email && provider.email.includes('@')) {
      operationalScore += 15;
      operationalDetails.push('Verifiable business email contact');
    }
    if (provider.address && provider.address.length > 10) {
      operationalScore += 25;
      operationalDetails.push('Physical address details present');
    }
    if (provider.yearsOperating && Number(provider.yearsOperating) >= 2) {
      operationalScore += 20;
      operationalDetails.push(`Established operating history: ${provider.yearsOperating} years`);
    } else if (provider.yearsOperating && Number(provider.yearsOperating) > 0) {
      operationalScore += 10;
      operationalDetails.push(`Operating history: ${provider.yearsOperating} year(s)`);
    }
    if (verifiedAssociations.length > 0) {
      operationalScore += 20;
      operationalDetails.push(`Member of recognized industry association(s): ${verifiedAssociations.join(', ')}`);
    }

    operationalScore = Math.min(100, operationalScore);

    // 5. Determine Provider Trust State
    let trustState = PROVIDER_TRUST_STATES.UNVERIFIED;
    let confidence = 0.5;
    let summary = '';
    let neutralAdvisory = null;

    if (conflicts.length > 0) {
      trustState = PROVIDER_TRUST_STATES.CONFLICTED;
      confidence = 0.75;
      summary = `Conflicting provider credentials detected (${conflicts.length} conflict(s)). Independent verification required.`;
    } else if (positiveOfficialMatches >= 2 || (positiveOfficialMatches >= 1 && verifiedAssociations.length > 0)) {
      trustState = PROVIDER_TRUST_STATES.LEGITIMATE_SUPPORTED;
      confidence = 0.90;
      summary = `Verified across official registries and industry recognitions (${positiveOfficialMatches} registry match(es)).`;
    } else if (positiveOfficialMatches === 1 || verifiedAssociations.length > 0 || operationalScore >= 60) {
      trustState = PROVIDER_TRUST_STATES.PARTIALLY_VERIFIED;
      confidence = 0.70;
      summary = positiveOfficialMatches === 1
        ? `Partially verified via official registry record.`
        : `Supported by operational signals and recognized industry association membership.`;
    } else if (attemptedVerifications === 0 && operationalScore < 20) {
      trustState = PROVIDER_TRUST_STATES.INSUFFICIENT_DATA;
      confidence = 0.25;
      summary = `Limited public operational records found for this provider.`;
      neutralAdvisory = this._buildNeutralAdvisory(providerType);
    } else {
      trustState = PROVIDER_TRUST_STATES.UNVERIFIED;
      confidence = 0.45;
      summary = `This provider is not currently indexed in central digital registries.`;
      neutralAdvisory = this._buildNeutralAdvisory(providerType);
    }

    return {
      providerId: provider.id || `prov_${Date.now()}`,
      providerName: provider.name,
      providerType,
      trustState,
      confidence,
      summary,
      verifications,
      conflicts,
      associations: verifiedAssociations,
      operationalSignals: {
        score: operationalScore,
        details: operationalDetails
      },
      grievances: grievanceData,
      neutralAdvisory,
      evaluatedAt: new Date().toISOString()
    };
  }

  _buildNeutralAdvisory(providerType) {
    switch (providerType) {
      case PROVIDER_TYPES.LOCAL_GUIDE:
        return 'This guide is not listed in central digital registries. This is standard for independent local guides and heritage custodians in regional destinations.';
      case PROVIDER_TYPES.EXPERIENCE_HOST:
      case PROVIDER_TYPES.ACTIVITY_OPERATOR:
        return 'This experience host operates independently without central registry listing. Common for artisanal, home-hosted, or community-run travel activities.';
      case PROVIDER_TYPES.RESTAURANT:
        return 'Central FSSAI digital registry record not attached to this listing. Common for traditional street-side eateries and heritage cafes.';
      default:
        return 'This provider is not listed in central digital registries. Common for independent local businesses and small family operations in India.';
    }
  }
}

module.exports = {
  ProviderLegitimacyEngine,
  PROVIDER_TYPES,
  PROVIDER_TRUST_STATES,
  RECOGNIZED_ASSOCIATIONS
};
