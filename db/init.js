// db/init.js — SQLite database setup & migrations
// Uses better-sqlite3 for synchronous, fast, zero-config database.

const path = require('path');
const fs   = require('fs');

let db = null;

/**
 * Initialize the SQLite database.
 * Creates tables if they don't exist.
 */
function initDatabase(dbPath) {
  // Ensure data directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const Database = require('better-sqlite3');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // ── Create tables ──────────────────────────────────────────────────────────

  db.exec(`
    -- Saved trips
    CREATE TABLE IF NOT EXISTS trips (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      city        TEXT NOT NULL,
      city_lat    REAL,
      city_lon    REAL,
      config_json TEXT,
      stops_json  TEXT NOT NULL,
      status      TEXT DEFAULT 'saved',
      share_token TEXT UNIQUE,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    -- Bookmarked / favorite places
    CREATE TABLE IF NOT EXISTS favorites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      place_name  TEXT NOT NULL,
      city        TEXT NOT NULL,
      lat         REAL,
      lon         REAL,
      category    TEXT,
      notes       TEXT,
      added_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, place_name, city)
    );

    -- API usage analytics
    CREATE TABLE IF NOT EXISTS api_usage (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint     TEXT NOT NULL,
      method       TEXT NOT NULL,
      ip           TEXT,
      user_agent   TEXT,
      status_code  INTEGER,
      response_ms  INTEGER,
      request_id   TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- Persistent place cache (survives server restarts)
    CREATE TABLE IF NOT EXISTS place_cache (
      cache_key    TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL
    );

    -- Persistent AI cache (saves Gemini API tokens)
    CREATE TABLE IF NOT EXISTS ai_cache (
      prompt_hash  TEXT PRIMARY KEY,
      response_txt TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_trips_user    ON trips(user_id);
    CREATE INDEX IF NOT EXISTS idx_trips_share   ON trips(share_token);
    CREATE INDEX IF NOT EXISTS idx_fav_user      ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_time    ON api_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_ep      ON api_usage(endpoint);
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON place_cache(expires_at);
  `);

  console.log(`📦  Database initialized: ${dbPath}`);
  return db;
}

/**
 * Get the database instance. Throws if not initialized.
 */
function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

/**
 * Close the database connection gracefully.
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('📦  Database closed');
  }
}

module.exports = { initDatabase, getDb, closeDatabase };
