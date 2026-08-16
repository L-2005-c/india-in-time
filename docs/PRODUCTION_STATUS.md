# Current Production Status

## Repository-level hardening

The repository implements production-hardening controls including strict CSP, no executable inline event attributes in the production frontend source, production frontend fail-closed behavior, Redis-backed distributed rate limiting, PostgreSQL TLS validation, backup verification/restore tooling, AI provider failover, routing-source semantics, time-window intelligence, and projected-arrival itinerary scoring.

## Verification boundary

Repository-level static checks can be executed here. Full dependency-backed Jest/lint/build/audit, staging Redis/PostgreSQL failure injection, browser E2E, capacity/load tests, backup restore drills, and live provider behavior require a clean CI/staging environment.

No status document should claim those checks passed unless their command output is retained as CI/staging evidence.

## Required pre-production evidence

- clean `npm ci`
- `npm run lint`
- `npm test`
- `npm run test:ci`
- `npm run build:frontend`
- `npm run check:bundle`
- `npm run check:production`
- `npm run security:audit`
- `npm run security:audit:prod`
- inline-handler assertion
- browser E2E on desktop and mobile
- networked Redis concurrency/failure tests
- PostgreSQL migration + backup/restore drill
- load test at expected peak concurrency
- monitoring/alert verification
