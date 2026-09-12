# India In-Time v3.0 — Phase 9 Incident Runbook
**Operational Emergency Procedures, Disaster Response, and Failure Mitigation Playbooks**
*Document Version:* 1.0.0  
*Effective Date:* September 2026  
*Status:* APPROVED FOR PRODUCTION OPERATIONS

---

## 1. Incident Response Framework

All operational incidents follow the rigorous 7-stage lifecycle:

$$\text{DETECT} \longrightarrow \text{CONTAIN} \longrightarrow \text{ASSESS} \longrightarrow \text{MITIGATE} \longrightarrow \text{RECOVER} \longrightarrow \text{VERIFY} \longrightarrow \text{DOCUMENT}$$

### Severity Definitions & SLA Thresholds
* **P0 (Emergency):** Critical traveler safety threat, false clear on natural hazard, security breach, or total platform failure.
  * *Response Time:* $< 5\text{ minutes}$ | *Target Mitigation:* $< 20\text{ minutes}$
* **P1 (Critical):** Core itinerary generation unavailable, database pool connection exhaustion, or regional provider blackout.
  * *Response Time:* $< 15\text{ minutes}$ | *Target Mitigation:* $< 45\text{ minutes}$
* **P2 (Major):** AI Assistant degraded, non-critical telemetry stale, or notification latency high.
  * *Response Time:* $< 60\text{ minutes}$ | *Target Mitigation:* $< 4\text{ hours}$
* **P3/P4 (Minor):** Cosmetic display defect or minor localized POI timing discrepancy.
  * *Response Time:* Next business day.

---

## 2. Standard Operating Procedures (Playbooks)

### Playbook 1: P0 Safety Incident (Hazard Misclassification / False Clear)
* **Trigger:** An active landslide, flash flood, or official road closure was omitted from an active route, or the system indicated a corridor was clear when danger existed.
* **1. DETECT:** Alert received via operator hotline, pilot feedback tag `incorrect_recommendation`, or automated NDMA sync mismatch.
* **2. CONTAIN:**
  * Immediately activate Emergency Safety Override via feature flag or admin CLI:
    ```bash
    curl -X POST https://api.indiaintime.app/api/admin/safety-lockdown \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -d '{"corridorId": "corridor_all_ghats", "state": "LOCKDOWN_AVOID"}'
    ```
  * Injects conservative `AVOID / REROUTE` decision state for all trips passing through the affected sector.
* **3. ASSESS:** Identify why authoritative signal was missed (e.g. CAP XML schema change, parser timeout, or geographic geofence mismatch).
* **4. MITIGATE:** Hardcode manual geofence barrier in `services/travelIntelligence/safety/geofenceOverrides.json` and deploy emergency patch.
* **5. RECOVER:** Dispatch targeted push notification to affected active travelers: *"Route updated due to active severe weather bulletin."*
* **6. VERIFY:** Confirm all planned routes avoiding the zone; verify automated route generator circumvents the affected highway.
* **7. DOCUMENT:** Author comprehensive Post-Incident Review (PIR) within 24 hours.

---

### Playbook 2: P0 Security Incident (Unauthorized Data Access or Secret Leakage)
* **Trigger:** Suspicious spike in 403/401 errors, unauthorized trip access attempt, or credential discovered in external logs.
* **1. DETECT:** Cloud Armor WAF anomaly alert or unexpected error log rate.
* **2. CONTAIN:** Revoke compromised credential immediately in Google Cloud Secret Manager. Rotate `SESSION_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, and database passwords.
* **3. ASSESS:** Inspect database audit logs to determine whether any cross-tenant data was accessed.
* **4. MITIGATE:** Block offending IP addresses at Cloudflare WAF; force invalidation of active traveler session JWTs.
* **5. RECOVER:** Deploy new container revision with refreshed secret bindings; restore clean traffic flow.
* **6. VERIFY:** Test authentication flow end-to-end; verify zero unauthorized data exposure.
* **7. DOCUMENT:** Publish security advisory and notify compliance stakeholders.

---

### Playbook 3: P1 Production Platform Outage (Server Crash Loop / 500 Cascade)
* **Trigger:** Uptime probe reports `/api/ready` returning 5xx or connection timeout for $> 60\text{s}$.
* **1. DETECT:** Cloud Run alert / PagerDuty page triggered.
* **2. CONTAIN:** Execute immediate rollback to previous pinned stable container revision:
  ```bash
  gcloud run services update-traffic india-in-time-prod \
    --to-revisions=PREVIOUS_HEALTHY_REVISION=100
  ```
* **3. ASSESS:** Inspect stderr logs in Cloud Logging for unhandled exceptions or memory leaks (`JavaScript heap out of memory`).
* **4. MITIGATE:** Identify root-cause commit. If caused by malformed input payload, apply input sanitization patch in hotfix branch.
* **5. RECOVER:** Re-deploy patched revision to canary tier (10% traffic), observe for 15 minutes, then shift 100%.
* **6. VERIFY:** Automated smoke suite (`scripts/production-check.js`) passes on production URL.
* **7. DOCUMENT:** Document incident in release log.

---

### Playbook 4: External Safety Provider Outage (NDMA / IMD Unreachable)
* **Trigger:** NDMA CAP endpoint or IMD Mausam RSS fails to respond for $> 15\text{ minutes}$.
* **1. DETECT:** Provider health monitor detects 3 consecutive failed fetches; status transitions to `UNAVAILABLE`.
* **2. CONTAIN:** The system activates **Conservative Safe Degradation**:
  * Freezes current active advisories for up to 60 minutes with a prominent `STALE` badge.
  * If outage exceeds 60 minutes, marks provider as `INSUFFICIENT_DATA`.
* **3. ASSESS:** Check upstream status pages or test direct curl from outside hosting infrastructure.
* **4. MITIGATE:** Consensus Engine automatically down-weights IMD/NDMA and up-weights secondary authoritative sources (Open-Meteo, regional disaster bulletins).
* **5. RECOVER:** Once upstream REST API recovers, verify payload integrity before clearing `INSUFFICIENT_DATA` status.
* **6. VERIFY:** Confirm live warnings re-synced and timestamps updated.
* **7. DOCUMENT:** Record provider downtime in `PRODUCTION_SERVICE_MATRIX.md`.

---

### Playbook 5: Database Outage (Cloud SQL Unreachable / Pool Exhaustion)
* **Trigger:** `/api/ready` returns 503; Knex pool emits `Knex: Timeout acquiring a connection`.
* **1. DETECT:** Health probe failure; DB latency metric exceeds 2000ms.
* **2. CONTAIN:** Application automatically enters `DEGRADED_READONLY_MODE`.
  * Inbound read requests for itineraries, weather, and decisions serve from Redis / in-memory cache.
  * Mutating endpoints return clean traveler-safe HTTP 503: *"Service is operating in offline-cached mode. Changes are saved locally on your device."*
* **3. ASSESS:** Check Cloud SQL CPU/memory utilization and active connection count in GCP Console.
* **4. MITIGATE:**
  * If connection leak: Restart worker containers to drain stale connection handles.
  * If database instance stuck: Trigger Cloud SQL failover to standby replica.
* **5. RECOVER:** Database connection pool re-establishes; `SELECT 1` ping returns in $< 5\text{ms}$; readiness probe resets to 200 OK.
* **6. VERIFY:** Execute `scripts/db-pool-loadtest.js` to ensure pool checkout stability.
* **7. DOCUMENT:** Update database sizing metrics.

---

### Playbook 6: Redis Memorystore Outage
* **Trigger:** `ioredis` emits `ECONNREFUSED` or connection timeout.
* **1. DETECT:** Redis latency metric spikes; log emits `[cache] Redis unavailable, using local LRU`.
* **2. CONTAIN:** Zero traveler-facing downtime! `lib/cache.js` immediately shifts to in-process bounded LRU cache (2,000 entries).
* **3. ASSESS:** Inspect Google Cloud Memorystore dashboard for network partition or cluster failover.
* **4. MITIGATE:** Allow automatic Redis cluster failover to secondary node; local LRU absorbs all caching and rate-limiting load.
* **5. RECOVER:** Redis reconnects via exponential backoff; cache layer resumes dual-tier sync.
* **6. VERIFY:** Redis health check in `/api/ready` transitions back to `healthy: true`.
* **7. DOCUMENT:** Log duration and cache miss rate during outage.

---

### Playbook 7: Notification Storm / Alert Loop Prevention
* **Trigger:** Excessive alerts dispatched to travelers in a short time window ($> 3\text{ alerts / 5 min}$).
* **1. DETECT:** Rate alert triggered by notification queue worker.
* **2. CONTAIN:** Global Notification Cooldown tripped:
  ```javascript
  // lib/notificationEngine.js
  if (now - lastAlertTime < COOLDOWN_WINDOW_MS) return DROP_DUPLICATE;
  ```
* **3. ASSESS:** Identify if rapid sensor oscillations (e.g. traffic delay toggling between 29m and 31m around threshold) are flapping decisions.
* **4. MITIGATE:** Enforce decision hysteresis: require minimum 15% change before re-notifying travelers on the same stop.
* **5. RECOVER:** Reset deduplication cache; dispatch single consolidated status digest.
* **6. VERIFY:** Validate single notification emission across full journey lifecycle test.
* **7. DOCUMENT:** Record threshold tuning in release notes.

---

### Playbook 8: AI Assistant Failure (Quota Exceeded / Gemini 503)
* **Trigger:** Gemini API returns 429 Resource Exhausted or 503 Service Unavailable.
* **1. DETECT:** Assistant error rate exceeds 5% over 5-minute window.
* **2. CONTAIN:** Express Assistant route intercepts upstream error and invokes `composeExplanation()` deterministic template generator.
* **3. ASSESS:** Check Google AI Studio / Vertex AI quota dashboard.
* **4. MITIGATE:** Seamlessly return traveler-safe structured response:
  > *"Route update: Delay of 35 min on NH66 due to heavy rainfall. We recommend taking the bypass route via Sawantwadi. (Automated Travel Advisory)"*
* **5. RECOVER:** Re-enable generative completions once quota resets or upstream provider recovers.
* **6. VERIFY:** Traveler UI displays structured advice without breaking conversation UI.
* **7. DOCUMENT:** Track assistant fallback frequency in weekly observability summary.

---

### Playbook 9: Data Freshness Stagnation
* **Trigger:** Weather or traffic data age exceeds 120 minutes without updating.
* **1. DETECT:** Freshness monitor trips `STALE_DATA_WARNING`.
* **2. CONTAIN:** UI displays yellow `STALE` badge beside temperature and route estimates; suppresses "Live" label.
* **3. ASSESS:** Check whether background sync worker was killed or cron schedule paused.
* **4. MITIGATE:** Trigger manual provider refresh worker; verify worker process restarted with auto-healing.
* **5. RECOVER:** Fresh telemetry received; stale badges automatically cleared from UI.
* **6. VERIFY:** Run `node scripts/live-safety-provider-smoke.js` to verify end-to-end sync.
* **7. DOCUMENT:** Review cron supervisor reliability.
