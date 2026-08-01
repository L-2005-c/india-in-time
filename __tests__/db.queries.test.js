// __tests__/db.queries.test.js
// db/queries.js previously had 0% test coverage — every function here routes
// through getDb() (see db/init.js), so we mock that module's pool and assert
// on the SQL/params each function sends, plus the shape of what it returns.
// This does not require a live Postgres connection.

jest.mock('../db/init', () => ({
  getDb: jest.fn(),
}));

const { getDb } = require('../db/init');
const queries = require('../db/queries');

function mockPool(queryImpl) {
  const pool = { query: jest.fn(queryImpl) };
  getDb.mockReturnValue(pool);
  return pool;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('db/queries — trips', () => {
  test('saveTrip inserts with correct params, defaulting userId to null', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    await queries.saveTrip({
      id: 'trip1', userId: undefined, city: 'Jaipur',
      cityLat: 26.9, cityLon: 75.8, configJson: '{}', stopsJson: '[]',
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO trips/);
    expect(params).toEqual(['trip1', null, 'Jaipur', 26.9, 75.8, '{}', '[]']);
  });

  test('getUserTrips returns rows and defaults limit to 50', async () => {
    const fakeRows = [{ id: 't1' }, { id: 't2' }];
    const pool = mockPool(async () => ({ rows: fakeRows }));
    const result = await queries.getUserTrips('user1');
    expect(result).toBe(fakeRows);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM trips/);
    expect(params).toEqual(['user1', 50]);
  });

  test('getTripById returns null when no row found', async () => {
    mockPool(async () => ({ rows: [] }));
    const result = await queries.getTripById('missing');
    expect(result).toBeNull();
  });

  test('getTripById returns the row when found', async () => {
    const row = { id: 'trip1', city: 'Goa' };
    mockPool(async () => ({ rows: [row] }));
    const result = await queries.getTripById('trip1');
    expect(result).toEqual(row);
  });

  test('deleteTrip scopes the delete to id AND user_id (prevents cross-user deletion)', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    await queries.deleteTrip('trip1', 'user1');
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM trips WHERE id = \$1 AND user_id = \$2/);
    expect(params).toEqual(['trip1', 'user1']);
  });
});

describe('db/queries — favorites', () => {
  test('addFavorite passes nulls for optional fields, not undefined', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    await queries.addFavorite({ userId: 'u1', placeName: 'Hawa Mahal', city: 'Jaipur' });
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(['u1', 'Hawa Mahal', 'Jaipur', null, null, null, null]);
  });

  test('isFavorite returns true when a row exists, false when it does not', async () => {
    mockPool(async () => ({ rows: [{ '?column?': 1 }] }));
    expect(await queries.isFavorite('u1', 'Hawa Mahal', 'Jaipur')).toBe(true);

    mockPool(async () => ({ rows: [] }));
    expect(await queries.isFavorite('u1', 'Nowhere', 'Nowhere')).toBe(false);
  });

  test('removeFavorite scopes deletion to the owning user', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    await queries.removeFavorite(42, 'u1');
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM favorites WHERE id = \$1 AND user_id = \$2/);
    expect(params).toEqual([42, 'u1']);
  });
});

describe('db/queries — place cache', () => {
  test('getCachedPlaces returns null when nothing cached', async () => {
    mockPool(async () => ({ rows: [] }));
    expect(await queries.getCachedPlaces('key1')).toBeNull();
  });

  test('getCachedPlaces parses and returns the stored JSON payload', async () => {
    mockPool(async () => ({ rows: [{ payload_json: JSON.stringify({ places: ['A', 'B'] }) }] }));
    const result = await queries.getCachedPlaces('key1');
    expect(result).toEqual({ places: ['A', 'B'] });
  });

  test('getCachedPlaces returns null (not throw) on corrupt JSON', async () => {
    mockPool(async () => ({ rows: [{ payload_json: '{not valid json' }] }));
    const result = await queries.getCachedPlaces('key1');
    expect(result).toBeNull();
  });

  test('setCachedPlaces serializes the payload and upserts', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    await queries.setCachedPlaces('key1', { a: 1 }, 60000);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO place_cache/);
    expect(sql).toMatch(/ON CONFLICT \(cache_key\) DO UPDATE/);
    expect(params[0]).toBe('key1');
    expect(params[1]).toBe(JSON.stringify({ a: 1 }));
  });

  test('purgeExpiredCache returns the deleted row count', async () => {
    mockPool(async () => ({ rowCount: 7 }));
    const result = await queries.purgeExpiredCache();
    expect(result).toBe(7);
  });
});

describe('db/queries — ai cache', () => {
  test('getCachedAiResponse returns null when no cached response exists', async () => {
    mockPool(async () => ({ rows: [] }));
    expect(await queries.getCachedAiResponse('hash1')).toBeNull();
  });

  test('getCachedAiResponse returns the cached text when present', async () => {
    mockPool(async () => ({ rows: [{ response_txt: 'Visit the fort at sunrise.' }] }));
    expect(await queries.getCachedAiResponse('hash1')).toBe('Visit the fort at sunrise.');
  });
});

describe('db/queries — feedback', () => {
  test('submitPlaceFeedback normalizes undefined accurate/comment to null', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    await queries.submitPlaceFeedback({
      userId: 'u1', placeName: 'Hawa Mahal', city: 'Jaipur', rating: 5,
    });
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(['u1', 'Hawa Mahal', 'Jaipur', 5, null, null]);
  });

  test('getPlaceFeedbackSummary falls back to a zeroed summary when no rows returned', async () => {
    mockPool(async () => ({ rows: [] }));
    const result = await queries.getPlaceFeedbackSummary('Hawa Mahal', 'Jaipur');
    expect(result).toEqual({ count: 0, avg_rating: null, accurate_count: 0, inaccurate_count: 0 });
  });

  test('submitAppFeedback defaults category to "general"', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    await queries.submitAppFeedback({ rating: 4, message: 'Great app!' });
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([null, 4, 'general', 'Great app!', null, null]);
  });

  test('getAppFeedbackSummary merges summary row with recent list', async () => {
    const pool = mockPool(jest.fn()
      .mockResolvedValueOnce({ rows: [{ count: 3, avg_rating: 4.5 }] })
      .mockResolvedValueOnce({ rows: [{ rating: 5, category: 'general' }] }));
    const result = await queries.getAppFeedbackSummary();
    expect(result).toEqual({ count: 3, avg_rating: 4.5, recent: [{ rating: 5, category: 'general' }] });
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});

describe('db/queries — analytics buffering', () => {
  // logApiUsage() starts a real setInterval(flushAnalyticsBuffer, 2000) the
  // first time it's called, and — unlike middleware/rateLimiter.js's own
  // cleanup interval, which calls .unref() specifically so it can't keep the
  // process alive — this one does not call .unref(). That's harmless in
  // production (the process calls process.exit() on shutdown regardless),
  // but it does mean a real timer keeps ticking after these tests, so we use
  // fake timers here to keep the test process from hanging on an interval
  // it never asked for.
  beforeAll(() => {
    jest.useFakeTimers();
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  test('flushAnalyticsBuffer is a safe no-op when the buffer is empty', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    await queries.flushAnalyticsBuffer();
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('logApiUsage buffers a row, and flushAnalyticsBuffer writes it inside a transaction', async () => {
    const client = {
      query: jest.fn(async () => ({})),
      release: jest.fn(),
    };
    const pool = mockPool(async () => ({ rows: [] }));
    pool.connect = jest.fn(async () => client);

    queries.logApiUsage({
      endpoint: '/api/places', method: 'GET', ip: '1.2.3.4',
      userAgent: 'jest', statusCode: 200, responseMs: 42, requestId: 'req1',
    });
    await queries.flushAnalyticsBuffer();

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
    // BEGIN + 1 insert + COMMIT = 3 calls
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  test('flushAnalyticsBuffer rolls back and does not throw if an insert fails mid-batch', async () => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
        throw new Error('insert failed');
      }),
      release: jest.fn(),
    };
    const pool = mockPool(async () => ({ rows: [] }));
    pool.connect = jest.fn(async () => client);

    queries.logApiUsage({ endpoint: '/api/x', method: 'GET', statusCode: 500, responseMs: 1 });
    await expect(queries.flushAnalyticsBuffer()).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
