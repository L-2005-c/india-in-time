/**
 * India In-Time v3.0 - Phase 5: Tourist Trust Intelligence
 * Price Trust Engine
 *
 * Decomposes pricing into 11 granular components, classifies transparency,
 * detects demand surges vs price anomalies, tracks freshness,
 * and handles official dual pricing (e.g., ASI monument tickets) with neutral clarity.
 *
 * Invariant:
 * Price increase != overcharge. Expensive != scam.
 * Never emit "SCAM" or "RIPOFF".
 */

const TRANSPARENCY_TIERS = Object.freeze({
  HIGH: 'HIGH',       // All components explicitly itemized
  MEDIUM: 'MEDIUM',   // Base price and estimated taxes/fees indicated
  LOW: 'LOW',         // Lump sum only, no component visibility
  UNKNOWN: 'UNKNOWN'  // No price stated or "contact for price"
});

const PRICE_FRESHNESS = Object.freeze({
  FRESH: 'FRESH',     // <= 24 hours
  AGING: 'AGING',     // 24h to 7 days
  STALE: 'STALE',     // > 7 days
  EXPIRED: 'EXPIRED'  // Validity date passed or tariff season changed
});

const PRICE_TRUST_STATES = Object.freeze({
  VERIFIED_TRANSPARENT: 'VERIFIED_TRANSPARENT',
  TYPICAL_RANGE: 'TYPICAL_RANGE',
  SURGE_ACTIVE: 'SURGE_ACTIVE',
  ELEVATED_UNEXPLAINED: 'ELEVATED_UNEXPLAINED',
  OPAQUE_PRICING: 'OPAQUE_PRICING',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

class PriceTrustEngine {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Decomposes and evaluates a price quote.
   * @param {Object} quote
   * @param {number} [quote.basePrice]
   * @param {number} [quote.taxes]
   * @param {number} [quote.fees]
   * @param {number} [quote.serviceCharge]
   * @param {number} [quote.mandatoryExtras]
   * @param {number} [quote.optionalAddOns]
   * @param {number} [quote.seasonalSurge]
   * @param {number} [quote.demandSurge]
   * @param {number} [quote.foreignNationalMarkup]
   * @param {number} [quote.deposit]
   * @param {number} [quote.total]
   * @param {string} [quote.currency='INR']
   * @param {string} [quote.quotedAt]
   * @param {string} [quote.validUntil]
   * @param {Object} [benchmark] - Historical benchmark context
   * @param {number} [benchmark.medianPrice]
   * @param {number} [benchmark.p25]
   * @param {number} [benchmark.p75]
   * @param {boolean} [benchmark.isPeakSeason]
   * @param {string} [benchmark.peakReason] - e.g. "Diwali weekend", "Pushkar Fair"
   * @param {boolean} [benchmark.isAsiMonument]
   * @param {Object} [benchmark.officialTicketTiers] - { domestic: 50, foreign: 550 }
   * @returns {Object} decomposed price and trust assessment
   */
  evaluatePrice(quote = {}, benchmark = {}) {
    if (!quote || (quote.total === undefined && quote.basePrice === undefined)) {
      return {
        transparencyTier: TRANSPARENCY_TIERS.UNKNOWN,
        trustState: PRICE_TRUST_STATES.INSUFFICIENT_DATA,
        freshness: PRICE_FRESHNESS.EXPIRED,
        confidence: 0.1,
        knownTotal: null,
        currency: quote?.currency || 'INR',
        components: null,
        observations: [],
        disclosures: ['No price quotation provided.'],
        pricingAdvice: 'Price not stated upfront. Confirm all inclusions and taxes before booking.'
      };
    }

    const currency = quote.currency || 'INR';
    const basePrice = quote.basePrice !== undefined ? Number(quote.basePrice) : null;
    const taxes = Number(quote.taxes || 0);
    const fees = Number(quote.fees || 0);
    const serviceCharge = Number(quote.serviceCharge || 0);
    const mandatoryExtras = Number(quote.mandatoryExtras || 0);
    const optionalAddOns = Number(quote.optionalAddOns || 0);
    const seasonalSurge = Number(quote.seasonalSurge || 0);
    const demandSurge = Number(quote.demandSurge || 0);
    const foreignNationalMarkup = Number(quote.foreignNationalMarkup || 0);
    const deposit = Number(quote.deposit || 0);

    // 1. Calculate Known Total
    let knownTotal = quote.total !== undefined ? Number(quote.total) : null;
    const hasItemizedComponents = basePrice !== null;

    if (hasItemizedComponents && knownTotal === null) {
      knownTotal = basePrice + taxes + fees + serviceCharge + mandatoryExtras + seasonalSurge + demandSurge + foreignNationalMarkup;
    }

    // 2. Assess Transparency Tier
    let transparencyTier = TRANSPARENCY_TIERS.LOW;
    let itemizedCount = 0;
    if (basePrice !== null) itemizedCount++;
    if (quote.taxes !== undefined) itemizedCount++;
    if (quote.fees !== undefined) itemizedCount++;
    if (quote.serviceCharge !== undefined) itemizedCount++;
    if (quote.mandatoryExtras !== undefined) itemizedCount++;

    if (itemizedCount >= 3) {
      transparencyTier = TRANSPARENCY_TIERS.HIGH;
    } else if (itemizedCount >= 1 && (quote.taxes !== undefined || quote.notes?.includes('tax'))) {
      transparencyTier = TRANSPARENCY_TIERS.MEDIUM;
    } else if (knownTotal !== null) {
      transparencyTier = TRANSPARENCY_TIERS.LOW;
    } else {
      transparencyTier = TRANSPARENCY_TIERS.UNKNOWN;
    }

    // 3. Freshness Assessment
    let freshness = PRICE_FRESHNESS.FRESH;
    const quotedAt = quote.quotedAt ? new Date(quote.quotedAt) : new Date();
    const now = new Date();
    const ageHours = (now - quotedAt) / (1000 * 60 * 60);

    if (quote.validUntil && new Date(quote.validUntil) < now) {
      freshness = PRICE_FRESHNESS.EXPIRED;
    } else if (ageHours > 7 * 24) {
      freshness = PRICE_FRESHNESS.STALE;
    } else if (ageHours > 24) {
      freshness = PRICE_FRESHNESS.AGING;
    } else {
      freshness = PRICE_FRESHNESS.FRESH;
    }

    // 4. Benchmarking & Anomaly / Surge Analysis
    const observations = [];
    const disclosures = [];
    let trustState = PRICE_TRUST_STATES.TYPICAL_RANGE;
    let confidence = 0.8;
    let pricingAdvice = 'Standard transparent pricing matching regional baseline.';

    // Check ASI / Government dual-pricing
    if (benchmark.isAsiMonument && benchmark.officialTicketTiers) {
      disclosures.push(
        `Official ASI regulated ticket tiers: Indian National: ₹${benchmark.officialTicketTiers.domestic}, Foreign Visitor: ₹${benchmark.officialTicketTiers.foreign}.`
      );
      if (foreignNationalMarkup > 0 || (knownTotal && knownTotal === benchmark.officialTicketTiers.foreign)) {
        observations.push({
          type: 'OFFICIAL_DUAL_PRICING',
          description: 'Government-mandated tariff differential for foreign nationals at ASI protected monument.',
          severity: 'INFO'
        });
      }
    }

    if (benchmark.medianPrice && knownTotal !== null) {
      const ratio = knownTotal / benchmark.medianPrice;

      if (ratio > 2.0) {
        if (benchmark.isPeakSeason) {
          trustState = PRICE_TRUST_STATES.SURGE_ACTIVE;
          confidence = 0.85;
          const peakReason = benchmark.peakReason || 'peak travel period';
          pricingAdvice = `Price is ${Math.round((ratio - 1) * 100)}% above off-peak median. Consistent with ${peakReason}.`;
          observations.push({
            type: 'PEAK_SEASON_SURGE',
            description: pricingAdvice,
            severity: 'INFO'
          });
        } else {
          trustState = PRICE_TRUST_STATES.ELEVATED_UNEXPLAINED;
          confidence = 0.70;
          pricingAdvice = `Price is ${ratio.toFixed(1)}x above comparable historical medians for this activity/venue. Component breakdown not fully disclosed.`;
          observations.push({
            type: 'PRICE_ANOMALY',
            description: pricingAdvice,
            severity: 'WATCH'
          });
        }
      } else if (ratio > 1.25 && benchmark.isPeakSeason) {
        trustState = PRICE_TRUST_STATES.SURGE_ACTIVE;
        confidence = 0.85;
        pricingAdvice = `Moderate seasonal surge (+${Math.round((ratio - 1) * 100)}%) during ${benchmark.peakReason || 'high demand'}.`;
      } else if (transparencyTier === TRANSPARENCY_TIERS.HIGH) {
        trustState = PRICE_TRUST_STATES.VERIFIED_TRANSPARENT;
        confidence = 0.90;
        pricingAdvice = 'High transparency with full component breakdown verified against regional norms.';
      } else {
        trustState = PRICE_TRUST_STATES.TYPICAL_RANGE;
        confidence = 0.80;
        pricingAdvice = 'Price within expected range for this service level.';
      }
    } else if (transparencyTier === TRANSPARENCY_TIERS.LOW) {
      trustState = PRICE_TRUST_STATES.OPAQUE_PRICING;
      confidence = 0.50;
      pricingAdvice = 'Single lump-sum quote provided. Taxes, service charges, or entry tickets may be collected separately on site.';
    }

    return {
      transparencyTier,
      trustState,
      freshness,
      confidence,
      currency,
      knownTotal,
      components: {
        basePrice,
        taxes,
        fees,
        serviceCharge,
        mandatoryExtras,
        optionalAddOns,
        seasonalSurge,
        demandSurge,
        foreignNationalMarkup,
        deposit
      },
      observations,
      disclosures,
      pricingAdvice,
      evaluatedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  PriceTrustEngine,
  TRANSPARENCY_TIERS,
  PRICE_FRESHNESS,
  PRICE_TRUST_STATES
};
