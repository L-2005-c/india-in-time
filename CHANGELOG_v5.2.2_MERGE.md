# v5.2.2 — Merge of the two parallel branches (v5.2.0 GeoAI + v5.2.1 ops)

Base: **v5.2.0** (`india-in-time`) — kept as-is because it has the stronger
tourism/GeoAI eligibility engine (multi-city whitelist, tiered scoring,
Jest-covered regression suite).

Patched in from **v5.2.1** (`WORLD_CLASS_PRODUCTION_READY`):

1. **`render.yaml`** — fixed the production build command to
   `npm ci --include=dev && npm run build:frontend && npm prune --omit=dev`.
   The previous command (`npm ci && npm run build:frontend`) would fail on
   Render because `NODE_ENV=production` causes `npm ci` to skip
   devDependencies, and `build:frontend` needs `esbuild`/`clean-css-cli`
   (devDependencies) to run. **Verified locally**: reproduced the failure
   with `npm ci --omit=dev && npm run build:frontend` (vite not found,
   process crash), then confirmed the fixed command builds cleanly.
2. **`config/index.js`** — wrapped the `dotenv` require in a try/catch so a
   partial `node_modules` tree (e.g. during static analysis or a broken
   install) doesn't hard-crash config loading.
3. **SEO assets** — `.nvmrc`, `frontend/public/robots.txt`,
   `frontend/public/sitemap.xml`, and the `<head>` additions in
   `frontend/app-src/index.html` (meta description, robots directive,
   canonical URL, OG/Twitter cards, JSON-LD `WebApplication` schema).
4. **`scripts/release-audit.js`** — ported and updated to check for this
   branch's tourism whitelist module and Jest regression suite (rather than
   v5.2.1's older standalone tourism scripts), plus the SEO assets and the
   corrected build command. Registered as `npm run release:audit`.
5. **Deployment docs** — `DEPLOYMENT_PRODUCTION.md` copied over; `DEPLOY.md`
   updated with the production build-command contract.
6. **Docs consolidation** — v5.2.1's tourism write-up
   (`TOURISM_INTELLIGENCE_UPGRADE_V5_1_1.md`) moved to `docs/archive/` for
   history; the canonical `docs/TOURISM_POI_ELIGIBILITY_V5_2.md` now notes
   the merge decision and points back to it.

## Validation performed

- `npm ci --include=dev` — installs cleanly, 0 vulnerabilities.
- `npm run build:frontend` — succeeds (Vite build, 36 modules, ~1.2s).
- `npm ci --omit=dev && npm run build:frontend` — **reproduced the original
  bug**: fails because `vite` is missing. Confirms the render.yaml fix was
  necessary, not cosmetic.
- `npm run release:audit` — all 18 checks pass.
- `npx jest` (excluding Playwright e2e, which needs a browser runtime) —
  **604/608 tests pass** (58/61 suites). The 4 failing tests
  (`services.geoTemporalOptimizer.test.js`,
  `services.multiDayPlanner.test.js`) were confirmed to **already fail on
  the unmodified v5.2.0 baseline** — they are pre-existing issues (a stale
  algorithm-name string assertion and a boundary-condition tie-break in the
  geo-temporal optimizer), not regressions introduced by this merge. Track
  and fix separately; see priority list below.

## Not yet done (tracked, not blocking this merge)

- Fix the 2 pre-existing failing test suites (stale
  `'geo-temporal-beam-search-v4-structured'` assertion vs. the actual
  `'geo-temporal-beam-search-v5-world-class'` algorithm string; a
  `mealTimingBonus` tie-break test that needs a `>=` instead of `>`, or a
  larger synthetic gap between fixtures).
- Move the tourism whitelist from an in-memory JS module to a DB-backed
  table so city data can be edited without a redeploy.
- Add a load/benchmark test for `filterEligibleCandidates` at realistic
  candidate volumes.
- Playwright e2e suite was not run in this sandbox (no browser runtime
  available) — run it in CI before shipping.
