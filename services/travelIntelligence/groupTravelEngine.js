'use strict';

/**
 * services/travelIntelligence/groupTravelEngine.js
 * Multi-Traveler Group Travel Optimization Engine.
 *
 * Implements:
 * 1. Multi-member preference consolidation & conflict detection.
 * 2. Group fairness index & satisfaction distribution calculation.
 * 3. Group travel modes (Family, Friends, Couple, Mixed, Photography, Food).
 * 4. Actionable conflict resolution & parallel split/rejoin planning.
 */

const { sanitizeDnaProfile, computeDnaMatch } = require('./personalTravelDna');

const GROUP_MODES = {
  FAMILY: { mode: 'FAMILY', defaultPace: 'relaxed', maxWalkKm: 3.5, priorityBias: ['family', 'scenic', 'park', 'food'] },
  FRIENDS: { mode: 'FRIENDS', defaultPace: 'balanced', maxWalkKm: 6.0, priorityBias: ['scenic', 'food', 'adventure', 'beach'] },
  COUPLE: { mode: 'COUPLE', defaultPace: 'relaxed', maxWalkKm: 4.5, priorityBias: ['scenic', 'photography', 'food', 'sunset'] },
  PHOTOGRAPHY_GROUP: { mode: 'PHOTOGRAPHY_GROUP', defaultPace: 'balanced', maxWalkKm: 5.0, priorityBias: ['photography', 'scenic', 'viewpoint', 'golden_hour'] },
  FOOD_GROUP: { mode: 'FOOD_GROUP', defaultPace: 'relaxed', maxWalkKm: 4.0, priorityBias: ['food', 'cafe', 'market'] },
  MIXED_GROUP: { mode: 'MIXED_GROUP', defaultPace: 'balanced', maxWalkKm: 5.0, priorityBias: [] },
};

/**
 * Consolidates multiple members' profiles into a unified group profile.
 */
function createGroupProfile(members = [], options = {}) {
  if (!Array.isArray(members) || !members.length) {
    members = [{ id: 'traveler_1', name: 'Traveler 1', travelDna: sanitizeDnaProfile({}) }];
  }

  const groupModeKey = String(options.groupMode || 'MIXED_GROUP').toUpperCase();
  const groupModeConfig = GROUP_MODES[groupModeKey] || GROUP_MODES.MIXED_GROUP;

  // Sanitize each member's DNA
  const sanitizedMembers = members.map((m, idx) => ({
    id: m.id || `member_${idx + 1}`,
    name: m.name || `Traveler ${idx + 1}`,
    travelDna: sanitizeDnaProfile(m.travelDna || m.dna),
    mustVisit: Array.isArray(m.mustVisit) ? m.mustVisit : [],
    mustAvoid: Array.isArray(m.mustAvoid) ? m.mustAvoid : [],
    dietaryRestrictions: Array.isArray(m.dietaryRestrictions) ? m.dietaryRestrictions : [],
  }));

  // Aggregate DNA vector means
  const dimensions = ['scenic', 'photography', 'food', 'culture', 'adventure', 'shopping', 'crowdTolerance', 'walkingTolerance'];
  const consolidatedDna = { pacePreference: groupModeConfig.defaultPace, enabled: true };

  dimensions.forEach(dim => {
    const sum = sanitizedMembers.reduce((acc, m) => acc + (m.travelDna[dim] || 50), 0);
    consolidatedDna[dim] = Math.round(sum / sanitizedMembers.length);
  });

  // Identify Common Preferences (all members score >= 70)
  const commonPreferences = dimensions.filter(dim =>
    sanitizedMembers.every(m => (m.travelDna[dim] || 50) >= 70)
  );

  // Identify Conflicting Preferences (high variance: range >= 40)
  const conflictingPreferences = dimensions.filter(dim => {
    const vals = sanitizedMembers.map(m => m.travelDna[dim] || 50);
    return (Math.max(...vals) - Math.min(...vals)) >= 40;
  });

  // Consolidate hard constraints
  const groupHard = {
    mustVisit: Array.from(new Set(sanitizedMembers.flatMap(m => m.mustVisit))),
    mustAvoidPlaces: Array.from(new Set(sanitizedMembers.flatMap(m => m.mustAvoid))),
    dietaryRestrictions: Array.from(new Set(sanitizedMembers.flatMap(m => m.dietaryRestrictions))),
    minWalkingTolerance: Math.min(...sanitizedMembers.map(m => m.travelDna.walkingTolerance || 60)),
    budgetCap: Number.isFinite(options.budgetCap) ? options.budgetCap : null,
  };

  return {
    groupMode: groupModeConfig.mode,
    memberCount: sanitizedMembers.length,
    members: sanitizedMembers,
    consolidatedDna: sanitizeDnaProfile(consolidatedDna),
    commonPreferences,
    conflictingPreferences,
    groupHardConstraints: groupHard,
  };
}

/**
 * Evaluates individual satisfaction and overall group fairness across an itinerary.
 */
function evaluateGroupSatisfaction(stops = [], groupProfile = {}) {
  const members = groupProfile.members || [];
  if (!members.length || !stops.length) {
    return {
      averageSatisfaction: 80,
      fairnessIndex: 1.0,
      memberSatisfactions: [],
      fairnessRating: 'High',
      summary: 'Standard single/unassigned traveler pacing.',
    };
  }

  const memberScores = members.map(m => {
    const stopMatches = stops.map(s => computeDnaMatch(s, m.travelDna).score);
    const avgScore = stopMatches.length ? Math.round(stopMatches.reduce((a, b) => a + b, 0) / stopMatches.length) : 70;
    return {
      memberId: m.id,
      name: m.name,
      satisfactionScore: avgScore,
      preferenceMatches: m.travelDna,
    };
  });

  const scores = memberScores.map(m => m.satisfactionScore);
  const meanSatisfaction = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Compute Standard Deviation for Fairness Index: Fairness = 1 - (stdDev / mean)
  const variance = scores.reduce((acc, score) => acc + Math.pow(score - meanSatisfaction, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const fairnessIndex = Math.max(0, Math.min(1.0, Math.round((1 - (stdDev / (meanSatisfaction + 1e-4))) * 100) / 100));

  let fairnessRating = 'High';
  if (fairnessIndex < 0.75) fairnessRating = 'Low (Unbalanced)';
  else if (fairnessIndex < 0.88) fairnessRating = 'Moderate';

  const lowestMember = [...memberScores].sort((a, b) => a.satisfactionScore - b.satisfactionScore)[0];

  return {
    averageSatisfaction: meanSatisfaction,
    fairnessIndex,
    fairnessRating,
    memberSatisfactions: memberScores,
    lowestSatisfactionMember: lowestMember,
    summary: `Group Satisfaction: ${meanSatisfaction}% (Fairness: ${Math.round(fairnessIndex * 100)}% · ${fairnessRating}). Lowest: ${lowestMember.name} (${lowestMember.satisfactionScore}%).`,
  };
}

/**
 * Detects hard group preference conflicts and generates resolution options.
 */
function resolveGroupConflicts(groupProfile = {}) {
  const conflicts = [];
  const members = groupProfile.members || [];

  // Check opposing category exclusions vs must-visits
  members.forEach(mA => {
    members.forEach(mB => {
      if (mA.id !== mB.id) {
        (mA.mustVisit || []).forEach(placeName => {
          if ((mB.mustAvoid || []).includes(placeName)) {
            conflicts.push({
              type: 'DIRECT_PLACE_OPPOSITION',
              placeName,
              memberA: mA.name,
              memberB: mB.name,
              reason: `${mA.name} requested to visit "${placeName}", but ${mB.name} requested to avoid it.`,
            });
          }
        });
      }
    });
  });

  const conflictResolutions = conflicts.map(c => ({
    conflict: c.reason,
    options: [
      {
        id: 'A',
        title: `Include ${c.placeName}`,
        description: `Keep ${c.placeName} for ${c.memberA} and schedule nearby activity for ${c.memberB}.`,
      },
      {
        id: 'B',
        title: `Substitute with Shared Interest`,
        description: `Replace ${c.placeName} with a neutral destination satisfying both travelers.`,
      },
      {
        id: 'C',
        title: `Temporary Parallel Split (45 min)`,
        description: `${c.memberA} visits ${c.placeName} while ${c.memberB} enjoys a nearby cafe, rejoining immediately after.`,
      },
    ],
  }));

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    resolutions: conflictResolutions,
  };
}

module.exports = {
  GROUP_MODES,
  createGroupProfile,
  evaluateGroupSatisfaction,
  resolveGroupConflicts,
};
