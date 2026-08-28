// services/travelIntelligence/proximityClustering.js
// Spatial proximity clustering and candidate grouping for itinerary optimization
'use strict';

const { distKm } = require('../../utils/geo');

/**
 * Calculate distance between two coordinates [lat, lon] in km
 */
function distance(coord1, coord2) {
  if (!coord1 || !coord2 || coord1.length < 2 || coord2.length < 2) return Infinity;
  return distKm(coord1[0], coord1[1], coord2[0], coord2[1]);
}

/**
 * Find nearby places within radius (km) of a given location
 */
function findNearbyPlaces(places, centerCoord, radiusKm = 2) {
  if (!Array.isArray(places) || !centerCoord) return [];
  
  return places
    .map(place => ({
      ...place,
      distFromCenter: distance(centerCoord, place.coords),
    }))
    .filter(place => place.distFromCenter <= radiusKm)
    .sort((a, b) => a.distFromCenter - b.distFromCenter);
}

/**
 * Group places into proximity clusters
 * Each cluster represents nearby places that can be visited together
 */
function clusterNearbyPlaces(places, clusterRadiusKm = 1.5) {
  if (!Array.isArray(places) || places.length === 0) return [];
  
  const clusters = [];
  const visited = new Set();

  for (let i = 0; i < places.length; i++) {
    if (visited.has(i)) continue;
    
    const cluster = {
      mainPlace: places[i],
      nearbyPlaces: [],
      clusterCenter: places[i].coords,
      radius: clusterRadiusKm,
      totalPlaces: 1,
    };
    
    visited.add(i);

    // Find all unvisited places within cluster radius
    for (let j = i + 1; j < places.length; j++) {
      if (visited.has(j)) continue;
      
      const dist = distance(places[i].coords, places[j].coords);
      if (dist <= clusterRadiusKm) {
        cluster.nearbyPlaces.push({
          place: places[j],
          distFromMain: dist,
        });
        cluster.totalPlaces++;
        visited.add(j);
      }
    }

    // Sort nearby places by distance
    cluster.nearbyPlaces.sort((a, b) => a.distFromMain - b.distFromMain);
    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Optimize route through place clusters using nearest-neighbor heuristic
 */
function optimizeClusterRoute(clusters) {
  if (!Array.isArray(clusters) || clusters.length === 0) return [];

  const route = [];
  const visited = new Set();

  let current = clusters[0];
  route.push(current);
  visited.add(0);

  while (visited.size < clusters.length) {
    let nearest = null;
    let nearestDist = Infinity;
    let nearestIdx = -1;

    for (let i = 0; i < clusters.length; i++) {
      if (visited.has(i)) continue;
      
      const dist = distance(current.clusterCenter, clusters[i].clusterCenter);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = clusters[i];
        nearestIdx = i;
      }
    }

    if (nearest) {
      route.push(nearest);
      visited.add(nearestIdx);
      current = nearest;
    }
  }

  return route;
}

module.exports = {
  distance,
  findNearbyPlaces,
  clusterNearbyPlaces,
  optimizeClusterRoute,
};
