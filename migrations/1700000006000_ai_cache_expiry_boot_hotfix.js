exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE ai_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
    UPDATE ai_cache
       SET expires_at = created_at + INTERVAL '10 minutes'
     WHERE expires_at IS NULL;
    ALTER TABLE ai_cache
      ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes');
    ALTER TABLE ai_cache ALTER COLUMN expires_at SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_ai_cache_expires;`);
};
