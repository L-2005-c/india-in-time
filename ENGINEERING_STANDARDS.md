# Engineering Standards — India In-Time v3.0

Toward FAANG-style practice (honest: process + code, not years of scale).

## Architecture
- Backend: modular services (`travelIntelligence/*`), middleware, routes
- Frontend: Vite `app-src` with `modules/`, `utils/`, `state/`, `a11y/`; pure TI in `experience-score.js`
- Gradual migration: `window.__experienceScore` / `window.__modules`

## Reliability
- SLO targets: 99.9% availability, p99 < 2s (rolling 1h) — `lib/slo.js`, `GET /api/slo`
- Health: `/api/health`, `/api/ready`
- Graceful shutdown, unhandledRejection logging
- HA: `lib/multiRegion.js`, Redis for multi-instance

## Observability
- Structured logs + request IDs
- Optional OpenTelemetry (`lib/tracing.js`)
- APM: Sentry and/or webhook (`lib/apm.js`)
- Prometheus metrics: `/api/metrics` (admin)

## CI / quality gates
- Lint + tests on Node 20 & 22
- Frontend modular file presence + Vite build
- `npm audit --audit-level=high` **blocking**
- Docker image build

## Security
- See `SECURITY_AUDIT.md`
- Pre-deploy: `npm run check:production`

## Testing
- Backend Jest suite (500+ tests)
- Pure frontend logic unit-tested via CJS mirrors
- E2E smoke scaffold under `__tests__/e2e`

## What this is not
- Not a multi-year production track record
- Not a fully decomposed design-system frontend
- Not a certified external pen-test
