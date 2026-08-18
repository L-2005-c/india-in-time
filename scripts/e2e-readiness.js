const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const hasCiPin = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8').includes('@playwright/test@1.55.0');
const hasSpecs = fs.existsSync(path.join(__dirname, '..', '__tests__', 'e2e', 'specs'));
if (!hasCiPin || !hasSpecs) process.exitCode = 1;
console.log(JSON.stringify({ e2e: hasCiPin && hasSpecs ? 'ready' : 'incomplete', strategy: 'pinned-in-CI', package: pkg.name }, null, 2));
