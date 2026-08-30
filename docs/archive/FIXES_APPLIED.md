> **ARCHIVED** — superseded by [STATUS.md](../STATUS.md), do not treat as current.

> **Historical document — not current repository status.**
> This file records an earlier audit/build state. For current architecture, security posture, and production status, use the current documents under `docs/`.

# Historical Document — Not Current Verification

This file records a prior engineering state. It must not be interpreted as current production verification.

# Fixes Applied — India In-Time

All fixes were verified by actually running `npm test` (the exact command your CI uses) before and after. **Before: crash, exit code 1, no summary printed. After: `Test Suites: 47 passed, 47 total` / `Tests: 534 passed, 534 total`, exit code 0.**

## 1. CI-crashing test (Critical — the one that blocked the whole pipeline)

`config/index.js` correctly calls `process.exit(1)` if `NODE_ENV=production` and `FIREBASE_SERVICE_ACCOUNT` isn't set — good hardening. But **three separate test files** simulate production mode without setting that variable, and in `jest --runInBand` mode (what `npm test` actually runs), that `process.exit(1)` kills the *entire* Jest worker process, not just that one test:

- `__tests__/middleware.errorHandler.test.js` — two `describe` blocks affected
- `__tests__/config.resolveIndexHtmlPath.test.js`
- `__tests__/config.corsGuard.test.js` — two tests that specifically assert the process should *not* exit were themselves being killed by the *other* guard

**Fix:** each `beforeEach` that sets `NODE_ENV = 'production'` now also sets a valid-shaped (fake) `FIREBASE_SERVICE_ACCOUNT`, and cleans it up in `afterEach`. This doesn't weaken any guard — it just stops these specific tests from tripping over a *different* production guard than the one they're testing.

## 2. Two stale test assertions (High priority)

`__tests__/db.queries.test.js` asserted `deleteTrip`/`removeFavorite` issue a hard `DELETE`. The implementation was correctly changed to a soft delete (`UPDATE ... SET deleted_at = ...`) at some point, but the tests were never updated to match — they were failing.

**Fix:** updated both assertions to match the actual (correct) soft-delete SQL, and renamed the test descriptions to say "(soft) delete" so this doesn't drift again silently.

## 3. Broken relative import in two ML service files (real application bug, not just a test issue)

`services/ml/crowdModel.js` and `services/ml/preferenceModel.js` both did `require('../db/init')`, which resolves to the nonexistent `services/db/init` (one directory too shallow — `services/travelIntelligence/`'s equivalent files correctly use `../../db/init`). `crowdModel.js` is actually exercised by a test, which is how this surfaced; `preferenceModel.js` isn't required anywhere yet, so this was silently broken dead code.

**Fix:** corrected both to `require('../../db/init')`.

## 4. Playwright e2e specs being picked up by Jest

`__tests__/e2e/specs/*.spec.js` and `__tests__/e2e/playwright.config.js` are an *optional*, separately-run browser e2e suite (`@playwright/test` isn't even a listed dependency) — but Jest's `testPathIgnorePatterns` didn't exclude them, so `npm test` tried and failed to load them. `__tests__/e2e/criticalPaths.test.js`, right next to them, *is* a real Jest test and needed to keep running.

**Fix:** narrowed the Jest ignore pattern to exclude only `__tests__/e2e/specs/` and `__tests__/e2e/playwright.config.js`, leaving `criticalPaths.test.js` intact.

## 5. Pre-existing bug in the frontend static-actions test itself, unmasked once #1 was fixed

Two separate problems in `__tests__/frontend.staticActions.test.js`, both invisible before because the whole file used to fail before reaching them:

- Its key-extraction regex only recognized `const CHAT_ACTIONS = { ... };` (object literal), but `app.js` now defines `CHAT_ACTIONS` as `Object.create(null)` and populates it later via `Object.assign(CHAT_ACTIONS, { ... })` — a deliberate, reasonable pattern (null-prototype + late population to avoid bundler ordering issues), just not one the test's regex accounted for.
- Its per-line key parser reset nesting depth at the start of every line, so multi-line nested function bodies inside `STATIC_ACTIONS` (e.g. `drawerRun: (btn) => { ...; setTimeout(...); }`) had their internal statements (`const`, `if`, `setTimeout`) misread as if they were top-level shorthand object keys.

**Fix:** extended the extractor to recognize both the object-literal and `Object.assign`-population shapes, and made depth-tracking cumulative across the whole object body so nested function bodies are correctly skipped rather than misparsed.

## Files changed
- `__tests__/middleware.errorHandler.test.js`
- `__tests__/db.queries.test.js`
- `__tests__/config.resolveIndexHtmlPath.test.js`
- `__tests__/config.corsGuard.test.js`
- `__tests__/frontend.staticActions.test.js`
- `services/ml/crowdModel.js`
- `services/ml/preferenceModel.js`
- `package.json` (Jest config only)

No production behavior changed — every fix is either a test-only correction or a dead/broken import path fix in code that wasn't previously reachable. Nothing here should require a new deploy decision beyond "merge it."

## What this moves in the due-diligence report
This resolves the Critical item and most of the High-priority items in the Technical Debt Ledger (§4) and directly addresses the CI/CD Readiness (§2.21) and Testing Coverage (§2.18) findings. The remaining open items — legacy admin key retirement, finishing the frontend migration, wiring up APM — are unchanged and still tracked there.
