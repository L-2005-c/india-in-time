#!/usr/bin/env node
'use strict';
// Pre-release gate. Ported from the WORLD_CLASS_PRODUCTION_READY (v5.2.1)
// branch and updated to assert against this branch's stronger tourism/GeoAI
// eligibility engine (multi-city whitelist + Jest regression suite) rather
// than the older standalone tourism script it originally checked for.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
function exists(p){return fs.existsSync(path.join(root,p));}
function text(p){return fs.readFileSync(path.join(root,p),'utf8');}
function check(name, ok){console.log(`${ok?'✓':'✗'} ${name}`); if(!ok) failures.push(name);}

check('package.json exists', exists('package.json'));
const pkg = JSON.parse(text('package.json'));
check('Node runtime is constrained to 20.x/22.x', pkg.engines?.node === '20.x || 22.x');

check('Render blueprint exists', exists('render.yaml'));
check(
  'production build installs devDependencies before build:frontend (esbuild/clean-css-cli)',
  /npm ci --include=dev && npm run build:frontend && npm prune --omit=dev/.test(text('render.yaml'))
);
check('production frontend is fail-closed', /Production frontend build is missing or unhealthy/.test(text('config/index.js')));

check('tourism eligibility engine exists', exists('services/travelIntelligence/tourismPoi'));
check('tourism whitelist (multi-city GeoAI data) exists', exists('services/travelIntelligence/tourismPoi/tourismWhitelist.js'));
check('tourism blacklist exists', exists('services/travelIntelligence/tourismPoi/tourismBlacklist.js'));
check('tourism eligibility Jest regression suite exists', exists('__tests__/services.tourismPoi.eligibility.test.js'));
check('itinerary regression suite exists', exists('scripts/itinerary-regression.js'));

check('security middleware exists', exists('middleware/security.js'));
check('health endpoint exists', /app\.get\('\/api\/health'/.test(text('server.js')));

check('SEO robots file exists', exists('frontend/public/robots.txt'));
check('SEO sitemap file exists', exists('frontend/public/sitemap.xml'));
check('PWA manifest exists', exists('frontend/public/manifest.json'));
check('Node modules are not committed', !exists('node_modules'));
check('.nvmrc pins a Node version', exists('.nvmrc'));

const index = text('frontend/app-src/index.html');
check('canonical URL is present', index.includes('<link rel="canonical"'));
check('structured data (JSON-LD) is present', index.includes('application/ld+json'));

if (failures.length) { console.error(`\nRelease audit failed: ${failures.length}`); process.exit(1); }
console.log('\nRelease audit passed.');
