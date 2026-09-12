# INDIA IN-TIME v3.0 — FORENSIC AUDIT REPORT
**Execution Date**: September 12, 2026  
**Repository**: `india-in-time-main` (India In-Time v3.0)  
**Audit Type**: Deep Static, Runtime, Architectural, Contract, and Forensic Recovery Audit  
**Authoritative Basis**: Source code on disk, Git reflog, Runtime execution, PostgreSQL schemas, Playwright E2E suites  

---

## 1. Executive Summary

India In-Time v3.0 was designed conceptually across Phases 1–7 as a contextual travel decision engine answering:
> *"Given everything known right now, what is the best next travel decision for THIS traveler?"*

Multiple historical walkthrough reports previously declared Phases 1–7 complete and frozen. However, a forensic investigation across Git branches, working trees, API contracts, runtime test runs, and headless browser tests revealed significant discrepancies between reported status and physical repository state.

### Primary Forensic Findings:
1. **Phase 7 Mobile UX Disconnect (P1 - High)**:
   - The entire Phase 7 Mobile-First Traveler Experience (5 canonical bottom-navigation tabs: Map, Journey, Plan, Alerts, More; dedicated `alertsCenter.js`, `bottomSheet.js`, `mobileShell.js`, `moreMenu.js`, responsive CSS, and `mobile.experience.spec.js`) was developed in branch `remotes/origin/copilot/l-2005-cindia-in-time` (commits `25e264c`, `a6ea62f`, `db39831`), but was **never merged into `main`**.
   - As a result, the active repository had legacy 4-tab navigation (`Map`, `Plan`, `Chat`, `Tools`), completely lacking the dominant Journey HUD, dedicated Alerts Center, and isolated simulation More menu.
   - An auxiliary branch (`copilot/l-2005-cupdate-bottom-navigation`) contained an errant commit `d6ef3bc` where an automated bot replaced `Alerts` with `AI Assistant`, violating Rule 4 (LLM is never source of truth) and Phase 7 safety hierarchy requirements.
   - **Resolution**: Canonical Phase 7 branch (`db39831`) was fast-forward merged into `main`. The 5 canonical tabs were verified and preserved.

2. **Tenant Isolation & Security Vulnerability (P0 - Critical)**:
   - `routes/intelligence.js` endpoints (`/trips/:id/*`) did not enforce trip ownership or authentication checks.
   - `server.js` mounted `/api/intelligence` without `optionalAuth`.
   - Cross-user actors or unauthenticated callers could read or mutate another user's active journey state, plan adaptations, progress, and alerts.
   - **Resolution**: Mounted `optionalAuth` on `/api/intelligence` in `server.js`. Implemented `verifyTripAccess` middleware in `routes/intelligence.js` validating that authenticated trips can only be accessed/mutated by their owner (`req.uid === ownerUid`), returning `403 Forbidden` on unauthorized cross-user access and `401 Unauthorized` on unauthenticated access to owned trips, while maintaining seamless access for guest trips. Verified with dedicated test suite `__tests__/routes.intelligence.auth.test.js`.

3. **Frontend API Contract Mismatches (P1 - High)**:
   - `frontend/public/client-api.js` provided wrappers for Phase 1, 2, 3, and 6, but omitted Phase 4 (Experience Value) and Phase 5 (Tourist Trust) methods on `window.API`.
   - **Resolution**: Implemented `evaluateTripExperience`, `fetchTripExperienceRecommendations`, `recordExperienceDecision`, `fetchExperienceWindows`, `fetchTripExperienceOutcomes`, `evaluateTrust`, `fetchEntityTrust`, `recordTrustFeedback`, and `fetchTrustMetrics` in `client-api.js`.

4. **Automated Axe Accessibility Failure (P2 - Medium)**:
   - Playwright E2E `@a11y` test failed due to low contrast on Leaflet CARTO attribution links (3.15:1 vs required 4.5:1) and dark-mode navigation labels.
   - **Resolution**: Integrated high-contrast styling tokens from commit `a6ea62f`, achieving 7.1:1 contrast and passing all automated Axe accessibility assertions.

5. **Architectural Ratchets Preservation**:
   - `frontend/app-src/src/core/app.js`: 3,493 lines (strictly <= 3,500 ratchet limit).
   - `server.js`: 518 lines (strictly <= 560 ratchet limit).
   - Circular dependencies: 0. Layering violations: 0.
   - Inline handlers: 0 violations across 92 frontend source files.
   - Production bundle size: 579,949 bytes (budget: 1,572,864 bytes).
   - ESLint: 0 errors, 0 warnings.

---

## 2. Machine-Readable Repository Inventory

```json
{
  "project": "india-in-time-backend",
  "version": "3.0.0",
  "node_engines": "20.x || 22.x",
  "codebase_metrics": {
    "total_routes": 15,
    "total_services": 68,
    "total_frontend_modules": 32,
    "total_db_tables": 24,
    "total_migrations": 7,
    "total_unit_test_suites": 134,
    "total_unit_tests": 1460,
    "total_e2e_specs": 3,
    "total_e2e_tests": 12
  },
  "architectural_ratchets": {
    "app_js_lines": 3493,
    "app_js_limit": 3500,
    "server_js_lines": 518,
    "server_js_limit": 560,
    "circular_dependencies": 0,
    "layering_violations": 0,
    "inline_event_handlers": 0,
    "bundle_bytes": 579949,
    "bundle_budget_bytes": 1572864,
    "eslint_errors": 0,
    "eslint_warnings": 0
  },
  "phases_status": {
    "phase_1_adaptive_decision": "RECOVERED_AND_VERIFIED",
    "phase_2_traffic_disruption": "RECOVERED_AND_VERIFIED",
    "phase_3_safety_risk": "RECOVERED_AND_VERIFIED",
    "phase_4_experience_value": "RECOVERED_AND_VERIFIED",
    "phase_5_tourist_trust": "RECOVERED_AND_VERIFIED",
    "phase_6_next_journey": "RECOVERED_AND_VERIFIED",
    "phase_7_mobile_traveler_ux": "RECOVERED_AND_VERIFIED"
  }
}
```

---

## 3. Directory Breakdown & Forensic Scan

### 3.1 Backend Routes (`routes/`)
- `ai.js`: Gemini GenAI integration, fallback reasoning, prompt injection guards.
- `analytics.js`: In-memory buffering, DB flush, API telemetry.
- `favorites.js`: Bookmark management with authentication verification.
- `feedback.js`: Per-place and overall app experience ratings.
- `flags.js`: Runtime dynamic feature flag configuration.
- `geocode.js`: Dual Nominatim + Photon cascading geocoder.
- `intelligence.js`: Comprehensive India In-Time v3.0 decision engine (65KB, 1916 lines). Handles weather consensus, journey state, Travel Guardian triggers, adaptive replanning, disruption evaluations, official safety feeds, experience value, tourist trust, and continuous next journey chaining.
- `itinerary-optimizer.js`: Spatial clustering and multi-stop heuristic route builder.
- `places.js`: Curated POI discovery, category filtering, opening hours.
- `routing.js`: OSRM routing, traffic congestion multipliers, corridor benchmarks.
- `time-intelligence.js`: GeoAI temporal profiles, open/close status, crowd density models.
- `travel-data.js`: Regional seeds, festivals, seasonal calendars.
- `trips.js`: Save/load/share trip persistence with owner-scoped queries.
- `weather.js`: Weather forecasts and current observations.
- `weather-alerts.js`: Weather warning levels and best time to visit calculations.

### 3.2 Backend Services (`services/travelIntelligence/`)
- `decision/`: `adaptiveDecisionEngine.js`, `adaptationPipeline.js`, `alternativeGenerator.js`.
- `disruption/`: `trafficAnomalyDetector.js`, `eventIntelligence.js`, `journeyImpactEngine.js`, `disruptionClassifier.js`, `disruptionNotificationEngine.js`.
- `safety/`: `geospatialSafetyEngine.js`, `temporalSafetyEngine.js`, `sourceAuthorityEngine.js`, `safetyDecisionEngine.js`, `safetySourceAdapters.js` (IMD, NDMA, CWC, FSI).
- `experience/`: `timeBudgetEngine.js`, `experienceWindowEngine.js`, `candidateGenerator.js`, `opportunityCostEngine.js`, `experienceValueEngine.js`, `experienceExplanationEngine.js`, `outcomeTracker.js`.
- `trust/`: `touristTrustEngine.js`, `officialRegistryAdapters.js` (FSSAI, NIDHI, GSTIN, ASI), `priceTrustEngine.js`, `providerLegitimacyEngine.js`, `routeTrustEngine.js`, `reviewTrustEngine.js`, `trustEntityResolver.js`, `trustEvidenceGraph.js`, `trustObservability.js`, `trustOutcomeTracker.js`.
- `nextJourney/`: `journeyLegModel.js`, `destinationIntentResolver.js`, `accommodationIntelligence.js`, `corridorDiningEngine.js`, `transportHubEngine.js`, `overnightStayEngine.js`, `nextLegDecisionEngine.js`, `nextJourneyObservability.js`.

### 3.3 Frontend Architecture (`frontend/app-src/`)
- `core/app.js`: Master application controller (3,493 lines).
- `modules/mobileShell.js`: 5-tab mobile view orchestrator, rush-hour corridor traffic generator, notification badge synchronization.
- `modules/alertsCenter.js`: Dedicated priority-sorted alerts view with filter tabs and bottom-sheet details.
- `modules/bottomSheet.js`: Accessible mobile modal sheet with drag gestures and progressive disclosure.
- `modules/moreMenu.js`: Strictly isolated developer/simulation panel and provider health telemetry.
- `modules/tripControlCenter.js`: Journey HUD, active stop execution, why-this disclosure, next journey intent selector, transport deadline warnings.

---

## 4. Test Suite Execution Summary

- **Unit & Integration Suite**: 134 test suites, 1,460 tests executed via Jest.
- **Playwright E2E Suite**: 3 spec files, 12 browser journeys executed on Chromium.
  - `home.spec.js`: 7 tests passing (landmark, health, security headers, Axe accessibility, performance budget, 375x667 mobile, 320x568 small mobile).
  - `trust.spec.js`: 1 test passing (11-dimension trust evaluation, registry tags, price breakdown, evidence drawer, simulations).
  - `mobile.experience.spec.js`: 4 tests passing (5-tab navigation, touch target compliance, "Why this?" bottom sheet, stop progress transition, dominant safety alert, adaptive replan, next-journey 8 intents, transport deadline risk, responsive tablet/desktop presentation).
- **Axe Core Accessibility**: 0 critical or serious WCAG violations.
- **Bundle & Handlers Verification**: PASS (579 KB / 1.5 MB limit; 0 inline event handlers across 92 files).
