'use strict';

/**
 * services/routing/routeQualityEngine.js
 *
 * Evaluates route quality, scenic score, terrain comfort rating,
 * turn-by-turn instruction refinement, and alternative route trade-offs.
 */

const { distKm } = require('../../utils/geo');

const SCENIC_TOKENS = /\b(beach|coast|coastal|marine|sea\s*link|promenade|ghat|hill|valley|viewpoint|lake|river|ridge|heritage|fort|palace|park|garden|island|drive)\b/i;

const COMFORT_TIERS = {
  EXCELLENT: { label: 'High-speed smooth arterial', score: 95 },
  GOOD: { label: 'Paved urban roadway with standard flow', score: 80 },
  FAIR: { label: 'Dense commercial street with frequent pedestrian crossings', score: 65 },
  WINDING_GHAT: { label: 'Mountainous winding road requiring cautious navigation', score: 70 },
  PEDESTRIAN_PATH: { label: 'Walkable urban pathway / sidewalk', score: 85 },
};

/**
 * Evaluates the scenic appeal score of a route based on geography and step names.
 *
 * @param {Array<number>} fromCoords
 * @param {Array<number>} toCoords
 * @param {Array<Object>} steps
 * @param {string} corridorType
 * @returns {{ score: number, isScenic: boolean, features: Array<string> }}
 */
function evaluateScenicQuality(fromCoords, toCoords, steps = [], corridorType = '') {
  let score = 30; // Baseline
  const features = [];

  if (corridorType === 'COASTAL_DRIVE') {
    score += 45;
    features.push('Seaside coastal panorama');
  } else if (corridorType === 'HILL_GHAT') {
    score += 40;
    features.push('Mountain vista & valley curves');
  } else if (corridorType === 'WALLED_BAZAAR') {
    score += 25;
    features.push('Historic heritage street architecture');
  }

  // Scan step street names for scenic keywords
  let scenicStepCount = 0;
  for (const s of steps) {
    const text = `${s.instruction || ''} ${s.streetName || ''}`;
    if (SCENIC_TOKENS.test(text)) {
      scenicStepCount++;
    }
  }

  if (scenicStepCount >= 2) {
    score += Math.min(25, scenicStepCount * 8);
    features.push('Scenic landmark waypoints');
  }

  const finalScore = Math.min(100, Math.max(0, score));
  return {
    score: finalScore,
    isScenic: finalScore >= 65,
    features,
  };
}

/**
 * Enriches and cleans turn-by-turn maneuvers for presentation.
 *
 * @param {Array<Object>} rawSteps
 * @param {Array<Array<number>>} geometry
 * @returns {Array<Object>} Enriched steps
 */
function enrichTurnByTurnSteps(rawSteps = [], geometry = null) {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    if (Array.isArray(geometry) && geometry.length >= 2) {
      const dM = Math.round(distKm(geometry[0][0], geometry[0][1], geometry[1][0], geometry[1][1]) * 1000);
      return [{
        stepNumber: 1,
        instruction: 'Proceed toward destination',
        distanceMeters: dM,
        durationSeconds: Math.max(60, Math.round(dM / 7.5)),
        maneuver: 'depart',
        formattedDistance: dM < 1000 ? `${dM} m` : `${(dM / 1000).toFixed(1)} km`,
      }];
    }
    return [];
  }

  let cumulativeDistance = 0;
  let cumulativeDuration = 0;

  return rawSteps.map((s, idx) => {
    const distM = Number(s.distanceM) || 0;
    const durSec = Number(s.durationSec) || 0;
    cumulativeDistance += distM;
    cumulativeDuration += durSec;

    let cleanInstruction = s.instruction || 'Continue straight';
    if (cleanInstruction.startsWith('via ')) {
      cleanInstruction = `Continue on ${cleanInstruction.replace('via ', '')}`;
    }

    return {
      stepNumber: idx + 1,
      instruction: cleanInstruction,
      streetName: s.streetName || null,
      distanceMeters: distM,
      durationSeconds: durSec,
      maneuver: s.maneuver || 'continue',
      cumulativeDistanceMeters: cumulativeDistance,
      cumulativeDurationSeconds: cumulativeDuration,
      formattedDistance: distM < 1000 ? `${distM} m` : `${(distM / 1000).toFixed(1)} km`,
    };
  });
}

/**
 * Rates the road comfort and surface characteristics of the corridor.
 *
 * @param {string} corridorType
 * @param {string} mode
 * @returns {{ tier: string, label: string, score: number }}
 */
function evaluateComfortRating(corridorType, mode = 'driving') {
  if (mode === 'walking') return { tier: 'PEDESTRIAN_PATH', ...COMFORT_TIERS.PEDESTRIAN_PATH };
  if (corridorType === 'HIGHWAY_EXPRESSWAY') return { tier: 'EXCELLENT', ...COMFORT_TIERS.EXCELLENT };
  if (corridorType === 'HILL_GHAT') return { tier: 'WINDING_GHAT', ...COMFORT_TIERS.WINDING_GHAT };
  if (corridorType === 'WALLED_BAZAAR') return { tier: 'FAIR', ...COMFORT_TIERS.FAIR };
  return { tier: 'GOOD', ...COMFORT_TIERS.GOOD };
}

module.exports = {
  evaluateScenicQuality,
  enrichTurnByTurnSteps,
  evaluateComfortRating,
};
