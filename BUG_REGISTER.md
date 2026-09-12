# INDIA IN-TIME v3.0 — BUG REGISTER

## Complete Forensic Defect & Resolution Register

| ID | Severity | Area | Problem | Root Cause | Fix | Verification |
|---|---|---|---|---|---|---|
| **BUG-001** | **P0** | Security & Auth | `/api/intelligence/trips/:id/*` endpoints lacked ownership verification, allowing unauthorized cross-tenant read/mutation of active journey state, plan adaptations, and alerts. | `server.js` omitted `optionalAuth` on `/api/intelligence`, and `routes/intelligence.js` did not validate caller `req.uid` against trip owner. | Mounted `optionalAuth` in `server.js`; added `verifyTripAccess` middleware in `routes/intelligence.js` returning 403 on mismatched UID and 401 on unauthenticated access to owned trips. | `__tests__/routes.intelligence.auth.test.js` (7 passed tests). |
| **BUG-002** | **P1** | Mobile UX / Shell | `main` branch was missing the Phase 7 Mobile-First Traveler Experience (5 canonical tabs, `mobileShell.js`, `alertsCenter.js`, `bottomSheet.js`, `moreMenu.js`, `mobile.experience.spec.js`). | Phase 7 was developed in branch `copilot/l-2005-cindia-in-time` (commits `25e264c`, `a6ea62f`, `db39831`) and was never merged into `main`. | Merged canonical branch `db39831` into `main`. Verified 5 canonical tabs (Map, Journey, Plan, Alerts, More) in `index.html` and `mobileShell.js`. Discarded errant `AI Assistant` tab replacement. | `__tests__/e2e/specs/mobile.experience.spec.js` (4 passed tests) and `npm run build:frontend`. |
| **BUG-003** | **P1** | Client API Contracts | `window.API` in `frontend/public/client-api.js` omitted Phase 4 Experience Value and Phase 5 Tourist Trust API methods. | Backend routes existed under `/api/intelligence`, but client-side JavaScript wrappers were never authored. | Implemented and exposed 9 missing API wrappers: `evaluateTripExperience`, `fetchTripExperienceRecommendations`, `recordExperienceDecision`, `fetchExperienceWindows`, `fetchTripExperienceOutcomes`, `evaluateTrust`, `fetchEntityTrust`, `recordTrustFeedback`, `fetchTrustMetrics`. | `npm run build:frontend`, `trust.spec.js`, and `mobile.experience.spec.js`. |
| **BUG-004** | **P2** | Accessibility (A11y) | Automated Axe Core audit failed in `home.spec.js` due to low color contrast on Leaflet CARTO tile attribution link (3.15:1) and bottom nav labels (4.22:1). | Default Leaflet attribution styles used grey background with dark blue link; bottom nav used muted grey `#6b7487`. | Added high-contrast CSS rules: `.leaflet-control-attribution` with `rgba(10,15,29,0.88)` background and `#93c5fd` link (7.1:1 ratio) and high-contrast navigation active states. | `__tests__/e2e/specs/home.spec.js` passed (0 serious or critical axe violations). |
| **BUG-005** | **P3** | Code Quality & Lint | ESLint reported 6 warnings across `routes/weather-alerts.js`, `openMeteoAdapter.js`, and `validate-weather-truth.js` for unused variables and requires. | Stale require statements (`fetch`, `keepAliveAgent`, `weatherCache`) and un-prefixed benchmark helpers left behind after refactoring. | Removed dead requires from `routes/weather-alerts.js`, prefixed unused timing and helper variables with `_`. | `npm run lint` passed with 0 errors and 0 warnings. |

---

## Severity Classification Standards
- **P0 — Critical**: Security vulnerability, unauthorized tenant/cross-user data access, data corruption, or state violation.
- **P1 — High**: Major product feature broken or disconnected from the active application branch.
- **P2 — Medium**: Important UX, accessibility (WCAG AA), integration, or responsive failure.
- **P3 — Low**: Minor UI glitch, dead code, lint warning, or maintainability issue.
- **P4 — Cosmetic**: Documentation discrepancy or typographical fix.
