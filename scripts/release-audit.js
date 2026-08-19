#!/usr/bin/env node
'use strict';
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
check('production build happens during Render build', /npm ci --include=dev && npm run build:frontend && npm prune --omit=dev/.test(text('render.yaml')));
check('production frontend is fail-closed', /Production frontend build is missing or unhealthy/.test(text('config/index.js')));
check('tourism eligibility engine exists', exists('services/travelIntelligence/tourismPoi'));
check('tourism regression suite exists', exists('scripts/tourism-poi-regression.js'));
check('itinerary regression suite exists', exists('scripts/itinerary-regression.js'));
check('security middleware exists', exists('middleware/security.js'));
check('health endpoint exists', /app\.get\('\/api\/health'/.test(text('server.js')));
check('SEO robots file exists', exists('frontend/public/robots.txt'));
check('SEO sitemap file exists', exists('frontend/public/sitemap.xml'));
check('PWA manifest exists', exists('frontend/public/manifest.json'));
check('Node modules are not committed', !exists('node_modules'));
const index = text('frontend/app-src/index.html');
check('canonical URL is present', index.includes('<link rel="canonical"'));
check('structured data is present', index.includes('application/ld+json'));
if (failures.length) { console.error(`\nRelease audit failed: ${failures.length}`); process.exit(1); }
console.log('\nRelease audit passed.');
