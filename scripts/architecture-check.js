'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function lines(file) {
  return read(file).split(/\r?\n/).length;
}

const checks = [
  [
    'frontend/core/app.js stays below the current 3,700-line ratchet',
    lines('frontend/app-src/src/core/app.js') <= 3700,
  ],
  [
    'server.js stays below the current 520-line ratchet',
    lines('server.js') <= 520,
  ],
  [
    'cluster orchestration is isolated',
    fs.existsSync(path.join(root, 'lib/clusterBootstrap.js')),
  ],
  [
    'legacy production frontend app.js is absent',
    !fs.existsSync(path.join(root, 'frontend/public/app.js')),
  ],
  [
    'legacy production frontend index.html is absent',
    !fs.existsSync(path.join(root, 'frontend/public/index.html')),
  ],
  [
    'shared admin authentication is absent from runtime',
    !/x-admin-key|ADMIN_FEEDBACK_KEY|allowLegacyAdminKey|requireAdminKey/.test(
      read('middleware/adminAuth.js') + '\n' + read('config/index.js')
    ),
  ],
];

let failures = 0;
for (const [label, ok] of checks) {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}`);
    failures += 1;
  }
}

process.exitCode = failures ? 1 : 0;
