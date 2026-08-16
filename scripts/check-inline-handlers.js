'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const roots = ['frontend/app-src', 'frontend/public'];
const extensions = new Set(['.html', '.js']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name))) files.push(full);
  }
}
for (const rel of roots) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) walk(abs);
}
const pattern = /\bon(?:click|change|input|keydown|keyup|submit)\s*=/i;
const violations = [];
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const stripped = original
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (pattern.test(stripped)) violations.push(path.relative(root, file));
}
if (violations.length) {
  console.error('Executable inline event handlers found:\n' + violations.join('\n'));
  process.exit(1);
}
console.log(`Inline-event assertion passed across ${files.length} frontend source files.`);
