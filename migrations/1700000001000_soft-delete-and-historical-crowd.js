// Adds soft-delete columns and historical_crowd observations table.
// Safe on databases that already have the baseline schema (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    ALTER TABLE favorites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

    CREATE INDEX IF NOT EXISTS idx_trips_deleted ON trips(deleted_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_fav_deleted   ON favorites(deleted_at) WHERE deleted_at IS NULL;

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
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS historical_crowd;
    DROP INDEX IF EXISTS idx_trips_deleted;
    DROP INDEX IF EXISTS idx_fav_deleted;
    ALTER TABLE trips DROP COLUMN IF EXISTS deleted_at;
    ALTER TABLE favorites DROP COLUMN IF EXISTS deleted_at;
  `);
};
