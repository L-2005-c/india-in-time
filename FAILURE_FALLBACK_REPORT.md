# INDIA IN-TIME: FAILURE, DEGRADATION & FALLBACK REPORT
**Release:** Next Stable / Production Hardening Version  
**Status:** PASS — Zero Single Points of Failure, Fully Covered Fallback Chains  
**Audit Date:** October 2026  

---

## 1. Executive Summary

A core invariant of the India In-Time platform is: **Never display blank screens or throw unhandled exceptions when upstream external APIs fail, timeout, or rate-limit.**

Every integration point implements an authoritative tiered fallback chain with strict provenance preservation.

---

## 2. Tiered Fallback Architecture Matrix

| Domain | Primary Tier (L1) | Secondary Tier (L2) | Fallback Tier (L3) | Terminal Safeguard (L4) |
| :--- | :--- | :--- | :--- | :--- |
| **Routing** | Google Directions API | OSRM Mirror Cluster (Raced) | Terrain Corridor Speed Model | Great-Circle Winding Factor |
| **Traffic** | Google Live Sensor API | OSRM Calibrated Peak Model | Historical Indian Corridor Baseline | Estimated Corridor Profile |
| **POI Resolution**| Golden Survey Benchmark | Curated Whitelist | Static Municipal Seeds (1000+) | Nominatim Hybrid + Validation |
| **Geocoding** | Nominatim Geocoder | Cache Tier (L1/L2) | Known Landmark Dictionary | Municipal District Centroid |
| **Weather** | Open-Meteo Live API | IMD Observation Service | Seasonal Indian Climatology Cache | `createSafeFallback('weather')` |
| **Itinerary AI** | Gemini 2.5 Flash API | Multi-Key Sticky Failover | Deterministic Rule-Based Engine | Pre-Generated Golden Plan |
| **Cache Storage**| Redis Distributed Cluster | QuickLRU In-Memory (Node.js) | Local Process Memory | Bypass / Direct Compute |

---

## 3. Fallback Chain Detailed Walkthrough

### 3.1 Routing & Traffic Fallback
1. **Google Directions API:** Checked first if API key configured. Times out after 4,000ms.
2. **OSRM Mirror Cluster:** Raced across available mirrors (`mirrorRacer.js`). Mirror circuit breaker trips after 3 consecutive failures (60s cooldown).
3. **Terrain Corridor Model:** Computes driving distance and time using surveyed Indian winding factors (1.08 to 1.55) and hour-of-day rush calibrations.
4. **Provenance Labeling:** The route object explicitly switches its label to `ROAD_NETWORK_ESTIMATE` or `FALLBACK_CORRIDOR_ESTIMATE`.

### 3.2 AI Itinerary Generation Fallback
1. **Primary Gemini Key:** Monitored via circuit breaker (`services/geminiService.js`).
2. **Key / Quota Failover:** On 429/503 responses, seamlessly activates secondary Gemini API key with sticky cooldown.
3. **Deterministic Adaptive Engine:** If both keys fail or network is severed, `adaptiveDecisionEngine.js` generates fully structured day itineraries using cultural timings, opening hours, and geo-spatial clustering.

### 3.3 Data Freshness Safe Envelope (`createSafeFallback`)
When any external provider is unreachable:
```json
{
  "value": { "tempC": 28, "condition": "Sunny" },
  "domain": "weather",
  "provider": "resilient_offline_fallback",
  "provenance": "ESTIMATED",
  "confidence": 0.50,
  "isStale": true,
  "isExpired": true,
  "freshness": "EXPIRED",
  "metadata": {
    "fallback": true,
    "reason": "UPSTREAM_UNAVAILABLE",
    "message": "Operating in high-availability offline mode; upstream live provider temporarily unreachable."
  }
}
```

---

## 4. Fallback Verification Test Suites

- Routing Failover: `__tests__/services.routingAlternativesAndClosures.test.js` (PASS)
- Mirror Racing & Circuit Breakers: `__tests__/services.routingAdvanced.test.js` (PASS)
- Traffic Provider Fallback: `__tests__/services.trafficProvider.test.js` (PASS)
- AI Failover & Simulation: `__tests__/routes.ai.test.js` & `__tests__/services.gemini.test.js` (PASS)
- Data Freshness Fallbacks: `__tests__/services.dataFreshnessService.test.js` (PASS)

---

## 5. Certification

All critical pathways feature automated, zero-downtime degradation paths, ensuring continuous traveler navigation regardless of third-party API availability.
