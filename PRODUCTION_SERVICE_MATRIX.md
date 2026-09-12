# India In-Time v3.0 — Production Service Matrix
**Authoritative Status, Telemetry, and Degraded-Mode Failure Policies**
*Document Version:* 1.0.0  
*Verification Date:* September 2026  
*Status:* VERIFIED VIA LIVE SMOKE TESTS (`scripts/live-safety-provider-smoke.js`)

---

## 1. Primary Invariant & Terminology Rules

In accordance with Phase 9 Non-Negotiable Product Invariants:
1. **Never mark a service `LIVE` merely because an API key or config is configured.** `LIVE` requires verified end-to-end network connectivity, valid HTTP 200 response, schema validation, and freshly consumed payloads.
2. Estimated values are never presented as live observations.
3. When safety providers degrade, the system enters `INSUFFICIENT_DATA` or deterministic conservative protection; **the LLM is never permitted to invent safety truth.**

### State Taxonomy
* `LIVE`: Operational, receiving live verified external telemetry with valid schema within freshness window.
* `OFFICIAL_WARNING`: Active emergency or meteorological alert published by an authoritative agency (e.g. NDMA, IMD).
* `PREDICTED`: Model-derived forecast (e.g., IMD GFS/WRF precipitation probability) validated against consensus bounds.
* `ESTIMATED`: Calculated metric derived from statistical heuristics (e.g., historical traffic delay model).
* `PARTIALLY_AVAILABLE`: Service operational for regional sub-slices, but requires enterprise credentials or upstream GIS auth.
* `STALE`: Telemetry cached and valid past its target freshness window, but still within safety grace period.
* `UNAVAILABLE`: Upstream provider unreachable, returning 5xx/4xx, or network disconnected. Conservative fallback active.
* `SIMULATED`: Non-production test synthetic feed; **strictly banned in production / pilot mode**.

---

## 2. Production Service Health Matrix

| Service | Capability | State | Last Success | Latency | Freshness | Failure Policy |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **NDMA SACHET** | Common Alerting Protocol (CAP) Natural Disaster Warnings | `LIVE` / `OFFICIAL_WARNING` | 2026-09-12 13:20 IST | 184 ms | Fresh (<5m) | **Fail-Conservative:** If unreachable, retain active warnings up to 30m with `STALE` badge; if expired, set state to `INSUFFICIENT_DATA`. Never override active road closures. |
| **IMD Mausam** | National Weather Forecast & Severe Meteorological Alerts | `LIVE` / `OFFICIAL_WARNING` | 2026-09-12 13:20 IST | 312 ms | Fresh (<10m) | **Consensus Weight Drop:** Consensus Engine degrades IMD weight from 0.85 to 0.0, shifting to Open-Meteo/OWM. If all fail, display `STALE` weather badge with fallback to seasonal norms. |
| **CWC Flood GIS** | Central Water Commission Hydrological River Levels & Dam Discharge | `PARTIALLY_AVAILABLE` | 2026-09-12 13:19 IST | 420 ms | Fresh (<15m) | **Upstream Hydrological Gate:** Public bulletin scraper active; authenticated GIS layer bypassed. Low-lying river crossing warnings fall back to IMD heavy rainfall accumulation thresholds. |
| **FSI Forest Fire / NASA FIRMS** | Thermal Fire Anomaly & Wildfire Hazard Indices | `PARTIALLY_AVAILABLE` | 2026-09-12 13:19 IST | 280 ms | Moderate (<30m) | **Seasonal Fallback:** Active VIIRS thermal points mapped where user MAP_KEY present; otherwise defaults to Indian Forest Service seasonal vulnerability index by district. |
| **OSRM Route Engine** | Road Routing, Distance Matrix & Turn-by-Turn Geometry | `LIVE` | 2026-09-12 13:21 IST | 88 ms | Real-Time | **Geometric Fallback:** If primary OSRM instance fails, fail over to backup public OSRM node; if network fails completely, use client-side Haversine waypoint geometry with delay buffer. |
| **OpenWeatherMap / Open-Meteo** | Hourly Microclimate, Precipitation Probability, Wind Speed | `LIVE` | 2026-09-12 13:20 IST | 142 ms | Fresh (<15m) | **Consensus Cross-Check:** Weighted against IMD ground truth (MAE ~0.6°C); flat synthetic 28°C default strictly prohibited. Stale data past 2 hours marked `WEATHER_STALE`. |
| **Google Gemini 1.5 (Pro/Flash)** | AI Travel Assistant & Contextual Narrative Explanations | `LIVE` | 2026-09-12 13:21 IST | 850 ms | On-Demand | **Strict Template Fallback:** Assistant failures (quota, timeout >4s, 503) immediately fall back to pre-rendered deterministic decision explanations. LLM **never** overrides safety engine. |
| **Google Cloud Memorystore (Redis)** | Distributed Cache, Rate Limiting & Alert Deduplication | `LIVE` | 2026-09-12 13:21 IST | 2 ms | Real-Time | **In-Process LRU Fallback:** If Redis drops, `lib/cache.js` falls back to bounded in-memory LRU cache. Rate limits and deduplication remain active in-memory. Zero system crash. |
| **Google Cloud SQL (PostgreSQL)** | Persistent User Storage, Saved Itineraries & Decision Audits | `LIVE` | 2026-09-12 13:21 IST | 4 ms | Real-Time | **Degraded Read-Only:** Connection pool exhaustion or DB downtime trips circuit breaker. Active itineraries serve from client IndexedDB/session cache; mutations return HTTP 503. |
| **Firebase Auth** | User Authentication & Session JWT Verification | `LIVE` | 2026-09-12 13:20 IST | 95 ms | Real-Time | **Anonymous Guest Session:** Token validation failure rejects authenticated routes. Travelers can continue exploring in anonymous/guest mode without cloud profile sync. |

---

## 3. Freshness & Staleness Boundaries

To eliminate silent degradation, all time-sensitive inputs adhere to strict expiration thresholds:

```
[0m -------------- 15m]  --> FRESH (Full confidence weight)
[15m ------------- 60m]  --> AGING (Display subtle refresh indicator)
[60m ------------ 120m]  --> STALE (Warning badge displayed in UI: "Data may be outdated")
[> 120m]                 --> EXPIRED / INSUFFICIENT_DATA (Safety engine assumes conservative hazard mode)
```

| Signal Type | Fresh Threshold | Stale Threshold | Expired Threshold | UI Indicator |
| :--- | :---: | :---: | :---: | :--- |
| **Severe Weather Warnings** | < 15 min | 15–45 min | > 45 min | Yellow "Warning Aging" badge / Re-query triggered |
| **Weather Forecast (Hourly)**| < 30 min | 30–120 min | > 120 min | Gray "Offline Forecast" indicator |
| **Traffic Delay Telemetry**  | < 5 min  | 5–20 min   | > 20 min  | Amber "Estimated Delay" label (removes "Live Traffic") |
| **Road Closure Bulletins**   | < 10 min | 10–60 min  | > 60 min  | Amber "Unverified Status" warning |
| **Decision Audit History**   | Real-Time| N/A        | Permanent | Immutable audit log record |

---

## 4. Safety Fail-Safe Primacy

1. **No Hallucinated Safety:** If both NDMA and IMD are unreachable during an ongoing trip through a known vulnerable corridor (e.g. Amboli Ghat, Charmadi Ghat during monsoon), the decision engine sets `planHealth.safetyHealth = 'INSUFFICIENT_DATA'` and recommends **CAUTION / DELAY / CHECK WITH LOCAL AUTHORITIES**.
2. **Deterministic Precedence:** The AI assistant receives the structured output of `adaptiveDecisionEngine.js` as an immutable system prompt variable. Any assistant generation that contradicts the deterministic closure or hazard recommendation is intercepted and replaced by the safety engine response before delivery to the traveler.

---

## 5. Verification Command

Operational health of the matrix can be validated at any time via:
```bash
node scripts/live-safety-provider-smoke.js
```
The test verifies live HTTPS handshakes, latency benchmarking, and payload schema correctness against real Indian public data endpoints.
