// db/init.js — PostgreSQL database setup & migrations

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws; // Required for Node.js
require('dotenv').config();
const { SCHEMA_SQL } = require('./schema');

let pool = null;

/**
 * Initialize the PostgreSQL database connection pool.
 * Creates tables if they don't exist.
 */
async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is missing.');
  }

  if (!/-pooler\./.test(process.env.DATABASE_URL) && !/pgbouncer=true/.test(process.env.DATABASE_URL)) {
    console.warn(
      '⚠️  [db] DATABASE_URL does not look like a Neon POOLED connection string ' +
      '(no "-pooler" in the hostname). If you raise CLUSTER_WORKERS above 1, each ' +
      'worker opens its own connection pool — without the pooler endpoint you will ' +
      'hit Neon\'s direct-connection ceiling fast. In the Neon dashboard, use the ' +
      '"Pooled connection" string, not the "Direct connection" one.'
    );
  }

  // Pool sizing is deliberately conservative PER WORKER PROCESS: in cluster
  // mode (see server.js) there can be one of these pools per CPU core, so the
  // effective total is (max * numCPUs). Override via DB_POOL_MAX if you know
  // your Neon plan's connection ceiling.
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    },
    max: parseInt(process.env.DB_POOL_MAX, 10) || 8,
    idleTimeoutMillis: 30000,       // release idle clients back after 30s
    connectionTimeoutMillis: 8000,  // fail fast instead of queuing forever if the pool is exhausted
    statement_timeout: 15000,       // kill any single query running >15s so it can't hold a connection hostage under load
    query_timeout: 15000,
  });

  pool.on('error', (err) => {
    // Idle client errors (e.g. connection dropped by Neon) shouldn't crash the process
    console.error('[db] Unexpected error on idle client:', err.message);
  });

  // ── Create tables ──────────────────────────────────────────────────────────
  // SCHEMA_SQL is shared with migrations/1700000000000_baseline-schema.js
  // (see db/schema.js) so the two can't silently drift apart. This
  // boot-time run covers environments that don't run `npm run migrate:up`
  // as a separate deploy step; it's a no-op (IF NOT EXISTS) anywhere the
  // migration has already applied the same schema.
  try {
    await pool.query(SCHEMA_SQL);

    console.log('📦  PostgreSQL Database initialized');
  } catch (error) {
    console.error('Failed to initialize PostgreSQL tables:', error);
    throw error;
  }
  
  return pool;
}

/**
 * Get the database pool instance. Throws if not initialized.
 */
function getDb() {
  if (!pool) throw new Error('Database pool not initialized. Call initDatabase() first.');
  return pool;
}

/**
 * Close the database connection gracefully.
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('📦  PostgreSQL Database closed');
  }
}

module.exports = { initDatabase, getDb, closeDatabase };
