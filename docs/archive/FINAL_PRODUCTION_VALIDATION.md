> **ARCHIVED** — superseded by [STATUS.md](../STATUS.md), do not treat as current.

# Final Production-Hardening Validation

## Verified in this environment

- `npm ci --dry-run --ignore-scripts --no-audit --no-fund`: **PASS** (lockfile/package consistency; 821 packages resolved).
- JavaScript syntax check: **173 files, 0 failures**.
- `package.json` and `package-lock.json` JSON parsing: **PASS**.
- Production hardening invariants: **PASS**.
- Inline executable event-handler assertion: **PASS**, no violations across frontend source trees.
- Production config import safety: **PASS** — production-mode configuration throws a normal validation error instead of killing the importing process with `process.exit()`.
- CI workflow YAML parsing: **PASS**.
- E2E/accessibility/performance tooling is wired into CI using pinned CI-only Playwright/axe installs.
- Staging acceptance now executes the frontend production build, browser E2E, accessibility, performance, load, failover, backup verification and isolated restore verification.

## Full runtime gates

A real `npm ci` was attempted but the current execution environment returned `EACCES` while modifying the existing `node_modules` tree. Therefore these commands were **not falsely marked as passed here**:

- `npm run lint`
- `npm test`
- `npm run test:ci`
- `npm run build:frontend`
- `npm run security:audit`
- `npm run security:audit:prod`
- live Playwright browser execution
- live networked PostgreSQL/Redis failover
- actual backup restore against a separate staging database
- real load testing against production-equivalent infrastructure

The CI/staging pipeline is configured to execute those gates on every main-branch acceptance run.

## Production decision boundary

The repository now contains the required implementation and automated acceptance gates for the uploaded production-hardening specification. Final approval for real production traffic still depends on successful execution of those environment-dependent gates in the actual staging/CI environment.


## Local Acceptance Stack

This repository includes `docker-compose.acceptance.yml` for deterministic PostgreSQL + Redis integration checks.

Run:

```bash
npm ci
npm run acceptance:local
npm run acceptance:stack
```

The stack is an acceptance harness, not a substitute for managed production infrastructure.

## Production Approval Gate

Real production approval requires the CI/staging environment to execute the complete dependency-backed suite, real PostgreSQL/Redis integration, browser E2E/accessibility, backup restore, load testing, and operational monitoring/alerting checks. Repository code alone cannot certify external-provider SLAs or user capacity.
