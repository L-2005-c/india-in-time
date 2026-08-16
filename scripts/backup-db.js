// Deterministic application-level PostgreSQL backup export.
// Production must also enable provider-managed PITR/backups.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const TABLES = [
  'trips', 'favorites', 'api_usage', 'place_cache', 'ai_cache',
  'place_feedback', 'app_feedback', 'historical_crowd', 'gemini_usage',
  'audit_log', 'ml_model_weights',
];

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function purgeOldBackups() {
  const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 7));
  if (!fs.existsSync(BACKUP_DIR)) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    if (!name.startsWith('backup-')) continue;
    const dir = path.join(BACKUP_DIR, name);
    const stat = fs.statSync(dir);
    if (stat.isDirectory() && stat.mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function backup() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  if (process.env.NODE_ENV === 'production' && !rejectUnauthorized) {
    throw new Error('DATABASE_SSL_REJECT_UNAUTHORIZED=false is not allowed in production');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized },
    max: 2,
    connectionTimeoutMillis: 8000,
    query_timeout: 30000,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFolder = path.join(BACKUP_DIR, `backup-${timestamp}`);
  fs.mkdirSync(backupFolder, { recursive: true });
  purgeOldBackups();
  const manifest = { version: 2, createdAt: new Date().toISOString(), tables: [] };

  try {
    await pool.query('SELECT 1');
    for (const table of TABLES) {
      const { rows } = await pool.query(`SELECT * FROM "${table}"`);
      const payload = JSON.stringify(rows);
      const file = `${table}.json`;
      fs.writeFileSync(path.join(backupFolder, file), payload);
      manifest.tables.push({ table, rows: rows.length, file, sha256: sha256(payload) });
    }
    if (manifest.tables.length !== TABLES.length) throw new Error('Backup completed only partially');
    fs.writeFileSync(path.join(backupFolder, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Backup complete: ${manifest.tables.length} tables`);
    console.log(`Location: ${backupFolder}`);
    return backupFolder;
  } finally {
    await pool.end();
  }
}

backup().catch((err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});
