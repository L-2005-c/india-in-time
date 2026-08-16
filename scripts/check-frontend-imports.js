#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'frontend/app-src/src/main.js');
const required = path.join(root, 'frontend/app-src/src/utils/browser-logger.js');

if (!fs.existsSync(entry)) {
  throw new Error(`Frontend entry missing: ${entry}`);
}
if (!fs.existsSync(required)) {
  throw new Error(`Frontend logger dependency missing: ${required}`);
}

const source = fs.readFileSync(entry, 'utf8');
if (!source.includes("from '../utils/browser-logger.js'")) {
  throw new Error('main.js no longer imports the expected browser logger module');
}

console.log('Frontend import integrity: PASS');
