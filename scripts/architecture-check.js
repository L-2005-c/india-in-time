'use strict';

/**
 * scripts/architecture-check.js
 *
 * Full static architectural invariant verification:
 * 1. File inventory & line-count ratchet limits
 * 2. Static dependency graph builder & layering rules enforcement
 * 3. Circular dependency detection (DFS cycle finder)
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }
function lines(f) {
  try { return read(f).split(/\r?\n/).length; } catch { return 999999; }
}
function exists(f) { return fs.existsSync(path.join(root, f)); }

const failures = [];

// ── 1. File Inventory & Line Count Ratchets ───────────────────────────────────
const APP_LIMIT = 3600;
const appLines = lines('frontend/app-src/src/core/app.js');
const serverLines = lines('server.js');

const inventoryChecks = [
  [`app.js ≤ ${APP_LIMIT}`, appLines <= APP_LIMIT],
  ['server.js ≤ 560', serverLines <= 560],
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

console.log('=== [1/2] FILE INVENTORY & LINE RATCHET CHECKS ===');
for (const [l, ok] of inventoryChecks) {
  console.log(ok ? `✓ ${l}` : `✗ ${l}`);
  if (!ok) failures.push(`Inventory check failed: ${l}`);
}

// ── 2. Static Dependency Graph & Layering Invariant Analyzer ──────────────────
console.log('\n=== [2/2] DEPENDENCY GRAPH & LAYERING ENFORCEMENT ===');
const TARGET_DIRS = ['services', 'routes', 'middleware', 'lib', 'db'];
const graph = new Map();

function getAllJsFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        files.push(...getAllJsFiles(full));
      }
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function extractRequires(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const requiredPaths = [];
  const reqRegex = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let match;
  while ((match = reqRegex.exec(content)) !== null) {
    const rel = match[1];
    let resolved = path.resolve(path.dirname(filePath), rel);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      resolved = path.join(resolved, 'index.js');
    } else if (!resolved.endsWith('.js') && fs.existsSync(resolved + '.js')) {
      resolved = resolved + '.js';
    } else if (!resolved.endsWith('.json') && fs.existsSync(resolved + '.json')) {
      resolved = resolved + '.json';
    }
    requiredPaths.push(resolved);
  }
  return requiredPaths;
}

// Build Graph
const allFiles = [];
for (const d of TARGET_DIRS) {
  allFiles.push(...getAllJsFiles(path.join(root, d)));
}

for (const file of allFiles) {
  const deps = extractRequires(file);
  graph.set(file, deps);
}

// Layering Rules Enforcement
for (const [sourceFile, deps] of graph.entries()) {
  const relSource = path.relative(root, sourceFile).replace(/\\/g, '/');
  const sourceLayer = relSource.split('/')[0];

  for (const targetFile of deps) {
    const relTarget = path.relative(root, targetFile).replace(/\\/g, '/');
    const targetLayer = relTarget.split('/')[0];

    // Rule A: services/ must never depend on routes/ or frontend/
    if (sourceLayer === 'services' && (targetLayer === 'routes' || targetLayer === 'frontend')) {
      failures.push(`Layering Violation: ${relSource} (${sourceLayer}) cannot depend on ${relTarget} (${targetLayer})`);
    }

    // Rule B: db/ must never depend on services/, routes/, or middleware/
    if (sourceLayer === 'db' && (targetLayer === 'services' || targetLayer === 'routes' || targetLayer === 'middleware')) {
      failures.push(`Layering Violation: ${relSource} (${sourceLayer}) cannot depend on ${relTarget} (${targetLayer})`);
    }

    // Rule C: middleware/ must never depend on routes/
    if (sourceLayer === 'middleware' && targetLayer === 'routes') {
      failures.push(`Layering Violation: ${relSource} (${sourceLayer}) cannot depend on ${relTarget} (${targetLayer})`);
    }

    // Rule D: lib/ must never depend on services/, routes/, or middleware/
    if (sourceLayer === 'lib' && (targetLayer === 'services' || targetLayer === 'routes' || targetLayer === 'middleware')) {
      failures.push(`Layering Violation: ${relSource} (${sourceLayer}) cannot depend on ${relTarget} (${targetLayer})`);
    }
  }
}

// Circular Dependency Detection (DFS Cycle Finder)
const visited = new Map();
const cycles = [];

function dfs(node, stack = []) {
  visited.set(node, 1);
  stack.push(node);

  const neighbors = graph.get(node) || [];
  for (const next of neighbors) {
    if (!graph.has(next)) continue;
    const state = visited.get(next) || 0;
    if (state === 1) {
      const cycleStartIdx = stack.indexOf(next);
      const cyclePath = stack.slice(cycleStartIdx).concat(next).map(p => path.relative(root, p).replace(/\\/g, '/'));
      cycles.push(cyclePath.join(' -> '));
    } else if (state === 0) {
      dfs(next, stack);
    }
  }

  stack.pop();
  visited.set(node, 2);
}

for (const file of graph.keys()) {
  if ((visited.get(file) || 0) === 0) {
    dfs(file);
  }
}

if (cycles.length) {
  cycles.forEach(c => failures.push(`Circular Dependency Detected: ${c}`));
}

if (failures.length) {
  console.error('\n❌ Architecture Checks Failed:');
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}

console.log(`✓ Layering & cycle check: ${graph.size} modules analyzed across [${TARGET_DIRS.join(', ')}] (0 cycles, 0 layering violations)`);
console.log(`\nArchitecture check passed cleanly (app.js=${appLines}, server.js=${serverLines}).`);
