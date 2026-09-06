# India In-Time — Intelligence Architecture & Truthful Decision Contracts

This document specifies the end-to-end architecture of India In-Time's Travel Intelligence Engine. The system is designed to provide **unquestionably reliable**, **evidence-aware**, **failure-safe**, **geographically grounded**, and **human-understandable** travel guidance across India.

---

## 1. Core Operating Principles

1. **Truth Over False Certainty**:
   - Prefer `"NO RESULT"` over `"WRONG RESULT"`.
   - Prefer `"UNKNOWN"` or explicit confidence bands over fabricated precision.
   - Never claim `"100% accurate"` or unverified marketing language.
2. **Explicit Provenance Model**:
   - Every piece of data returned to travelers carries explicit data states:
     - `OBSERVED`: Direct sensor/station observation.
     - `ESTIMATED`: Grounded mathematical/physics model (e.g. speed-flow, OSRM road geometry).
     - `PREDICTED`: Astronomical or historical pattern forecast (e.g. solar elevation, historical footfall).
     - `OFFICIAL`: Curated benchmark or government dataset.
     - `UNAVAILABLE`: Missing signal cleanly reported without fabricating fallback values.
     - `STALE`: Cached data past validity window.
3. **Zero-Trust Entity Verification**:
   - Reference datasets (Golden benchmarks, Whitelists) are treated as **candidates** subject to multi-signal coordinate integrity verification.
   - Localities (e.g. *Marripalem*, *Seethammadhara*, *Dwaraka Nagar*) are strictly quarantined/rejected from ever becoming tourist destinations.
   - Candidate coordinates outside city radius (>70 km) are rejected; candidate coordinates diverging from reference surveys (>1,500 m for beaches, >3,500 m for viewpoints) are quarantined.

---

## 2. Provenance & Confidence Model (`provenanceModel.js`, `confidenceEngine.js`)

```
Data State Taxonomy:
  UNKNOWN | UNAVAILABLE | OBSERVED | ESTIMATED | PREDICTED | LIVE | OFFICIAL | STALE

Confidence Bands:
  HIGH   (Evidence score >= 70) — Multi-signal consensus (weather + verified coords + opening hours + rules)
  MEDIUM (Evidence score >= 40) — Core signals present; some estimates used
  LOW    (Evidence score < 40)  — Minimal verified signals; relies on fallbacks
```

- Zero-signal calls return `confidence: 0`, `confidenceBand: 'LOW'`, and explicit reasons (`"No verified data sources available for this place"`).
- Confidence scores are strictly additive based on verified signals present:
  - Valid coordinates (+20)
  - Verified opening hours (+20)
  - Weather signal (+20)
  - Category heuristics (+10)
  - Routing network estimate (+10)
  - Historical crowd observation (+10)

---

## 3. Routing Trust Hierarchy & Mountain Physics

```
Routing Hierarchy:
  1. Live Traffic Route         (Sensor/Probe real-time flow)
  2. Road Network Estimate      (OSRM topological network with speed-flow physics)
  3. Geodesic Heuristic Fallback (Great-circle distance × 1.35 winding factor)
```

- Routing estimates explicitly declare their source:
  - An OSRM estimate is labeled `ROAD_NETWORK_ESTIMATE` (never masquerading as "live traffic").
  - Mountain corridors (*Ghat roads* in Araku, Lambasingi, Paderu, Tirumala) enforce switchback physics:
    - Speed caps: 22–28 km/h on hairpin bends.
    - Curfew modeling: Tirumala ghat road closure between 23:45 and 03:00.
    - Monsoon landslide vulnerability indexes dynamically dampening speeds during heavy rainfall.

---

## 4. Crowd & Darshan Queue Engine (`crowdEngine.js`)

- Crowd estimates distinguish between `HISTORICAL_PATTERN` and `RULE_BASED_ESTIMATE`.
- Darshan and entry queues provide realistic traveler ranges rather than artificial point precision:
  - `minWaitMinutes` and `maxWaitMinutes` (e.g. `~15–25 min Entry / Security Queue`, `~54–97 min Heavy Darshan/Entry Queue`).
  - Off-peak windows calculated based on place category (temple, fort, viewpoint, cafe).

---

## 5. Dynamic Itinerary Replanning (`adaptiveReplanner.js`)

When an in-flight disruption occurs (traffic delay, sudden rain, sanctum closure):
- **Completed Stops Locked**: Past visited stops are immutable history.
- **Remaining Stops Rescheduled**: Only remaining unvisited stops are re-optimized.
- **Explainable Delta**: Generates structured changes:
  - `droppedStops`: Destinations pruned due to time expiration or closure.
  - `adjustedTimes`: Shifted arrival/departure windows.
  - `explanation`: Human-friendly explanation ("*Skipped Museum because it closes at 17:00; rerouted directly to Sunset Point*").

---

## 6. Prompt Injection Defense & Gemini Trust Layer (`services/gemini.js`)

- All user inputs passed to the Gemini AI travel assistant are sanitized via `sanitizeAiInput`:
  - Strips XML/HTML tags, role masquerades (`<system>`, `<developer>`, `assistant:`).
  - Truncates inputs exceeding 1,200 characters.
  - Blocks prompt jailbreaks (`ignore previous instructions`, `reveal system prompt`).

---

## 7. Runtime Data Quality Dashboard (`dataQualityDashboard.js`)

Diagnostic endpoints track system health without fabricating metrics:
- POI Verification & Quarantine Rates
- Routing Fallback Frequencies
- Weather Availability & Stale Cache Metrics
- Crowd Confidence Distribution
