# India In-Time

A travel-planning app for exploring India — AI-generated itineraries, real-time
"open now / crowd level / golden hour" place intelligence, live navigation,
weather-aware trip stops, and offline-friendly PWA support.

**Stack:** Node.js/Express backend · PostgreSQL (Neon) · Firebase Auth ·
Google Gemini AI · vanilla JS/HTML/CSS frontend (no framework/build step) ·
Leaflet for maps.

---

## Quick start (local development)

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in the required values
cp .env.example .env
# At minimum you need: DATABASE_URL (Neon Postgres), GEMINI_API_KEY,
# FIREBASE_SERVICE_ACCOUNT. See .env.example for details on each.

# 3. Run the dev server (auto-restarts on file changes)
npm run dev

# App will be at http://localhost:3000
```

### Running tests

```bash
npm test              # run the full test suite once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

### Linting

```bash
npm run lint          # check
npm run lint:fix      # auto-fix what's fixable
```

---

## Project structure

```
├── server.js              # Entry point — clustering, middleware wiring, graceful shutdown
├── config/index.js         # Centralized, validated environment config (fail-fast on missing vars)
├── routes/                 # One file per API resource (trips, places, ai, weather, ...)
├── middleware/              # auth, adminAuth, rateLimiter, validator, errorHandler, requestLogger
├── services/                # gemini.js (AI), placesDiscovery.js, timeIntelligence.js, cache.js
├── db/                      # init.js (schema/migrations-on-boot), queries.js (all parameterized SQL)
├── utils/                   # sanitize.js, geo.js, placesMerge.js — pure, unit-tested helpers
├── data/                    # Static seed data + the time-intelligence rules engine's rule set
├── frontend/public/         # Static frontend: index.html, app.js, styles.css, service worker, PWA manifest
├── scripts/backup-db.js     # DB backup utility
└── __tests__/                # Jest test suite (backend)
```

## Deployment

Two deployment targets are configured:

- **Render** (`render.yaml`) — long-running Node process. This is the target the
  clustering, in-memory/Redis rate limiting, and Gemini circuit breaker are
  actually designed for (see comments in `server.js` and
  `middleware/rateLimiter.js`).
- **Vercel** (`vercel.json`) — serverless. ⚠️ Note: serverless functions don't
  persist process state between invocations, so the in-memory rate limiter,
  clustering, and circuit-breaker state **do not carry the same guarantees**
  on Vercel as they do on Render. If you're deploying to Vercel, treat those
  protections as best-effort only, or set `REDIS_URL` so rate limiting is
  backed by a real shared store instead of in-memory state.

A `Dockerfile` is also provided (multi-stage, non-root user, built-in
healthcheck) if you'd rather run this anywhere else that speaks Docker.

### Required environment variables

See `.env.example` for the full list with explanations. The app will refuse
to boot in production if these are missing:

- `DATABASE_URL` — Neon Postgres connection string (use the **pooled**
  connection string, not the direct one)
- `GEMINI_API_KEY` — Google Gemini API key
- `FIREBASE_SERVICE_ACCOUNT` — Firebase service account JSON, used to verify
  user auth tokens server-side (see `FIREBASE_SETUP.txt` for how to generate
  this)
- `CORS_ORIGIN` — your real frontend origin. The app will **hard-fail to
  boot in production** if this is left as the default wildcard (`*`), unless
  you explicitly set `CORS_ALLOW_WILDCARD=true`.

## Additional setup guides

- `FIREBASE_SETUP.txt` — one-time Firebase project + Google Sign-In setup
- `frontend/public/ANDROID_APK_GUIDE.txt` — packaging the PWA as an Android APK

## Architecture notes worth knowing before you change things

- **Rate limiting is per-worker in-memory by default.** `server.js` deliberately
  caps `CLUSTER_WORKERS` to 1 until `REDIS_URL` is set, specifically to avoid
  silently splitting rate limits across workers. Don't raise
  `CLUSTER_WORKERS` without also setting `REDIS_URL`.
- **Every SQL query is parameterized** (`db/queries.js`) — keep it that way;
  never string-interpolate values into a query.
- **`req.uid`, not `req.body.userId`, is the trusted user identity** for
  anything that reads/writes user-specific data — see `middleware/auth.js`.
- **AI-facing input is sanitized in `middleware/validator.js`** before it
  reaches Gemini — this exists specifically to prevent prompt injection and
  unbounded-cost payloads. Any new field that ends up in a Gemini prompt
  needs the same treatment.
- **The frontend renders some content via `innerHTML`.** `addMsg()` and
  `showToast()` in `frontend/public/app.js` now run everything through
  `sanitizeChatHtml()` (DOMPurify-backed) before it reaches the DOM — if you
  add a new function that builds HTML strings for insertion, sanitize
  user/API-derived values the same way rather than interpolating them raw.

## Known gaps / in-progress hardening

This project underwent an external technical audit; the following were
identified and are being worked through (see CI status and open issues for
current state):

- [x] Automated test suite (Jest) — `__tests__/`
- [x] CI pipeline — `.github/workflows/ci.yml`
- [x] Dependency vulnerability scanning — `.github/dependabot.yml`
- [x] Reflected/stored XSS in chat rendering and saved-plan names
- [x] Production boot no longer silently allows wildcard CORS
- [ ] Frontend modularization (`app.js` is currently a single large file)
- [ ] Formal DB migration tooling (schema currently applies via
      `CREATE TABLE IF NOT EXISTS` at boot — fine for additive changes, no
      safe path for altering/renaming existing columns)
- [ ] Admin access is a single shared secret (`ADMIN_FEEDBACK_KEY`) rather
      than per-admin roles/audit trail
- [ ] Structured logging / error tracking (currently `console.log` only)
- [ ] Reconcile the Render vs. Vercel deployment story (see Deployment
      section above)
