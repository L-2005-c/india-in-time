'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  'frontend/app-src',
  'frontend/public',
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (/\.(html|js)$/.test(entry.name)) out.push(file);
  }
  return out;
}

test('production frontend contains no executable inline event attributes', () => {
  const pattern = /\bon(?:click|change|input|keydown|keyup|submit)\s*=\s*["']/i;
  const violations = [];
  for (const rel of files) {
    const base = path.join(root, rel);
    for (const file of walk(base)) {
      const text = fs.readFileSync(file, 'utf8')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (pattern.test(text)) violations.push(path.relative(root, file));
    }
  }
  expect(violations).toEqual([]);
});
