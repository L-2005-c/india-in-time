'use strict';

/**
 * services/travelIntelligence/proximityGraph.js
 * Smart Proximity & Spatial Clustering Graph.
 * Discovers geographic corridors, penalizes zig-zag backtracking, and generates "Nearby After This" recommendations.
 */

const { distKm } = require('../../utils/geo');
const { formatDistance, formatDuration } = require('../routing/routingService');

const ROAD_FACTOR = 1.42;

/**
 * Calculates bearing between two coordinates in degrees (0 - 360).
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2 * (Math.PI / 180));
  const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
            Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

/**
 * Evaluates directional backtracking penalty (0 to 30) when transitioning A -> B -> C.
 */
function evaluateBacktrackingPenalty(prevPrevCoords, prevCoords, currentCoords) {
  if (!prevPrevCoords || !prevCoords || !currentCoords) return 0;
  if (!Array.isArray(prevPrevCoords) || !Array.isArray(prevCoords) || !Array.isArray(currentCoords)) return 0;

  const bearing1 = calculateBearing(prevPrevCoords[0], prevPrevCoords[1], prevCoords[0], prevCoords[1]);
  const bearing2 = calculateBearing(prevCoords[0], prevCoords[1], currentCoords[0], currentCoords[1]);

  let diff = Math.abs(bearing1 - bearing2);
  if (diff > 180) diff = 360 - diff;

  // If turning around > 135 degrees and distance is significant (> 2.5 km), apply backtracking penalty
  const dist = distKm(prevCoords[0], prevCoords[1], currentCoords[0], currentCoords[1]);
  if (diff >= 135 && dist >= 2.5) {
    return Math.min(25, Math.round((diff / 180) * 20 + (dist * 1.5)));
  }

  return 0;
}

/**
 * Groups candidate places into natural geographic clusters.
 */
function buildGeographicClusters(places = [], maxClusterRadiusKm = 4.0) {
  const clusters = [];
  const visited = new Set();

  for (let i = 0; i < places.length; i++) {
    if (visited.has(i)) continue;
    const p1 = places[i];
    const cluster = { id: `cluster-${clusters.length + 1}`, center: p1.coords, places: [p1] };
    visited.add(i);

    for (let j = i + 1; j < places.length; j++) {
      if (visited.has(j)) continue;
      const p2 = places[j];
      if (p1.coords && p2.coords) {
        const d = distKm(p1.coords[0], p1.coords[1], p2.coords[0], p2.coords[1]);
        if (d <= maxClusterRadiusKm) {
          cluster.places.push(p2);
          visited.add(j);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Generates top "Nearby After This" recommendations for a specific stop.
 */
function getNearbyRecommendations(currentStop, candidatePool = [], opts = {}) {
  if (!currentStop?.coords || !Array.isArray(candidatePool) || !candidatePool.length) return [];

  const currentCoords = currentStop.coords;
  const currentId = String(currentStop.id ?? currentStop.name).toLowerCase();
  const maxRadiusKm = opts.maxRadiusKm || 8.0;

  const ranked = candidatePool
    .filter(p => {
      const pid = String(p.id ?? p.name).toLowerCase();
      if (pid === currentId) return false;
      if (!p.coords || !Array.isArray(p.coords) || p.coords.length < 2) return false;
      const d = distKm(currentCoords[0], currentCoords[1], p.coords[0], p.coords[1]);
      return d > 0.1 && d <= maxRadiusKm;
    })
    .map(p => {
      const straightKm = distKm(currentCoords[0], currentCoords[1], p.coords[0], p.coords[1]);
      const roadKm = Math.round(straightKm * ROAD_FACTOR * 10) / 10;
      const travelMins = Math.max(4, Math.round(roadKm / 0.32)); // ~19.2 km/h urban speed

      let score = 70 - (roadKm * 4);
      if (p.importance === 'must_see' || p.rating >= 4.5) score += 15;
      if (opts.preferredCategories?.includes(p.cat)) score += 12;

      const whyList = [];
      if (roadKm <= 2.5) whyList.push(`Very close (${formatDistance(roadKm * 1000)})`);
      else whyList.push(`${formatDuration(travelMins)} drive (${roadKm} km)`);

      if (p.cat === 'food' || p.cat === 'cafe') whyList.push('Dining & refreshment');
      else if (p.cat === 'scenic' || p.is_sunset_spot) whyList.push('Scenic highlight');
      else whyList.push('High-rated nearby spot');

      return {
        id: p.id || p.name,
        name: p.name,
        category: p.cat || 'sight',
        coords: p.coords,
        distanceM: Math.round(straightKm * 1000),
        distanceKm: roadKm,
        travelMinutes: travelMins,
        formattedDistance: formatDistance(roadKm * 1000),
        formattedDuration: formatDuration(travelMins),
        rating: p.rating || 4.5,
        whyRecommended: whyList.join(' • '),
        googleMapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${currentCoords[0]},${currentCoords[1]}&destination=${p.coords[0]},${p.coords[1]}&travelmode=driving`,
        score: Math.round(score),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return ranked;
}

module.exports = {
  calculateBearing,
  evaluateBacktrackingPenalty,
  buildGeographicClusters,
  getNearbyRecommendations,
  ROAD_FACTOR,
};
