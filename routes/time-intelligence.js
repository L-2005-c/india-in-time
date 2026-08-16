const logger = require('../lib/logger');
// routes/time-intelligence.js — GeoAI Time / Travel Intelligence Engine API
const express = require('express');
const router = express.Router();
const { getBatchState, personalizeScore, suggestOpenAlternatives, getTravelIntelligence } = require('../services/timeIntelligence');
const { rankPlacesForDay, buildDayPlan, dynamicAdvice, multiDayAdvice, getTravelIntelligenceAsync } = require('../services/travelIntelligence');
const { mapWithConcurrency } = require('../utils/concurrency');
const { buildTemporalProfile } = require('../services/travelIntelligence/temporalEngine');
const { optimizeItinerary, replanItinerary } = require('../services/travelIntelligence/geoTemporalOptimizer');
const MAX_PLACES = 50;
const LIVE_ROUTING_CONCURRENCY = Math.max(1, parseInt(process.env.LIVE_ROUTING_CONCURRENCY, 10) || 5);

router.post('/status', (req, res) => {
  try {
    const { weather, at, fromCoords, personas, tripMode } = req.body || {};
    const rawPlaces = req.body?.places;
    if (!Array.isArray(rawPlaces) || !rawPlaces.length) return res.status(400).json({ error: 'places[] is required' });
    const places = rawPlaces.slice(0, MAX_PLACES);
    const now = at ? new Date(at) : new Date();
    const options = { fromCoords: Array.isArray(fromCoords) && fromCoords.length >= 2 ? fromCoords : null, personas: Array.isArray(personas) ? personas : [], tripMode: tripMode || null };
    const states = (options.fromCoords || options.personas.length || options.tripMode)
      ? places.map((p) => {
          const intel = getTravelIntelligence(p, now, weather || null, options);
          return { name: intel.name, category: intel.category, isOpenNow: intel.isOpenNow, statusLabel: intel.statusLabel, minutesToClose: intel.minutesToClose, minutesToOpen: intel.minutesToOpen, openTime: intel.openTime, closeTime: intel.closeTime, sunrise: intel.sunrise, sunset: intel.sunset, nightAvailable: intel.nightAvailable, weeklyHoliday: intel.weeklyHoliday, daypart: intel.daypart, isBestTimeNow: intel.isBestTimeNow, isPeakHourNow: intel.isPeakHourNow, crowdLevel: intel.crowdLevel, season: intel.season, bestSeason: intel.bestSeason, seasonalNote: intel.seasonalNote, recommendations: intel.recommendations, weatherWarnings: intel.weatherWarnings, badges: intel.badges, notifications: intel.notifications, visitScore: intel.visitScore, visitLabel: intel.visitLabel, components: intel.components, crowd: intel.crowd, weather: intel.weather, traffic: intel.traffic, scenic: intel.scenic, arrival: intel.arrival, confidence: intel.confidence, explanation: intel.explanation, goldenHours: intel.goldenHours, dataQuality: intel.dataQuality };
        })
      : getBatchState(places, now, weather || null);
    const withAlternatives = states.map((state, i) => {
      if (state.isOpenNow === false) state.alternatives = suggestOpenAlternatives(places[i], places, now, weather || null);
      return state;
    });
    res.json({ at: now.toISOString(), places: withAlternatives });
  } catch (err) {
    logger.error('[time-intelligence:status]', err.message);
    res.status(500).json({ error: 'Failed to compute time intelligence status' });
  }
});

router.post('/score', (req, res) => {
  try {
    const { personas, tripMode } = req.body || {};
    const rawPlaces = req.body?.places;
    if (!Array.isArray(rawPlaces) || !rawPlaces.length) return res.status(400).json({ error: 'places[] is required' });
    const places = rawPlaces.slice(0, MAX_PLACES);
    const scored = places.map((p) => ({ name: p.name, score: personalizeScore(p.baseScore ?? 1, p, personas || [], tripMode || null) }));
    res.json({ scored });
  } catch (err) {
    logger.error('[time-intelligence:score]', err.message);
    res.status(500).json({ error: 'Failed to compute personalized scores' });
  }
});

router.post('/recommend', async (req, res) => {
  try {
    const { weather, at, fromCoords, personas, tripMode, publicHoliday } = req.body || {};
    const rawPlaces = req.body?.places;
    if (!Array.isArray(rawPlaces) || !rawPlaces.length) return res.status(400).json({ error: 'places[] is required' });
    const places = rawPlaces.slice(0, MAX_PLACES);
    const now = at ? new Date(at) : new Date();
    const options = {
      fromCoords: Array.isArray(fromCoords) && fromCoords.length >= 2 ? fromCoords : null,
      personas: Array.isArray(personas) ? personas : [],
      tripMode: tripMode || null,
      publicHoliday: !!publicHoliday,
      region: req.body?.region || null,
      enableLiveRouting: req.body?.enableLiveRouting === true,
    };

    let ranked;
    if (options.enableLiveRouting && options.fromCoords) {
      // Bound external routing fan-out so one request cannot create 50
      // simultaneous upstream calls under load.
      const scored = await mapWithConcurrency(places, LIVE_ROUTING_CONCURRENCY, async (p) => {
        const intel = await getTravelIntelligenceAsync(p, now, weather || null, options);
        return { place: p, intel, score: intel.visitScore };
      });
      scored.sort((a, b) => b.score - a.score);
      ranked = scored;
    } else {
      ranked = rankPlacesForDay(places, now, weather || null, options);
    }

    res.json({
      at: now.toISOString(),
      recommendations: ranked.map(({ place, intel, score }) => ({
        name: place.name, category: place.cat || intel.category, visitScore: score, visitLabel: intel.visitLabel, statusLabel: intel.statusLabel,
        isOpenNow: intel.isOpenNow, crowdLevel: intel.crowdLevel, confidence: intel.confidence, explanation: intel.explanation, arrival: intel.arrival,
        scenic: { score: intel.scenic?.scenicScore, suitability: intel.scenic?.suitability, types: intel.scenic?.scenicTypes, bestWindow: intel.scenic?.bestScenicWindow, photographyWindow: intel.scenic?.photographyWindow },
        weather: { score: intel.weather?.score, suitability: intel.weather?.suitability, warnings: intel.weather?.warnings },
        traffic: intel.traffic ? { level: intel.traffic.trafficLevel, risk: intel.traffic.trafficRisk, minutes: intel.traffic.travelMinutes, source: intel.traffic.source } : null,
        components: intel.components, badges: intel.badges, dataQuality: intel.dataQuality,
      })),
    });
  } catch (err) {
    logger.error('[time-intelligence:recommend]', err.message);
    res.status(500).json({ error: 'Failed to compute travel recommendations' });
  }
});



// ── Day plan (timed multi-stop itinerary) ───────────────────────────────────

// ── Advanced temporal profile ────────────────────────────────────────────────
router.post('/temporal-profile', (req, res) => {
  try {
    const { place, weather, at, stepMin, horizonHours, startOffsetMin, personas, tripMode, region } = req.body || {};
    if (!place || typeof place !== 'object') return res.status(400).json({ error: 'place object is required' });
    const now = at ? new Date(at) : new Date();
    if (Number.isNaN(now.getTime())) return res.status(400).json({ error: 'Invalid at timestamp' });
    const profile = buildTemporalProfile(place, {
      referenceDate: now,
      weather: weather || null,
      stepMin,
      horizonMin: Number(horizonHours || 48) * 60,
      startOffsetMin,
      intelOptions: { personas: Array.isArray(personas) ? personas : [], tripMode: tripMode || null, region: region || null },
    });
    res.json(profile);
  } catch (err) {
    logger.error('[time-intelligence:temporal-profile]', err.message);
    res.status(500).json({ error: 'Failed to compute temporal profile' });
  }
});

// ── Advanced GeoAI itinerary optimizer ─────────────────────────────────────
router.post('/optimize', async (req, res) => {
  try {
    const { weather, at, fromCoords, personas, tripMode, startMin, endMin, maxStops, bufferMin, beamWidth, region } = req.body || {};
    const rawPlaces = req.body?.places;
    if (!Array.isArray(rawPlaces) || !rawPlaces.length) return res.status(400).json({ error: 'places[] is required' });
    const now = at ? new Date(at) : new Date();
    if (Number.isNaN(now.getTime())) return res.status(400).json({ error: 'Invalid at timestamp' });
    const result = await optimizeItinerary(rawPlaces.slice(0, MAX_PLACES), {
      now,
      weather: weather || null,
      originCoords: Array.isArray(fromCoords) && fromCoords.length >= 2 ? fromCoords : null,
      personas: Array.isArray(personas) ? personas : [],
      tripMode: tripMode || null,
      startMin: Number.isFinite(startMin) ? startMin : undefined,
      endMin: Number.isFinite(endMin) ? endMin : undefined,
      maxStops: Number.isFinite(maxStops) ? maxStops : undefined,
      bufferMin: Number.isFinite(bufferMin) ? bufferMin : undefined,
      beamWidth: Number.isFinite(beamWidth) ? beamWidth : undefined,
      region: region || null,
    });
    res.json(result);
  } catch (err) {
    logger.error('[time-intelligence:optimize]', err.message);
    res.status(500).json({ error: 'Failed to optimize itinerary' });
  }
});

// ── Dynamic re-planning from current state ──────────────────────────────────
router.post('/replan', async (req, res) => {
  try {
    const { weather, at, fromCoords, personas, tripMode, startMin, endMin, maxStops, bufferMin, region, trigger, reason } = req.body || {};
    const rawPlaces = req.body?.places;
    if (!Array.isArray(rawPlaces) || !rawPlaces.length) return res.status(400).json({ error: 'places[] is required' });
    const now = at ? new Date(at) : new Date();
    if (Number.isNaN(now.getTime())) return res.status(400).json({ error: 'Invalid at timestamp' });
    const result = await replanItinerary(rawPlaces.slice(0, MAX_PLACES), {
      now,
      weather: weather || null,
      originCoords: Array.isArray(fromCoords) && fromCoords.length >= 2 ? fromCoords : null,
      personas: Array.isArray(personas) ? personas : [],
      tripMode: tripMode || null,
      startMin: Number.isFinite(startMin) ? startMin : undefined,
      endMin: Number.isFinite(endMin) ? endMin : undefined,
      maxStops: Number.isFinite(maxStops) ? maxStops : undefined,
      bufferMin: Number.isFinite(bufferMin) ? bufferMin : undefined,
      region: region || null,
      trigger: trigger || 'dynamic_replan',
      reason: reason || 'Plan recalculated from the current state.',
    });
    res.json(result);
  } catch (err) {
    logger.error('[time-intelligence:replan]', err.message);
    res.status(500).json({ error: 'Failed to replan itinerary' });
  }
});

router.post('/day-plan', async (req, res) => {
  try {
    const { weather, at, fromCoords, personas, tripMode, startMin, endMin, maxStops, bufferMin, region } = req.body || {};
    const rawPlaces = req.body?.places;
    if (!Array.isArray(rawPlaces) || !rawPlaces.length) {
      return res.status(400).json({ error: 'places[] is required' });
    }
    const now = at ? new Date(at) : new Date();
    if (Number.isNaN(now.getTime())) return res.status(400).json({ error: 'Invalid at timestamp' });
    const optimized = await optimizeItinerary(rawPlaces.slice(0, MAX_PLACES), {
      now, weather: weather || null,
      originCoords: Array.isArray(fromCoords) && fromCoords.length >= 2 ? fromCoords : null,
      personas: Array.isArray(personas) ? personas : [], tripMode: tripMode || null,
      startMin: Number.isFinite(startMin) ? startMin : undefined,
      endMin: Number.isFinite(endMin) ? endMin : undefined,
      maxStops: Number.isFinite(maxStops) ? maxStops : 8,
      bufferMin: Number.isFinite(bufferMin) ? bufferMin : undefined, region: region || null,
    });
    // Backwards-compatible response shape with the advanced optimizer attached.
    res.json({ ...optimized, advanced: true, stops: optimized.stops });
  } catch (err) {
    logger.error('[time-intelligence:day-plan]', err.message);
    res.status(500).json({ error: 'Failed to build day plan' });
  }
});

// ── Dynamic advice for one place ────────────────────────────────────────────
router.post('/advice', (req, res) => {
  try {
    const { place, weather, at, fromCoords, personas, tripMode } = req.body || {};
    if (!place || typeof place !== 'object') {
      return res.status(400).json({ error: 'place object is required' });
    }
    const now = at ? new Date(at) : new Date();
    const intel = getTravelIntelligence(place, now, weather || null, {
      fromCoords: Array.isArray(fromCoords) && fromCoords.length >= 2 ? fromCoords : null,
      personas: Array.isArray(personas) ? personas : [],
      tripMode: tripMode || null,
    });
    const advice = dynamicAdvice(intel);
    res.json({ advice, intel: {
      visitScore: intel.visitScore, visitLabel: intel.visitLabel, statusLabel: intel.statusLabel,
      crowdLevel: intel.crowdLevel, confidence: intel.confidence, explanation: intel.explanation,
      arrival: intel.arrival, scenic: intel.scenic, weather: intel.weather, traffic: intel.traffic,
    }});
  } catch (err) {
    logger.error('[time-intelligence:advice]', err.message);
    res.status(500).json({ error: 'Failed to compute advice' });
  }
});


// ── Multi-day reschedule suggestions ────────────────────────────────────────
router.post('/multi-day-advice', (req, res) => {
  try {
    const { weather, at, personas, tripMode, region } = req.body || {};
    const rawPlaces = req.body?.places;
    if (!Array.isArray(rawPlaces) || !rawPlaces.length) {
      return res.status(400).json({ error: 'places[] is required' });
    }
    const places = rawPlaces.slice(0, MAX_PLACES);
    const now = at ? new Date(at) : new Date();
    const options = {
      personas: Array.isArray(personas) ? personas : [],
      tripMode: tripMode || null,
      region: region || null,
    };
    const intelList = places.map((p) => {
      const intel = getTravelIntelligence(p, now, weather || null, options);
      return { name: p.name, cat: p.cat, intel };
    });
    const result = multiDayAdvice(intelList);
    res.json(result);
  } catch (err) {
    logger.error('[time-intelligence:multi-day-advice]', err.message);
    res.status(500).json({ error: 'Failed to compute multi-day advice' });
  }
});

module.exports = router;
