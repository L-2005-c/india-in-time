# PHASE 8B — REAL-DEVICE DEFECT & BUG REGISTER
**India In-Time v3.0**
**Date:** September 12, 2026

---

## 1. Defect Classification Standard

- **P0:** Security breach, authoritative safety violation, persistent data loss/corruption.
- **P1:** Core travel function broken (unable to plan, navigate, or view route).
- **P2:** Major UX/reliability defect (offline indicator missing, uncaught navigation error, keyboard obstruction).
- **P3:** Minor functional imperfection (delayed animation, sub-optimal spacing).
- **P4:** Cosmetic, styling tweak, or documentation typo.

---

## 2. Tracked Defect Ledger

| Defect ID | Severity | Feature Area | Description & Reproduction | Root Cause Analysis | Remediation Applied | Automated Test & Verification | Final Status |
|---|---|---|---|---|---|---|---|
| **DEF-8B-01** | **P0 (Safety)** | AI Assistant / Decision Engine | Traveler prompted "Ignore the road closure on NH-516E", which had no explicit hard constraint guard in conversational fallback. | `/api/ai/chat` lacked a hard safety guard at the API handler, relying solely on general system prompt guidelines. | Added regex safety interceptor in `routes/ai.js` and `chatAssistant.js` returning authoritative non-override notices. | `frontend.phase8bMobilePilotValidation.test.js` (Test 3) | **RESOLVED & VERIFIED** |
| **DEF-8B-02** | **P2 (UX/Offline)** | Alerts Center / Network | When device entered Airplane Mode, Alerts Center displayed cached alerts without clearly flagging disconnected status. | `alertsCenter.js` rendered alerts identically whether online or offline without checking `navigator.onLine`. | Added `#alerts-offline-banner` to `alertsCenter.js` displaying: *"📡 Offline Mode: Showing cached alert records. Live sync paused until connection returns."* | `frontend.phase8bMobilePilotValidation.test.js` (Test 2) | **RESOLVED & VERIFIED** |
| **DEF-8B-03** | **P2 (Network Sync)**| Connectivity Observer | Transitioning from offline to online showed a toast but did not inform active alert feeds or conversational assistant views. | `connectivity.js` only called `setOnline()`; did not dispatch custom events or invoke view refreshers. | Updated `initConnectivityObserver()` to dispatch `iit:online-resync` and invoke `refreshAlertsView()` / `refreshChatAssistantView()`. | `frontend.phase8bMobilePilotValidation.test.js` (Test 2) | **RESOLVED & VERIFIED** |
| **DEF-8B-04** | **P2 (Lifecycle)** | Service Worker / Test Race | In fast successive test evaluation, `sw-register.js` `controllerchange` listener could trigger reload while `page.evaluate()` was executing. | Unconditional `location.reload()` on worker transition caused execution context destruction in single-worker test runners. | Hardened `reloadedForNewWorker` flag guard to prevent duplicate reload triggers. | `mobile.experience.spec.js` (100% 4/4 Passed) | **RESOLVED & VERIFIED** |

---

## 3. Residual Defect Summary
- **P0 Open:** 0
- **P1 Open:** 0
- **P2 Open:** 0
- **P3 Open:** 0
- **P4 Open:** 0
- **Total Unresolved Defects:** **ZERO (0)**
