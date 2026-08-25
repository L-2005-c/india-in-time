'use strict';

/**
 * routes/routing.js
 * Public API router for authoritative routing, travel times, and traffic intelligence.
 * Single backend endpoint mounted at /api/v1/routing.
 */

const express = require('express');
const router = express.Router();
const { calculateRoute, calculateRouteMatrix } = require('../services/routing/routingService');
const appLogger = require('../lib/logger');

/**
 * GET /api/v1/routing/route
 * Authoritative point-to-point route.
 */
router.get('/route', async (req, res) => {
  try {
    const { origin, destination, mode, departureTime, originName, destName, preference } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters: origin and destination (format: lat,lon)',
        code: 'MISSING_COORDINATES',
      });
    }

    const route = await calculateRoute(origin, destination, {
      mode: mode || 'driving',
      departureTime,
      originName,
      destName,
      preference,
    });

    if (!route.success) {
      return res.status(400).json(route);
    }

    res.json(route);
  } catch (err) {
    appLogger.error({ err: err.message }, '[routing:route] Calculation failure');
    res.status(500).json({ success: false, error: 'Failed to calculate route', code: 'ROUTING_SERVER_ERROR' });
  }
});

/**
 * POST /api/v1/routing/matrix
 * Multi-stop matrix route legs for day itineraries.
 */
router.post('/matrix', async (req, res) => {
  try {
    const { stops, mode, departureTime, preference } = req.body;

    if (!Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Body must include a "stops" array with at least 2 destinations',
        code: 'INVALID_STOPS_ARRAY',
      });
    }

    const matrix = await calculateRouteMatrix(stops, {
      mode: mode || 'driving',
      departureTime,
      preference,
    });

    res.json(matrix);
  } catch (err) {
    appLogger.error({ err: err.message }, '[routing:matrix] Matrix calculation failure');
    res.status(500).json({ success: false, error: 'Failed to calculate route matrix', code: 'MATRIX_SERVER_ERROR' });
  }
});

/**
 * GET /api/v1/routing/eta
 * Fast lightweight ETA lookup.
 */
router.get('/eta', async (req, res) => {
  try {
    const { origin, destination, mode, departureTime } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ success: false, error: 'origin and destination required' });
    }

    const route = await calculateRoute(origin, destination, {
      mode: mode || 'driving',
      departureTime,
    });

    if (!route.success) {
      return res.status(400).json(route);
    }

    res.json({
      success: true,
      distance: route.distance,
      duration: route.duration,
      traffic: route.traffic,
      timestamps: route.timestamps,
    });
  } catch (err) {
    appLogger.error({ err: err.message }, '[routing:eta] ETA lookup failure');
    res.status(500).json({ success: false, error: 'Failed to calculate ETA' });
  }
});

module.exports = router;
