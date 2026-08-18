#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const app = path.join(root, 'frontend', 'app-src', 'src', 'core', 'app.js');
const source = fs.readFileSync(app, 'utf8');

const required = [
  "from '../modules/auth-session.js'",
  "from './firebase.js'",
  'let currentUser = null;',
  'const authCheckedPromise = new Promise',
  'provider,',
  'Object.assign(window, {',
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`Missing frontend runtime invariant: ${token}`);
  }
}

if (source.indexOf('Object.assign(window, {') < source.indexOf('const { saveUserData')) {
  throw new Error('Window binding is still initialized before auth lexical bindings');
}

for (const stale of [
  'provider: gProvider',
  '_ttTrafficMult(',
  '_ttTrafficLevel(',
  '_ttCrowdMult(',
  '_ttCrowdLevel(',
  '_ttSmartTravel(',
  '_ttSmartVisit(',
  '_modStopBudget(',
  '_modDayBudget(',
  '_modTripBudget(',
]) {
  if (source.includes(stale)) {
    throw new Error(`Stale runtime reference remains: ${stale}`);
  }
}

console.log('Frontend runtime invariants: PASS');
