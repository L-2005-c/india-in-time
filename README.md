# India In-Time

India In-Time is a full-stack GeoAI-powered travel-intelligence platform.

## Architecture

- Frontend: Vite + native ES modules/PWA under `frontend/app-src`
- Backend: Node.js + Express
- Database: PostgreSQL + migrations
- Cache/rate limiting: Redis
- Authentication: Firebase Authentication
- AI: Gemini primary, optional OpenAI secondary provider
- Routing: operator-managed/Google traffic-aware provider when configured, OSRM route estimates, deterministic fallback
- Travel Intelligence: deterministic time/weather/crowd/scenic/opening/scoring engines
- Deployment: Docker / Render / Vercel-compatible build outputs, with production frontend fail-closed

## Important data semantics

The application distinguishes:
- `live_traffic` — traffic-aware provider data
- `route_estimate` — route duration without live traffic
- `estimated` / `heuristic` — deterministic local estimates
- `observed`, `forecast`, `predicted`, `estimated`, `unavailable` for other intelligence signals

Gemini is not used as a substitute for deterministic routing, time, weather, crowd, or geospatial calculations. It is used for explanation, summarization, personalization, and conversational assistance.

## Development

```bash
npm ci
npm run migrate:up
npm start
```

Frontend development:

```bash
npm run dev:frontend
```

## Production build

Production requires a healthy Vite bundle under `frontend/public/dist`.

```bash
npm run build:frontend
npm run check:inline-handlers
npm run check:bundle
npm run check:production
npm run security:audit
npm run security:audit:prod
npm test
npm run test:ci
```

The server refuses to silently serve the legacy source frontend when `NODE_ENV=production` and the production bundle is missing or unhealthy.

## Acceptance tooling

```bash
npm run test:smoke
npm run test:failover
npm run loadtest:smoke
npm run backup:verify
npm run backup:restore-verify
```

Real networked Redis/PostgreSQL load, failover, restore, monitoring, and provider behavior must be executed in staging before approving live traffic.

## Documentation

Current production documentation lives under `docs/`.

Historical audit material is preserved under `docs/archive/` and must not be treated as current verified state.
