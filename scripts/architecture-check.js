'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
function lines(f) {
  try { return read(f).split(/\r?\n/).length; } catch { return 999999; }
}
function exists(f) { return fs.existsSync(path.join(root, f)); }
const APP_LIMIT = 3600;
const checks = [
  [`app.js ≤ ${APP_LIMIT}`, lines('frontend/app-src/src/core/app.js') <= APP_LIMIT],
  ['server.js ≤ 560', lines('server.js') <= 560],
  ['apiResponse helper', exists('lib/apiResponse.js')],
  ['responseTime middleware', exists('middleware/responseTime.js')],
  ['flags route', exists('routes/flags.js')],
  ['eventBus', exists('frontend/app-src/src/platform/eventBus.js')],
  ['featureFlags client', exists('frontend/app-src/src/platform/featureFlags.js')],
  ['streetQuest module', exists('frontend/app-src/src/modules/streetQuest.js')],
  ['timeAwarePlanner', exists('frontend/app-src/src/modules/timeAwarePlanner.js')],
  ['dayStructure nearby', exists('services/travelIntelligence/dayStructure.js')],
  ['crowd v3', exists('services/ml/crowdModel.js') && /MODEL_VERSION = 3/.test(read('services/ml/crowdModel.js'))],
  ['CI workflow', exists('.github/workflows/ci.yml')],
];
let fail = 0;
for (const [l, ok] of checks) {
  console.log(ok ? `✓ ${l}` : `✗ ${l}`);
  if (!ok) fail++;
}
console.log(`\napp.js=${lines('frontend/app-src/src/core/app.js')} server.js=${lines('server.js')}`);
process.exitCode = fail ? 1 : 0;
