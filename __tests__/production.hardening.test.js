const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

describe('production hardening invariants', () => {
  test('favorite uniqueness is active-row based', () => {
    const schema = fs.readFileSync(path.join(root, 'db/schema.js'), 'utf8');
    expect(schema).toContain('idx_favorites_active_unique');
    expect(schema).toContain('WHERE deleted_at IS NULL');
  });

  test('AI cache is time bounded', () => {
    const queries = fs.readFileSync(path.join(root, 'db/queries.js'), 'utf8');
    expect(queries).toContain('expires_at > CURRENT_TIMESTAMP');
  });

  test('live routing is bounded', () => {
    const route = fs.readFileSync(path.join(root, 'routes/time-intelligence.js'), 'utf8');
    expect(route).toContain('mapWithConcurrency');
  });
});
