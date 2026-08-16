# Production scaling and acceptance

The application is designed to scale horizontally, but capacity is an infrastructure property, not a source-code guarantee.

## Required production architecture

- PostgreSQL: pooled connection endpoint; one bounded pool per application process.
- Redis: mandatory in production for distributed rate limiting and shared cache state.
- Multiple API instances: scale horizontally rather than increasing `CLUSTER_WORKERS` aggressively.
- Gemini: configure a secondary project/key only for independent quota protection; a second key does not protect against a provider-wide outage.
- CDN/object storage: serve static frontend assets from an edge/CDN once traffic justifies it.
- Provider-managed PostgreSQL PITR/backups: required in addition to `npm run backup`.

## Staging acceptance test

1. Deploy the exact production artifact to staging.
2. Configure production-like PostgreSQL and Redis.
3. Run `LOADTEST_URL=https://staging.example.com LOADTEST_DURATION_SEC=120 LOADTEST_CONCURRENCY=50 npm run loadtest:smoke`.
4. Require <1% health request error rate and p95 <1s for the health endpoint.
5. Run the full Jest suite, frontend build, dependency audit, and Docker build in clean CI.
6. Exercise Redis outage, PostgreSQL failover, Gemini timeout/429/5xx, and graceful deploy termination.
7. Verify backups with `npm run backup:verify -- backups/<backup-folder>`.

The application must not be declared “large-user production ready” until those tests pass on the actual deployment stack.
