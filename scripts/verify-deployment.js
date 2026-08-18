'use strict';

const fs = require('fs');
const path = require('path');

const required = [
  'package.json', 'package-lock.json', 'Dockerfile', '.dockerignore',
  '.github/workflows/ci.yml', 'config/index.js', 'db/init.js',
  'middleware/security.js', 'middleware/rateLimiter.js', 'scripts/backup-db.js',
];
const root = path.join(__dirname, '..');
let failed = 0;
for (const file of required) {
  const ok = fs.existsSync(path.join(root, file));
  console.log(`${ok ? '✓' : '✗'} deployment file: ${file}`);
  if (!ok) failed++;
}
const docker = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
if (!/USER\s+appuser\b/.test(docker)) { console.error('✗ Docker runtime is not explicitly non-root'); failed++; }
if (!/HEALTHCHECK/.test(docker)) { console.error('✗ Docker HEALTHCHECK missing'); failed++; }
const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
for (const needle of ['npm ci', 'npm run check:production', 'npm run test:ci', 'npm run security:audit', 'docker build']) {
  const ok = ci.includes(needle);
  console.log(`${ok ? '✓' : '✗'} CI gate: ${needle}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log('Deployment structure verification passed.');
