'use strict';
/**
 * Gate merge on coverage for product-critical modules.
 * Reads Jest coverage-summary.json produced by `npm run test:ci`.
 */
const fs = require('fs');
const path = require('path');

const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
if (!fs.existsSync(summaryPath)) {
  console.error('Missing coverage/coverage-summary.json — run test:ci with coverage first.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

// path suffixes → minimum statement % (and branch % where noted)
const GATES = [
  { match: /services[\\/]travelIntelligence[\\/]routingEngine\.js$/, statements: 70, branches: 50, label: 'routingEngine' },
  { match: /services[\\/]travelIntelligence[\\/]decisionEngine\.js$/, statements: 90, branches: 70, label: 'decisionEngine' },
  { match: /services[\\/]travelIntelligence[\\/]dayStructure\.js$/, statements: 55, branches: 40, label: 'dayStructure' },
  { match: /services[\\/]travelIntelligence[\\/]temporalEngine\.js$/, statements: 55, branches: 40, label: 'temporalEngine' },
  { match: /middleware[\\/]validator\.js$/, statements: 70, branches: 55, label: 'validator' },
];

let failed = 0;
for (const gate of GATES) {
  const entry = Object.entries(summary).find(([k]) => gate.match.test(k));
  if (!entry) {
    console.error(`✗ ${gate.label}: file not found in coverage summary`);
    failed += 1;
    continue;
  }
  const [, cov] = entry;
  const st = cov.statements?.pct ?? 0;
  const br = cov.branches?.pct ?? 0;
  const okSt = st >= gate.statements;
  const okBr = br >= (gate.branches ?? 0);
  const mark = okSt && okBr ? '✓' : '✗';
  console.log(`${mark} ${gate.label}: statements ${st}% (min ${gate.statements}%)  branches ${br}% (min ${gate.branches}%)`);
  if (!okSt || !okBr) failed += 1;
}

if (failed) {
  console.error(`\n${failed} core coverage gate(s) failed.`);
  process.exit(1);
}
console.log('\nAll core coverage gates passed.');
