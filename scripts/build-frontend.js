#!/usr/bin/env node
// scripts/build-frontend.js — Builds the frontend for production via Vite.
//
// The frontend source lives at frontend/app-src/ (a proper ES-module
// project — see frontend/app-src/src/ and MIGRATION.md) and Vite bundles
// it into frontend/public/dist/ as content-hashed files, including its own
// dist/index.html. That's wired into the serving path via
// config.resolveIndexHtmlPath() (see config/index.js and server.js): in
// production, if this script has been run, the server serves that
// dist/index.html instead of the source frontend/public/index.html. If
// this script hasn't been run, or NODE_ENV isn't production, the server
// transparently falls back to the source index.html — so running this
// step is opt-in, but it's no longer inert once it has been run.
//
// This replaced an earlier version of this script that minified the old
// single-file frontend/public/app.js directly with esbuild. That source
// file has since been split into frontend/app-src/ (see MIGRATION.md) —
// frontend/public/app.js is kept only as a frozen fallback and is no
// longer what this script builds.
//
// Usage:
//   npm run build:frontend

const { execFileSync } = require('child_process');
const path = require('path');

const VITE_CONFIG = path.join(__dirname, '..', 'frontend', 'app-src', 'vite.config.js');
const VITE_BIN = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');

function main() {
  console.log('Building frontend production bundle (Vite)...');
  execFileSync(VITE_BIN, ['build', '--config', VITE_CONFIG], { stdio: 'inherit' });
  console.log('Done. Output in frontend/public/dist/ (content-hashed, served automatically in');
  console.log('production — see config.resolveIndexHtmlPath()/server.js).');
}

main();
