// db/schema.js
// Canonical schema definition — the ONE source of truth for the database
// structure. Both db/init.js (boot-time auto-provisioning, for environments
// that don't run `npm run migrate:up` as a separate deploy step) and
// migrations/1700000000000_baseline-schema.js (the tracked, versioned
// migration) require this exact string, so the two can never silently drift
// apart the way two independently-maintained copies could.
//
// All statements use IF NOT EXISTS, so this remains safe to run repeatedly
// and safe to run alongside node-pg-migrate's own migration tracking.

const SCHEMA_SQL = `
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
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMP
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
    deleted_at  TIMESTAMP
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

  -- Soft-delete support: heal tables created before "deleted_at" existed.
  -- CREATE TABLE IF NOT EXISTS above is a no-op on a table that already
  -- exists, so on any database provisioned before this column was added,
  -- the CREATE INDEX below would fail with "column deleted_at does not
  -- exist". ADD COLUMN IF NOT EXISTS makes this safe to run every boot,
  -- on both fresh and pre-existing databases.
  ALTER TABLE trips ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
  ALTER TABLE favorites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

  CREATE INDEX IF NOT EXISTS idx_trips_deleted ON trips(deleted_at) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_fav_deleted   ON favorites(deleted_at) WHERE deleted_at IS NULL;

  ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_user_id_place_name_city_key;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_active_unique
    ON favorites(user_id, place_name, city) WHERE deleted_at IS NULL;

  ALTER TABLE ai_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
  UPDATE ai_cache SET expires_at = created_at + INTERVAL '10 minutes' WHERE expires_at IS NULL;
  ALTER TABLE ai_cache ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes');
  ALTER TABLE ai_cache ALTER COLUMN expires_at SET NOT NULL;

  -- The AI-cache expiry column may be absent on databases created before the
  -- persistent-cache TTL hardening. Add/repair it before creating its index.
  CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);

  -- Historical crowd observations (pipeline target; engines blend when present)
  CREATE TABLE IF NOT EXISTS historical_crowd (
    id            SERIAL PRIMARY KEY,
    place_name    VARCHAR(255) NOT NULL,
    city          VARCHAR(255) NOT NULL,
    region        VARCHAR(100),
    observed_at   TIMESTAMP NOT NULL,
    daypart       VARCHAR(32),
    crowd_level   VARCHAR(32) NOT NULL,
    crowd_score   SMALLINT CHECK (crowd_score BETWEEN 0 AND 100),
    source        VARCHAR(64) DEFAULT 'user_report',
    sample_size   INTEGER DEFAULT 1,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_hist_crowd_place ON historical_crowd(place_name, city);
  CREATE INDEX IF NOT EXISTS idx_hist_crowd_time  ON historical_crowd(observed_at);

  -- Gemini / AI usage for cost dashboards
  CREATE TABLE IF NOT EXISTS gemini_usage (
    id          SERIAL PRIMARY KEY,
    endpoint    VARCHAR(255),
    model       VARCHAR(100),
    tokens_in   INTEGER DEFAULT 0,
    tokens_out  INTEGER DEFAULT 0,
    latency_ms  INTEGER,
    success     BOOLEAN DEFAULT true,
    cached      BOOLEAN DEFAULT false,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_gemini_usage_time ON gemini_usage(created_at);

  -- Online ML model weight store (crowd logistic, preference, etc.)
  CREATE TABLE IF NOT EXISTS audit_log (
    id          SERIAL PRIMARY KEY,
    action      VARCHAR(128) NOT NULL,
    actor       VARCHAR(255),
    resource    VARCHAR(255),
    outcome     VARCHAR(64),
    meta_json   TEXT,
    ip          VARCHAR(45),
    request_id  VARCHAR(64),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

  CREATE TABLE IF NOT EXISTS ml_model_weights (
    model_key    VARCHAR(64) PRIMARY KEY,
    weights_json TEXT NOT NULL,
    trained_n    INTEGER DEFAULT 0,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

module.exports = { SCHEMA_SQL };
