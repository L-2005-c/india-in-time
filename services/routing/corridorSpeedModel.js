'use strict';

/**
 * services/routing/corridorSpeedModel.js
 *
 * Multi-factor corridor classification, terrain speed calibration,
 * dynamic winding factor calculation, and junction/signal delay modeling
 * tailored for real-world Indian road and pedestrian networks.
 */

const { distKm } = require('../../utils/geo');

// Corridor Types
const CORRIDOR_TYPE = {
  HIGHWAY_EXPRESSWAY: 'HIGHWAY_EXPRESSWAY',
  URBAN_ARTERIAL: 'URBAN_ARTERIAL',
  DENSE_DOWNTOWN: 'DENSE_DOWNTOWN',
  WALLED_BAZAAR: 'WALLED_BAZAAR',
  COASTAL_DRIVE: 'COASTAL_DRIVE',
  HILL_GHAT: 'HILL_GHAT',
  PEDESTRIAN_WALK: 'PEDESTRIAN_WALK',
};

// Known Indian Walled City / Hyper-Dense Bazaar Corridors (bounding boxes or key landmarks)
const DENSE_BAZAAR_ZONES = [
  { name: 'Old Delhi / Chandni Chowk', bounds: { minLat: 28.645, maxLat: 28.665, minLon: 77.220, maxLon: 77.245 } },
  { name: 'Hyderabad Charminar / Old City', bounds: { minLat: 17.350, maxLat: 17.375, minLon: 78.460, maxLon: 78.485 } },
  { name: 'Jaipur Walled City / Johari Bazaar', bounds: { minLat: 26.915, maxLat: 26.935, minLon: 75.815, maxLon: 75.835 } },
  { name: 'Varanasi Ghats / Kashi Vishwanath', bounds: { minLat: 25.295, maxLat: 25.320, minLon: 83.000, maxLon: 83.025 } },
  { name: 'Mumbai Crawford Market / Kalbadevi', bounds: { minLat: 18.940, maxLat: 18.955, minLon: 72.825, maxLon: 72.840 } },
];

// Known Hill / Ghat Routes (Specific high-elevation ascent zones)
const HILL_GHAT_ZONES = [
  { name: 'Visakhapatnam Dolphin Nose / Yarada Ghat', bounds: { minLat: 17.640, maxLat: 17.685, minLon: 83.250, maxLon: 83.305 } },
  { name: 'Visakhapatnam Kailasagiri Hilltop', bounds: { minLat: 17.745, maxLat: 17.755, minLon: 83.338, maxLon: 83.348 } },
  { name: 'Jaipur Nahargarh / Jaigarh Fort Ascent', bounds: { minLat: 26.935, maxLat: 26.995, minLon: 75.835, maxLon: 75.858 } },
  { name: 'Pune Sinhagad / Lavasa Ghats', bounds: { minLat: 18.350, maxLat: 18.450, minLon: 73.720, maxLon: 73.800 } },
  { name: 'Goa Western Ghats / Dudhsagar', bounds: { minLat: 15.280, maxLat: 15.350, minLon: 74.250, maxLon: 74.350 } },
];

// Known High-Congestion Tourist POI Bottleneck Hotspots (Approach / Parking Delay)
const BOTTLENECK_POIS = [
  { id: 'hyd_charminar', name: 'Charminar', lat: 17.3616, lon: 78.4747, delayMin: 4, label: 'Old City pedestrianization approach delay' },
  { id: 'del_red_fort', name: 'Red Fort', lat: 28.6562, lon: 77.2410, delayMin: 4, label: 'Chandni Chowk approach delay' },
  { id: 'mum_gateway', name: 'Gateway of India', lat: 18.9220, lon: 72.8347, delayMin: 4, label: 'Colaba Causeway security perimeter delay' },
];

/**
 * Checks if coordinates fall within a zone boundary.
 */
function isCoordInZone(lat, lon, zone) {
  const b = zone.bounds;
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}

/**
 * Classifies the road corridor and terrain for two endpoints.
 */
function classifyCorridor(fromCoords, toCoords, opts = {}) {
  const mode = opts.mode || 'driving';
  const straightKm = distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);

  if (mode === 'walking') {
    return {
      corridorType: CORRIDOR_TYPE.PEDESTRIAN_WALK,
      windingFactor: 1.15,
      baseSpeedKmH: 4.8,
      signalsPerKm: 0,
      description: 'Pedestrian walkway / urban walking path',
    };
  }

  // 1. Check Hill Ghat Zones
  for (const g of HILL_GHAT_ZONES) {
    if (isCoordInZone(fromCoords[0], fromCoords[1], g) || isCoordInZone(toCoords[0], toCoords[1], g)) {
      return {
        corridorType: CORRIDOR_TYPE.HILL_GHAT,
        windingFactor: 1.72,
        baseSpeedKmH: 26.0,
        signalsPerKm: 0.1,
        description: `Winding hill ghat route (${g.name})`,
      };
    }
  }

  // 2. Check Walled Bazaar Zones
  for (const b of DENSE_BAZAAR_ZONES) {
    if (isCoordInZone(fromCoords[0], fromCoords[1], b) && isCoordInZone(toCoords[0], toCoords[1], b)) {
      return {
        corridorType: CORRIDOR_TYPE.WALLED_BAZAAR,
        windingFactor: 1.30,
        baseSpeedKmH: 14.0,
        signalsPerKm: 1.0,
        description: `High-density bazaar corridor (${b.name})`,
      };
    }
  }

  // 3. Distance & Alignment Based Classification
  if (straightKm >= 20.0) {
    return {
      corridorType: CORRIDOR_TYPE.HIGHWAY_EXPRESSWAY,
      windingFactor: 1.18,
      baseSpeedKmH: 60.0,
      signalsPerKm: 0.1,
      description: 'Inter-city arterial / national highway',
    };
  }

  if (straightKm >= 5.0) {
    return {
      corridorType: CORRIDOR_TYPE.URBAN_ARTERIAL,
      windingFactor: 1.26,
      baseSpeedKmH: 34.0,
      signalsPerKm: 0.5,
      description: 'Primary urban arterial / ring road',
    };
  }

  // Short Urban Hop (< 5 km)
  return {
    corridorType: CORRIDOR_TYPE.DENSE_DOWNTOWN,
    windingFactor: 1.28,
    baseSpeedKmH: 24.0,
    signalsPerKm: 0.6,
    description: 'Central city urban street network',
  };
}

/**
 * Checks for tourist hotspot parking/approach bottleneck delays.
 */
function evaluateDestinationBottleneck(destCoords) {
  if (!destCoords || !Number.isFinite(destCoords[0])) {
    return { hasBottleneck: false, delayMinutes: 0, reason: null };
  }

  for (const b of BOTTLENECK_POIS) {
    const d = distKm(destCoords[0], destCoords[1], b.lat, b.lon);
    if (d <= 0.4) {
      return {
        hasBottleneck: true,
        delayMinutes: b.delayMin,
        reason: b.label,
      };
    }
  }

  return { hasBottleneck: false, delayMinutes: 0, reason: null };
}

/**
 * Calculates a physics-calibrated road distance and duration estimate.
 */
function computeCalibratedCorridorMetrics(fromCoords, toCoords, opts = {}) {
  const straightKm = distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
  const corridor = classifyCorridor(fromCoords, toCoords, opts);

  const roadKm = straightKm * corridor.windingFactor;
  const distanceMeters = Math.max(100, Math.round(roadKm * 1000));

  // Speed adjustments by mode
  const mode = opts.mode || 'driving';
  let speedKmH = corridor.baseSpeedKmH;
  if (mode === 'walking') speedKmH = 4.8;
  else if (mode === 'bicycling') speedKmH = 14.0;
  else if (mode === 'transit') speedKmH = Math.min(speedKmH * 0.75, 22.0);

  const transitHours = roadKm / speedKmH;
  const baseDurationSec = Math.max(mode === 'walking' ? 60 : 60, Math.round(transitHours * 3600));

  // Signal delay (only applied to non-walking on longer urban trips)
  const totalSignals = roadKm >= 3.0 ? Math.max(0, roadKm * corridor.signalsPerKm) : 0;
  const signalDelaySec = mode === 'walking' ? 0 : Math.round(totalSignals * 20);

  // Hotspot approach delay
  const bottleneck = evaluateDestinationBottleneck(toCoords);
  const bottleneckDelaySec = (mode !== 'walking' && bottleneck.hasBottleneck) ? bottleneck.delayMinutes * 60 : 0;

  const totalEstimatedSec = Math.max(mode === 'walking' ? 60 : 60, baseDurationSec + signalDelaySec + bottleneckDelaySec);

  return {
    distanceMeters,
    baseDurationSec,
    signalDelaySec,
    bottleneckDelaySec,
    totalEstimatedSec,
    corridor,
    bottleneck,
  };
}

module.exports = {
  CORRIDOR_TYPE,
  classifyCorridor,
  evaluateDestinationBottleneck,
  computeCalibratedCorridorMetrics,
};
