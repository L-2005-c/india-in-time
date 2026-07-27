#!/usr/bin/env node
// scripts/build-frontend.js — Minifies the frontend for production.
//
// Wired into the serving path via config.resolveIndexHtmlPath() (see
// config/index.js and server.js): in production, if this script has been
// run, the server serves frontend/public/dist/index.html (generated below,
// referencing the hashed files this script builds) instead of the raw
// source index.html. If this script hasn't been run, or NODE_ENV isn't
// production, the server transparently falls back to the source
// index.html — so running this step is opt-in, but it's no longer inert
// once it has been run. The source frontend/public/index.html itself is
// never modified by this script.
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

// Rewrites the three asset tags in source index.html to point at the
// hashed dist/ files, and writes the result to dist/index.html. Source
// index.html is only ever read, never modified — this is deliberate (see
// the header comment) since hand-verifying every edit to that file without
// a browser isn't reliable in this environment. The regexes tolerate the
// existing "?v=..." cache-busting query strings (or none at all) so this
// doesn't silently break if that version string changes later; if a tag
// isn't found at all, this throws rather than shipping a dist/index.html
// with a dangling reference to a file that no longer exists there.
function buildProductionIndexHtml(manifest) {
  const srcPath = path.join(PUBLIC_DIR, 'index.html');
  let html = fs.readFileSync(srcPath, 'utf8');

  const replacements = [
    {
      label: 'styles.css link tag',
      pattern: /<link rel="stylesheet" href="\.\/styles\.css(?:\?[^"]*)?">/,
      replacement: `<link rel="stylesheet" href="/dist/${manifest['styles.css']}">`,
    },
    {
      label: 'client-api.js script tag',
      pattern: /<script src="\.\/client-api\.js(?:\?[^"]*)?"><\/script>/,
      replacement: `<script src="/dist/${manifest['client-api.js']}"></script>`,
    },
    {
      label: 'app.js module script tag',
      pattern: /<script type="module" src="\.\/app\.js(?:\?[^"]*)?"><\/script>/,
      replacement: `<script type="module" src="/dist/${manifest['app.js']}"></script>`,
    },
  ];

  for (const { label, pattern, replacement } of replacements) {
    if (!pattern.test(html)) {
      throw new Error(
        `build-frontend.js: could not find the ${label} in frontend/public/index.html — ` +
        `it may have changed shape since this script was written. Refusing to write a ` +
        `dist/index.html that might reference a stale/missing asset. Update the pattern ` +
        `in scripts/build-frontend.js to match the current markup.`
      );
    }
    html = html.replace(pattern, replacement);
  }

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);
  return path.relative(PUBLIC_DIR, path.join(DIST_DIR, 'index.html'));
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

  const indexOut = buildProductionIndexHtml(manifest);
  console.log(`  index.html: rewritten -> ${indexOut}`);

  console.log('Done. Output in frontend/public/dist/ (see manifest.json for the hashed filenames).');
  console.log('This is now served automatically in production — see config.resolveIndexHtmlPath()/server.js.');
}

main();
