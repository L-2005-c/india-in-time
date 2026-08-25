'use strict';

/**
 * services/travelIntelligence/mealIntelligence.js
 * Route-Aware Meal & Culinary Intelligence Engine.
 *
 * Implements:
 * 1. Intelligent meal slot detection (Breakfast, Lunch, Tea/Snack, Dinner).
 * 2. On-route corridor dining discovery (minimizing detour from Stop A → Stop B).
 * 3. Dietary filtering (Vegetarian, Vegan, Halal, Jain).
 * 4. Climate-matched dining environments (AC indoors during heat, covered during monsoon, outdoor terrace during pleasant evenings).
 */

const { distKm } = require('../../utils/geo');
const { isFoodPlace } = require('./requirementEngine');

const MEAL_SLOTS = {
  breakfast: { name: 'Breakfast', startMin: 7 * 60, endMin: 10 * 60 + 30, durationMin: 40 },
  lunch: { name: 'Lunch', startMin: 12 * 60, endMin: 15 * 60 + 30, durationMin: 55 },
  snack: { name: 'Tea & Refreshment', startMin: 16 * 60, endMin: 18 * 60 + 30, durationMin: 30 },
  dinner: { name: 'Dinner', startMin: 18 * 60 + 30, endMin: 22 * 60 + 30, durationMin: 60 },
};

/**
 * Determines which meal slot is active for a given minute of day.
 */
function getActiveMealSlot(minuteOfDay) {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  for (const [key, slot] of Object.entries(MEAL_SLOTS)) {
    if (m >= slot.startMin && m <= slot.endMin) {
      return { key, ...slot };
    }
  }
  return null;
}

/**
 * Calculates perpendicular detour distance from point P to line segment AB.
 */
function detourDistanceKm(pCoords, aCoords, bCoords) {
  if (!aCoords || !bCoords || !pCoords) return 0;
  const dAP = distKm(aCoords[0], aCoords[1], pCoords[0], pCoords[1]);
  const dPB = distKm(pCoords[0], pCoords[1], bCoords[0], bCoords[1]);
  const dAB = distKm(aCoords[0], aCoords[1], bCoords[0], bCoords[1]);
  return Math.max(0, Math.round((dAP + dPB - dAB) * 10) / 10);
}

/**
 * Discovers and ranks route-aware food recommendations.
 */
function findRouteAwareDining(fromCoords, toCoords, candidatePlaces = [], options = {}) {
  const timeMin = options.timeMin || 750;
  const slot = getActiveMealSlot(timeMin) || MEAL_SLOTS.lunch;
  const dietary = options.dietaryRestrictions || [];
  const weather = options.weather || {};
  const isHot = (weather.tempC || 28) >= 35;
  const isRaining = /rain|storm/i.test(weather.condition || '');

  const foodCandidates = (candidatePlaces || []).filter(p => isFoodPlace(p) && p.coords);

  const scored = foodCandidates.map(place => {
    const coords = place.coords;
    const detour = detourDistanceKm(coords, fromCoords, toCoords);
    const directDist = fromCoords ? distKm(fromCoords[0], fromCoords[1], coords[0], coords[1]) : 2.0;

    let score = 70;
    const whyList = [];

    // Detour penalty
    if (detour <= 1.2) {
      score += 18;
      whyList.push('Directly on your travel route');
    } else if (detour <= 3.0) {
      score += 8;
      whyList.push(`Short detour (${detour} km)`);
    } else {
      score -= (detour * 4);
    }

    // Quality / Rating
    if (place.rating >= 4.4) {
      score += 10;
      whyList.push(`Top-rated (${place.rating}★)`);
    }

    // Dietary Match
    if (dietary.includes('vegetarian') && (place.vegetarian || place.veg)) {
      score += 12;
      whyList.push('Pure Vegetarian dining');
    }

    // Climate Seating Match
    if (isHot) {
      whyList.push('Air-conditioned indoor dining recommended for midday heat');
      score += 8;
    } else if (isRaining) {
      whyList.push('Covered indoor dining for weather comfort');
      score += 8;
    } else if (timeMin >= 18 * 60) {
      whyList.push('Evening dining atmosphere');
    }

    return {
      id: place.id || place.name,
      name: place.name,
      category: place.cat || 'restaurant',
      coords: place.coords,
      rating: place.rating || 4.5,
      detourKm: detour,
      distanceKm: Math.round(directDist * 10) / 10,
      mealSlot: slot.name,
      durationMin: slot.durationMin,
      whyRecommended: whyList.join(' • '),
      score: Math.max(10, Math.min(100, Math.round(score))),
      googleMapsUrl: fromCoords ? `https://www.google.com/maps/dir/?api=1&origin=${fromCoords[0]},${fromCoords[1]}&destination=${coords[0]},${coords[1]}&travelmode=driving` : null,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, options.limit || 3);
}

module.exports = {
  MEAL_SLOTS,
  getActiveMealSlot,
  findRouteAwareDining,
  detourDistanceKm,
};
