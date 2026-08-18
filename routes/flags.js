'use strict';
const express = require('express');
const router = express.Router();
const { getFlag, listFlags } = require('../lib/featureFlags');

/** Public, non-sensitive flags for client hydration */
router.get('/public', (_req, res) => {
  const flags = {
    aiEnabled: getFlag('aiEnabled'),
    timeIntelligenceEnabled: getFlag('timeIntelligenceEnabled'),
    mlCrowdEnabled: getFlag('mlCrowdEnabled'),
    liveRoutingEnabled: getFlag('liveRoutingEnabled'),
    streetQuest: true,
    multiDayPlanner: true,
    offlineToast: true,
    maintenanceMode: getFlag('maintenanceMode'),
  };
  res.json({ ok: true, flags, ts: Date.now() });
});

module.exports = router;
