'use strict';

/**
 * services/travelIntelligence/nextJourney/accommodationIntelligence.js
 *
 * Accommodation Intelligence & Next-Morning Optimization Engine (Phase 6).
 *
 * Evaluates candidate stays across:
 * 1. Price Decomposition & Transparency (Phase 5 integration).
 * 2. Check-In Feasibility (arrival vs check-in window).
 * 3. Provider Legitimacy & Trust (Phase 5 NIDHI+ / GSTIN).
 * 4. Next-Morning Departure Utility (proximity to tomorrow's travel corridor).
 */

const { distKm } = require('../../../utils/geo');
const { PriceTrustEngine } = require('../trust/priceTrustEngine');
const priceTrustEngine = new PriceTrustEngine();
const appLogger = require('../../../lib/logger');

const CHECKIN_STATES = Object.freeze({
  CHECKIN_FEASIBLE: 'CHECKIN_FEASIBLE',
  CHECKIN_TIGHT: 'CHECKIN_TIGHT',
  CHECKIN_UNKNOWN: 'CHECKIN_UNKNOWN',
  CHECKIN_INFEASIBLE: 'CHECKIN_INFEASIBLE',
});

// Seed catalog of verified regional accommodations for key Andhra / South corridors
const SEED_ACCOMMODATIONS = [
  // Visakhapatnam City & Coastal Corridor
  {
    id: 'hotel_vskp_grand',
    name: 'The Gateway Hotel Beach Road',
    city: 'Visakhapatnam',
    lat: 17.7128,
    lon: 83.3182,
    basePrice: 4200,
    taxes: 504,
    fees: 150,
    checkInStartHour: 14,
    checkInEndHour: 23, // 11:00 PM
    has24hrFrontDesk: true,
    nidhiVerified: true,
    gstin: '37AAAAA0000A1Z5',
    trustState: 'TRUSTED',
    rating: 4.6,
    corridorAdvantage: 'Direct access to Beach Road & Coastal Highway',
  },
  {
    id: 'hotel_vskp_transit',
    name: 'Dolphin Hotel Jagadamba',
    city: 'Visakhapatnam',
    lat: 17.7155,
    lon: 83.3012,
    basePrice: 2800,
    taxes: 336,
    fees: 100,
    checkInStartHour: 12,
    checkInEndHour: 23.5,
    has24hrFrontDesk: true,
    nidhiVerified: true,
    gstin: '37BBBBB1111B1Z2',
    trustState: 'SUPPORTED',
    rating: 4.4,
    corridorAdvantage: 'Immediate proximity to Railway Station (5 min)',
  },
  {
    id: 'hotel_vskp_budget',
    name: 'Green Park Business Stay',
    city: 'Visakhapatnam',
    lat: 17.7280,
    lon: 83.3080,
    basePrice: 2100,
    taxes: 252,
    fees: 50,
    checkInStartHour: 13,
    checkInEndHour: 22,
    has24hrFrontDesk: false,
    nidhiVerified: false,
    gstin: null,
    trustState: 'UNVERIFIED',
    rating: 4.1,
    corridorAdvantage: 'City center budget transit',
  },
  // Araku Valley Corridor
  {
    id: 'hotel_araku_resort',
    name: 'Haritha Valley Resort Araku',
    city: 'Araku Valley',
    lat: 18.3312,
    lon: 82.8710,
    basePrice: 2400,
    taxes: 288,
    fees: 100,
    checkInStartHour: 12,
    checkInEndHour: 21, // 9:00 PM front desk closure
    has24hrFrontDesk: false,
    nidhiVerified: true,
    gstin: '37APTD00001Z9',
    trustState: 'TRUSTED',
    rating: 4.3,
    corridorAdvantage: 'Inside valley; zero morning transit to waterfalls',
  },
  {
    id: 'hotel_araku_tribal',
    name: 'Tyda Jungle Bells Nature Camp',
    city: 'Tyda',
    lat: 18.2167,
    lon: 83.0500,
    basePrice: 2000,
    taxes: 240,
    fees: 80,
    checkInStartHour: 13,
    checkInEndHour: 20, // 8:00 PM front desk closure
    has24hrFrontDesk: false,
    nidhiVerified: true,
    gstin: '37APTD00002Z8',
    trustState: 'SUPPORTED',
    rating: 4.2,
    corridorAdvantage: 'Midpoint on Ghat Road; eliminates night descent hazard',
  },
  // Tirupati Corridor
  {
    id: 'hotel_tpty_bliss',
    name: 'Hotel Bliss Tirupati',
    city: 'Tirupati',
    lat: 13.6268,
    lon: 79.4215,
    basePrice: 2600,
    taxes: 312,
    fees: 100,
    checkInStartHour: 12,
    checkInEndHour: 23.5,
    has24hrFrontDesk: true,
    nidhiVerified: true,
    gstin: '37CCCCC2222C1Z1',
    trustState: 'TRUSTED',
    rating: 4.4,
    corridorAdvantage: '3 min from Railway Station; direct Alipiri link',
  },
  {
    id: 'hotel_tpty_alipiri',
    name: 'Marasa Sarovar Premiere',
    city: 'Tirupati',
    lat: 13.6540,
    lon: 79.3980,
    basePrice: 5500,
    taxes: 660,
    fees: 250,
    checkInStartHour: 14,
    checkInEndHour: 23.9,
    has24hrFrontDesk: true,
    nidhiVerified: true,
    gstin: '37DDDDD3333D1Z0',
    trustState: 'TRUSTED',
    rating: 4.7,
    corridorAdvantage: 'Right at foot of Tirumala Hills; fastest morning darshan ascent',
  },
];

/**
 * Evaluates check-in feasibility given estimated arrival time.
 */
function evaluateCheckInFeasibility(hotel, arrivalMinute) {
  if (arrivalMinute == null) return CHECKIN_STATES.CHECKIN_UNKNOWN;

  const arrivalHour = (arrivalMinute % 1440) / 60;
  const start = hotel.checkInStartHour || 12;
  const end = hotel.checkInEndHour || (hotel.has24hrFrontDesk ? 24 : 22);

  // If front desk is 24-hour, check-in is virtually always feasible
  if (hotel.has24hrFrontDesk) {
    if (arrivalHour < start && arrivalHour > 6) {
      return CHECKIN_STATES.CHECKIN_TIGHT; // Early arrival before standard check-in
    }
    return CHECKIN_STATES.CHECKIN_FEASIBLE;
  }

  // Non-24hr front desk
  if (arrivalHour > end || arrivalHour < 6) {
    return CHECKIN_STATES.CHECKIN_INFEASIBLE;
  }
  if (arrivalHour >= end - 0.75) { // within 45 mins of closing
    return CHECKIN_STATES.CHECKIN_TIGHT;
  }
  if (arrivalHour >= start) {
    return CHECKIN_STATES.CHECKIN_FEASIBLE;
  }

  return CHECKIN_STATES.CHECKIN_TIGHT;
}

/**
 * Evaluates candidate accommodations against current position and next-day plans.
 */
function findCandidateAccommodations({
  currentLocation = null,
  nextDayDestination = null,
  arrivalMinute = null,
  maxCandidates = 4,
  customPool = null,
} = {}) {
  const pool = Array.isArray(customPool) && customPool.length > 0 ? customPool : SEED_ACCOMMODATIONS;
  const currCoords = currentLocation ? [Number(currentLocation.lat), Number(currentLocation.lon)] : null;
  const nextCoords = nextDayDestination ? [Number(nextDayDestination.lat), Number(nextDayDestination.lon)] : null;

  appLogger.info(`[accommodationIntelligence] Evaluating ${pool.length} hotels (curr: ${currCoords}, next: ${nextCoords})`);

  const scored = pool.map(hotel => {
    // 1. Spatial distance from current location
    const distToHotel = currCoords
      ? Math.round(distKm(currCoords[0], currCoords[1], hotel.lat, hotel.lon) * 10) / 10
      : 5.0;
    const etaMinutes = Math.round(distToHotel * 2.2) + 10; // realistic traffic assumption
    const projectedArrival = arrivalMinute != null ? arrivalMinute + etaMinutes : null;

    // 2. Check-in Feasibility
    const checkInStatus = evaluateCheckInFeasibility(hotel, projectedArrival);

    // 3. Price Decomposition
    const priceDecomp = priceTrustEngine.evaluatePrice({
      basePrice: hotel.basePrice,
      taxes: hotel.taxes || Math.round(hotel.basePrice * 0.12),
      fees: hotel.fees || 0,
      currency: 'INR',
    });

    // 4. Next-Morning Departure Advantage
    let tomorrowDistKm = null;
    let tomorrowUtility = 'NEUTRAL';
    let corridorScore = 15;

    if (nextCoords) {
      tomorrowDistKm = Math.round(distKm(hotel.lat, hotel.lon, nextCoords[0], nextCoords[1]) * 10) / 10;
      if (tomorrowDistKm < 15) {
        tomorrowUtility = 'HIGHLY_FAVORABLE';
        corridorScore = 30;
      } else if (tomorrowDistKm < 35) {
        tomorrowUtility = 'FAVORABLE';
        corridorScore = 20;
      } else {
        tomorrowUtility = 'INCONVENIENT';
        corridorScore = 5;
      }
    }

    // 5. Composite Scoring
    let compositeScore = 60;

    // Distance penalty
    compositeScore -= Math.min(25, distToHotel * 0.6);

    // Check-in status
    if (checkInStatus === CHECKIN_STATES.CHECKIN_FEASIBLE) compositeScore += 20;
    else if (checkInStatus === CHECKIN_STATES.CHECKIN_TIGHT) compositeScore += 5;
    else if (checkInStatus === CHECKIN_STATES.CHECKIN_INFEASIBLE) compositeScore -= 40;

    // Trust state
    if (hotel.trustState === 'TRUSTED') compositeScore += 15;
    else if (hotel.trustState === 'SUPPORTED') compositeScore += 10;
    else if (hotel.trustState === 'UNVERIFIED') compositeScore -= 5;

    // Next morning corridor advantage
    compositeScore += corridorScore;

    // Rating
    compositeScore += ((hotel.rating || 4.0) - 3.5) * 10;

    const boundedScore = Math.max(10, Math.min(99, Math.round(compositeScore)));

    return {
      id: hotel.id,
      name: hotel.name,
      city: hotel.city,
      lat: hotel.lat,
      lon: hotel.lon,
      distanceKm: distToHotel,
      etaMinutes,
      checkInStatus,
      checkInHoursText: `${hotel.checkInStartHour || 12}:00 - ${hotel.checkInEndHour ? `${hotel.checkInEndHour}:00` : '24h'}`,
      price: {
        basePrice: hotel.basePrice,
        taxes: hotel.taxes || Math.round(hotel.basePrice * 0.12),
        fees: hotel.fees || 0,
        totalPrice: priceDecomp.knownTotal || (hotel.basePrice + (hotel.taxes || 0)),
        totalKnownPrice: priceDecomp.knownTotal || (hotel.basePrice + (hotel.taxes || 0)),
        transparencyTier: priceDecomp.transparencyTier,
        decomposed: priceDecomp,
      },
      totalKnownPrice: priceDecomp.knownTotal || (hotel.basePrice + (hotel.taxes || 0)),
      trustState: hotel.trustState || 'SUPPORTED',
      nidhiVerified: Boolean(hotel.nidhiVerified),
      gstin: hotel.gstin || null,
      rating: hotel.rating,
      tomorrowDistanceKm: tomorrowDistKm,
      tomorrowUtility,
      corridorAdvantage: hotel.corridorAdvantage || 'Standard transit access',
      compositeScore: boundedScore,
      tradeoff: generateTradeoffText(hotel, distToHotel, priceDecomp.totalPrice, tomorrowUtility),
    };
  });

  // Sort descending by composite score
  scored.sort((a, b) => b.compositeScore - a.compositeScore);
  return scored.slice(0, maxCandidates);
}

/**
 * Synthesizes a human-readable tradeoff statement for the traveler.
 */
function generateTradeoffText(hotel, distKm, totalCost, tomorrowUtility) {
  if (tomorrowUtility === 'HIGHLY_FAVORABLE') {
    return `Prime location for tomorrow's journey, saving 25-40 min of morning transit.`;
  }
  if (totalCost < 2500) {
    return `Cost-effective rate (₹${totalCost}), though slightly farther from departure corridor.`;
  }
  if (distKm < 5) {
    return `Fastest arrival tonight (${Math.round(distKm)} km away), allowing immediate rest.`;
  }
  return `Balanced comfort and verified hospitality standards.`;
}

module.exports = {
  CHECKIN_STATES,
  SEED_ACCOMMODATIONS,
  evaluateCheckInFeasibility,
  findCandidateAccommodations,
  generateTradeoffText,
};
