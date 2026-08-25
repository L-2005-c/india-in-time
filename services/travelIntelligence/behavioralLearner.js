'use strict';

/**
 * services/travelIntelligence/behavioralLearner.js
 * Privacy-Preserving Behavioral Learning Engine.
 *
 * Implements:
 * 1. Structured event ingestion (SEARCH, VIEW, SAVE, FAVORITE, GENERATE, ACCEPT, MODIFY, STOP_ADD, STOP_DROP, RATING, SKIP).
 * 2. Separation of observed interaction from inferred preference.
 * 3. Safe negative signal handling (SKIP != DISLIKE; only explicit drops apply negative weight).
 * 4. Full user data controls (view, reset, delete).
 */

const userBehaviorStore = new Map(); // userId -> { events: [], inferredAffinities: {}, lastUpdated }

const EVENT_WEIGHTS = {
  SAVE: 1.5,
  FAVORITE: 2.0,
  STOP_ADD: 1.8,
  ITINERARY_ACCEPT: 1.2,
  RATING_HIGH: 2.0, // 4-5 stars
  DESTINATION_VIEW: 0.5,
  RECOMMENDATION_CLICK: 0.8,
  RECOMMENDATION_SKIP: -0.1, // Cautious decay — skip is not hate
  STOP_DROP: -1.5, // Explicit removal
  RATING_LOW: -2.0, // 1-2 stars
};

/**
 * Ingests a behavioral event and updates the user's inferred affinities.
 */
function recordBehavioralEvent(userId = 'anonymous_user', event = {}) {
  const uid = String(userId).trim();
  const existing = userBehaviorStore.get(uid) || {
    userId: uid,
    events: [],
    inferredAffinities: {
      scenic: 50,
      photography: 50,
      food: 50,
      culture: 50,
      adventure: 50,
      shopping: 50,
      crowdTolerance: 50,
    },
    confidence: 60,
    lastUpdated: new Date().toISOString(),
  };

  const eventType = String(event.type || 'VIEW').toUpperCase();
  const category = String(event.category || event.cat || 'sight').toLowerCase();
  const weight = EVENT_WEIGHTS[eventType] ?? 0.5;

  const eventRecord = {
    type: eventType,
    destinationId: event.destinationId || event.placeName || 'unknown',
    category,
    timestamp: new Date().toISOString(),
    context: event.context || 'itinerary_interaction',
  };

  // Limit in-memory history to last 50 events per user for privacy/memory
  existing.events.push(eventRecord);
  if (existing.events.length > 50) {
    existing.events.shift();
  }

  // Update inferred category affinities
  const affinities = existing.inferredAffinities;
  if (category === 'scenic' || category === 'beach' || category === 'viewpoint') {
    affinities.scenic = Math.max(10, Math.min(100, Math.round(affinities.scenic + weight * 2.5)));
  }
  if (category === 'food' || category === 'restaurant' || category === 'cafe') {
    affinities.food = Math.max(10, Math.min(100, Math.round(affinities.food + weight * 3.0)));
  }
  if (category === 'temple' || category === 'museum' || category === 'monument' || category === 'fort') {
    affinities.culture = Math.max(10, Math.min(100, Math.round(affinities.culture + weight * 2.5)));
  }
  if (category === 'trekking' || category === 'hiking' || category === 'waterfall') {
    affinities.adventure = Math.max(10, Math.min(100, Math.round(affinities.adventure + weight * 3.0)));
  }
  if (category === 'shopping' || category === 'market' || category === 'mall') {
    affinities.shopping = Math.max(10, Math.min(100, Math.round(affinities.shopping + weight * 3.0)));
  }

  // Increase confidence as event sample size grows
  existing.confidence = Math.min(95, 60 + Math.round(existing.events.length * 0.7));
  existing.lastUpdated = new Date().toISOString();

  userBehaviorStore.set(uid, existing);
  return { success: true, eventRecord, confidence: existing.confidence };
}

/**
 * Retrieves the user's privacy-preserved behavioral profile.
 */
function getUserBehavioralProfile(userId = 'anonymous_user') {
  const uid = String(userId).trim();
  const profile = userBehaviorStore.get(uid);
  if (!profile) {
    return {
      userId: uid,
      hasData: false,
      inferredAffinities: { scenic: 50, photography: 50, food: 50, culture: 50, adventure: 50, shopping: 50 },
      eventCount: 0,
      confidence: 50,
    };
  }
  return {
    userId: uid,
    hasData: true,
    inferredAffinities: profile.inferredAffinities,
    eventCount: profile.events.length,
    confidence: profile.confidence,
    lastUpdated: profile.lastUpdated,
  };
}

/**
 * Privacy Control: Deletes all behavioral event history for a user.
 */
function deleteUserBehavioralData(userId = 'anonymous_user') {
  const uid = String(userId).trim();
  const existed = userBehaviorStore.has(uid);
  userBehaviorStore.delete(uid);
  return { success: true, deleted: existed, userId: uid };
}

/**
 * Privacy Control: Resets inferred preferences back to neutral (50) without deleting raw interaction count.
 */
function resetUserBehavioralPreferences(userId = 'anonymous_user') {
  const uid = String(userId).trim();
  if (userBehaviorStore.has(uid)) {
    const existing = userBehaviorStore.get(uid);
    existing.inferredAffinities = { scenic: 50, photography: 50, food: 50, culture: 50, adventure: 50, shopping: 50, crowdTolerance: 50 };
    existing.confidence = 50;
    existing.lastUpdated = new Date().toISOString();
    userBehaviorStore.set(uid, existing);
  }
  return { success: true, userId: uid };
}

module.exports = {
  EVENT_WEIGHTS,
  recordBehavioralEvent,
  getUserBehavioralProfile,
  deleteUserBehavioralData,
  resetUserBehavioralPreferences,
};
