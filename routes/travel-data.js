// routes/travel-data.js — Festival calendar + historical crowd hints (read APIs)
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getActiveFestivals, festivalCrowdMultiplier } = require('../services/travelIntelligence/festivalEngine');
const { lookupHistoricalCrowd, attachHistoricalCrowdBatch } = require('../services/travelIntelligence/historicalCrowdStore');
const { requireAdminAuth } = require('../middleware/adminAuth');

const FESTIVAL_PATH = path.join(__dirname, '..', 'data', 'india-festivals.json');
const HIST_PATH = path.join(__dirname, '..', 'data', 'historical-crowd-hints.json');

router.get('/festivals', (req, res) => {
  try {
    const at = req.query.at ? new Date(req.query.at) : new Date();
    const region = req.query.region || null;
    const placeCat = req.query.cat || null;
    const active = getActiveFestivals(at, { region, placeCat });
    const mult = festivalCrowdMultiplier(at, { region, placeCat });
    const raw = JSON.parse(fs.readFileSync(FESTIVAL_PATH, 'utf8'));
    res.json({
      at: at.toISOString(),
      active,
      crowdMultiplier: mult.multiplier,
      reason: mult.reason,
      catalogCount: (raw.festivals || []).length,
      source: 'calendar',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load festivals' });
  }
});

router.get('/historical-crowd', (req, res) => {
  try {
    const name = req.query.name || null;
    const cat = req.query.cat || null;
    const city = req.query.city || null;
    if (name) {
      const hit = lookupHistoricalCrowd({ name, cat }, city);
      return res.json({ place: name, historicalCrowd: hit, source: hit ? 'historical-json' : 'none' });
    }
    const raw = JSON.parse(fs.readFileSync(HIST_PATH, 'utf8'));
    res.json({
      byPlaceNameCount: Object.keys(raw.byPlaceName || {}).length,
      byCategoryCityCount: Object.keys(raw.byCategoryCity || {}).length,
      source: 'historical-json',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load historical crowd data' });
  }
});

// Admin: replace festival catalog (validated JSON)
router.put('/festivals', requireAdminAuth, (req, res) => {
  try {
    const body = req.body;
    if (!body || !Array.isArray(body.festivals)) {
      return res.status(400).json({ error: 'Body must include festivals[]' });
    }
    fs.writeFileSync(FESTIVAL_PATH, JSON.stringify(body, null, 2));
    // Clear require cache so next read picks up file — festivalEngine caches via require
    try {
      delete require.cache[require.resolve('../data/india-festivals.json')];
      delete require.cache[require.resolve('../services/travelIntelligence/festivalEngine')];
    } catch (_e) { /* ignore */ }
    res.json({ ok: true, count: body.festivals.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update festivals' });
  }
});

router.put('/historical-crowd', requireAdminAuth, (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid body' });
    }
    fs.writeFileSync(HIST_PATH, JSON.stringify(body, null, 2));
    try {
      delete require.cache[require.resolve('../data/historical-crowd-hints.json')];
      delete require.cache[require.resolve('../services/travelIntelligence/historicalCrowdStore')];
    } catch (_e) { /* ignore */ }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update historical crowd data' });
  }
});

module.exports = router;
