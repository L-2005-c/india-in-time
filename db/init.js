// db/init.js — PostgreSQL database setup & migrations

const { Pool } = require('pg');
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

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
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

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_trips_user    ON trips(user_id);
      CREATE INDEX IF NOT EXISTS idx_trips_share   ON trips(share_token);
      CREATE INDEX IF NOT EXISTS idx_fav_user      ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_usage_time    ON api_usage(created_at);
      CREATE INDEX IF NOT EXISTS idx_usage_ep      ON api_usage(endpoint);
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON place_cache(expires_at);
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
