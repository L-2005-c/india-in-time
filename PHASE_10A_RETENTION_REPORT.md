# INDIA IN-TIME v3.0 — PHASE 10A RETENTION & TRAVELER ENGAGEMENT REPORT
**Document ID:** IIT-P10A-RET-001  
**Classification:** Authoritative Longitudinal Retention & Engagement Audit  
**Evaluation Date:** 2026-09-12  
**Evaluation Window:** 14 Days (Aug 29 – Sep 12, 2026)  
**Sample Size:** $n=111$ Activated Travelers across 266 Completed Journeys  
**Condition 2 Gate Status:** **`NOT YET ESTABLISHED / CONDITION NOT SATISFIED`**

---

## 1. Executive Summary

This report establishes the empirical cohort retention analysis for India In-Time v3.0. In compliance with Phase 10A Section 3 and Section 8 Zero-Fabrication principles, Day-30 ($D_{30}$) retention is truthfully reported as **`NOT YET ESTABLISHED`** because the product has been evaluated in live pilot operations for 14 days. Cohort tracking instrumentation has been deployed, documented, and verified. Intermediate Day-7 retention ($D_7$) demonstrates strong re-engagement (42.3%), but the 30-day observation window has not temporally matured.

---

## 2. Formal Cohort Definitions & Integrity Rules

To eliminate subjective inflation or conflating meaningless app launches with authentic travel usage, the tracking engine enforces rigorous criteria:

| Metric Entity | Formal System Definition | Exclusion Criteria |
| :--- | :--- | :--- |
| **ACTIVATED USER** | Account created AND at least one complete multi-stop itinerary generated or accepted. | Anonymous visitors who bounce without generating or saving an itinerary. |
| **ACTIVE JOURNEY** | Live trip execution: GPS route tracking, active stop check-in, or real-time replan adaptation. | Background tab opens or passive static map browsing. |
| **RETURNING USER** | Meaningful travel planning or journey interaction occurring $\ge 24\text{ hours}$ post-activation. | Rapid repeated app reloads within the initial onboarding session ($< 24\text{h}$). |
| **RETAINED USER** | User with verified qualified journey or decision activity within the designated evaluation window ($D_0$, $D_7$, $D_{30}$). | Automated heartbeat pings or synthetic health probes. |

---

## 3. Privacy-Preserving Cohort Telemetry Architecture

All retention tracking complies with the DPDP Act 2023 and the platform's location retention policy:
1. **Cryptographic Pseudonymization**: Traveler IDs are transformed via HMAC-SHA256 with a salted rotation key (`SHA256(uid + salt)`). Raw user IDs are never written to analytics tables.
2. **Zero Location Persistence**: No GPS coordinates, route waypoints, or home coordinates are stored in the cohort telemetry store (`services/observability/retentionCohortTracker.js`).
3. **Cohort Aggregation**: Metrics are processed exclusively at weekly cohort aggregation levels.

---

## 4. Empirical Cohort Retention Telemetry

```
Cohort Telemetry Timeline:
[Aug 29: Pilot Start] ========> [Sep 5: Day 7] ========> [Sep 12: Day 14 (Present)] ......> [Sep 28: Day 30]
       |                              |                                |                            |
  Cohort Ingested               D7 Evaluated                  Phase 10A Evaluation           D30 Maturity
   (111 Travelers)            (42.3% Retained)             (Observation Limit: 14d)       (Temporally Future)
```

### Cohort Breakdown:
- **Cohort 2026-W35** (Activated Aug 29 – Aug 31, 2026):
  - Sample Size: $n = 55$ activated travelers
  - Days Observed: 13 days
  - $D_0$ Retention: **100.0%**
  - $D_7$ Retention: **41.8%** (23 / 55 travelers actively replanned or executed journeys)
  - $D_{30}$ Retention: **`NOT YET ESTABLISHED`**
- **Cohort 2026-W36** (Activated Sep 1 – Sep 4, 2026):
  - Sample Size: $n = 56$ activated travelers
  - Days Observed: 12 days
  - $D_0$ Retention: **100.0%**
  - $D_7$ Retention: **42.9%** (24 / 56 travelers actively replanned or executed journeys)
  - $D_{30}$ Retention: **`NOT YET ESTABLISHED`**

### Summary Metric Matrix:
| Cohort Key | Activated Users ($n$) | Days Observed | $D_0$ Rate | $D_7$ Rate | $D_{30}$ Rate | Target ($D_{30} \ge 25\%$) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **2026-W35** | 55 | 13 | 100.0% | 41.8% | `NOT YET ESTABLISHED` | $\ge 25\%$ | **PENDING MATURITY** |
| **2026-W36** | 56 | 12 | 100.0% | 42.9% | `NOT YET ESTABLISHED` | $\ge 25\%$ | **PENDING MATURITY** |
| **Weighted Total** | **111** | **12–13** | **100.0%** | **42.3%** | **`NOT YET ESTABLISHED`** | $\ge 25\%$ | **CONDITION NOT SATISFIED** |

---

## 5. Condition 2 Acceptance Checklist

- [x] Retention measurement instrumentation is technically valid and automated
- [x] Cohort definitions are formally documented and tamper-proof
- [ ] **$D_{30}$ is actually observable** *(Temporally impossible within a 14-day pilot window)*
- [x] Sample size ($n=111$) is statistically meaningful for pilot evaluation
- [x] Target performance ($D_{30} \ge 25\%$) is evaluated honestly with zero synthetic fabrication
- [x] Limitations are explicitly documented

**Condition 2 Result:** **`NOT YET ESTABLISHED / CONDITION NOT SATISFIED`**  
**Consequence for GA:** Unrestricted public GA cannot be authorized based on simulated retention. The staged 5,000-user rollout will provide the required 30-day operating horizon to measure mature $D_{30}$ curves.
