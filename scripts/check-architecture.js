'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const appPath = path.join(root, 'frontend/app-src/src/core/app.js');
const serverPath = path.join(root, 'server.js');
const legacyPath = path.join(root, 'frontend/public/app.js');
const legacyIndex = path.join(root, 'frontend/public/index.html');

function lineCount(file) {
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
}

const appLines = lineCount(appPath);
if (appLines > 3800) failures.push(`core/app.js exceeds architecture ratchet: ${appLines} lines > 3800`);
const serverLines = lineCount(serverPath);
if (serverLines > 520) failures.push(`server.js exceeds architecture ratchet: ${serverLines} lines > 520`);
if (fs.existsSync(legacyPath)) failures.push('legacy frontend/public/app.js must remain retired');
if (fs.existsSync(legacyIndex)) failures.push('legacy frontend/public/index.html must remain retired');

const adminPath = path.join(root, 'middleware/adminAuth.js');
if (fs.existsSync(adminPath)) {
  const admin = fs.readFileSync(adminPath, 'utf8');
  if (/x-admin-key|ADMIN_FEEDBACK_KEY|allowLegacyAdminKey/i.test(admin)) failures.push('legacy shared admin authentication path detected');
}

if (failures.length) {
  console.error('Architecture check failed:');
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}

console.log(`Architecture check passed (app.js=${appLines}, server.js=${serverLines}).`);
