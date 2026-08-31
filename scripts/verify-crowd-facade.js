'use strict';
const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'public' || file === 'dist') continue;
    const p = path.join(dir, file);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) results = results.concat(walk(p));
    else if (file.endsWith('.js')) results.push(p);
  }
  return results;
}

const allFiles = walk('.');
const violations = [];

for (const file of allFiles) {
  const norm = file.replace(/\\/g, '/');
  // Skip services/crowd internal files, tests, and module-internal files
  if (norm.startsWith('services/crowd/') || 
      norm.startsWith('__tests__/') || 
      norm.startsWith('services/travelIntelligence/crowd') || 
      norm.startsWith('services/travelIntelligence/historicalCrowd') || 
      norm.startsWith('services/ml/crowdModel') ||
      norm.startsWith('scripts/')) {
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  const regex = /require\(['"][^'"]*(crowdEngine|crowdCurve|crowdLearner|historicalCrowdStore|ml\/crowdModel)['"]\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    violations.push(`${norm}: ${match[0]}`);
  }
}

if (violations.length === 0) {
  console.log('✅ ZERO direct crowd internal imports found outside services/crowd/');
  process.exit(0);
} else {
  console.error('❌ Found direct imports outside services/crowd/:');
  console.error(violations.join('\n'));
  process.exit(1);
}
