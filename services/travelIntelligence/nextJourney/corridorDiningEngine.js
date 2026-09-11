'use strict';

/**
 * services/travelIntelligence/nextJourney/corridorDiningEngine.js
 *
 * Compound Corridor Dining Chain Engine (Phase 6).
 *
 * Evaluates dining candidates as a compound multi-stop chain:
 *   Current Location -> Dining -> Next Destination (Hotel / Home / Transport Hub)
 * rather than evaluating dining in isolation.
 */

const { distKm } = require('../../../utils/geo');
const { getActiveMealSlot, detourDistanceKm } = require('../mealIntelligence');
const appLogger = require('../../../lib/logger');

const DINING_OPENING_STATES = Object.freeze({
  OPEN: 'OPEN',
  CLOSING_SOON: 'CLOSING_SOON',
  CLOSED: 'CLOSED',
  UNKNOWN: 'UNKNOWN',
});

// Seed catalog of verified dining establishments on key corridors
const SEED_CORRIDOR_RESTAURANTS = [
  // Visakhapatnam Coastal Corridor
  {
    id: 'dine_vskp_dharani',
    name: 'Dharani Veg Restaurant (Dasapalla)',
    city: 'Visakhapatnam',
    lat: 17.7118,
    lon: 83.3020,
    cuisine: 'South Indian Pure Vegetarian',
    vegetarian: true,
    rating: 4.6,
    openMinute: 720,  // 12:00 PM
    closeMinute: 1350, // 10:30 PM
    avgCostForTwo: 750,
    trustState: 'TRUSTED',
    fssaiVerified: true,
  },
  {
    id: 'dine_vskp_dakshin',
    name: 'Dakshin Coastal Dining',
    city: 'Visakhapatnam',
    lat: 17.7125,
    lon: 83.3180,
    cuisine: 'Andhra Seafood & Thali',
    vegetarian: false,
    rating: 4.7,
    openMinute: 750,  // 12:30 PM
    closeMinute: 1380, // 11:00 PM
    avgCostForTwo: 1400,
    trustState: 'TRUSTED',
    fssaiVerified: true,
  },
  {
    id: 'dine_vskp_subbayya',
    name: 'Subbayya Gari Hotel (Butta Bhojanam)',
    city: 'Visakhapatnam',
    lat: 17.7210,
    lon: 83.3040,
    cuisine: 'Traditional Andhra Plantain Leaf Meal',
    vegetarian: true,
    rating: 4.5,
    openMinute: 690,  // 11:30 AM
    closeMinute: 1320, // 10:00 PM
    avgCostForTwo: 600,
    trustState: 'SUPPORTED',
    fssaiVerified: true,
  },
  // Araku Valley - Vizag Ghat Corridor
  {
    id: 'dine_araku_bamboo',
    name: 'Tyda Hilltop Bamboo Chicken Center',
    city: 'Tyda',
    lat: 18.2180,
    lon: 83.0480,
    cuisine: 'Tribal Bamboo Chicken & Ragi Sangati',
    vegetarian: false,
    rating: 4.4,
    openMinute: 660,  // 11:00 AM
    closeMinute: 1200, // 08:00 PM (Ghat closes early)
    avgCostForTwo: 450,
    trustState: 'SUPPORTED',
    fssaiVerified: true,
  },
  {
    id: 'dine_araku_vasundhara',
    name: 'Vasundhara Family Restaurant Araku',
    city: 'Araku Valley',
    lat: 18.3280,
    lon: 82.8750,
    cuisine: 'South Indian & Andhra Meals',
    vegetarian: false,
    rating: 4.2,
    openMinute: 660,  // 11:00 AM
    closeMinute: 1290, // 09:30 PM
    avgCostForTwo: 500,
    trustState: 'SUPPORTED',
    fssaiVerified: true,
  },
];

/**
 * Evaluates whether a restaurant will be open at the projected meal arrival minute.
 */
function evaluateDiningOpenStatus(restaurant, arrivalMinute, mealDurationMin = 45) {
  if (arrivalMinute == null) return DINING_OPENING_STATES.UNKNOWN;

  const arrMin = arrivalMinute % 1440;
  const finishMin = (arrMin + mealDurationMin) % 1440;
  const open = restaurant.openMinute ?? (restaurant.openHour != null ? restaurant.openHour * 60 : 660);
  const close = restaurant.closeMinute ?? (restaurant.closeHour != null ? restaurant.closeHour * 60 : 1320);

  if (arrMin < open) {
    return DINING_OPENING_STATES.CLOSED;
  }
  if (arrMin > close || (finishMin > close && finishMin > arrMin)) {
    return arrMin <= close ? DINING_OPENING_STATES.CLOSING_SOON : DINING_OPENING_STATES.CLOSED;
  }
  if (arrMin >= close - 30) {
    return DINING_OPENING_STATES.CLOSING_SOON;
  }

  return DINING_OPENING_STATES.OPEN;
}

/**
 * Evaluates candidate corridor dining choices along the chain:
 * Origin -> Dining Stop -> Destination.
 */
function evaluateCorridorDiningChain({
  currentLocation,
  nextDestination,
  currentMinute = 720,
  dietaryPreference = null,
  maxCandidates = 3,
  customPool = null,
} = {}) {
  const pool = Array.isArray(customPool) && customPool.length > 0 ? customPool : SEED_CORRIDOR_RESTAURANTS;
  const fromCoords = currentLocation ? [Number(currentLocation.lat), Number(currentLocation.lon)] : null;
  const toCoords = nextDestination ? [Number(nextDestination.lat), Number(nextDestination.lon)] : null;

  const slot = getActiveMealSlot(currentMinute);
  appLogger.info(`[corridorDiningEngine] Active slot: ${slot?.name || 'Dining'} (time: ${currentMinute})`);

  const candidates = pool.map(rest => {
    const restCoords = [Number(rest.lat), Number(rest.lon)];

    // 1. Leg 1: Distance from current location to restaurant
    const leg1DistKm = fromCoords ? Math.round(distKm(fromCoords[0], fromCoords[1], restCoords[0], restCoords[1]) * 10) / 10 : 2.0;
    const leg1EtaMin = Math.round(leg1DistKm * 2.2) + 5;
    const arrivalAtRestMin = currentMinute + leg1EtaMin;

    // 2. Meal duration & operating hours
    const mealDurationMin = 50;
    const openStatus = evaluateDiningOpenStatus(rest, arrivalAtRestMin, mealDurationMin);

    // 3. Leg 2: Distance from restaurant to final destination
    let leg2DistKm = 0;
    let leg2EtaMin = 0;
    let detourKm = 0;

    if (toCoords) {
      leg2DistKm = Math.round(distKm(restCoords[0], restCoords[1], toCoords[0], toCoords[1]) * 10) / 10;
      leg2EtaMin = Math.round(leg2DistKm * 2.2) + 5;
      detourKm = fromCoords ? detourDistanceKm(restCoords, fromCoords, toCoords) : 0;
    }

    const totalChainTimeMin = leg1EtaMin + mealDurationMin + leg2EtaMin;

    // 4. Scoring logic
    let score = 70;

    // Opening status penalties
    if (openStatus === DINING_OPENING_STATES.OPEN) score += 15;
    else if (openStatus === DINING_OPENING_STATES.CLOSING_SOON) score -= 10;
    else if (openStatus === DINING_OPENING_STATES.CLOSED) score -= 50;

    // Detour efficiency
    if (detourKm <= 1.0) {
      score += 15;
    } else if (detourKm <= 2.5) {
      score += 8;
    } else {
      score -= Math.min(25, detourKm * 4);
    }

    // Dietary match
    if (dietaryPreference === 'vegetarian' && rest.vegetarian) {
      score += 12;
    }

    // Trust
    if (rest.trustState === 'TRUSTED') score += 10;
    else if (rest.trustState === 'SUPPORTED') score += 5;

    // Rating
    score += ((rest.rating || 4.0) - 3.5) * 8;

    const boundedScore = Math.max(10, Math.min(99, Math.round(score)));

    return {
      id: rest.id,
      name: rest.name,
      city: rest.city,
      lat: rest.lat,
      lon: rest.lon,
      cuisine: rest.cuisine,
      vegetarian: rest.vegetarian,
      rating: rest.rating,
      openStatus,
      leg1DistanceKm: leg1DistKm,
      leg1DistKm: leg1DistKm,
      leg1EtaMinutes: leg1EtaMin,
      arrivalMinute: arrivalAtRestMin,
      mealDurationMinutes: mealDurationMin,
      leg2DistanceKm: leg2DistKm,
      leg2EtaMinutes: leg2EtaMin,
      totalChainMinutes: totalChainTimeMin,
      detourKm,
      avgCostForTwo: rest.avgCostForTwo,
      trustState: rest.trustState || 'SUPPORTED',
      fssaiVerified: Boolean(rest.fssaiVerified),
      compositeScore: boundedScore,
      corridorSummary: `Adds only ${Math.round(detourKm * 10) / 10} km detour along your path to ${nextDestination?.name || 'next destination'}.`,
    };
  });

  // Filter out completely closed venues unless all are closed
  const viable = candidates.filter(c => c.openStatus !== DINING_OPENING_STATES.CLOSED);
  const resultPool = viable.length > 0 ? viable : candidates;

  resultPool.sort((a, b) => b.compositeScore - a.compositeScore);
  return resultPool.slice(0, maxCandidates);
}

module.exports = {
  DINING_OPENING_STATES,
  SEED_CORRIDOR_RESTAURANTS,
  evaluateDiningOpenStatus,
  evaluateCorridorDiningChain,
};
