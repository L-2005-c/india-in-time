#!/usr/bin/env node
// scripts/build-frontend.js — Builds the frontend for production via Vite.
//
// The frontend source lives at frontend/app-src/ (a proper ES-module
// project — see frontend/app-src/src/ and MIGRATION.md) and Vite bundles
// it into frontend/public/dist/ as content-hashed files, including its own
// dist/index.html. That's wired into the serving path via
// config.resolveIndexHtmlPath() (see config/index.js and server.js): in
// production, if this script has been run, the server serves that
// dist/index.html is the only production frontend entry point. Development
// uses a minimal shell unless the Vite dev server is running.
//
// The retired monolithic frontend is not part of the production build path.
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

  // Safety: public static files live at site root (logo, client-api, manifest,
  // favicons). If any tool rewrote them under /dist/, put them back.
  const fs = require('fs');
  const distIndex = path.join(__dirname, '..', 'frontend', 'public', 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    let html = fs.readFileSync(distIndex, 'utf8');
    const before = html;
    const staticFiles = [
      'logo-mark.png', 'client-api.js', 'manifest.json', 'favicon-32.png',
      'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'sw.js',
    ];
    for (const f of staticFiles) {
      html = html.split('/dist/' + f).join('/' + f);
    }
    if (html !== before) {
      fs.writeFileSync(distIndex, html);
      console.log('Post-processed dist/index.html: restored root paths for public static assets.');
    }
    // Sanity check
    if (html.includes('/dist/client-api.js') || html.includes('/dist/logo-mark.png')) {
      console.warn('WARNING: dist/index.html still references /dist/ static assets');
    }
  }

  if (!fs.existsSync(distIndex)) {
    throw new Error('Production frontend build failed: frontend/public/dist/index.html was not generated.');
  }
  if (!/assets\//.test(html)) {
    throw new Error('Production frontend build failed: dist/index.html does not reference Vite assets.');
  }
  console.log('Done. Output in frontend/public/dist/ (content-hashed and required in production).');
}

main();
