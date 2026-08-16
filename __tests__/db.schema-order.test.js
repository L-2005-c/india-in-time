const { SCHEMA_SQL } = require('../db/schema');

test('AI cache expiry index is created only after the column repair', () => {
  const alterAt = SCHEMA_SQL.indexOf('ALTER TABLE ai_cache ADD COLUMN IF NOT EXISTS expires_at');
  const indexAt = SCHEMA_SQL.indexOf('CREATE INDEX IF NOT EXISTS idx_ai_cache_expires');
  expect(alterAt).toBeGreaterThan(-1);
  expect(indexAt).toBeGreaterThan(-1);
  expect(indexAt).toBeGreaterThan(alterAt);
});
