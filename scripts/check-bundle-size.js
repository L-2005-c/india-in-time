'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'frontend', 'public', 'dist', 'assets');
const maxBytes = Number(process.env.MAX_ASSET_BYTES || 1572864);
if (!fs.existsSync(dist)) {
  console.error('Bundle check failed: frontend/public/dist/assets is missing. Run npm run build:frontend.');
  process.exit(1);
}
let total = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else total += fs.statSync(p).size;
  }
}
walk(dist);
console.log(`Bundle bytes: ${total}; budget: ${maxBytes}`);
if (total > maxBytes) process.exit(1);
