// scripts/backup-db.js — Backs up the real database.
//
// The old version of this script copied local SQLite files
// (data/india-in-time.db) — leftover from before the app moved to Neon
// Postgres. Those files haven't existed for a while, so `npm run backup`
// was silently doing nothing and printing success. This version dumps
// every table to JSON via the same DATABASE_URL the app itself uses, so it
// works anywhere (Render, your laptop, CI) without needing the `pg_dump`
// binary installed.
//
// Usage:  npm run backup
// Output: backups/backup-<timestamp>/<table>.json

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');
const { neonConfig } = require('@neondatabase/serverless');
neonConfig.webSocketConstructor = ws;

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Every table created in db/init.js. Keep this in sync if you add tables.
const TABLES = [
  'trips', 'favorites', 'api_usage', 'place_cache', 'ai_cache',
  'place_feedback', 'app_feedback',
];

async function backup() {
  if (!process.env.DATABASE_URL) {
    console.error('❌  DATABASE_URL is not set — nothing to back up. (On Render, this should already be in your environment.)');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFolder = path.join(BACKUP_DIR, `backup-${timestamp}`);
  fs.mkdirSync(backupFolder, { recursive: true });

  console.log(`📦 Backing up Postgres database to: ${backupFolder}`);
  let successCount = 0;
  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table}`);
      fs.writeFileSync(
        path.join(backupFolder, `${table}.json`),
        JSON.stringify(rows, null, 2)
      );
      console.log(`  ✅ ${table}: ${rows.length} row(s)`);
      successCount++;
      totalRows += rows.length;
    } catch (err) {
      console.error(`  ❌ Failed to back up ${table}:`, err.message);
    }
  }

  await pool.end();
  console.log(`🎉 Backup complete! ${successCount}/${TABLES.length} tables, ${totalRows} total row(s).`);
  console.log(`   Note: trips/favorites contain user data — keep the backups/ folder out of git (already in .gitignore) and store it somewhere access-controlled.`);
}

backup().catch(err => {
  console.error('💥 Backup failed:', err.message);
  process.exit(1);
});
