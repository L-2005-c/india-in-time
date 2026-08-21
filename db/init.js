'use strict';
const appLogger = require('../lib/logger');
// db/init.js — PostgreSQL database setup & migrations

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws; // Required for Node.js

// ── CI/local-only: talk to a plain Postgres container instead of Neon ──────
// @neondatabase/serverless normally speaks Neon's WebSocket proxy protocol,
// which a vanilla `postgres` Docker service does not implement — so e2e
// tests in CI need a small shim (the community `wsproxy` sidecar) sitting in
// front of an ordinary Postgres container. This block is a no-op in every
// real deployment (Render/Vercel/local dev against a real Neon URL); it only
// activates when NEON_LOCAL_PROXY=true, which only the CI e2e job sets. See
// .github/workflows/ci.yml's `e2e` job and https://github.com/neondatabase/wsproxy.
if (process.env.NEON_LOCAL_PROXY === 'true') {
  const proxyHost = process.env.NEON_LOCAL_PROXY_HOST || 'localhost:4444';
  // wsproxy expects the WebSocket handshake on a specific path (/v2), not
  // the bare root. Without it, wsproxy has no route for the request and
  // answers with a plain HTTP 404 instead of upgrading the connection —
  // which is exactly the "Unexpected server response: 404" seen in CI.
  neonConfig.wsProxy = () => `${proxyHost}/v2`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

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

  if (process.env.NEON_LOCAL_PROXY !== 'true'
      && !/-pooler\./.test(process.env.DATABASE_URL) && !/pgbouncer=true/.test(process.env.DATABASE_URL)) {
    appLogger.warn(
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
  const sslRejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  if (process.env.NODE_ENV === 'production' && !sslRejectUnauthorized) {
    throw new Error('DATABASE_SSL_REJECT_UNAUTHORIZED=false is not allowed in production.');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NEON_LOCAL_PROXY === 'true' ? false : { rejectUnauthorized: sslRejectUnauthorized },
    max: Math.max(2, parseInt(process.env.DB_POOL_MAX, 10) || 8),
    idleTimeoutMillis: 30000,       // release idle clients back after 30s
    connectionTimeoutMillis: 8000,  // fail fast instead of queuing forever if the pool is exhausted
    statement_timeout: 15000,       // kill any single query running >15s so it can't hold a connection hostage under load
    query_timeout: 15000,
  });

  pool.on('error', (err) => {
    // Idle client errors should be observable but should not crash the process.
    appLogger.error('[db] Unexpected error on idle client:', err.message);
  });

  // ── Create tables ──────────────────────────────────────────────────────────
  // SCHEMA_SQL is shared with migrations/1700000000000_baseline-schema.js
  // (see db/schema.js) so the two can't silently drift apart. This
  // boot-time run covers environments that don't run `npm run migrate:up`
  // as a separate deploy step; it's a no-op (IF NOT EXISTS) anywhere the
  // migration has already applied the same schema.
  try {
    await pool.query(SCHEMA_SQL);

    appLogger.info('📦  PostgreSQL Database initialized');
  } catch (error) {
    appLogger.error('Failed to initialize PostgreSQL tables:', error);
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
    appLogger.info('📦  PostgreSQL Database closed');
  }
}

module.exports = { initDatabase, getDb, closeDatabase };
