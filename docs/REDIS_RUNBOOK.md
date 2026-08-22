# Redis Operations & Staging Validation Runbook

## Overview
This runbook provides step-by-step procedures for validating Redis connectivity, cache fail-open resilience, and network latency tolerances in Staging and Production environments for India In-Time.

---

## 1. Environment Configuration

The backend supports both standard standalone Redis (`redis://`) and TLS-encrypted Redis (`rediss://`, required for Google Cloud Memorystore with in-transit encryption, AWS ElastiCache, or Upstash):

```bash
# Example Staging / Production Redis URL (TLS enabled)
REDIS_URL="rediss://default:secrettoken@staging-redis.domain.internal:6380"
```

When `REDIS_URL` is omitted or unset, the system gracefully falls back to in-memory Least-Recently-Used (LRU) local caching with structured logging:
```
[cache] REDIS_URL not set — per-process in-memory caching only (no cross-instance sharing).
```

---

## 2. Pre-Deployment Staging Validation Steps

### Step 1: Validate Fail-Open Behavior
Simulates complete Redis outage or network partition to verify the service degrades gracefully to local memory without crashing or returning 500s.

```bash
# Run fail-open verification test (forces unreachable Redis port 65530)
node scripts/redis-loadtest/fail-open-check.js
```
**Expected Outcome**: 10/10 requests return `200 OK`, warning logged, zero unhandled rejections.

### Step 2: Validate Caching & Polling Under Latency
Validates write-through caching, hit-ratio tracking, and TTL eviction with adaptive polling loops (`pollUntil` instead of static sleeps):

```bash
# Run cache check with target Redis instance
REDIS_URL="redis://localhost:6379" node scripts/redis-loadtest/cache-check.js
```

### Step 3: Run High-Concurrency Load Simulation
Simulates concurrent traffic load across Redis with simulated network jitter (15ms ± 10ms):

```bash
REDIS_URL="redis://localhost:6379" node scripts/redis-loadtest/run.js
```

---

## 3. Troubleshooting & Recovery

| Symptom | Probable Cause | Action |
| :--- | :--- | :--- |
| `[rateLimiter] Redis unavailable; using local fallback` | Redis connection timed out or socket refused | Verify network security groups/firewall rules allowing port 6379/6380. Check if `REDIS_URL` uses `rediss://` for TLS endpoints. |
| Memory spike on node process | In-memory cache fallback holding high cardinality keys | Verify `CACHE_MAX_KEYS` and `TTL` settings in `services/cache.js`. |
| High p99 latencies on cache hits | Redis CPU throttling or single-thread saturation | Check Redis instance slowlog (`SLOWLOG GET 10`) and consider scaling cluster or read replicas. |
