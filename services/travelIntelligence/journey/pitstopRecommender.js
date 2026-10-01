'use strict';

/**
 * services/travelIntelligence/journey/pitstopRecommender.js
 *
 * Real-Time Wayside Pitstop & Corridor Recharge Engine for India In-Time v3.0.
 *
 * Provides travelers on active journeys with context-aware, low-detour recharge points:
 * - Iconic highway dhabas & authentic tea stalls
 * - High-hygiene family rest stops with clean washrooms
 * - Scenic vantage points & coffee plantation roasteries
 * - Seamless non-destructive insertion into active journey state
 */

const { distKm } = require('../../../utils/geo');
const { getActiveMealSlot } = require('../mealIntelligence');
const { cloneJourneyState, STOP_STATUSES } = require('./journeyStateEngine');

// Curated high-reliability wayside pitstops and iconic highway recharge plazas across India
const CURATED_CORRIDOR_PITSTOPS = [
  // ── 1. Andhra Pradesh & Eastern Ghats (Vizag - Araku - Paderu) ─────────────
  {
    id: 'pitstop_tyda_jungle_bells',
    name: 'Tyda Jungle Bells Highway Cafe & Restroom Oasis',
    cat: 'cafe',
    coords: [18.216, 83.052],
    tier: 'S',
    visitMinutes: 30,
    hasCleanWashrooms: true,
    hasAc: true,
    familyFriendly: true,
    specialty: 'Fresh Araku organic coffee, hot mirchi bajji & clean restroom pavilions',
    corridor: 'Vizag - Araku Ghat Road',
  },
  {
    id: 'pitstop_ananthagiri_view',
    name: 'Ananthagiri Coffee Roastery & Valley Vantage Kiosk',
    cat: 'tea_break',
    coords: [18.238, 83.012],
    tier: 'A',
    visitMinutes: 20,
    hasCleanWashrooms: true,
    hasAc: false,
    familyFriendly: true,
    specialty: 'High-elevation valley mist view, fresh ginger tea & bamboo chicken snack',
    corridor: 'Vizag - Araku Ghat Road',
  },
  {
    id: 'pitstop_simhachalam_foothills',
    name: 'Simhachalam Foothills Heritage Tiffin Pavilion',
    cat: 'highway_dhaba',
    coords: [17.768, 83.251],
    tier: 'A',
    visitMinutes: 30,
    hasCleanWashrooms: true,
    hasAc: true,
    familyFriendly: true,
    specialty: 'Steaming hot ghee idli, filter coffee & covered parking',
    corridor: 'Vizag Coastal Bypass',
  },

  // ── 2. North India & Golden Triangle (Delhi - Agra - Jaipur - Chandigarh) ───
  {
    id: 'pitstop_murthal_amrik_sukhdev',
    name: 'Amrik Sukhdev Iconic Dhaba & Grand Plaza',
    cat: 'highway_dhaba',
    coords: [29.028, 77.071],
    tier: 'S',
    visitMinutes: 45,
    hasCleanWashrooms: true,
    hasAc: true,
    familyFriendly: true,
    specialty: 'Legendary white butter tandoori parathas, kullad lassi & airport-grade luxury restrooms',
    corridor: 'Delhi - Panipat - Ambala NH44',
  },
  {
    id: 'pitstop_highway_king_jaipur',
    name: 'Highway King Grand Midway Rest Oasis',
    cat: 'highway_dhaba',
    coords: [27.812, 76.324],
    tier: 'S',
    visitMinutes: 40,
    hasCleanWashrooms: true,
    hasAc: true,
    familyFriendly: true,
    specialty: 'Multi-cuisine Rajasthani thali, masala chai & shaded rest lawns',
    corridor: 'Delhi - Jaipur NH48',
  },
  {
    id: 'pitstop_yamuna_expressway_shiva',
    name: 'Yamuna Expressway Midway Toll Plaza Haven',
    cat: 'cafe',
    coords: [27.854, 77.621],
    tier: 'A',
    visitMinutes: 25,
    hasCleanWashrooms: true,
    hasAc: true,
    familyFriendly: true,
    specialty: 'Fast food, espresso bar, express fuel and clean emergency washrooms',
    corridor: 'Noida - Agra Yamuna Expressway',
  },

  // ── 3. Maharashtra & West Coast (Mumbai - Pune - Goa) ──────────────────────
  {
    id: 'pitstop_datta_snacks_expressway',
    name: 'Datta Snacks Iconic Maharashtrian Rest Stop',
    cat: 'highway_dhaba',
    coords: [18.732, 73.415],
    tier: 'S',
    visitMinutes: 30,
    hasCleanWashrooms: true,
    hasAc: true,
    familyFriendly: true,
    specialty: 'Authentic Puneri misal pav, piping hot batata vada & cutting chai',
    corridor: 'Mumbai - Pune Expressway',
  },
  {
    id: 'pitstop_khalapur_food_mall',
    name: 'Khalapur Grand Expressway Food Mall',
    cat: 'cafe',
    coords: [18.825, 73.284],
    tier: 'S',
    visitMinutes: 35,
    hasCleanWashrooms: true,
    hasAc: true,
    familyFriendly: true,
    specialty: 'Multi-brand food court, barista coffee & expansive EV fast charging',
    corridor: 'Mumbai - Pune Expressway',
  },

  // ── 4. Karnataka & Tamil Nadu (Bengaluru - Mysuru - Chennai - Hosur) ────────
  {
    id: 'pitstop_maddur_tiffanys',
    name: 'Maddur Tiffany’s Heritage Rest Plaza',
    cat: 'tea_break',
    coords: [12.584, 77.042],
    tier: 'S',
    visitMinutes: 25,
    hasCleanWashrooms: true,
    hasAc: true,
    familyFriendly: true,
    specialty: 'Crispy Maddur vada, strong Kumbakonam degree filter coffee',
    corridor: 'Bengaluru - Mysuru Expressway NH275',
  },
  {
    id: 'pitstop_a2b_highway_krishnagiri',
    name: 'A2B (Adyar Ananda Bhavan) Highway Oasis',
    cat: 'highway_dhaba',
    coords: [12.631, 78.114],
    tier: 'S',
    visitMinutes: 40,
    hasCleanWashrooms: true,
    hasAc: true,
    familyFriendly: true,
    specialty: 'Pure veg South Indian thali, mini tiffin, fresh sweets & clean washrooms',
    corridor: 'Bengaluru - Chennai NH44',
  },

  // ── 5. Kerala & Western Ghats (Kochi - Munnar - Idukki) ─────────────────────
  {
    id: 'pitstop_gap_road_munnar_tea',
    name: 'Lockhart Gap Road Mist & Spice Tea Lounge',
    cat: 'tea_break',
    coords: [10.021, 77.142],
    tier: 'S',
    visitMinutes: 25,
    hasCleanWashrooms: true,
    hasAc: false,
    familyFriendly: true,
    specialty: 'Fresh cardamom spiced tea, banana fritters (pazham pori) & cliff panoramic view',
    corridor: 'Munnar - Kochi NH85 Gap Road',
  },
];

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
 * Discovers and ranks wayside pitstop and recharge candidates along the active corridor.
 *
 * @param {Object} params
 * @param {Object} params.activeStop
 * @param {Object} [params.nextStop]
 * @param {number} [params.currentMinute=720]
 * @param {Object} [params.weather={}]
 * @param {Array} [params.candidatePlaces=[]]
 * @param {number} [params.limit=3]
 * @returns {Array<Object>} Ranked wayside pitstops
 */
function findMidwayPitstops({
  activeStop,
  nextStop = null,
  currentMinute = 720,
  weather = {},
  candidatePlaces = [],
  limit = 3,
} = {}) {
  if (!activeStop) return [];

  const fromCoords = activeStop.coords || [activeStop.lat, activeStop.lon];
  if (!fromCoords || fromCoords[0] == null) return [];

  const toCoords = nextStop
    ? (nextStop.coords || [nextStop.lat, nextStop.lon])
    : [fromCoords[0] + 0.05, fromCoords[1] + 0.05];

  const mealSlot = getActiveMealSlot(currentMinute);
  const isHighHeat = (weather.temperatureC ?? 28) >= 36;
  const isRaining = (weather.precipitationProb ?? 0) >= 60;

  // Pool combining curated highway pitstops + local candidate dining/rest places
  const pool = [...CURATED_CORRIDOR_PITSTOPS];

  if (Array.isArray(candidatePlaces)) {
    for (const c of candidatePlaces) {
      const coords = c.coords || (c.lat && c.lon ? [c.lat, c.lon] : null);
      if (coords) {
        pool.push({
          id: c.id || `place_${c.name?.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          name: c.name,
          cat: c.category || c.cat || 'cafe',
          coords,
          tier: c.tier || 'B',
          visitMinutes: c.stayMinutes || 30,
          hasCleanWashrooms: true,
          hasAc: Boolean(c.airConditioned),
          familyFriendly: true,
          specialty: c.description || 'Local recharge & refreshment stop',
          corridor: 'Local Corridor',
        });
      }
    }
  }

  // Pre-filter with bounding box
  const minLat = Math.min(fromCoords[0], toCoords[0]) - 0.75;
  const maxLat = Math.max(fromCoords[0], toCoords[0]) + 0.75;
  const minLon = Math.min(fromCoords[1], toCoords[1]) - 0.75;
  const maxLon = Math.max(fromCoords[1], toCoords[1]) + 0.75;

  const inBounds = pool.filter(p => {
    const lat = p.coords[0];
    const lon = p.coords[1];
    return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
  });

  const scored = inBounds.map(p => {
    const detour = detourDistanceKm(p.coords, fromCoords, toCoords);
    const distFromActive = distKm(fromCoords[0], fromCoords[1], p.coords[0], p.coords[1]);

    let score = 70;
    const whyList = [];

    // Detour scoring: < 2km detour is ideal
    if (detour <= 1.0) {
      score += 25;
      whyList.push('Virtually zero detour on your immediate route');
    } else if (detour <= 3.0) {
      score += 15;
      whyList.push(`Short ${detour}km detour off corridor`);
    } else {
      score -= Math.min(30, Math.round(detour * 5));
    }

    // Distance sanity check: within 50km
    if (distFromActive > 50) {
      score -= 40;
    }

    // Meal slot synergy
    if (mealSlot) {
      if (mealSlot.key === 'snack' && (p.cat === 'tea_break' || p.cat === 'cafe')) {
        score += 20;
        whyList.push('Matches afternoon tea & snack window');
      } else if ((mealSlot.key === 'lunch' || mealSlot.key === 'breakfast') && p.cat === 'highway_dhaba') {
        score += 20;
        whyList.push(`Perfect timing for ${mealSlot.name}`);
      }
    }

    // AC & Hygiene bonus during hot weather
    if (isHighHeat && p.hasAc) {
      score += 15;
      whyList.push('Air-conditioned haven during midday heat');
    }

    // Covered shelters during rain
    if (isRaining && p.hasCleanWashrooms) {
      score += 10;
      whyList.push('Covered shelter with verified clean amenities');
    }

    // Tier bonus
    if (p.tier === 'S') score += 10;

    return {
      id: p.id,
      name: p.name,
      category: p.cat,
      coords: p.coords,
      detourKm: detour,
      distanceFromCurrentKm: Math.round(distFromActive * 10) / 10,
      visitMinutes: p.visitMinutes,
      specialty: p.specialty,
      hasCleanWashrooms: p.hasCleanWashrooms,
      hasAc: p.hasAc,
      familyFriendly: p.familyFriendly,
      rechargeScore: Math.max(10, Math.min(100, score)),
      whyRecommended: whyList.length ? whyList.join(' · ') : 'Convenient route recharge waypoint',
    };
  });

  scored.sort((a, b) => b.rechargeScore - a.rechargeScore);

  // Fallback: If no candidate found in strict bounding box, synthesize a contextual wayside stop
  if (scored.length === 0) {
    const midLat = Math.round(((fromCoords[0] + toCoords[0]) / 2) * 1000) / 1000;
    const midLon = Math.round(((fromCoords[1] + toCoords[1]) / 2) * 1000) / 1000;
    return [{
      id: `synthetic_pitstop_${Date.now()}`,
      name: 'Corridor Tea Stall & Rest Haven',
      category: 'tea_break',
      coords: [midLat, midLon],
      detourKm: 0.2,
      distanceFromCurrentKm: Math.round(distKm(fromCoords[0], fromCoords[1], midLat, midLon) * 10) / 10,
      visitMinutes: 20,
      specialty: 'Authentic local chai, mineral water, and refreshment break',
      hasCleanWashrooms: true,
      hasAc: false,
      familyFriendly: true,
      rechargeScore: 78,
      whyRecommended: 'Midway transit pause to restore travel energy without detour',
    }];
  }

  return scored.slice(0, limit);
}

/**
 * Inserts a chosen pitstop directly into the active journey state.
 *
 * @param {Object} journeyState Active journey state
 * @param {Object} pitstop Chosen pitstop object
 * @param {string} [insertAfterStopId] ID of stop to insert after (defaults to active stop)
 * @returns {Object} Updated journey state
 */
function insertPitstopIntoJourney(journeyState, pitstop, insertAfterStopId = null) {
  if (!journeyState || !Array.isArray(journeyState.stops)) {
    throw new Error('Valid journeyState is required to insert pitstop');
  }
  if (!pitstop || !pitstop.name) {
    throw new Error('Valid pitstop object with name is required');
  }

  const cloned = cloneJourneyState(journeyState);
  const targetId = insertAfterStopId || cloned.activeStop?.id || cloned.stops[0]?.id;

  const targetIdx = cloned.stops.findIndex(s => s.id === targetId);
  const insertIdx = targetIdx >= 0 ? targetIdx + 1 : 1;

  const targetStop = cloned.stops[targetIdx] || cloned.stops[0];
  const targetDeparture = (targetStop?.plannedArrivalMinute || cloned.currentMinute || 600) +
    (targetStop?.visitMinutes || 45);

  const newStop = {
    id: pitstop.id || `pitstop_${Date.now()}`,
    name: pitstop.name,
    category: pitstop.category || 'tea_break',
    coords: pitstop.coords || null,
    lat: pitstop.coords ? pitstop.coords[0] : null,
    lon: pitstop.coords ? pitstop.coords[1] : null,
    visitMinutes: pitstop.visitMinutes || 25,
    plannedArrivalMinute: targetDeparture + 10, // ~10m travel to midway pitstop
    status: STOP_STATUSES.UPCOMING,
    isPitstop: true,
    specialty: pitstop.specialty,
    whyInserted: pitstop.whyRecommended || 'Traveler-selected wayside recharge stop',
  };

  cloned.stops.splice(insertIdx, 0, newStop);

  // Retime subsequent stops
  const addedTime = newStop.visitMinutes + 10;
  for (let i = insertIdx + 1; i < cloned.stops.length; i++) {
    if (cloned.stops[i].plannedArrivalMinute != null) {
      cloned.stops[i].plannedArrivalMinute += addedTime;
    }
  }

  // Update partitions
  cloned.upcomingStops = cloned.stops.filter(s => s.status === STOP_STATUSES.UPCOMING);
  cloned.activePlanVersion = (cloned.activePlanVersion || 1) + 1;

  return cloned;
}

module.exports = {
  findMidwayPitstops,
  insertPitstopIntoJourney,
  CURATED_CORRIDOR_PITSTOPS,
};
