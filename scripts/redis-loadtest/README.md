# Redis distributed-load validation

These scripts test the Redis-backed rate limiter and cache against a
**real Redis instance** — not a mocked `ioredis` client. The jest test
suite (`__tests__/middleware.rateLimiter.redis.test.js`,
`__tests__/services.cache.test.js`) covers the logic against a mock, which
proves the code is *correct in isolation* but can't catch race conditions
that only show up with real concurrent I/O across real separate processes.
These scripts close that gap.

## Requirements

A reachable Redis instance. Locally:

```
apt-get install redis-server   # or brew install redis, docker run redis, etc.
redis-server --daemonize yes
```

Then set `REDIS_URL` (defaults to `redis://127.0.0.1:6379` if unset) and run:

```bash
npm run loadtest:redis-ratelimit   # cross-process rate limit correctness
npm run loadtest:redis-failopen    # fails open when Redis is unreachable
npm run loadtest:redis-cache       # write-through + cross-process warm
```

## What each one proves

- **`run.js`** — spawns 4 real, separate Node processes (real PIDs, real
  ports), all pointed at the same Redis instance, and fires 300 real
  concurrent HTTP requests at them simultaneously from one client. Asserts
  that exactly the configured limit gets through — i.e. the shared
  `INCR`/`PEXPIRE` counter in `middleware/rateLimiter.js` is atomic across
  real process boundaries, not just within one process's event loop.

- **`fail-open-check.js`** — points a real worker at a genuinely
  unreachable Redis (connection refused, not a simulated error) and
  confirms requests are still served rather than the API going down.

- **`cache-check.js`** — two separate `LRUCache` instances with two
  separate real `ioredis` connections (simulating two worker processes)
  confirm the write-through-on-`set()` and warm-from-Redis-on-miss
  behavior in `services/cache.js` actually round-trips through real Redis.

## What this does NOT prove

All of the above runs against a local Redis over loopback. It validates
cross-process correctness, not:

- Behavior against a real hosted/managed Redis (Render's add-on, Upstash,
  etc.) over real WAN network latency
- Behavior under production-scale traffic volume or sustained load over
  time (connection pool exhaustion, memory growth, etc.)

Before raising `CLUSTER_WORKERS` above 1 in production, it's worth
re-running `loadtest:redis-ratelimit` with `REDIS_URL` pointed at the
actual staging/production Redis instance, from a machine with realistic
network latency to it — that's the one gap only real infrastructure can
close.
