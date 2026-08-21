// routes/itinerary-optimizer.js — Smart itinerary planning with nearby place optimization
'use strict';
const express = require('express');
const router = express.Router();
const appLogger = require('../lib/logger');
const { distKm, bearing, routeDuration } = require('../utils/geo');
const config = require('../config');
const { itineraryCache } = require('../services/cache');

const ITINERARY_CACHE_TTL_MS = config.cache.itineraryTtlMs || 30 * 60 * 1000; // 30 min default

/**
 * Calculate distance between two coordinates [lat, lon]
 */
function distance(coord1, coord2) {
  if (!coord1 || !coord2 || coord1.length < 2 || coord2.length < 2) return Infinity;
  return distKm(coord1[0], coord1[1], coord2[0], coord2[1]);
}

/**
 * Find nearby places within radius (km) of a given location
 * Groups places by proximity clusters
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
 * Optimize route through place clusters
 * Uses nearest-neighbor algorithm to minimize travel distance
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

/**
 * Build optimized itinerary with time allocation
 */
async function buildOptimizedItinerary(req) {
  const {
    places,           // Array of places with coords
    startCoord,       // [lat, lon]
    endCoord,         // [lat, lon] - optional
    totalMinutes,     // Total time available
    preferNearby = true, // Group nearby places together
    clusterRadiusKm = 1.5,
    minPlacesPerCluster = 2,
  } = req.body;

  if (!Array.isArray(places) || places.length === 0) {
    return { error: 'No places provided' };
  }

  if (!startCoord || startCoord.length < 2) {
    return { error: 'Missing start coordinate' };
  }

  try {
    // Step 1: Cluster nearby places
    let clusters = preferNearby 
      ? clusterNearbyPlaces(places, clusterRadiusKm)
      : places.map(p => ({
          mainPlace: p,
          nearbyPlaces: [],
          clusterCenter: p.coords,
          totalPlaces: 1,
        }));

    // Step 2: Optimize route through clusters
    const optimizedClusters = optimizeClusterRoute(clusters);

    // Step 3: Allocate time based on distance and cluster size
    const timePerMinute = totalMinutes / (optimizedClusters.length || 1);
    const itinerary = [];
    let currentTime = 0;

    for (let i = 0; i < optimizedClusters.length; i++) {
      const cluster = optimizedClusters[i];
      const prevCoord = i === 0 ? startCoord : optimizedClusters[i - 1].clusterCenter;
      
      // Estimate travel time to cluster
      const travelDist = distance(prevCoord, cluster.clusterCenter);
      const travelTimeMin = Math.max(5, Math.ceil(travelDist * 4)); // ~15km/h average speed

      currentTime += travelTimeMin;

      // Time for main place + nearby places
      const placeCount = cluster.totalPlaces;
      const timePerPlace = Math.floor(timePerMinute / placeCount);
      
      const clusterEntry = {
        order: i + 1,
        mainPlace: cluster.mainPlace,
        nearbyPlaces: cluster.nearbyPlaces.slice(0, Math.min(3, cluster.nearbyPlaces.length)), // Top 3 nearby
        visitTime: {
          startTime: currentTime,
          mainPlaceMinutes: Math.max(20, timePerPlace),
          nearbyPlaceMinutesEach: Math.max(10, Math.floor(timePerPlace / 2)),
          totalClusterMinutes: timePerPlace * placeCount,
        },
        distance: {
          travelToClusterKm: travelDist,
          travelTimeMinutes: travelTimeMin,
        },
        stats: {
          totalInCluster: placeCount,
          nearbyCount: cluster.nearbyPlaces.length,
        },
      };

      itinerary.push(clusterEntry);
      currentTime += clusterEntry.visitTime.totalClusterMinutes;
    }

    // Add return journey if end coordinate provided
    if (endCoord && endCoord.length >= 2) {
      const lastCluster = optimizedClusters[optimizedClusters.length - 1];
      const returnDist = distance(lastCluster.clusterCenter, endCoord);
      const returnTime = Math.max(5, Math.ceil(returnDist * 4));
      
      currentTime += returnTime;
      
      return {
        itinerary,
        summary: {
          totalPlaces: places.length,
          clusterCount: optimizedClusters.length,
          totalTime: currentTime,
          allocatedMinutes: totalMinutes,
          strategy: 'nearby-clustering',
        },
        returnJourney: {
          destination: endCoord,
          distanceKm: returnDist,
          estimatedMinutes: returnTime,
        },
      };
    }

    return {
      itinerary,
      summary: {
        totalPlaces: places.length,
        clusterCount: optimizedClusters.length,
        totalTime: currentTime,
        allocatedMinutes: totalMinutes,
        strategy: 'nearby-clustering',
      },
    };

  } catch (err) {
    appLogger.error('[itinerary-optimizer] Error:', err.message);
    return { error: err.message };
  }
}

/**
 * POST /itinerary/optimize
 * Build optimized itinerary with nearby place grouping
 */
router.post('/optimize', async (req, res) => {
  try {
    const result = await buildOptimizedItinerary(req);
    
    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    appLogger.error('[itinerary-optimizer] Route error:', err.message);
    res.status(500).json({ error: 'Failed to optimize itinerary' });
  }
});

/**
 * POST /itinerary/cluster
 * Find nearby places clustered around a location
 */
router.post('/cluster', (req, res) => {
  try {
    const { places, centerCoord, radiusKm = 2 } = req.body;

    if (!Array.isArray(places) || places.length === 0) {
      return res.status(400).json({ error: 'No places provided' });
    }

    if (!centerCoord || centerCoord.length < 2) {
      return res.status(400).json({ error: 'Missing center coordinate' });
    }

    const nearby = findNearbyPlaces(places, centerCoord, radiusKm);
    const clusters = clusterNearbyPlaces(nearby, 1.5);

    res.json({
      centerCoord,
      radiusKm,
      foundPlaces: nearby.length,
      clusters: clusters.map(c => ({
        mainPlace: c.mainPlace,
        nearbyCount: c.nearbyPlaces.length,
        totalInCluster: c.totalPlaces,
        centerCoord: c.clusterCenter,
        radius: c.radius,
      })),
    });
  } catch (err) {
    appLogger.error('[itinerary-optimizer] Cluster error:', err.message);
    res.status(500).json({ error: 'Failed to cluster places' });
  }
});

module.exports = router;
