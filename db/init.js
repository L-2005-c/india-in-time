// db/init.js — PostgreSQL database setup & migrations

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws; // Required for Node.js
require('dotenv').config();

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
  try {
    await pool.query(`
      -- Saved trips
      CREATE TABLE IF NOT EXISTS trips (
        id          VARCHAR(255) PRIMARY KEY,
        user_id     VARCHAR(255),
        city        VARCHAR(255) NOT NULL,
        city_lat    DOUBLE PRECISION,
        city_lon    DOUBLE PRECISION,
        config_json TEXT,
        stops_json  TEXT NOT NULL,
        status      VARCHAR(50) DEFAULT 'saved',
        share_token VARCHAR(255) UNIQUE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Bookmarked / favorite places
      CREATE TABLE IF NOT EXISTS favorites (
        id          SERIAL PRIMARY KEY,
        user_id     VARCHAR(255) NOT NULL,
        place_name  VARCHAR(255) NOT NULL,
        city        VARCHAR(255) NOT NULL,
        lat         DOUBLE PRECISION,
        lon         DOUBLE PRECISION,
        category    VARCHAR(100),
        notes       TEXT,
        added_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, place_name, city)
      );

      -- API usage analytics
      CREATE TABLE IF NOT EXISTS api_usage (
        id           SERIAL PRIMARY KEY,
        endpoint     VARCHAR(255) NOT NULL,
        method       VARCHAR(10) NOT NULL,
        ip           VARCHAR(45),
        user_agent   TEXT,
        status_code  INTEGER,
        response_ms  INTEGER,
        request_id   VARCHAR(255),
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Persistent place cache (survives server restarts)
      CREATE TABLE IF NOT EXISTS place_cache (
        cache_key    VARCHAR(255) PRIMARY KEY,
        payload_json TEXT NOT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at   TIMESTAMP NOT NULL
      );

      -- Persistent AI cache (saves Gemini API tokens)
      CREATE TABLE IF NOT EXISTS ai_cache (
        prompt_hash  VARCHAR(255) PRIMARY KEY,
        response_txt TEXT NOT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Per-place feedback (rating on a specific stop after visiting)
      CREATE TABLE IF NOT EXISTS place_feedback (
        id          SERIAL PRIMARY KEY,
        user_id     VARCHAR(255),
        place_name  VARCHAR(255) NOT NULL,
        city        VARCHAR(255) NOT NULL,
        rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        accurate    BOOLEAN,
        comment     TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Overall app experience feedback
      CREATE TABLE IF NOT EXISTS app_feedback (
        id          SERIAL PRIMARY KEY,
        user_id     VARCHAR(255),
        rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        category    VARCHAR(50),
        message     TEXT,
        context     VARCHAR(50),
        user_agent  TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_trips_user    ON trips(user_id);
      CREATE INDEX IF NOT EXISTS idx_trips_share   ON trips(share_token);
      CREATE INDEX IF NOT EXISTS idx_fav_user      ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_usage_time    ON api_usage(created_at);
      CREATE INDEX IF NOT EXISTS idx_usage_ep      ON api_usage(endpoint);
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON place_cache(expires_at);
      CREATE INDEX IF NOT EXISTS idx_place_fb_place ON place_feedback(place_name, city);
      CREATE INDEX IF NOT EXISTS idx_app_fb_time    ON app_feedback(created_at);
    `);
    
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
