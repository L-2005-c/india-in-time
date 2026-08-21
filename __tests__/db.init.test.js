// __tests__/db.init.test.js
// db/init.js previously had 0% test coverage. Covers: (1) the DATABASE_URL
// fail-fast check, (2) that initDatabase() actually runs the shared
// SCHEMA_SQL against the pool, (3) getDb()/closeDatabase() lifecycle, and
// (4) the schema-consolidation fix itself — db/init.js and the tracked
// migration must reference the exact same SQL string, not two independently
// maintained copies that could drift apart.

jest.mock('@neondatabase/serverless', () => {
  const mPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    on: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  };
  return {
    Pool: jest.fn(() => mPool),
    neonConfig: {},
  };
});

const { Pool } = require('@neondatabase/serverless');
const { SCHEMA_SQL } = require('../db/schema');
const { initDatabase, getDb, closeDatabase } = require('../db/init');

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://user:pass@ep-test-pooler.neon.tech/db?sslmode=require';
  Pool.mockClear();
});

afterEach(async () => {
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  await closeDatabase(); // reset db/init.js's module-level pool singleton between tests
});

describe('db/init — DATABASE_URL validation', () => {
  test('throws a clear error when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    await expect(initDatabase()).rejects.toThrow('DATABASE_URL environment variable is missing.');
    expect(Pool).not.toHaveBeenCalled();
  });
});

describe('db/init — initDatabase()', () => {
  test('runs the shared SCHEMA_SQL against the pool (not a separately-maintained inline copy)', async () => {
    await initDatabase();
    const pool = Pool.mock.results[0].value;
    expect(pool.query).toHaveBeenCalledWith(SCHEMA_SQL);
  });

  test('getDb() returns the same pool instance after initDatabase()', async () => {
    await initDatabase();
    const pool = Pool.mock.results[0].value;
    expect(getDb()).toBe(pool);
  });

  test('getDb() throws if called before initDatabase()', () => {
    expect(() => getDb()).toThrow('Database pool not initialized');
  });

  test('closeDatabase() ends the pool and getDb() throws again afterward', async () => {
    await initDatabase();
    const pool = Pool.mock.results[0].value;
    await closeDatabase();
    expect(pool.end).toHaveBeenCalled();
    expect(() => getDb()).toThrow('Database pool not initialized');
  });

  test('propagates the underlying error if the schema query itself fails', async () => {
    Pool.mockImplementationOnce(() => ({
      query: jest.fn().mockRejectedValue(new Error('permission denied for schema public')),
      on: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined),
    }));
    await expect(initDatabase()).rejects.toThrow('permission denied for schema public');
  });
});

describe('db/schema — single source of truth', () => {
  test('the tracked migration uses the exact same SCHEMA_SQL string db/init.js does', () => {
    const migration = require('../migrations/1700000000000_baseline-schema.js');
    let capturedSql = null;
    migration.up({ sql: (s) => { capturedSql = s; } });
    expect(capturedSql).toBe(SCHEMA_SQL);
  });

  // Regression guard for a real bug found during the technical audit: on a
  // completely fresh database, `CREATE INDEX ... ON ai_cache(expires_at)`
  // used to run *before* the `ALTER TABLE ai_cache ADD COLUMN expires_at`
  // that creates that column, which made the very first boot / the very
  // first `npm run migrate:up` fail with "column expires_at does not exist"
  // — verified by actually running this SQL against a real Postgres 16
  // instance. This test fails loudly if the statements are ever reordered
  // back to the broken sequence.
  test('ai_cache.expires_at is added before anything indexes it', () => {
    const addColumnIdx = SCHEMA_SQL.indexOf('ALTER TABLE ai_cache ADD COLUMN IF NOT EXISTS expires_at');
    const createIndexIdx = SCHEMA_SQL.indexOf('CREATE INDEX IF NOT EXISTS idx_ai_cache_expires');
    expect(addColumnIdx).toBeGreaterThan(-1);
    expect(createIndexIdx).toBeGreaterThan(-1);
    expect(addColumnIdx).toBeLessThan(createIndexIdx);
  });

  // Regression guard for the other real bug found during the audit: a stray
  // migrations/README.md made node-pg-migrate crash entirely with "Cannot
  // determine numeric prefix for README.md", because it tries to parse every
  // file in the migrations directory as a timestamped migration.
  test('the migrations directory contains only numerically-prefixed migration files', () => {
    const fs = require('fs');
    const path = require('path');
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir);
    for (const file of files) {
      expect(file).toMatch(/^\d+[_-]/);
    }
  });
});
