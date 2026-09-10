'use strict';

/**
 * services/travelIntelligence/decision/alternativeGenerator.js
 *
 * Contextual Alternative Destination Generator for India In-Time v3.0.
 * Replaces unviable or disrupted upcoming stops with viable alternatives matching Traveler DNA.
 *
 * Examples:
 * - Outdoor Viewpoint in heavy rain -> Indoor Museum, Cultural Center, or Coffee Haven.
 * - Temple closed in afternoon -> Nearby Heritage site or Culinary stop.
 */

const { distKm } = require('../../../utils/geo');
const { computeDnaMatch } = require('../personalTravelDna');

// Curated high-reliability regional indoor / sheltered havens across popular circuits
const REGIONAL_ALTERNATIVE_HAVENS = [
  // Visakhapatnam - Araku Circuit
  { id: 'araku_tribal_museum', name: 'Araku Tribal Museum', cat: 'museum', lat: 18.331, lon: 82.868, indoorOutdoor: 'indoor', open_time: '09:00', close_time: '19:00', city: 'Araku Valley', visitMinutes: 60 },
  { id: 'coffee_house_haven', name: 'Araku Valley Coffee House & Roastery', cat: 'food', lat: 18.334, lon: 82.871, indoorOutdoor: 'indoor', open_time: '08:00', close_time: '20:00', city: 'Araku Valley', visitMinutes: 45 },
  { id: 'padmapuram_craft_centre', name: 'Padmapuram Handicrafts Pavilion', cat: 'heritage', lat: 18.325, lon: 82.862, indoorOutdoor: 'covered', open_time: '09:00', close_time: '18:00', city: 'Araku Valley', visitMinutes: 45 },
  { id: 'sub_museum_vizag', name: 'INS Kursura Submarine Museum', cat: 'museum', lat: 17.716, lon: 83.333, indoorOutdoor: 'indoor', open_time: '14:00', close_time: '20:30', city: 'Visakhapatnam', visitMinutes: 60 },
  { id: 'aircraft_museum_vizag', name: 'TU-142 Aircraft Museum', cat: 'museum', lat: 17.717, lon: 83.334, indoorOutdoor: 'indoor', open_time: '14:00', close_time: '20:30', city: 'Visakhapatnam', visitMinutes: 50 },

  // Hyderabad Circuit
  { id: 'salar_jung', name: 'Salar Jung Museum', cat: 'museum', lat: 17.371, lon: 78.480, indoorOutdoor: 'indoor', open_time: '10:00', close_time: '17:00', city: 'Hyderabad', visitMinutes: 120 },
  { id: 'chowmahalla_covered', name: 'Chowmahalla Palace Durbar Hall', cat: 'heritage', lat: 17.357, lon: 78.471, indoorOutdoor: 'covered', open_time: '10:00', close_time: '17:00', city: 'Hyderabad', visitMinutes: 90 },

  // Bengaluru Circuit
  { id: 'visvesvaraya_museum', name: 'Visvesvaraya Industrial & Technological Museum', cat: 'museum', lat: 12.975, lon: 77.596, indoorOutdoor: 'indoor', open_time: '09:30', close_time: '18:00', city: 'Bengaluru', visitMinutes: 90 },
  { id: 'national_gallery_blr', name: 'National Gallery of Modern Art', cat: 'museum', lat: 12.990, lon: 77.587, indoorOutdoor: 'indoor', open_time: '10:00', close_time: '17:00', city: 'Bengaluru', visitMinutes: 75 },
];

/**
 * Finds the optimal alternative stop for a degraded destination.
 *
 * @param {Object} disruptedStop - Stop that is no longer viable
 * @param {Object} options
 * @param {string} options.reason - Reason for substitution (e.g. 'WEATHER_RAIN', 'CLOSED')
 * @param {Object} options.travelerDna - Traveler DNA profile
 * @param {number} options.currentMinute - Current journey minute
 * @param {Array<Object>} options.candidatePool - Optional custom pool of POIs
 * @returns {Object|null} Recommended alternative stop with justification
 */
function findAlternativeStop(disruptedStop, {
  reason = 'WEATHER_RAIN',
  travelerDna = {},
  _currentMinute = 600,
  candidatePool = [],
} = {}) {
  const pool = (candidatePool && candidatePool.length > 0)
    ? candidatePool
    : REGIONAL_ALTERNATIVE_HAVENS;

  const targetLat = disruptedStop.lat || disruptedStop.coords?.[0];
  const targetLon = disruptedStop.lon || disruptedStop.coords?.[1];

  let bestCandidate = null;
  let bestScore = -1;

  for (const candidate of pool) {
    if (candidate.id === disruptedStop.id || candidate.name === disruptedStop.name) continue;

    // If reason is severe rain, require indoor or covered stop
    if (reason.includes('RAIN') || reason.includes('WEATHER')) {
      if (candidate.indoorOutdoor !== 'indoor' && candidate.indoorOutdoor !== 'covered' && candidate.cat !== 'museum' && candidate.cat !== 'food') {
        continue;
      }
    }

    // Proximity check: prefer stops within 35 km of disrupted stop
    const dist = (targetLat && targetLon && candidate.lat && candidate.lon)
      ? distKm(targetLat, targetLon, candidate.lat, candidate.lon)
      : 15;

    if (dist > 60) continue; // Skip stops that are too far away

    // Traveler DNA Alignment
    const dnaMatch = computeDnaMatch(candidate, travelerDna);
    const proximityScore = Math.max(10, 100 - dist * 2);
    const combinedScore = dnaMatch.score * 0.6 + proximityScore * 0.4;

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestCandidate = {
        ...candidate,
        distanceFromOriginalKm: Math.round(dist * 10) / 10,
        substituteScore: Math.round(combinedScore),
        dnaMatchScore: dnaMatch.score,
        substitutionReason: (reason.includes('RAIN') || reason.includes('WEATHER') || reason.includes('GHAT'))
          ? `Sheltered haven substituting for ${disruptedStop.name} during adverse weather`
          : `Alternative open attraction substituting for ${disruptedStop.name}`,
      };
    }
  }

  return bestCandidate;
}

module.exports = {
  findAlternativeStop,
  REGIONAL_ALTERNATIVE_HAVENS,
};
