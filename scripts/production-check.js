'use strict';
/** FAANG-style pre-deploy production checklist */
const fs = require('fs');
const path = require('path');
let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
check('brace-expansion override ≥5.0.9', (pkg.overrides || {})['brace-expansion'] >= '5.0.9' || (pkg.overrides || {})['brace-expansion'] === '5.0.9');
check('experience-score module exists', fs.existsSync(path.join(__dirname, '../frontend/app-src/src/utils/experience-score.js')));
check('APM module exists', fs.existsSync(path.join(__dirname, '../lib/apm.js')));
check('SLO module exists', fs.existsSync(path.join(__dirname, '../lib/slo.js')));
check('multiRegion module exists', fs.existsSync(path.join(__dirname, '../lib/multiRegion.js')));
check('CI workflow exists', fs.existsSync(path.join(__dirname, '../.github/workflows/ci.yml')));
if (process.env.NODE_ENV === 'production') {
  check('DATABASE_URL', !!process.env.DATABASE_URL);
  check('GEMINI_API_KEY', !!process.env.GEMINI_API_KEY);
  check('FIREBASE_SERVICE_ACCOUNT', !!process.env.FIREBASE_SERVICE_ACCOUNT);
  check('CORS not wildcard', process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*');
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll production checks passed');
process.exit(failed ? 1 : 0);
