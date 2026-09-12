'use strict';

/**
 * services/routing/roadClosureRegistry.js
 *
 * Authoritative Indian road closures, ghat night bans, urban pedestrianization zones,
 * and high-impact construction corridor registry.
 *
 * Provides spatial route intersection checking and dynamic detour bypass waypoint generation.
 */

const { distKm } = require('../../utils/geo');

const CLOSURE_TYPES = Object.freeze({
  GHAT_NIGHT_CLOSURE: 'GHAT_NIGHT_CLOSURE',
  PEDESTRIAN_ZONE: 'PEDESTRIAN_ZONE',
  LANDSLIDE_RISK: 'LANDSLIDE_RISK',
  CONSTRUCTION_CLOSURE: 'CONSTRUCTION_CLOSURE',
  POLICE_DIVERSION: 'POLICE_DIVERSION',
  VIP_CORRIDOR: 'VIP_CORRIDOR',
});

const CANONICAL_ROAD_CLOSURES = [
  // 1. Araku Valley — Ananthagiri Ghat Night Curfew
  {
    id: 'closure_araku_ghat_01',
    name: 'Araku Valley — Ananthagiri Ghat Road',
    category: CLOSURE_TYPES.GHAT_NIGHT_CLOSURE,
    city: 'araku',
    location: {
      lat: 18.2325,
      lon: 83.1168,
      radiusKm: 7.5,
    },
    corridorName: 'SH39 / Ananthagiri Ghat Section',
    timeWindow: {
      type: 'NIGHT_CURFEW',
      startMin: 21 * 60, // 21:00 (9:00 PM)
      endMin: 5 * 60 + 30, // 05:30 (5:30 AM)
    },
    severity: 'CRITICAL',
    reason: 'Ghat section closed to nocturnal transit due to fog, hairpin turns, and elephant corridor safety regulations.',
    diversionAdvice: 'Halt overnight or divert via Srungavarapukota bypass or defer ascent until morning daylight (after 05:30 AM).',
    bypassWaypoint: [18.1150, 83.1580], // S.Kota lower junction bypass
  },

  // 2. Bandipur / Wayanad — NH766 Forest Night Traffic Ban
  {
    id: 'closure_bandipur_nh766_01',
    name: 'Bandipur National Park NH766 Corridor',
    category: CLOSURE_TYPES.GHAT_NIGHT_CLOSURE,
    city: 'mysuru',
    location: {
      lat: 11.6664,
      lon: 76.6315,
      radiusKm: 12.0,
    },
    corridorName: 'NH766 Gundlupet–Sulthan Bathery Section',
    timeWindow: {
      type: 'NIGHT_CURFEW',
      startMin: 21 * 60, // 21:00
      endMin: 6 * 60, // 06:00
    },
    severity: 'CRITICAL',
    reason: 'National Green Tribunal & High Court mandated nighttime wildlife corridor closure on NH766.',
    diversionAdvice: 'Night traffic must divert via SH89 / Hunsur–Gonikoppal–Kutta–Mananthavady route.',
    bypassWaypoint: [12.1800, 76.0200], // Hunsur bypass
  },

  // 3. Dhimbam Ghat (Tamil Nadu / Karnataka border)
  {
    id: 'closure_dhimbam_ghat_01',
    name: 'Dhimbam Ghat 27 Hairpin Section',
    category: CLOSURE_TYPES.GHAT_NIGHT_CLOSURE,
    city: 'erode',
    location: {
      lat: 11.6917,
      lon: 77.1697,
      radiusKm: 6.0,
    },
    corridorName: 'NH948 Bannari–Asanur Ghat Stretch',
    timeWindow: {
      type: 'NIGHT_CURFEW',
      startMin: 18 * 60, // 18:00 (6:00 PM)
      endMin: 6 * 60, // 06:00 (6:00 AM)
    },
    severity: 'CRITICAL',
    reason: 'Tiger reserve safety restrictions & frequent night breakdown bottlenecks.',
    diversionAdvice: 'Divert via Sathyamangalam–Anthiyur–Bhavani or await 06:00 AM opening.',
    bypassWaypoint: [11.5800, 77.5200],
  },

  // 4. Old Delhi — Chandni Chowk & Red Fort Pedestrianized Corridor
  {
    id: 'closure_delhi_chandni_chowk_01',
    name: 'Chandni Chowk Red Fort Pedestrian Corridor',
    category: CLOSURE_TYPES.PEDESTRIAN_ZONE,
    city: 'delhi',
    location: {
      lat: 28.6562,
      lon: 77.2305,
      radiusKm: 1.2,
    },
    corridorName: 'Chandni Chowk Main Heritage Street',
    timeWindow: {
      type: 'TIME_RANGE',
      startMin: 9 * 60, // 09:00 AM
      endMin: 21 * 60, // 09:00 PM
    },
    severity: 'CRITICAL',
    reason: 'Complete motor vehicle prohibition; pedestrian and non-motorized heritage zone only.',
    diversionAdvice: 'Divert via Ring Road (Mahatma Gandhi Marg) or SPM Marg; park at Asaf Ali Road or Red Fort Multilevel Parking.',
    bypassWaypoint: [28.6650, 77.2280], // SPM Marg bypass
  },

  // 5. Hyderabad — Charminar Pedestrianization Project (CPP Zone)
  {
    id: 'closure_hyd_charminar_01',
    name: 'Charminar Pedestrian Precinct (CPP Zone)',
    category: CLOSURE_TYPES.PEDESTRIAN_ZONE,
    city: 'hyderabad',
    location: {
      lat: 17.3616,
      lon: 78.4747,
      radiusKm: 0.6,
    },
    corridorName: 'Charminar Perimeter Heritage Zone',
    timeWindow: {
      type: 'ALWAYS',
    },
    severity: 'CRITICAL',
    reason: 'Permanent pedestrianization around Charminar. Motor vehicles not permitted within 400m perimeter.',
    diversionAdvice: 'Approach via Madina Building or Mir Alam Mandi; park at Old Bus Depot / Charkaman and proceed on foot.',
    bypassWaypoint: [17.3685, 78.4760], // Madina Circle bypass
  },

  // 6. Visakhapatnam — RK Beach Road Sunday Vehicle-Free Evenings
  {
    id: 'closure_vskp_beach_road_01',
    name: 'Visakhapatnam RK Beach Road Vehicle-Free Promenade',
    category: CLOSURE_TYPES.PEDESTRIAN_ZONE,
    city: 'visakhapatnam',
    location: {
      lat: 17.7142,
      lon: 83.3237,
      radiusKm: 2.5,
    },
    corridorName: 'Coastal Battery to Park Hotel Stretch',
    timeWindow: {
      type: 'WEEKEND_EVENING',
      days: [0], // Sunday
      startMin: 17 * 60, // 17:00 (5:00 PM)
      endMin: 20 * 60 + 30, // 20:30 (8:30 PM)
    },
    severity: 'WARNING',
    reason: 'Sunday evening vehicle-free pedestrian promenade for citizens and tourists.',
    diversionAdvice: 'Divert via Waltair Main Road, Pandurangapuram, or Siripuram Junction arterial.',
    bypassWaypoint: [17.7220, 83.3180], // Waltair Main Road bypass
  },

  // 7. Mumbai — Marine Drive to Coastal Road Evening Diversion
  {
    id: 'closure_mum_marine_drive_01',
    name: 'Marine Drive / Nariman Point VIP Movement Corridor',
    category: CLOSURE_TYPES.VIP_CORRIDOR,
    city: 'mumbai',
    location: {
      lat: 18.9320,
      lon: 72.8220,
      radiusKm: 1.5,
    },
    corridorName: 'Netaji Subhash Chandra Bose Road',
    timeWindow: {
      type: 'TIME_RANGE',
      startMin: 18 * 60,
      endMin: 20 * 60,
    },
    severity: 'WARNING',
    reason: 'Peak evening protocol and coastal road connector traffic diversion.',
    diversionAdvice: 'Divert via Maharshi Karve Road (Queens Road) or JJ Flyover.',
    bypassWaypoint: [18.9400, 72.8300], // Queens Road bypass
  },

  // 8. Munnar — Gap Road / NH85 Monsoon Landslide Hazard Zone
  {
    id: 'closure_munnar_gap_road_01',
    name: 'Munnar Gap Road NH85 Rocky Stretch',
    category: CLOSURE_TYPES.LANDSLIDE_RISK,
    city: 'munnar',
    location: {
      lat: 10.0380,
      lon: 77.1040,
      radiusKm: 4.5,
    },
    corridorName: 'NH85 Lockhart Gap to Poopara Corridor',
    timeWindow: {
      type: 'NIGHT_CURFEW',
      startMin: 19 * 60, // 19:00
      endMin: 6 * 60, // 06:00
    },
    severity: 'CRITICAL',
    reason: 'Landslide hazard and heavy rockfall risk during rain and nighttime mist.',
    diversionAdvice: 'Take alternate route via Rajakkad–Ponmudi or wait for daylight clearance.',
    bypassWaypoint: [10.0100, 77.0200], // Rajakkad bypass
  },
];

/**
 * Checks if a closure rule is active given a target date/time.
 *
 * @param {Object} closure
 * @param {Date|string} departureTime
 * @returns {boolean}
 */
function isClosureActive(closure, departureTime) {
  if (!closure || !closure.timeWindow) return false;
  const tw = closure.timeWindow;

  if (tw.type === 'ALWAYS') return true;

  const d = departureTime ? new Date(departureTime) : new Date();
  const utcMs = d.getTime() + (d.getTimezoneOffset() * 60000);
  const istDate = new Date(utcMs + (5.5 * 3600000));
  const minuteOfDay = istDate.getHours() * 60 + istDate.getMinutes();
  const dayOfWeek = istDate.getDay(); // 0 = Sunday, 6 = Saturday

  if (tw.days && Array.isArray(tw.days)) {
    if (!tw.days.includes(dayOfWeek)) return false;
  }

  if (tw.type === 'NIGHT_CURFEW') {
    // Night curfew typically spans midnight: e.g. 21:00 (1260) to 06:00 (360)
    if (tw.startMin > tw.endMin) {
      return minuteOfDay >= tw.startMin || minuteOfDay <= tw.endMin;
    }
    return minuteOfDay >= tw.startMin && minuteOfDay <= tw.endMin;
  }

  if (tw.type === 'TIME_RANGE' || tw.type === 'WEEKEND_EVENING') {
    return minuteOfDay >= tw.startMin && minuteOfDay <= tw.endMin;
  }

  return false;
}

/**
 * Analyzes whether a route polyline intersects any active road closures.
 *
 * @param {Array<Array<number>>} geometry - Route coordinates [[lat, lon], ...]
 * @param {Object} opts - Options { departureTime, city, mode }
 * @returns {Object} { hasClosure, closures, primaryClosure }
 */
function checkRouteForClosures(geometry = [], opts = {}) {
  if (!Array.isArray(geometry) || geometry.length < 2) {
    return { hasClosure: false, closures: [], primaryClosure: null };
  }

  const departureTime = opts.departureTime || new Date().toISOString();
  const targetCity = String(opts.city || '').trim().toLowerCase();
  const travelMode = opts.mode || 'driving';

  const matchedClosures = [];

  // Downsample polyline checks for long routes: examine every Nth point + endpoints
  const step = geometry.length > 100 ? Math.ceil(geometry.length / 50) : 1;
  const samplePoints = [];
  for (let i = 0; i < geometry.length; i += step) {
    samplePoints.push(geometry[i]);
  }
  if (samplePoints[samplePoints.length - 1] !== geometry[geometry.length - 1]) {
    samplePoints.push(geometry[geometry.length - 1]);
  }

  for (const closure of CANONICAL_ROAD_CLOSURES) {
    // Pedestrian zones do not block pedestrian travel
    if (travelMode === 'walking' && closure.category === CLOSURE_TYPES.PEDESTRIAN_ZONE) {
      continue;
    }

    // City filter if provided (matching city or nationwide closures)
    if (targetCity && closure.city && targetCity !== closure.city) {
      // Check if route origin/dest is nearby regardless of city string
      const cLoc = closure.location;
      const startDist = distKm(geometry[0][0], geometry[0][1], cLoc.lat, cLoc.lon);
      const endDist = distKm(geometry[geometry.length - 1][0], geometry[geometry.length - 1][1], cLoc.lat, cLoc.lon);
      if (startDist > 80 && endDist > 80) continue;
    }

    const isActive = isClosureActive(closure, departureTime);
    if (!isActive) continue;

    const cLoc = closure.location;
    const thresholdKm = cLoc.radiusKm || 2.0;

    // Check distance of sampled polyline points to the closure centroid
    let intersects = false;
    let closestDist = Infinity;
    let intersectionCoord = null;

    for (const pt of samplePoints) {
      if (!Array.isArray(pt) || !Number.isFinite(pt[0])) continue;
      const d = distKm(pt[0], pt[1], cLoc.lat, cLoc.lon);
      if (d < closestDist) closestDist = d;
      if (d <= thresholdKm) {
        intersects = true;
        intersectionCoord = pt;
        break;
      }
    }

    if (intersects) {
      matchedClosures.push({
        closureId: closure.id,
        name: closure.name,
        category: closure.category,
        severity: closure.severity,
        corridorName: closure.corridorName,
        reason: closure.reason,
        diversionAdvice: closure.diversionAdvice,
        bypassWaypoint: closure.bypassWaypoint,
        intersectionCoord,
        distanceToCentroidKm: Math.round(closestDist * 10) / 10,
      });
    }
  }

  const primaryClosure = matchedClosures.length > 0 ? matchedClosures[0] : null;

  return {
    hasClosure: matchedClosures.length > 0,
    closures: matchedClosures,
    primaryClosure,
  };
}

/**
 * Computes an avoidance bypass waypoint coordinate around a closed corridor.
 *
 * @param {Array<number>} origin - [lat, lon]
 * @param {Array<number>} destination - [lat, lon]
 * @param {Object} closure - Matched closure entity
 * @returns {Array<number>} [lat, lon] bypass point
 */
function computeClosureBypassPoint(origin, destination, closure) {
  if (closure?.bypassWaypoint && Array.isArray(closure.bypassWaypoint)) {
    return closure.bypassWaypoint;
  }

  // Geometric offset calculation: offset perpendicular to origin-dest vector
  const cLat = closure?.location?.lat || (origin[0] + destination[0]) / 2;
  const cLon = closure?.location?.lon || (origin[1] + destination[1]) / 2;

  const dLat = destination[0] - origin[0];
  const dLon = destination[1] - origin[1];

  // Perpendicular vector (-dLon, dLat)
  const len = Math.sqrt(dLat * dLat + dLon * dLon) || 0.01;
  const perpLat = (-dLon / len) * 0.06; // ~6.5 km offset
  const perpLon = (dLat / len) * 0.06;

  return [
    Math.round((cLat + perpLat) * 10000) / 10000,
    Math.round((cLon + perpLon) * 10000) / 10000,
  ];
}

module.exports = {
  CLOSURE_TYPES,
  CANONICAL_ROAD_CLOSURES,
  isClosureActive,
  checkRouteForClosures,
  computeClosureBypassPoint,
};
