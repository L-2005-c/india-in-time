'use strict';

// Restores application-level JSON backup exports into an isolated PostgreSQL
// schema, validates every row can be inserted, then drops the schema.
// This is intentionally non-destructive to the source database.
const fs = require('fs');
const path = require('path');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;

const backupRoot = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const dirs = fs.existsSync(backupRoot)
  ? fs.readdirSync(backupRoot).filter((n) => n.startsWith('backup-')).sort().reverse()
  : [];
if (!dirs.length) throw new Error(`No backups found under ${backupRoot}`);

const latest = path.join(backupRoot, dirs[0]);
const manifest = JSON.parse(fs.readFileSync(path.join(latest, 'manifest.json'), 'utf8'));
if (!Array.isArray(manifest.tables) || !manifest.tables.length) throw new Error('Backup manifest contains no tables');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for restore verification');
if (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
  throw new Error('Production restore verification refuses disabled DB TLS verification');
}

const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized },
  max: 1,
  connectionTimeoutMillis: 8000,
  query_timeout: 30000,
});

const quoteIdent = (name) => `"${String(name).replaceAll('"', '""')}"`;
const schemaName = `restore_verify_${Date.now()}`;

(async () => {
  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${quoteIdent(schemaName)}`);

    for (const item of manifest.tables) {
      const table = quoteIdent(item.table);
      const target = `${quoteIdent(schemaName)}.${table}`;
      await client.query(`CREATE TABLE ${target} (LIKE public.${table} INCLUDING ALL)`);
      const payload = JSON.parse(fs.readFileSync(path.join(latest, item.file), 'utf8'));
      if (!Array.isArray(payload) || payload.length !== item.rows) {
        throw new Error(`Backup row mismatch for ${item.table}`);
      }
      if (!payload.length) continue;

      const columns = Object.keys(payload[0]);
      const columnSql = columns.map(quoteIdent).join(', ');
      for (const row of payload) {
        const values = columns.map((column) => row[column]);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${target} (${columnSql}) VALUES (${placeholders})`,
          values,
        );
        inserted += 1;
      }

      const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${target}`);
      if (rows[0].count !== payload.length) throw new Error(`Restore count mismatch for ${item.table}`);
    }

    await client.query('ROLLBACK');
    console.log(JSON.stringify({ ok: true, backup: dirs[0], tables: manifest.tables.length, restoredRows: inserted, mode: 'isolated-schema-rollback' }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => {
  console.error(`Restore verification failed: ${error.message}`);
  process.exit(1);
});
