/**
 * India In-Time v3.0 - Phase 5: Tourist Trust Intelligence
 * Trust Outcome Tracker
 *
 * Records actual traveler outcomes against prior trust evaluations.
 * Provides closed-loop feedback to adjust confidence, identify emergent discrepancies,
 * and ground algorithmic recommendations in real-world results.
 */

const OUTCOME_TYPES = Object.freeze({
  SUCCESSFUL_VISIT: 'SUCCESSFUL_VISIT',
  PRICE_MISMATCH: 'PRICE_MISMATCH',
  FACILITY_CLOSED: 'FACILITY_CLOSED',
  SERVICE_COMPLAINT: 'SERVICE_COMPLAINT',
  SAFETY_INCIDENT: 'SAFETY_INCIDENT',
  ROUTE_IMPASSABLE: 'ROUTE_IMPASSABLE',
  PROVIDER_VERIFIED_ON_SITE: 'PROVIDER_VERIFIED_ON_SITE'
});

class TrustOutcomeTracker {
  constructor() {
    this.outcomes = [];
    this.entityOutcomeStats = new Map(); // entityId -> { successCount, mismatchCount, closureCount, etc. }
  }

  /**
   * Records a traveler's post-experience outcome.
   * @param {Object} outcomeRecord
   * @param {string} outcomeRecord.evaluationId
   * @param {string} outcomeRecord.entityId
   * @param {string} [outcomeRecord.travelerId]
   * @param {string} outcomeRecord.outcomeType - One of OUTCOME_TYPES
   * @param {string} [outcomeRecord.notes]
   * @param {Object} [outcomeRecord.evidenceDetails] - E.g. receipt photo or meter reading
   * @returns {Object} saved outcome summary and updated entity trust calibration
   */
  recordOutcome(outcomeRecord = {}) {
    if (!outcomeRecord.entityId || !outcomeRecord.outcomeType) {
      throw new Error('entityId and outcomeType are required to record a trust outcome.');
    }

    const outcome = {
      id: `outcome_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      evaluationId: outcomeRecord.evaluationId || 'direct_observation',
      entityId: outcomeRecord.entityId,
      travelerId: outcomeRecord.travelerId || 'anonymous_traveler',
      outcomeType: outcomeRecord.outcomeType,
      notes: outcomeRecord.notes || '',
      evidenceDetails: outcomeRecord.evidenceDetails || null,
      timestamp: new Date().toISOString()
    };

    this.outcomes.push(outcome);

    // Update aggregate stats for entity
    let stats = this.entityOutcomeStats.get(outcome.entityId);
    if (!stats) {
      stats = {
        totalReported: 0,
        successCount: 0,
        mismatchCount: 0,
        closureCount: 0,
        complaintCount: 0,
        safetyIncidents: 0,
        lastOutcomeAt: null
      };
      this.entityOutcomeStats.set(outcome.entityId, stats);
    }

    stats.totalReported++;
    stats.lastOutcomeAt = outcome.timestamp;

    if (outcome.outcomeType === OUTCOME_TYPES.SUCCESSFUL_VISIT || outcome.outcomeType === OUTCOME_TYPES.PROVIDER_VERIFIED_ON_SITE) {
      stats.successCount++;
    } else if (outcome.outcomeType === OUTCOME_TYPES.PRICE_MISMATCH) {
      stats.mismatchCount++;
    } else if (outcome.outcomeType === OUTCOME_TYPES.FACILITY_CLOSED || outcome.outcomeType === OUTCOME_TYPES.ROUTE_IMPASSABLE) {
      stats.closureCount++;
    } else if (outcome.outcomeType === OUTCOME_TYPES.SERVICE_COMPLAINT) {
      stats.complaintCount++;
    } else if (outcome.outcomeType === OUTCOME_TYPES.SAFETY_INCIDENT) {
      stats.safetyIncidents++;
    }

    return {
      recorded: true,
      outcomeId: outcome.id,
      entityStats: { ...stats }
    };
  }

  /**
   * Retrieves aggregated outcome statistics for an entity.
   * @param {string} entityId
   * @returns {Object} statistics
   */
  getEntityStats(entityId) {
    return this.entityOutcomeStats.get(entityId) || {
      totalReported: 0,
      successCount: 0,
      mismatchCount: 0,
      closureCount: 0,
      complaintCount: 0,
      safetyIncidents: 0,
      lastOutcomeAt: null
    };
  }

  /**
   * Returns recent outcomes.
   * @param {number} [limit=50]
   * @returns {Array<Object>}
   */
  getRecentOutcomes(limit = 50) {
    return this.outcomes.slice(-limit).reverse();
  }

  /**
   * Resets outcomes (for testing).
   */
  reset() {
    this.outcomes = [];
    this.entityOutcomeStats.clear();
  }
}

const trustOutcomeTracker = new TrustOutcomeTracker();

module.exports = {
  TrustOutcomeTracker,
  trustOutcomeTracker,
  OUTCOME_TYPES
};
