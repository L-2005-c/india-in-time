#!/usr/bin/env node
// scripts/build-frontend.js — Minifies the frontend for production.
//
// NOT currently wired into the Dockerfile/deploy pipeline automatically —
// this is deliberately a standalone, opt-in build step for now. Wiring it
// in fully would mean index.html needs to reference the hashed output
// filenames conditionally in production (a small HTML templating step this
// pass didn't take on, to avoid more changes to an already many-times-edited
// file without a way to visually verify the result in this environment).
//
// Usage:
//   npm run build:frontend
//
// Output goes to frontend/public/dist/ as content-hashed files, e.g.
// app.a1b2c3d4.min.js — the hash changes whenever the source changes, so
// these can be served with a long max-age cache header safely (no need for
// the manual ?v=... cache-busting query strings currently in index.html).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { execSync } = require('child_process');

const PUBLIC_DIR = path.join(__dirname, '..', 'frontend', 'public');
const DIST_DIR = path.join(PUBLIC_DIR, 'dist');

function contentHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
}

function minifyJs(srcFile, label) {
  const srcPath = path.join(PUBLIC_DIR, srcFile);
  const src = fs.readFileSync(srcPath, 'utf8');
  const before = src.length;

  const result = esbuild.transformSync(src, {
    minify: true,
    target: 'es2020',
    loader: 'js',
  });

  const hash = contentHash(Buffer.from(result.code));
  const base = path.basename(srcFile, '.js');
  const outFile = `${base}.${hash}.min.js`;
  fs.writeFileSync(path.join(DIST_DIR, outFile), result.code);

  const after = result.code.length;
  console.log(`  ${label}: ${(before / 1024).toFixed(1)}KB -> ${(after / 1024).toFixed(1)}KB  (${outFile})`);
  return outFile;
}

function minifyCss(srcFile, label) {
  const srcPath = path.join(PUBLIC_DIR, srcFile);
  const before = fs.statSync(srcPath).size;
  const base = path.basename(srcFile, '.css');
  const tmpOut = path.join(DIST_DIR, `${base}.tmp.css`);

  execSync(`npx cleancss -o "${tmpOut}" "${srcPath}"`, { stdio: 'pipe' });

  const minified = fs.readFileSync(tmpOut);
  const hash = contentHash(minified);
  const outFile = `${base}.${hash}.min.css`;
  fs.renameSync(tmpOut, path.join(DIST_DIR, outFile));

  console.log(`  ${label}: ${(before / 1024).toFixed(1)}KB -> ${(minified.length / 1024).toFixed(1)}KB  (${outFile})`);
  return outFile;
}

function main() {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  // Clean previous build output so stale hashed files don't accumulate.
  for (const f of fs.readdirSync(DIST_DIR)) {
    fs.unlinkSync(path.join(DIST_DIR, f));
  }

  console.log('Building frontend production bundle...');
  const manifest = {};
  manifest['app.js'] = minifyJs('app.js', 'app.js');
  manifest['client-api.js'] = minifyJs('client-api.js', 'client-api.js');
  manifest['styles.css'] = minifyCss('styles.css', 'styles.css');

  fs.writeFileSync(path.join(DIST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Done. Output in frontend/public/dist/ (see manifest.json for the hashed filenames).');
  console.log('Note: this build step is not yet wired into index.html automatically — see README.md.');
}

main();
