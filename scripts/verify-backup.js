'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter(n => n.startsWith('backup-')).sort().reverse() : [];
if (!dirs.length) {
  console.error(`No backup directories found under ${root}`);
  process.exit(1);
}
const latest = path.join(root, dirs[0]);
const manifestPath = path.join(latest, 'manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error(`Missing manifest: ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest.tables) || manifest.tables.length === 0) throw new Error('Backup manifest contains no tables');
let totalRows = 0;
for (const item of manifest.tables) {
  const file = path.join(latest, item.file);
  if (!fs.existsSync(file)) throw new Error(`Missing table export: ${item.file}`);
  const payload = fs.readFileSync(file, 'utf8');
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  if (hash !== item.sha256) throw new Error(`Checksum mismatch: ${item.table}`);
  const rows = JSON.parse(payload);
  if (!Array.isArray(rows) || rows.length !== item.rows) throw new Error(`Row-count mismatch: ${item.table}`);
  totalRows += rows.length;
}
console.log(JSON.stringify({ok: true, backup: dirs[0], tables: manifest.tables.length, rows: totalRows}, null, 2));
