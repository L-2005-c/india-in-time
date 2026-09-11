'use strict';

/**
 * services/travelIntelligence/experience/outcomeTracker.js
 *
 * Outcome Learning & Post-Experience Decision Tracker for India In-Time v3.0 Phase 4.
 * Records user interaction with experience recommendations and updates inferred DNA without
 * mutating explicit user declarations.
 */

const { recordTravelerObservation, sanitizeDnaProfile } = require('../personalTravelDna');

// In-memory outcome repository (mirrored to DB when connection available)
const inMemoryOutcomes = new Map();

const VALID_ACTIONS = Object.freeze(['ACCEPTED', 'REJECTED', 'DEFERRED', 'MODIFIED']);

/**
 * Records a traveler's decision or post-experience feedback.
 *
 * @param {Object} options
 * @param {string} options.tripId - Trip identifier
 * @param {string} [options.travelerId] - Traveler ID
 * @param {string} [options.recommendationId] - Target recommendation ID
 * @param {string} options.placeId - Destination ID
 * @param {string} [options.placeCategory] - Destination category (e.g. 'beach', 'museum')
 * @param {string} options.actionTaken - One of ACCEPTED, REJECTED, DEFERRED, MODIFIED
 * @param {number} [options.actualDwellMinutes] - Realized visit duration
 * @param {number} [options.predictedDwellMinutes] - Predicted duration
 * @param {number} [options.travelerRating] - 1 to 5 star rating
 * @param {string} [options.feedbackText] - Optional qualitative feedback
 * @param {Object} [options.travelerDna] - Current Traveler DNA
 * @returns {Object} Result of logging and updated DNA
 */
function recordExperienceOutcome({
  tripId,
  travelerId = null,
  recommendationId = null,
  placeId,
  placeCategory = 'attraction',
  actionTaken = 'ACCEPTED',
  actualDwellMinutes = null,
  predictedDwellMinutes = 45,
  travelerRating = null,
  feedbackText = '',
  travelerDna = {},
} = {}) {
  if (!tripId || !placeId) {
    throw new Error('tripId and placeId are required to record an experience outcome');
  }

  const normAction = String(actionTaken).toUpperCase();
  if (!VALID_ACTIONS.includes(normAction)) {
    throw new Error(`Invalid actionTaken '${actionTaken}'. Must be one of: ${VALID_ACTIONS.join(', ')}`);
  }

  const outcomeId = `out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const recordedAt = new Date().toISOString();

  const outcomeRecord = {
    id: outcomeId,
    tripId: String(tripId),
    travelerId: travelerId ? String(travelerId) : null,
    recommendationId: recommendationId || `rec_${Date.now()}`,
    placeId: String(placeId),
    placeCategory: String(placeCategory).toLowerCase(),
    actionTaken: normAction,
    actualDwellMinutes: actualDwellMinutes != null ? Number(actualDwellMinutes) : null,
    predictedDwellMinutes: Number(predictedDwellMinutes) || 45,
    travelerRating: travelerRating != null ? Math.max(1, Math.min(5, Number(travelerRating))) : null,
    feedbackText: String(feedbackText || '').slice(0, 500),
    recordedAt,
  };

  // Store in memory cache
  const list = inMemoryOutcomes.get(String(tripId)) || [];
  list.push(outcomeRecord);
  inMemoryOutcomes.set(String(tripId), list);

  // Behavioral Learning — Update Traveler DNA via recordTravelerObservation
  let updatedDna = sanitizeDnaProfile(travelerDna);

  const dim = mapCategoryToDnaDimension(outcomeRecord.placeCategory);
  if (dim) {
    let delta = 0;
    if (normAction === 'ACCEPTED') {
      delta = outcomeRecord.travelerRating ? (outcomeRecord.travelerRating >= 4 ? 4 : 2) : 3;
    } else if (normAction === 'REJECTED') {
      delta = -3;
    }

    if (delta !== 0) {
      updatedDna = recordTravelerObservation(updatedDna, {
        type: `EXPERIENCE_${normAction}`,
        dimension: dim,
        delta,
        context: {
          placeId: outcomeRecord.placeId,
          placeCategory: outcomeRecord.placeCategory,
          rating: outcomeRecord.travelerRating,
        },
        confidence: 'MEDIUM',
      });
    }
  }

  return {
    success: true,
    outcome: outcomeRecord,
    updatedTravelerDna: updatedDna,
  };
}

/**
 * Maps a POI category to its canonical Travel DNA dimension.
 */
function mapCategoryToDnaDimension(cat) {
  const c = String(cat).toLowerCase();
  if (['beach', 'hill', 'scenic', 'lake', 'nature', 'waterfall'].includes(c)) return 'nature';
  if (['museum', 'monument', 'fort', 'heritage'].includes(c)) return 'culture';
  if (['food', 'restaurant', 'cafe', 'dhaba'].includes(c)) return 'food';
  if (['shopping', 'market', 'emporium'].includes(c)) return 'shopping';
  if (['trekking', 'hiking', 'adventure'].includes(c)) return 'adventure';
  if (['temple', 'church', 'mosque'].includes(c)) return 'culture';
  return null;
}

/**
 * Retrieves outcome history for a trip.
 */
function getTripExperienceOutcomes(tripId) {
  return inMemoryOutcomes.get(String(tripId)) || [];
}

/**
 * Computes accuracy and satisfaction metrics for a trip's experience recommendations.
 */
function computeExperienceAccuracyMetrics(tripId) {
  const list = getTripExperienceOutcomes(tripId);
  if (!list.length) {
    return {
      totalOutcomes: 0,
      acceptanceRate: 0,
      averageRating: null,
      dwellTimeAccuracyPercentage: null,
    };
  }

  const accepted = list.filter(o => o.actionTaken === 'ACCEPTED').length;
  const acceptanceRate = Math.round((accepted / list.length) * 100);

  const rated = list.filter(o => o.travelerRating != null);
  const averageRating = rated.length
    ? Math.round((rated.reduce((sum, o) => sum + o.travelerRating, 0) / rated.length) * 10) / 10
    : null;

  const dwellRecords = list.filter(o => o.actualDwellMinutes != null && o.predictedDwellMinutes != null);
  let dwellAccuracy = null;
  if (dwellRecords.length) {
    const errorRatios = dwellRecords.map(o => {
      const diff = Math.abs(o.actualDwellMinutes - o.predictedDwellMinutes);
      return Math.max(0, 1 - (diff / o.predictedDwellMinutes));
    });
    dwellAccuracy = Math.round((errorRatios.reduce((sum, r) => sum + r, 0) / dwellRecords.length) * 100);
  }

  return {
    totalOutcomes: list.length,
    acceptedCount: accepted,
    acceptanceRate,
    averageRating,
    dwellTimeAccuracyPercentage: dwellAccuracy,
  };
}

module.exports = {
  recordExperienceOutcome,
  getTripExperienceOutcomes,
  computeExperienceAccuracyMetrics,
  VALID_ACTIONS,
};
