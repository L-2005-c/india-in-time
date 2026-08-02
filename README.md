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
├── db/                      # schema.js (canonical DDL), init.js (runs it on boot), queries.js (all parameterized SQL)
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
- **Vercel** (`vercel.json`) — serverless. `server.js` now detects Vercel's
  `VERCEL` env var and skips clustering/port-binding entirely in that mode
  (exporting the Express app directly instead) — previously, `cluster.isPrimary`
  is always `true` on a fresh serverless invocation, so the app's routes were
  **never actually registered on Vercel at all**; every request would have
  hit the primary's fork-workers branch instead. That's fixed now, but the
  rate limiter, clustering, and circuit-breaker state still don't persist
  between invocations the way they do on Render — set `REDIS_URL` if you need
  rate limiting to actually hold up on Vercel.

A `Dockerfile` is also provided (multi-stage, non-root user, built-in
healthcheck) if you'd rather run this anywhere else that speaks Docker.

### Frontend production build (optional, not yet wired in automatically)

```bash
npm run build:frontend
```

Minifies `app.js`, `client-api.js`, and `styles.css` into
`frontend/public/dist/` with content-hashed filenames (verified: ~32%
smaller JS, ~17% smaller CSS). This is **not yet referenced by
`index.html`** — wiring it in fully needs a small build step that rewrites
`index.html`'s script/link tags to point at the hashed output in production,
which wasn't done here to avoid further changes to `index.html` without a
way to visually verify the result. Until then this is available tooling,
not an active part of the deploy.

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

- [x] Automated test suite (Jest) — `__tests__/` (357 tests, 33 suites). Also
      closed the remaining coverage gaps on `services/timeIntelligence.js`
      (11.6% → 92.2%) and `services/placesDiscovery.js` (19.4% → 48.1%,
      including its curated-fallback functions — previously skipped because
      they loop with a real 1.1s-per-item delay to respect Nominatim's rate
      limit; now tested in under a second using Jest's modern fake timers
      instead of either waiting 11+ real seconds or removing the delay).
      `services/cache.js` also went from 0% to fully covered. Writing the
      `timeIntelligence` tests surfaced one more real bug: `computeSunTimes`
      given `NaN` lat/lon silently returned the literal string `"NaN:NaN"`
      instead of its own documented `06:00/18:30` fallback, because NaN
      comparisons are always false so the existing safety check never
      caught it — fixed with an explicit `Number.isFinite` guard.
      Previously the core business logic — `db/queries.js`, `db/init.js`,
      `services/gemini.js`, `services/placesDiscovery.js`, and most
      `routes/` — had effectively 0% coverage even though the suite existed;
      middleware/utils were well-covered but the AI/places/DB core wasn't.
      Added coverage for the DB layer (`db/queries.js`, `db/init.js`),
      `services/gemini.js` (circuit breaker, retry, caching, API-key
      redaction), the Wikipedia/Nominatim filtering logic in
      `services/placesDiscovery.js`, and every route handler (`ai`, `places`,
      `trips`, `favorites`, `geocode`, `weather`, `weather-alerts`,
      `analytics`, `feedback`) — including the ownership-scoping and
      userId-trust checks that stop one user from reading/acting on another
      user's data. Writing these tests also surfaced and fixed two real
      bugs: a Wikipedia place-name filter that would have silently dropped
      the Taj Mahal itself (only matched "palace", not "mahal"), and a
      "last resort" fallback in `routes/places.js` that bypassed
      proximity-dedup and could return near-duplicate places under
      different names. `services/placesDiscovery.js`'s curated-fallback
      functions are the one deliberate remaining gap — they loop with a
      hardcoded 1.1s delay per seed to respect Nominatim's rate limit,
      which makes them expensive to test meaningfully; see the test file's
      header comment for the reasoning.
- [x] CI pipeline — `.github/workflows/ci.yml` (lint + test on Node 20.x/22.x,
      dependency audit, Docker build verification, on every push/PR to `main`).
      **Note:** earlier versions of this README marked this done before the
      workflow file actually existed in the repo — an internal audit caught
      the mismatch a second time (the workflow existed by name but only ran
      `node --check`, a syntax check, not lint or the test suite). It's now
      genuinely wired up; the lint and test steps were re-verified by running
      `npm run lint` / `npm test` locally with the exact commands CI uses,
      both passing. The Docker build step's syntax matches the existing
      `Dockerfile` but has **not** been executed end-to-end (no Docker
      daemon available in the environment this fix was made in) — first CI
      run on this branch should be watched to confirm it actually builds.
- [x] Dependency vulnerability scanning — `.github/dependabot.yml` (weekly,
      npm + GitHub Actions ecosystems). Same prior-mismatch note as above —
      this file didn't exist before either; it does now.
- [x] Reflected/stored XSS in chat rendering and saved-plan names
- [x] Production boot no longer silently allows wildcard CORS
- [x] CSP re-enabled with a real allowlist (was fully disabled before)
- [x] DB migration tooling (`node-pg-migrate`) — see `migrations/README.md`.
      **Update:** `db/init.js`'s boot-time bootstrap and the tracked
      migration used to be two independently-maintained copies of the same
      SQL (a real drift risk — nothing stopped them from silently
      diverging). Both now reference one canonical schema definition in
      `db/schema.js`, and `__tests__/db.init.test.js` asserts they still
      match, so drift would fail CI rather than go unnoticed.
- [x] Structured logging (pino) for server lifecycle + Gemini circuit breaker
- [x] Admin RBAC via Firebase custom claims, additive to the legacy shared key
- [x] Legacy admin shared-key comparison is now constant-time
      (`crypto.timingSafeEqual` over a fixed-length digest of each side,
      in `middleware/adminAuth.js`) — previously a plain `!==`, which leaks
      how many leading characters of a guess matched via response timing.
      **Not retired** — removing it outright would be a breaking change for
      any existing caller (e.g. `frontend/public/admin-feedback.html`)
      without a coordinated migration. Instead: every successful legacy-key
      auth logs a `DEPRECATED` warning with the endpoint it hit, so there's
      actual visibility into whether anything still depends on it; and
      `ADMIN_LEGACY_KEY_DISABLED=true` is now a real kill switch — an
      operator can retire the path via config once the logs show nothing
      depends on it, without a code deploy, and flip it back instantly if
      that turns out to be wrong.
- [x] `/api/health/ready` (internal cache stats, Gemini circuit-breaker
      state) is now gated behind the same admin auth as the feedback
      dashboard — previously fully public. `/api/health` (the one actually
      used by Render's/Docker's healthchecks) remains intentionally public
      and minimal
- [x] Vercel serverless clustering bug (routes were never registered on Vercel — see Deployment section)
- [x] Basic accessibility pass: keyboard-operable bottom nav, aria-labels on
      icon-only buttons, aria-hidden on decorative icons (bottom nav, close
      buttons, send button, back-button icons in `index.html`). Also removed
      `maximum-scale=1.0, user-scalable=no` from the viewport meta tag —
      those blocked pinch-to-zoom entirely, a real problem for low-vision
      users and a recognized accessibility anti-pattern regardless of intent.
- [x] Frontend minification tooling (`npm run build:frontend`) — **now wired
      in**: the script also generates `frontend/public/dist/index.html`
      referencing its own content-hashed output, and
      `config.resolveIndexHtmlPath()` serves it automatically in production
      when present (falling back to the unminified source file if the build
      hasn't been run — never a hard failure either way). Source
      `frontend/public/index.html` itself is never modified by the build.
- [x] Added a `.gitignore` — there wasn't one at all before, meaning
      `node_modules` and any `.env` file placed in this directory would have
      been committed. Same prior-mismatch note as CI/dependabot above.
- [x] `npm audit` — the 20 *high*-severity findings in the dev-only
      `jest`/`clean-css-cli` toolchain (transitive `brace-expansion` DoS,
      not previously called out in this README) are fixed via a
      `package.json` `overrides` pin to a patched version, with no
      breaking changes. The 8 *moderate* findings below remain, for the
      reason described there.
- [ ] Frontend modularization (`app.js` is still a single ~4,800-line file).
      Splitting it into modules is still **not** attempted — that's a much
      larger, riskier undertaking than what's below, with no browser/e2e
      test coverage in this environment to catch a subtle breakage.
      **What did get done**, more narrowly: every *static* inline event
      handler in `index.html` (52 `onclick=`, 4 `onkeydown=`, 1 `onchange=`,
      1 `oninput=`) and in `admin-feedback.html` (4 `onclick=`) — **zero
      remain in either file now**, converted to the same `data-action`
      delegation pattern the codebase already used for in-chat widget
      buttons (`CHAT_ACTIONS` → now also `STATIC_ACTIONS`, see the end of
      `frontend/public/app.js`). Deliberately not `eval()`/`new Function()`
      for dispatch — that would need CSP's `'unsafe-eval'`, trading one
      hole for another; it's a real, fixed lookup table of function
      references instead. Verified two ways, since `app.js` can't be
      loaded whole in jsdom (it's an ES module importing live Firebase SDK
      URLs and calling `initializeApp()` at top level): a static test
      parses the *real* HTML and JS files and cross-checks every
      `data-action` value against the *real* dispatch table (catches a
      typo/mismatch with full fidelity to the shipped code), plus a jsdom
      behavioral test of the delegation pattern itself (click/keydown
      delegation, argument type coercion) against mock functions. See
      `__tests__/frontend.staticActions.test.js`.
      **This does NOT let CSP's `scriptSrcAttr` drop `'unsafe-inline'`
      yet** — `app.js` still dynamically generates `onclick=` attributes
      inside template-literal HTML strings when rendering place cards,
      saved trips, etc. (e.g. `` `<button onclick="delExp(${e.id})">` ``).
      Those arguments come from live data, not fixed literals, which is
      exactly the harder, riskier remainder this pass didn't attempt. CSP
      can only tighten once every inline handler is gone, including those.
- [x] Single point of failure — geocoding: `routes/geocode.js` (the public
      `/api/geocode` endpoint the frontend's city search actually calls) had
      no fallback at all; a Nominatim outage meant city search was fully
      broken for every user. It now falls back to Photon (a free, no-API-key
      geocoder) when Nominatim errors or returns nothing, converting the
      response into the same shape so the frontend contract doesn't change.
      `services/placesDiscovery.js` already had this fallback internally for
      per-place geocoding — this closes the same gap on the city-search path.
      **Cross-provider AI failover** (e.g. Gemini → OpenAI/Anthropic) was
      not attempted — no credentials for a second provider exist in this
      deployment, and shipping an integration that's never actually been
      called would be worse than not having it. What *is* in place instead,
      in `services/gemini.js`:
      - A configurable fallback Gemini **model** (`GEMINI_FALLBACK_MODEL`,
        default `gemini-2.0-flash`) — protection against "this one model is
        overloaded/rate-limited/deprecated."
      - An optional second Gemini API **key** (`GEMINI_API_KEY_SECONDARY`),
        ideally from a separate Google Cloud project/billing account —
        protection against the primary key/project specifically hitting its
        own quota, rate limit, or billing/auth suspension. Tried after the
        primary key exhausts its retries, using the primary model first
        (skipping the fallback model on the primary key), then the fallback
        model on the secondary key as a last resort if that also fails.
      - Both only trigger on retryable failures (network/429/5xx — never a
        4xx). **Still open, and can only be closed with real credentials
        for an actual different provider:** a full Gemini/Google outage
        still takes the AI feature down entirely, since both the fallback
        model and the secondary key call the same underlying service.
- [x] Redis-backed rate limiting: `middleware/rateLimiter.js`'s Redis path
      already existed but had 0% test coverage — added tests against a
      mocked `ioredis` client (increment/expire/window logic, fail-open
      behavior on Redis errors, per-tier key scoping) *and* real,
      non-mocked validation in `scripts/redis-loadtest/` — 4 genuinely
      separate worker processes sharing one real Redis instance, hit with
      300 real concurrent requests simultaneously, confirming the shared
      counter stays atomic under actual cross-process race conditions (see
      `scripts/redis-loadtest/README.md` for how to run it and exactly
      what it does/doesn't prove). **Still open:** that script runs against
      a local Redis over loopback — validating against the actual
      production/staging Redis over real network latency and at
      production traffic volume needs that real infrastructure, which
      isn't available here.
- [x] `services/cache.js` had no Redis-backed mode at all, unlike the rate
      limiter — now it does, via a background write-through/warm-on-miss
      layer (active only when `REDIS_URL` is set). Deliberately does **not**
      change `get()`/`set()` to async — every existing call site
      (`routes/places.js`, `routes/geocode.js`, `services/gemini.js`,
      `routes/analytics.js`) calls them synchronously, and changing that
      contract would mean touching and re-verifying all of them. Instead: a
      local cache miss kicks off a background Redis lookup that warms the
      *next* call on this process (the current call still returns
      synchronously, unchanged); `set()` fire-and-forgets a write-through to
      Redis. A Redis outage degrades silently to exactly today's
      in-memory-only behavior — never blocks, never throws into the caller.
      Same "can't validate real distributed behavior without a live Redis
      instance" caveat as the rate limiter above.
- [x] `npm audit` — previously flagged 8 moderate-severity findings, all
      transitively pulled in by `firebase-admin`'s dependency tree (an old
      `uuid` version with a buffer-bounds-check issue). **Now 0
      vulnerabilities.** Worth documenting how, because the first attempt
      was wrong: bumping `firebase-admin` from `^12.7.0` to `^14.2.0` did
      clear the audit, but a smoke test against the actual API surface
      caught that v13+ removed `admin.credential.cert()` in favor of a
      top-level `admin.cert()` — which would have silently broken
      `middleware/auth.js` and `middleware/adminAuth.js` in production. That
      bump was reverted. The fix that shipped instead: `firebase-admin`
      stays on `^12.7.0` (API surface re-verified intact via the same smoke
      test), and a `"uuid": "^11.1.1"` entry was added to `package.json`'s
      `overrides` to force every transitive dependency onto a patched `uuid`
      without touching `firebase-admin`'s major version at all. Full test
      suite (190/190) re-run and passing after this change.
