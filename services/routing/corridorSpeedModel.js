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

// Known Hill / Ghat Routes
const HILL_GHAT_ZONES = [
  { name: 'Visakhapatnam Kailasagiri / Dolphin Hill', bounds: { minLat: 17.650, maxLat: 17.760, minLon: 83.260, maxLon: 83.350 }, minAltDiff: true },
  { name: 'Jaipur Nahargarh / Jaigarh Hills', bounds: { minLat: 26.930, maxLat: 27.010, minLon: 75.830, maxLon: 75.860 } },
  { name: 'Pune Sinhagad / Lavasa Ghats', bounds: { minLat: 18.350, maxLat: 18.450, minLon: 73.720, maxLon: 73.800 } },
  { name: 'Goa Western Ghats / Dudhsagar', bounds: { minLat: 15.280, maxLat: 15.350, minLon: 74.250, maxLon: 74.350 } },
];

// Known High-Congestion Tourist POI Bottleneck Hotspots (Approach / Parking Delay)
const BOTTLENECK_POIS = [
  { id: 'vtz_kailasagiri', name: 'Kailasagiri', lat: 17.7492, lon: 83.3418, delayMin: 4, label: 'Ropeway / Hill Gate approach delay' },
  { id: 'hyd_charminar', name: 'Charminar', lat: 17.3616, lon: 78.4747, delayMin: 6, label: 'Old City pedestrianization & parking delay' },
  { id: 'del_red_fort', name: 'Red Fort', lat: 28.6562, lon: 77.2410, delayMin: 5, label: 'Chandni Chowk approach & security checkpoint' },
  { id: 'mum_gateway', name: 'Gateway of India', lat: 18.9220, lon: 72.8347, delayMin: 5, label: 'Colaba Causeway & security perimeter delay' },
  { id: 'jai_amber_fort', name: 'Amber Fort', lat: 26.9855, lon: 75.8513, delayMin: 5, label: 'Amer ascent & elephant trail approach delay' },
  { id: 'goa_baga', name: 'Baga Beach', lat: 15.5553, lon: 73.7517, delayMin: 6, label: 'Tito Lane bottleneck & beach parking delay' },
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
 *
 * @param {Array<number>} fromCoords - [lat, lon]
 * @param {Array<number>} toCoords - [lat, lon]
 * @param {Object} opts - Options (mode, originName, destName)
 * @returns {{ corridorType: string, windingFactor: number, baseSpeedKmH: number, signalsPerKm: number }}
 */
function classifyCorridor(fromCoords, toCoords, opts = {}) {
  const mode = opts.mode || 'driving';
  const straightKm = distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);

  if (mode === 'walking' || straightKm <= 1.2) {
    return {
      corridorType: CORRIDOR_TYPE.PEDESTRIAN_WALK,
      windingFactor: 1.15, // Walking shortcuts through alleys/crossings
      baseSpeedKmH: 4.6,
      signalsPerKm: 0.2,
      description: 'Pedestrian walkway / urban walking path',
    };
  }

  // 1. Check Hill Ghat Zones
  for (const g of HILL_GHAT_ZONES) {
    if (isCoordInZone(fromCoords[0], fromCoords[1], g) || isCoordInZone(toCoords[0], toCoords[1], g)) {
      return {
        corridorType: CORRIDOR_TYPE.HILL_GHAT,
        windingFactor: 1.72, // Severe hairpin curves & elevation gain
        baseSpeedKmH: 22.0,
        signalsPerKm: 0.1,
        description: `Winding hill ghat route (${g.name})`,
      };
    }
  }

  // 2. Check Walled Bazaar Zones
  for (const b of DENSE_BAZAAR_ZONES) {
    if (isCoordInZone(fromCoords[0], fromCoords[1], b) || isCoordInZone(toCoords[0], toCoords[1], b)) {
      return {
        corridorType: CORRIDOR_TYPE.WALLED_BAZAAR,
        windingFactor: 1.48, // Tight heritage lanes
        baseSpeedKmH: 12.5,
        signalsPerKm: 2.2,
        description: `High-density bazaar corridor (${b.name})`,
      };
    }
  }

  // 3. Check Coastal Highway Corridor (long seaside roads)
  const isCoastal = (
    (fromCoords[0] >= 17.65 && fromCoords[0] <= 17.90 && fromCoords[1] >= 83.25 && fromCoords[1] <= 83.48) || // Vizag Beach Rd
    (fromCoords[0] >= 15.40 && fromCoords[0] <= 15.65 && fromCoords[1] >= 73.70 && fromCoords[1] <= 73.85) || // Goa Coast
    (fromCoords[0] >= 18.90 && fromCoords[0] <= 19.10 && fromCoords[1] >= 72.80 && fromCoords[1] <= 72.84)    // Mumbai Marine / Sea Link
  );
  if (isCoastal && straightKm >= 3.0) {
    return {
      corridorType: CORRIDOR_TYPE.COASTAL_DRIVE,
      windingFactor: 1.44,
      baseSpeedKmH: 34.0,
      signalsPerKm: 0.7,
      description: 'Scenic coastal highway corridor',
    };
  }

  // 4. Distance-based classification
  if (straightKm >= 22.0) {
    return {
      corridorType: CORRIDOR_TYPE.HIGHWAY_EXPRESSWAY,
      windingFactor: 1.20, // Straight alignment on national highways & expressways
      baseSpeedKmH: 68.0,
      signalsPerKm: 0.15,
      description: 'Inter-city arterial / national highway',
    };
  }

  if (straightKm >= 6.0) {
    return {
      corridorType: CORRIDOR_TYPE.URBAN_ARTERIAL,
      windingFactor: 1.34, // Major city radial & ring roads
      baseSpeedKmH: 32.0,
      signalsPerKm: 0.9,
      description: 'Primary urban arterial / ring road',
    };
  }

  // Default: Dense Downtown Urban Grid
  return {
    corridorType: CORRIDOR_TYPE.DENSE_DOWNTOWN,
    windingFactor: 1.42,
    baseSpeedKmH: 20.5,
    signalsPerKm: 1.6,
    description: 'Central city urban street network',
  };
}

/**
 * Checks for tourist hotspot parking/approach bottleneck delays.
 *
 * @param {Array<number>} destCoords - [lat, lon]
 * @returns {{ hasBottleneck: boolean, delayMinutes: number, reason: string|null }}
 */
function evaluateDestinationBottleneck(destCoords) {
  if (!destCoords || !Number.isFinite(destCoords[0])) {
    return { hasBottleneck: false, delayMinutes: 0, reason: null };
  }

  for (const b of BOTTLENECK_POIS) {
    const d = distKm(destCoords[0], destCoords[1], b.lat, b.lon);
    if (d <= 0.65) { // Within 650m radius of major tourist hotspot
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
 *
 * @param {Array<number>} fromCoords
 * @param {Array<number>} toCoords
 * @param {Object} opts
 * @returns {{ distanceMeters: number, baseDurationSec: number, signalDelaySec: number, bottleneckDelaySec: number, corridor: Object }}
 */
function computeCalibratedCorridorMetrics(fromCoords, toCoords, opts = {}) {
  const straightKm = distKm(fromCoords[0], fromCoords[1], toCoords[0], toCoords[1]);
  const corridor = classifyCorridor(fromCoords, toCoords, opts);

  const roadKm = straightKm * corridor.windingFactor;
  const distanceMeters = Math.round(roadKm * 1000);

  // Speed adjustments by mode
  const mode = opts.mode || 'driving';
  let speedKmH = corridor.baseSpeedKmH;
  if (mode === 'walking') speedKmH = 4.6;
  else if (mode === 'bicycling') speedKmH = 13.5;
  else if (mode === 'transit') speedKmH = Math.min(speedKmH * 0.75, 24.0); // Transit stopping time

  const transitHours = roadKm / speedKmH;
  const baseDurationSec = Math.round(transitHours * 3600);

  // Signal & Junction Delays
  const totalSignals = Math.max(0, roadKm * corridor.signalsPerKm);
  const avgSignalWaitSec = corridor.corridorType === CORRIDOR_TYPE.DENSE_DOWNTOWN ? 45 : 30;
  const signalDelaySec = mode === 'walking' ? 0 : Math.round(totalSignals * avgSignalWaitSec);

  // Hotspot Bottleneck Approach Delay
  const bottleneck = evaluateDestinationBottleneck(toCoords);
  const bottleneckDelaySec = bottleneck.hasBottleneck ? bottleneck.delayMinutes * 60 : 0;

  return {
    distanceMeters,
    baseDurationSec,
    signalDelaySec,
    bottleneckDelaySec,
    totalEstimatedSec: baseDurationSec + signalDelaySec + bottleneckDelaySec,
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
