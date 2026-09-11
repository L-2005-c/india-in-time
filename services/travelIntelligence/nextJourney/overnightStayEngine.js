'use strict';

/**
 * services/travelIntelligence/nextJourney/overnightStayEngine.js
 *
 * Overnight Stay & Night Travel Pacing Engine (Phase 6).
 *
 * Evaluates whether a traveler should halt for the night rather than
 * continuing transit, based on:
 * 1. Time of day (post-sunset / late evening).
 * 2. Terrain hazards (e.g. mountain ghat roads, unlit highways, fog/monsoon).
 * 3. Journey pacing duration (e.g. > 8 hours of active travel today).
 * 4. Next-morning onward departure efficiency.
 */

const appLogger = require('../../../lib/logger');

const OVERNIGHT_RECOMMENDATION = Object.freeze({
  STAY_HIGHLY_RECOMMENDED: 'STAY_HIGHLY_RECOMMENDED',
  STAY_ADVISED: 'STAY_ADVISED',
  CONTINUE_WITH_CAUTION: 'CONTINUE_WITH_CAUTION',
  SAFE_TO_CONTINUE: 'SAFE_TO_CONTINUE',
});

/**
 * Evaluates whether an overnight halt is recommended.
 */
function evaluateOvernightViability({
  currentMinute = 1140, // default 19:00 (7 PM)
  plannedRemainingTransitMinutes = 180, // e.g. 3 hours onward
  routeTerrainType = 'STANDARD_HIGHWAY', // GHAT_ROAD, RURAL_ROAD, EXPRESSWAY
  activeWeatherHazards = [],
  tripPacingMinutesToday = 480, // 8 hours active travel
  declaredFatigue = false,
  isNightGhatRestricted = false,
} = {}) {
  const currentHour = (currentMinute % 1440) / 60;
  const arrivalHour = ((currentMinute + plannedRemainingTransitMinutes) % 1440) / 60;

  const isNightTime = currentHour >= 19.5 || currentHour < 5.5; // after 7:30 PM
  const isLateNightArrival = arrivalHour >= 22.0 || arrivalHour < 6.0; // arrives after 10 PM
  const isGhatTerrain = String(routeTerrainType).toUpperCase().includes('GHAT') || isNightGhatRestricted;
  const hasSevereWeather = activeWeatherHazards.some(h =>
    /fog|rain|flood|cyclone|storm|landslide/i.test(h.type || h.name || '')
  );

  const reasons = [];
  let recommendation = OVERNIGHT_RECOMMENDATION.SAFE_TO_CONTINUE;

  // 1. High-Risk Ghat / Curfew Rule
  if (isGhatTerrain && isNightTime) {
    recommendation = OVERNIGHT_RECOMMENDATION.STAY_HIGHLY_RECOMMENDED;
    reasons.push('High-risk night ghat driving conditions. Steep descents and hairpin bends lack illumination.');
  }

  // 2. Severe Weather + Night Transit
  if (isNightTime && hasSevereWeather) {
    recommendation = OVERNIGHT_RECOMMENDATION.STAY_HIGHLY_RECOMMENDED;
    reasons.push('Adverse weather coupled with night transit poses elevated hazard risks.');
  }

  // 3. Late arrival past lodging check-in limits
  if (isLateNightArrival && recommendation === OVERNIGHT_RECOMMENDATION.SAFE_TO_CONTINUE) {
    recommendation = OVERNIGHT_RECOMMENDATION.STAY_ADVISED;
    reasons.push(`Projected destination arrival (${Math.floor(arrivalHour)}:${Math.round((arrivalHour % 1) * 60).toString().padStart(2, '0')}) falls into late-night hours with restricted service availability.`);
  }

  // 4. Extended pacing fatigue
  if (tripPacingMinutesToday >= 540 || declaredFatigue) { // > 9 hours
    if (recommendation !== OVERNIGHT_RECOMMENDATION.STAY_HIGHLY_RECOMMENDED) {
      recommendation = OVERNIGHT_RECOMMENDATION.STAY_ADVISED;
    }
    reasons.push('Cumulative active travel today exceeds 9 hours with driver fatigue. Pacing and rest advised before onward transit.');
  }

  // 5. Mild caution
  if (isNightTime && recommendation === OVERNIGHT_RECOMMENDATION.SAFE_TO_CONTINUE) {
    recommendation = OVERNIGHT_RECOMMENDATION.CONTINUE_WITH_CAUTION;
    reasons.push('Standard nocturnal highway transit; exercise regular night vigilance.');
  }

  appLogger.info(`[overnightStayEngine] Overnight verdict: ${recommendation}`);

  return {
    recommendation,
    isNightTime,
    isLateNightArrival,
    isGhatTerrain,
    hasSevereWeather,
    currentHour,
    arrivalHour,
    reasons,
    explanation: reasons.length > 0
      ? reasons.join(' ')
      : 'Conditions are favorable for continued onward travel.',
  };
}

module.exports = {
  OVERNIGHT_RECOMMENDATION,
  evaluateOvernightViability,
};
