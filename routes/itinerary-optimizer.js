// routes/itinerary-optimizer.js — Spatial proximity clustering & unified itinerary optimization
'use strict';

const express = require('express');
const router = express.Router();
const appLogger = require('../lib/logger');
const {
  distance,
  findNearbyPlaces,
  clusterNearbyPlaces,
  optimizeClusterRoute,
} = require('../services/travelIntelligence/proximityClustering');
const { planAdvancedItinerary } = require('../services/travelIntelligence/advancedItineraryEngine');

/**
 * Build optimized itinerary with time allocation using authoritative advancedItineraryEngine
 */
async function buildOptimizedItinerary(req) {
  const {
    places,              // Array of places with coords
    startCoord,          // [lat, lon]
    endCoord,            // [lat, lon] - optional
    totalMinutes,        // Total time available
    preferNearby = true, // Group nearby places together
    clusterRadiusKm = 1.5,
    weather = null,
    personas = [],
    tripMode = null,
    startMin,
    endMin,
  } = req.body || {};

  if (!Array.isArray(places) || places.length === 0) {
    return { error: 'No places provided' };
  }

  if (!startCoord || startCoord.length < 2) {
    return { error: 'Missing start coordinate' };
  }

  try {
    const originCoords = [Number(startCoord[0]), Number(startCoord[1])];
    const destinationCoords = (endCoord && endCoord.length >= 2)
      ? [Number(endCoord[0]), Number(endCoord[1])]
      : null;

    // Optional cluster pre-processing for spatial grouping
    const clusters = preferNearby
      ? clusterNearbyPlaces(places, clusterRadiusKm)
      : places.map(p => ({
          mainPlace: p,
          nearbyPlaces: [],
          clusterCenter: p.coords,
          totalPlaces: 1,
        }));

    // Authoritative time-aware itinerary planning via advancedItineraryEngine
    const effectiveStartMin = Number.isFinite(startMin) ? startMin : 540; // 09:00 default
    const effectiveEndMin = Number.isFinite(endMin)
      ? endMin
      : (Number.isFinite(totalMinutes) ? effectiveStartMin + totalMinutes : 1260);

    const advancedPlan = planAdvancedItinerary(places, {
      now: req.body?.at ? new Date(req.body.at) : new Date(),
      originCoords,
      destinationCoords,
      startMin: effectiveStartMin,
      endMin: effectiveEndMin,
      weather,
      personas,
      tripMode,
      preferNearby,
      clusters,
    });

    const returnDist = destinationCoords && advancedPlan.stops?.length
      ? distance(advancedPlan.stops[advancedPlan.stops.length - 1].coords, destinationCoords)
      : 0;

    return {
      itinerary: advancedPlan.stops || [],
      stops: advancedPlan.stops || [],
      stopCount: advancedPlan.stopCount || 0,
      totalScore: advancedPlan.totalScore || 0,
      totalTravelMinutes: advancedPlan.totalTravelMinutes || 0,
      totalVisitMinutes: advancedPlan.totalVisitMinutes || 0,
      summary: {
        totalPlaces: places.length,
        clusterCount: clusters.length,
        totalTime: (advancedPlan.totalTravelMinutes || 0) + (advancedPlan.totalVisitMinutes || 0),
        allocatedMinutes: totalMinutes || (effectiveEndMin - effectiveStartMin),
        strategy: 'authoritative-advanced-beam-search',
        optimizer: 'beam-search-2-opt',
      },
      clusters: clusters.map((c, i) => ({
        order: i + 1,
        mainPlace: c.mainPlace,
        nearbyCount: c.nearbyPlaces.length,
        totalInCluster: c.totalPlaces,
      })),
      ...(destinationCoords ? {
        returnJourney: {
          destination: destinationCoords,
          distanceKm: returnDist,
          estimatedMinutes: Math.max(5, Math.ceil(returnDist * 4)),
        },
      } : {}),
    };
  } catch (err) {
    appLogger.error('[itinerary-optimizer] Error:', err.message);
    return { error: err.message };
  }
}

/**
 * POST /api/itinerary/optimize
 * Authoritative itinerary planning with nearby place grouping (delegates to advancedItineraryEngine)
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
 * POST /api/itinerary/cluster
 * Spatial proximity clustering endpoint (groups places within radiusKm)
 */
router.post('/cluster', (req, res) => {
  try {
    const { places, centerCoord, radiusKm = 2 } = req.body || {};

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
