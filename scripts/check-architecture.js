'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];

// ── 1. File Inventory & Line Count Ratchets ───────────────────────────────────
const appPath = path.join(root, 'frontend/app-src/src/core/app.js');
const serverPath = path.join(root, 'server.js');
const legacyPath = path.join(root, 'frontend/public/app.js');
const legacyIndex = path.join(root, 'frontend/public/index.html');

function lineCount(file) {
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
}

const appLines = lineCount(appPath);
if (appLines > 3800) failures.push(`core/app.js exceeds architecture ratchet: ${appLines} lines > 3800`);
const serverLines = lineCount(serverPath);
if (serverLines > 520) failures.push(`server.js exceeds architecture ratchet: ${serverLines} lines > 520`);
if (fs.existsSync(legacyPath)) failures.push('legacy frontend/public/app.js must remain retired');
if (fs.existsSync(legacyIndex)) failures.push('legacy frontend/public/index.html must remain retired');

const adminPath = path.join(root, 'middleware/adminAuth.js');
if (fs.existsSync(adminPath)) {
  const admin = fs.readFileSync(adminPath, 'utf8');
  if (/x-admin-key|ADMIN_FEEDBACK_KEY|allowLegacyAdminKey/i.test(admin)) {
    failures.push('legacy shared admin authentication path detected in adminAuth.js');
  }
}

// ── 2. Static Dependency Graph & Layering Invariant Analyzer ──────────────────
const TARGET_DIRS = ['services', 'routes', 'middleware', 'lib', 'db'];
const graph = new Map(); // filepath -> Set of required filepaths

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

// ── 3. Layering Rules Enforcement ─────────────────────────────────────────────
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

// ── 4. Circular Dependency Detection (DFS Cycle Finder) ───────────────────────
const visited = new Map(); // file -> 0: unvisited, 1: visiting, 2: visited
const cycles = [];

function dfs(node, stack = []) {
  visited.set(node, 1);
  stack.push(node);

  const neighbors = graph.get(node) || [];
  for (const next of neighbors) {
    if (!graph.has(next)) continue; // ignore external or non-target files
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

// ── 5. Report Results ─────────────────────────────────────────────────────────
if (failures.length) {
  console.error('\n❌ Architecture Invariant Violations Detected:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log(`✅ Architecture Invariants Passed: ${graph.size} modules analyzed across [${TARGET_DIRS.join(', ')}], 0 circular dependencies, 0 layering violations (app.js=${appLines} lines, server.js=${serverLines} lines).`);

