'use strict';

const {
  recordBehavioralEvent,
  getUserBehavioralProfile,
  deleteUserBehavioralData,
  resetUserBehavioralPreferences,
} = require('../services/travelIntelligence/behavioralLearner');

describe('Behavioral Learning Engine (behavioralLearner.js)', () => {
  const testUserId = 'test_traveler_101';

  afterEach(() => {
    deleteUserBehavioralData(testUserId);
  });

  test('records user interaction events and updates inferred affinities safely', () => {
    recordBehavioralEvent(testUserId, { type: 'SAVE', category: 'food', destinationId: 'd1' });
    recordBehavioralEvent(testUserId, { type: 'FAVORITE', category: 'food', destinationId: 'd2' });

    const profile = getUserBehavioralProfile(testUserId);
    expect(profile.hasData).toBe(true);
    expect(profile.inferredAffinities.food).toBeGreaterThan(50);
    expect(profile.eventCount).toBe(2);
    expect(profile.confidence).toBeGreaterThanOrEqual(60);
  });

  test('cautiously handles skip events without aggressively punishing categories', () => {
    recordBehavioralEvent(testUserId, { type: 'SAVE', category: 'scenic', destinationId: 's1' });
    recordBehavioralEvent(testUserId, { type: 'RECOMMENDATION_SKIP', category: 'scenic', destinationId: 's2' });

    const profile = getUserBehavioralProfile(testUserId);
    // Score should remain high after a skip
    expect(profile.inferredAffinities.scenic).toBeGreaterThan(50);
  });

  test('allows complete data deletion and preference reset under privacy controls', () => {
    recordBehavioralEvent(testUserId, { type: 'SAVE', category: 'scenic', destinationId: 's1' });
    resetUserBehavioralPreferences(testUserId);

    let profile = getUserBehavioralProfile(testUserId);
    expect(profile.inferredAffinities.scenic).toBe(50);

    deleteUserBehavioralData(testUserId);
    profile = getUserBehavioralProfile(testUserId);
    expect(profile.hasData).toBe(false);
  });
});
