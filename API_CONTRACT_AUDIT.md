# INDIA IN-TIME v3.0 — API CONTRACT AUDIT

## 1. Master Endpoint & Contract Matrix

| Consumer | Method | Endpoint | Request Schema | Response Schema | Source of Truth | Contract Status |
|---|---|---|---|---|---|---|
| Frontend / App Shell | `GET` | `/api/health` | None | `{ status, ts, uptime, version, region, ha }` | Backend Server | **VERIFIED** |
| Frontend / Health Probe | `GET` | `/api/ready` | None | `{ status: 'ready'\|'not_ready', checks, ts }` | PostgreSQL & Redis status | **VERIFIED** |
| Frontend / Admin | `GET` | `/api/health/ready` | Bearer Token | `{ status, uptime, memory, gemini, caches }` | Redis / DB / Circuit Breakers | **VERIFIED** |
| Client SDK / Geocoder | `GET` | `/api/geocode` | `?q=string` | `[{ name, lat, lon, display_name }]` | Nominatim + Photon Fallback | **VERIFIED** |
| Client SDK / Explorer | `POST` | `/api/places` | `{ lat, lon, cityName, totalMinutes, prefs }` | `{ places: [...] }` | Places Discovery Engine | **VERIFIED** |
| Client SDK / Weather | `GET` | `/api/weather` | `?lat=num&lon=num` | `{ temp, conditions, rainProb, source }` | Multi-Source Weather Engine | **VERIFIED** |
| Client SDK / Trips | `POST` | `/api/trips` | `{ city, cityLat, cityLon, config, stops }` | `{ id, message }` | PostgreSQL `trips` Table | **VERIFIED** |
| Client SDK / Trips | `GET` | `/api/trips` | None (Auth Required) | `{ trips: [...], count }` | PostgreSQL `trips` Table | **VERIFIED** |
| Client SDK / Trips | `GET` | `/api/trips/:id` | None (Auth Required) | `{ id, city, stops: [...], config }` | PostgreSQL `trips` Table | **VERIFIED** |
| Client SDK / Routing | `POST` | `/api/routing/route` | `{ waypoints: [[lat, lon], ...] }` | `{ geometry, distanceKm, durationMin }` | OSRM / Native Routing Engine | **VERIFIED** |
| Client SDK / Time Intel | `POST` | `/api/time-intelligence/recommend` | `{ cityName, stops, currentMinute, dna }` | `{ recommendations: [...], pacing }` | GeoAI Time Intelligence 2.0 | **VERIFIED** |
| Journey HUD (Phase 1) | `POST` | `/api/intelligence/trips/:id/state` | `{ plan, travelerId, initialLocation, dna }` | `{ tripId, activePlanVersion, tripHealth, activeStop, upcomingStops }` | `journeyStateEngine` | **VERIFIED** |
| Journey HUD (Phase 1) | `GET` | `/api/intelligence/trips/:id/state` | None (Owner Auth Enforced) | `{ tripId, state, travelerDna }` | Active State Registry | **VERIFIED** |
| Journey HUD (Phase 1) | `POST` | `/api/intelligence/trips/:id/state/progress` | `{ stopId, action: 'START'\|'COMPLETE'\|'SKIP' }` | `{ message, updatedState }` | `journeyStateEngine` (Immutable) | **VERIFIED** |
| Travel Guardian (P1/2) | `GET` | `/api/intelligence/trips/:id/guardian` | None (Owner Auth Enforced) | `{ tripHealth, shouldReplan, activeTriggers, preservedStops }` | `travelGuardian` (12 Triggers) | **VERIFIED** |
| Replanner (Phase 1/2/3)| `POST` | `/api/intelligence/trips/:id/replan` | `{ triggerType, options }` | `{ shouldAdapt, newPlanVersion, preservedStops, changedStops }` | `adaptationPipeline` | **VERIFIED** |
| Plan Versions (Phase 1)| `GET` | `/api/intelligence/trips/:id/plan-versions` | None (Owner Auth Enforced) | `{ versionsCount, history: [...] }` | `planVersioning` Audit Trail | **VERIFIED** |
| Disruption HUD (Phase 2)| `POST` | `/api/intelligence/trips/:id/disruptions/evaluate` | `{ weather, traffic, currentMinute }` | `{ activeDisruptions: [...], macroAction }` | `disruptionClassifier` | **VERIFIED** |
| Alerts Center (Phase 2/3)| `GET` | `/api/intelligence/trips/:id/notifications` | None (Owner Auth Enforced) | `{ tripId, notifications: [...] }` | `disruptionNotificationEngine` | **VERIFIED** |
| Safety Engine (Phase 3)| `GET` | `/api/intelligence/safety/providers` | None | `{ providers: [{ name, status, latency, freshness }] }` | Official Feeds (IMD, NDMA, CWC) | **VERIFIED** |
| Safety Decision (Phase 3)| `POST` | `/api/intelligence/trips/:id/safety/evaluate` | `{ currentLocation, plannedRoute, weather }` | `{ safetyState, decision, dominantHazard, explanations }` | `safetyDecisionEngine` | **VERIFIED** |
| Experience HUD (Phase 4)| `POST` | `/api/intelligence/trips/:id/experience/evaluate` | `{ currentMinute, candidatePool, dna }` | `{ evaluation: { timeBudget, recommendations, sequencePlan } }` | `experienceValueEngine` | **REPAIRED & VERIFIED** |
| Experience HUD (Phase 4)| `GET` | `/api/intelligence/trips/:id/experience/recommendations` | None (Owner Auth Enforced) | `{ primaryRecommendation, recommendations: [...], timeBudget }` | Active Experience Cache | **REPAIRED & VERIFIED** |
| Experience HUD (Phase 4)| `POST` | `/api/intelligence/trips/:id/experience/decide` | `{ placeId, actionTaken, actualDwellMinutes, travelerRating }` | `{ success, outcomeId }` | `outcomeTracker` | **REPAIRED & VERIFIED** |
| Experience HUD (Phase 4)| `GET` | `/api/intelligence/experience/windows` | `?placeId=...&currentMinute=...` | `{ windowState, isPeak, crowdDensity, solarWindow }` | `experienceWindowEngine` | **REPAIRED & VERIFIED** |
| Tourist Trust HUD (P5) | `POST` | `/api/intelligence/trust/evaluate` | `{ target: { id, name, type }, context, isSimulated }` | `{ overallTrustState, confidence, subEvaluations, explainability }` | `touristTrustEngine` | **REPAIRED & VERIFIED** |
| Tourist Trust HUD (P5) | `GET` | `/api/intelligence/trust/entity/:id` | `?type=PLACE&city=...` | `{ entityId, canonicalName, trustState, verifications, prices }` | `trustEntityResolver` | **REPAIRED & VERIFIED** |
| Next Journey (Phase 6)| `POST` | `/api/intelligence/trips/:id/next-leg/intent` | `{ intentType, rawInput, options }` | `{ intentId, intentType, candidates: [...] }` | `destinationIntentResolver` | **VERIFIED** |
| Next Journey (Phase 6)| `POST` | `/api/intelligence/trips/:id/next-leg/evaluate` | `{ intentId, candidatePool, currentTime }` | `{ recommendation, rankedCandidates: [...] }` | `nextLegDecisionEngine` | **VERIFIED** |
| Next Journey (Phase 6)| `POST` | `/api/intelligence/trips/:id/next-leg/decide` | `{ action: 'ACCEPT'\|'REJECT', candidateId }` | `{ success, activeLeg, journeyChain }` | `journeyLegModel` | **VERIFIED** |
| Next Journey (Phase 6)| `GET` | `/api/intelligence/journeys/:id/legs` | None | `{ legsCount, legs: [...] }` | Persistent Journey Leg History | **VERIFIED** |

---

## 2. API Schema Consistency & Verification

### 2.1 Fixed Contract Gaps
1. **Frontend `window.API` Alignment**:
   - `client-api.js` was updated to provide direct, fully typed async methods for all Phase 4 (`evaluateTripExperience`, `fetchTripExperienceRecommendations`, `recordExperienceDecision`, `fetchExperienceWindows`, `fetchTripExperienceOutcomes`) and Phase 5 (`evaluateTrust`, `fetchEntityTrust`, `recordTrustFeedback`, `fetchTrustMetrics`) backend endpoints.
   - Removed discrepancies between parameter names (e.g., standardizing on `tripId`, `candidateId`, `placeId`).

2. **Idempotency & Safe Retries**:
   - Mutation endpoints (`POST /api/intelligence/trips/:id/state/progress`, `POST /api/intelligence/trips/:id/replan`) enforce atomic version increments and preserve completed stops immutably.
   - Repeated progress submission for an already completed stop returns the current consistent state without duplicating history.

3. **Tenant & User Authorization**:
   - All `/api/intelligence/trips/:id/*` endpoints now enforce `verifyTripAccess` middleware:
     - Cross-user mismatch (`req.uid !== trip.user_id`) returns `403 Forbidden` with `{ error: 'Access denied: You do not have permission...' }`.
     - Missing authentication on a private trip returns `401 Unauthorized`.
     - Guest trips without an explicit user continue to allow client access.
