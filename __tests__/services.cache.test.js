// __tests__/services.cache.test.js
// services/cache.js had 0% test coverage before this. Covers the core
// LRUCache (get/set/TTL/eviction/stats — this is what every route and
// service in the app relies on for caching) plus the new optional
// Redis-backed write-through/warm-on-miss layer added to close the
// "in-memory only, unlike the rate limiter" gap.

const { LRUCache } = require('../services/cache');

describe('LRUCache — core behavior (no Redis)', () => {
  test('set then get returns the stored value', () => {
    const cache = new LRUCache({ name: 'test' });
    cache.set('a', 'hello');
    expect(cache.get('a')).toBe('hello');
  });

  test('get on a missing key returns undefined and counts as a miss', () => {
    const cache = new LRUCache({ name: 'test' });
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.getStats().misses).toBe(1);
  });

  test('an entry expires after its TTL', () => {
    const cache = new LRUCache({ name: 'test', defaultTtlMs: 10 });
    cache.set('a', 'value');
    expect(cache.get('a')).toBe('value');
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(cache.get('a')).toBeUndefined();
        resolve();
      }, 20);
    });
  });

  test('a per-entry TTL overrides the default', () => {
    const cache = new LRUCache({ name: 'test', defaultTtlMs: 100000 });
    cache.set('a', 'value', 10);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(cache.get('a')).toBeUndefined();
        resolve();
      }, 20);
    });
  });

  test('evicts the least-recently-used entry once maxEntries is exceeded', () => {
    const cache = new LRUCache({ name: 'test', maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // touch 'a' so 'b' becomes the LRU one
    cache.set('c', 3); // should evict 'b', not 'a'
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.getStats().evictions).toBe(1);
  });

  test('has() checks existence without affecting LRU order or hit/miss stats', () => {
    const cache = new LRUCache({ name: 'test' });
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('missing')).toBe(false);
    expect(cache.getStats().hits).toBe(0);
    expect(cache.getStats().misses).toBe(0);
  });

  test('delete removes an entry', () => {
    const cache = new LRUCache({ name: 'test' });
    cache.set('a', 1);
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
  });

  test('clear empties the whole cache', () => {
    const cache = new LRUCache({ name: 'test' });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  test('purgeExpired removes only expired entries and returns the count removed', () => {
    const cache = new LRUCache({ name: 'test' });
    cache.set('fresh', 1, 100000);
    cache.set('stale', 2, -1); // already expired
    const purged = cache.purgeExpired();
    expect(purged).toBe(1);
    expect(cache.get('fresh')).toBe(1);
  });

  test('getStats reports an accurate hit rate', () => {
    const cache = new LRUCache({ name: 'test' });
    cache.set('a', 1);
    cache.get('a'); // hit
    cache.get('a'); // hit
    cache.get('missing'); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe('66.7%');
  });

  test('resetStats zeroes counters without touching stored data', () => {
    const cache = new LRUCache({ name: 'test' });
    cache.set('a', 1);
    cache.get('a');
    cache.resetStats();
    expect(cache.getStats().hits).toBe(0);
    expect(cache.get('a')).toBe(1); // data untouched
  });
});

describe('LRUCache — Redis-backed layer', () => {
  function mockRedis() {
    return {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
  }

  test('set() stays synchronous and succeeds locally even though the Redis write is fire-and-forget', () => {
    const redis = mockRedis();
    const cache = new LRUCache({ name: 'test', redis });
    cache.set('a', { hello: 'world' });
    // No await anywhere above — if set() were accidentally async this
    // would still be undefined right here.
    expect(cache.get('a')).toEqual({ hello: 'world' });
  });

  test('set() writes through to Redis with a JSON payload and a TTL in seconds', () => {
    const redis = mockRedis();
    const cache = new LRUCache({ name: 'places', redis, defaultTtlMs: 5000 });
    cache.set('jaipur', { city: 'Jaipur' });
    expect(redis.set).toHaveBeenCalledWith(
      'cache:places:jaipur',
      expect.any(String),
      'EX',
      5 // 5000ms -> 5s
    );
    const written = JSON.parse(redis.set.mock.calls[0][1]);
    expect(written.value).toEqual({ city: 'Jaipur' });
  });

  test('a local miss triggers a background Redis lookup that warms the cache for the NEXT get(), not the current one', async () => {
    const redis = mockRedis();
    redis.get.mockResolvedValue(JSON.stringify({ value: 'from redis', expiresAt: Date.now() + 60000 }));
    const cache = new LRUCache({ name: 'test', redis });

    const firstResult = cache.get('a'); // local miss — still returns undefined synchronously
    expect(firstResult).toBeUndefined();

    await new Promise(setImmediate); // let the background Redis lookup resolve
    expect(cache.get('a')).toBe('from redis'); // now warmed locally
  });

  test('does not warm from an already-expired Redis entry', async () => {
    const redis = mockRedis();
    redis.get.mockResolvedValue(JSON.stringify({ value: 'stale', expiresAt: Date.now() - 1000 }));
    const cache = new LRUCache({ name: 'test', redis });

    cache.get('a');
    await new Promise(setImmediate);
    expect(cache.get('a')).toBeUndefined();
  });

  test('a Redis error on get() never throws and leaves the cache behaving as a normal miss', async () => {
    const redis = mockRedis();
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const cache = new LRUCache({ name: 'test', redis });

    expect(() => cache.get('a')).not.toThrow();
    await new Promise(setImmediate);
    expect(cache.get('a')).toBeUndefined(); // still just a miss, nothing corrupted
  });

  test('a Redis error on set() never throws and the local write still succeeds', async () => {
    const redis = mockRedis();
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const cache = new LRUCache({ name: 'test', redis });

    expect(() => cache.set('a', 'value')).not.toThrow();
    expect(cache.get('a')).toBe('value');
    await new Promise(setImmediate); // let the rejected promise settle so it doesn't leak into another test
  });

  test('delete() also issues a fire-and-forget Redis DEL', () => {
    const redis = mockRedis();
    const cache = new LRUCache({ name: 'places', redis });
    cache.set('a', 1);
    cache.delete('a');
    expect(redis.del).toHaveBeenCalledWith('cache:places:a');
  });

  test('cache keys are namespaced per cache instance name, so two caches never collide in Redis', () => {
    const redis = mockRedis();
    const placesCache = new LRUCache({ name: 'places', redis });
    const geminiCache = new LRUCache({ name: 'gemini', redis });
    placesCache.set('same-key', 'places-value');
    geminiCache.set('same-key', 'gemini-value');
    const keysUsed = redis.set.mock.calls.map(c => c[0]);
    expect(keysUsed).toEqual(['cache:places:same-key', 'cache:gemini:same-key']);
  });

  test('without a redis instance passed in, behavior is unchanged from before (no Redis calls attempted)', () => {
    const cache = new LRUCache({ name: 'test' }); // no redis option — mirrors every existing call site today
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    cache.get('missing'); // must not throw trying to call redis.get on null
    expect(cache.get('missing')).toBeUndefined();
  });
});
