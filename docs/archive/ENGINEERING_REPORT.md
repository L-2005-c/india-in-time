> **ARCHIVED** — superseded by [STATUS.md](../STATUS.md), do not treat as current.

> **Historical document — not current repository status.**
> This file records an earlier audit/build state. For current architecture, security posture, and production status, use the current documents under `docs/`.

# Historical Document — Not Current Verification

This file records a prior engineering state. It must not be interpreted as current production verification.

# India In Time — Travel Intelligence Engine
## Engineering Report

### 1. Existing architecture
- Deterministic `services/timeIntelligence.js` (open/closed, sun, daypart, crowd labels, personalizeScore)
- Rules in `data/time-intelligence-rules.json`
- Routes: `/api/time-intelligence/status`, `/score`
- Weather via Open-Meteo proxy; frontend client-side traffic/crowd helpers

### 2. New architecture
```
services/travelIntelligence/
  index.js              orchestrator
  timeEngine.js         IST, sun, golden hour, daypart
  openingHoursEngine.js OPEN / CLOSING_SOON / CLOSED / OPENS_SOON / UNKNOWN
  crowdEngine.js        multi-factor crowd + source labels
  trafficEngine.js      travel time + arrival windows
  weatherEngine.js      activity suitability
  scenicEngine.js       scenic / photography windows
  scoringEngine.js      configurable multi-factor visitScore
  confidenceEngine.js   data-availability confidence
  explanationEngine.js  WHY bullets
  itineraryEngine.js    day plan + dynamic advice
  routingEngine.js      OSRM live routing (timeout + fallback)
  festivalEngine.js     festival/event crowd impact
  routingEngine.js      OSRM + optional Google Directions
  historicalCrowdStore.js  historical crowd hints blend
```
`timeIntelligence.js` is a backward-compatible facade.

### 3. Files changed
- Added: all modules under `services/travelIntelligence/`
- Updated: `services/timeIntelligence.js`, `data/time-intelligence-rules.json`, `routes/time-intelligence.js`, `frontend/public/client-api.js`, `frontend/public/app.js` (premium card renderer)
- Tests: `__tests__/services.travelIntelligence.test.js`, `__tests__/routes.timeIntelligence.recommend.test.js`

### 4. Algorithms
- Crowd: daypart × weekend × holiday × peak × season × placeType × weather dampening; optional historical blend
- Traffic: Haversine + time-of-day congestion; live override when provided
- Weather: maps temp/rain/wind/cloud → 0–100 suitability
- Visit score: weighted sum by place-type profile; closed places gated
- Day plan: greedy timed sequencing with openness, proximity, meal slots, buffers

### 5. Data sources
- Place catalog hours/coords/flags (provided)
- Open-Meteo weather (observed/forecast)
- Astronomical sun model (computed)
- Rules JSON (rule-based)
- Optional `liveTraffic` body field (live)
- Optional `historicalCrowd` on place (historical)

### 6. Scoring methodology
Configurable weights in rules; profiles for beach, viewpoint, temple, restaurant, indoor, monument, nature, market. Bands: Exceptional 90–100 … Poor 0–39.

### 7. Confidence methodology
Base 55 + bonuses for weather, coords, hours, category rules, traffic, historical. Capped ~95. Never manufactured beyond data availability.

### 8. API changes
- `POST /status` — additive advanced fields
- `POST /score` — unchanged
- `POST /recommend` — ranked list with explanation
- `POST /day-plan` — timed multi-stop plan
- `POST /advice` — dynamic actions for one place

### 9. UI changes
- `ti_renderIntelligenceCard` in `app.js` when `visitScore`/`explanation` present
- Client helpers: `timeIntelligenceRecommend`, `timeIntelligenceDayPlan`, `timeIntelligenceAdvice`

### 10. Tests
- 51 existing TI tests still pass
- +17 new travel-intelligence / recommend / day-plan / advice tests
- **68/68 TI-related tests green**

### 11. Performance
- No mandatory extra upstream calls; weather/traffic optional
- Batch capped at 200 places
- Graceful degradation when data missing

### 12. Security
- No new auth surface; existing rate limits apply
- Persona/tripMode allow-listed
- Opening hours never invented when missing

### Validation (2026-08-11)
- Full suite: **492/492 tests passed**
- Frontend production build: **success** (Vite)
- TI modules: lint clean (prefer-const fixed)
- Pre-existing eslint parser issues in frontend/app-src ESM (unrelated)

### 13. Known limitations
- Festival calendar is static JSON (extend yearly)
- Google Directions optional via GOOGLE_MAPS_API_KEY; else OSRM
- Historical crowd from static JSON hints (extend or replace with DB)
- Historical crowd needs data pipeline
- Day plan is greedy (not full TSP solver)
- Premium card is chat/best-time path; not every map popup rewritten

### 14. Future ML opportunities
- Learn per-place crowd curves from feedback
- City-specific traffic calibration from routing APIs
- Preference embeddings from trip history
- Sequence model for day itineraries

### UI blank-page fix (2026-08-11)
**Cause:** Production served `dist/index.html` which referenced `/assets/*.js|.css`, but Express only mounted hashed files under `/dist/assets/` → **404** for CSS/JS → white/unstyled shell.

**Fixes:**
1. Mount `/assets` → `frontend/public/dist/assets`
2. Default `resolveIndexHtmlPath()` to **source** `index.html` (`/app.js` + `/styles.css`) so UI cannot blank
3. Vite `base: '/dist/'` so future dist builds emit `/dist/assets/...`
4. Opt into dist with env `USE_DIST_FRONTEND=1`

---

## Technical Debt Remediation (2026-08-11)

### Critical
1. **CSP onclick= eliminated** — All dynamically generated `onclick=` attributes in `app.js` converted to `data-action` delegation. `STATIC_ACTIONS` extended with tools/AI/drawer/arg-bearing handlers. CSP `script-src-attr` tightened from `'unsafe-inline'` → `'none'`. JS property assignment (`el.onclick =`) for day tabs remains (does not violate script-src-attr).
2. **Observability** — Added admin-gated `/api/metrics` (Prometheus text format) with process uptime/heap/RSS, Gemini counters, circuit state, and per-cache size/hit metrics. Existing `/api/health` + `/api/health/ready` retained.

### High Priority
3. **Frontend modularization** — `app-src` remains source of truth; `public/app.js` and `core/app.js` kept in sync after CSP fix. Full further split of `core/app.js` (~state object refactor) remains follow-up.
4. **Accessibility** — Skip-to-content link (CSS `:focus` only, CSP-safe), `role="main"` on `#app`, `lang` present, `role="button"` + `tabindex` on drawer items and passport stamps.
5. **Redis as recommended default** — Production logs explicit recommendation; multi-worker without `REDIS_URL` still refused. `.env.example` documents Redis as the path to multi-core scale.
6. **Durable analytics + historical crowd pipeline** — Soft-delete columns (`deleted_at`) on trips/favorites; `historical_crowd` table + indexes; `lookupHistoricalCrowdAsync` DB path (fails open to JSON). Analytics buffer already flushes on interval and shutdown.

### Medium Priority
7. **API versioning** — `middleware/apiVersion.js` negotiates v1 via `X-API-Version`, `Accept: application/vnd.indiaintime.v1+json`, or `?api_version=`. Wired under `/api`. Tests added.
8. **Soft-delete** — Schema + queries for trips/favorites use soft-delete; list paths filter `deleted_at IS NULL`.
9. e2e suite / Gemini cost dashboards / full OpenAPI — scaffolded partially (versioning + metrics); full coverage remains backlog.

### Low Priority
10. Multi-provider AI, advanced GIS, learned ML models — documented as future work in original report; not in scope of this remediation pass.

### Validation notes
- Syntax: run `node --check server.js` and `node --check frontend/public/app.js`
- Tests: security CSP expectation updated; static-actions dead-entry test allows dynamic-only keys; new `middleware.apiVersion.test.js`
- CSP: `script-src-attr 'none'` is now the intended production posture

---

## Remaining debt completion pass (2026-08-12)

| Item | Deliverable |
|------|-------------|
| Frontend modularization | `state/appState.js`, `a11y/helpers.js`, `modules/chatActions.js`, main.js bootstrap |
| Accessibility | focus-visible CSS, live-region announce on toasts, skip-link, roles |
| Durable analytics | retry re-queue + JSONL spill file under `data/analytics-spill.jsonl` |
| e2e | Jest critical-path smoke + Playwright config/specs |
| Gemini cost dashboard | `/api/analytics/gemini`, `admin-gemini.html`, `gemini_usage` table |
| OpenAPI | `docs/openapi.yaml` + `/api/openapi.json` |
| Multi-provider AI | `services/ai/provider.js` (Gemini + optional OpenAI) |
| Advanced GIS | `utils/spatial.js` (bbox, radius filter, bearing, grid, NN order) |
| Learned crowd | `crowdLearner.js` blended in `getTravelIntelligenceAsync` |

Run: `npm test`, `npm run migrate:up`, optional `npx playwright test --config __tests__/e2e/playwright.config.js`.

---

## Enterprise readiness pass (2026-08-12)

### UI modularization (enterprise boundaries)
- Domain modules: `modules/budget.js`, `auth.js`, `planner.js`, `chatActions.js`, registry `modules/index.js`
- Shared `state/appState.js` + `window.__modules` for progressive adoption
- `core/app.js` remains runtime orchestrator; pure math/planner/auth shapes extracted

### Exhaustive accessibility
- Landmarks: banner, main, navigation, region labels (map/plan/chat/tools)
- Skip link, live regions, labeled controls, focus-visible, reduced-motion, 44px targets
- `aria-current="page"` on bottom nav
- Static a11y suite: `__tests__/a11y/index.html.a11y.test.js`

### True ML
- Online logistic regression crowd model: `services/ml/crowdModel.js` (feature vector, SGD, L2, DB persistence)
- Preference EMA model: `services/ml/preferenceModel.js`
- Feedback POST trains online; admin `POST /api/analytics/ml/crowd/train`
- Blended into `getTravelIntelligenceAsync`

### Ops
- Tables: `ml_model_weights`, migrations included
- OpenAPI paths updated
