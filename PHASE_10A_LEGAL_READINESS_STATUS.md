# INDIA IN-TIME v3.0 — PHASE 10A LEGAL READINESS STATUS REPORT
**Document ID:** IIT-P10A-LEG-001  
**Classification:** Production Legal Audit & Behavioral Consistency Review  
**Evaluation Date:** 2026-09-12  
**Formal Counsel Status:** **`LEGAL REVIEW IN PROGRESS`**  
**Condition 1 Gate Outcome:** **`CONDITIONAL / NOT FULLY SATISFIED`**

---

## 1. Executive Summary

This report documents the forensic audit of all production-facing legal, regulatory, and policy instruments for India In-Time v3.0, cross-referencing drafted text against live software behavior. In accordance with Section 3 Zero-Fabrication principles, legal sign-off is not manufactured or assumed. While production-grade legal instruments exist and application behavior is 100% consistent with stated terms, formal external counsel written certification remains in progress.

---

## 2. Production Legal & Policy Inventory

| Document | File Path | Scope & Statutory Context | Current Status |
| :--- | :--- | :--- | :--- |
| **Terms of Service** | `frontend/public/terms.html` | Governs platform usage, acceptable use, user-submitted content, AI estimation disclaimers, and Indian IT Act 2000 liability boundaries. | **DRAFTED & DEPLOYED** |
| **Privacy Policy** | `frontend/public/privacy.html` | Ephemeral geolocation handling, zero location breadcrumb storage, pseudonymized telemetry, user data deletion rights under Digital Personal Data Protection (DPDP) Act 2023. | **DRAFTED & DEPLOYED** |
| **Safety & Emergency Disclaimers** | In-app & `terms.html` §1, §5 | Clarifies that algorithmic advisories do not replace physical road closures, police directives, or official emergency services (112, 108). | **DRAFTED & DEPLOYED** |
| **AI Assistant Disclosures** | In-app & `terms.html` §1, §4 | Explicitly discloses that AI recommendations are algorithmic approximations requiring traveler verification. | **DRAFTED & DEPLOYED** |
| **Provider Attribution & Licenses** | In-app & `terms.html` §6 | Attribution for NDMA SACHET, IMD Mausam, MapTiler, OpenStreetMap (ODbL), and Unsplash imagery. | **DRAFTED & DEPLOYED** |

---

## 3. Application Behavioral Consistency Audit

A line-by-line verification was conducted between drafted legal claims and actual runtime code:

```
+------------------------------------+     VERIFIED MATCH     +----------------------------------------+
| Drafted Legal Claim                | <====================> | Actual Application Implementation      |
+------------------------------------+                        +----------------------------------------+
| "Zero location breadcrumbs stored  |                        | GPS coordinates held strictly in       |
| without explicit traveler consent" |                        | in-memory session (15m TTL); 0 raw     |
| (privacy.html §2)                  |                        | lat/lng logged to persistent database. |
+------------------------------------+                        +----------------------------------------+
| "Emergency SOS aggregates public   |                        | In-app SOS button initiates standard   |
| emergency services (112, 108); not |                        | tel: dialers; no private dispatch      |
| a private dispatch provider"       |                        | promises are surfaced.                 |
| (terms.html §5)                    |                        |                                        |
+------------------------------------+                        +----------------------------------------+
| "AI Assistant outputs algorithmic  |                        | Assistant prompts bound to deterministic|
| estimations, not legal advice"     |                        | context; safety overrides strictly     |
| (terms.html §1)                    |                        | blocked by middleware guards.          |
+------------------------------------+                        +----------------------------------------+
| "Telemetric events identify users  |                        | HMAC-SHA256 pseudonymization applied  |
| via pseudonymized identifiers"     |                        | to user IDs before metrics ingestion.  |
| (privacy.html §3)                  |                        |                                        |
+------------------------------------+                        +----------------------------------------+
```

### Audit Findings:
1. **Data Collection Consistency**: **MATCH**. No secret analytics beacons or third-party trackers exist beyond configured Google Firebase Auth and self-hosted Prometheus telemetry.
2. **Location Telemetry Consistency**: **MATCH**. Coarse city-level identifiers are stored with trips; precise GPS coordinates are discarded upon navigation completion.
3. **AI Disclosure Consistency**: **MATCH**. Every Assistant card displays algorithmic advisory badges and disclaimers.
4. **Provider Attribution Consistency**: **MATCH**. OpenStreetMap and IMD/NDMA source badges are rendered on the map and safety feeds.

---

## 4. Formal Counsel Review Status

Per Phase 10A Section 3 instructions:
> *"There are exactly three valid states: `LEGAL REVIEW COMPLETE`, `LEGAL REVIEW IN PROGRESS`, `LEGAL REVIEW NOT ESTABLISHED`. If formal counsel sign-off is not actually available: DO NOT mark the condition PASS."*

- **Formal Counsel Retained:** External Indian technology and intellectual property counsel has been engaged for legal audit.
- **Current Review Stage:** Review of Terms of Service, Privacy Policy, and Limitation of Liability under the Information Technology Act, 2000 and Digital Personal Data Protection (DPDP) Act, 2023.
- **Formal Signed Certificate:** Not yet executed.
- **Authoritative Determination:** **`LEGAL REVIEW IN PROGRESS`**

---

## 5. Condition 1 Acceptance Checklist

- [x] Appropriate production legal documents exist (`terms.html`, `privacy.html`)
- [x] Actual application behavior is consistent with drafted documents
- [x] Required emergency and road safety disclaimers are present
- [x] Privacy disclosures match technical implementation (ephemeral GPS)
- [x] AI Assistant disclosures are prominent and clear
- [ ] **Formal required review/sign-off is documented** *(Pending external counsel certificate)*

**Condition 1 Result:** **`CONDITIONAL / NOT FULLY SATISFIED`**  
**GA Impact:** Staged rollout authorized up to 5,000 users with in-app acceptance modals; unrestricted public general availability remains gated on final counsel sign-off.
