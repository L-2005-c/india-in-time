exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_user_id_place_name_city_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_active_unique
      ON favorites(user_id, place_name, city) WHERE deleted_at IS NULL;

    ALTER TABLE ai_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
    UPDATE ai_cache SET expires_at = created_at + INTERVAL '10 minutes' WHERE expires_at IS NULL;
    ALTER TABLE ai_cache ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes');
    ALTER TABLE ai_cache ALTER COLUMN expires_at SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);

    CREATE INDEX IF NOT EXISTS idx_trips_user_updated ON trips(user_id, updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_favorites_user_added ON favorites(user_id, added_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint_time ON api_usage(endpoint, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_api_usage_endpoint_time;
    DROP INDEX IF EXISTS idx_favorites_user_added;
    DROP INDEX IF EXISTS idx_trips_user_updated;
    DROP INDEX IF EXISTS idx_ai_cache_expires;
    ALTER TABLE ai_cache DROP COLUMN IF EXISTS expires_at;
    DROP INDEX IF EXISTS idx_favorites_active_unique;
  `);
};
