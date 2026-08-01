// 1700000000000_baseline-schema.js — Baseline migration
//
// This mirrors the schema that db/init.js has been creating via
// `CREATE TABLE IF NOT EXISTS` on every server boot. It's written with
// `IF NOT EXISTS` guards specifically so it's safe to run against:
//   (a) a brand new empty database (creates everything), and
//   (b) an existing production database that already has these tables
//       from db/init.js's own bootstrapping (all statements become no-ops).
//
// Going forward, schema changes should be made via NEW migration files
// (`npm run migrate:create -- <name>`), not by editing db/init.js's inline
// SQL or this file. db/init.js's own CREATE TABLE IF NOT EXISTS block is
// left in place for now as a safety net for any environment that boots the
// app without running migrations first — see README.md for the tracked
// follow-up to fully cut over.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
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

    CREATE TABLE IF NOT EXISTS place_cache (
      cache_key    VARCHAR(255) PRIMARY KEY,
      payload_json TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at   TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_cache (
      prompt_hash  VARCHAR(255) PRIMARY KEY,
      response_txt TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE INDEX IF NOT EXISTS idx_trips_user    ON trips(user_id);
    CREATE INDEX IF NOT EXISTS idx_trips_share   ON trips(share_token);
    CREATE INDEX IF NOT EXISTS idx_fav_user      ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_time    ON api_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_ep      ON api_usage(endpoint);
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON place_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_place_fb_place ON place_feedback(place_name, city);
    CREATE INDEX IF NOT EXISTS idx_app_fb_time    ON app_feedback(created_at);
  `);
};

exports.down = (pgm) => {
  // Deliberately NOT dropping tables in the down migration for this
  // baseline — this is the production schema with real user data
  // (trips, favorites, feedback). A destructive down-migration here would
  // be a data-loss footgun. If you need to actually tear this down (e.g.
  // in a disposable test database), do it explicitly and intentionally,
  // not via `migrate down`.
  pgm.sql(`SELECT 1;`); // no-op
};
