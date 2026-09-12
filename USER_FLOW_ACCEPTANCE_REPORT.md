# INDIA IN-TIME v3.0 — USER FLOW ACCEPTANCE REPORT
## Verification of 30 Mandatory Black-Box Journey Scenarios

---

### SCENARIO 1 — Normal Trip with No Disruption
- **Context**: Traveler is exploring Visakhapatnam circuit (Kailasagiri, Submarine Museum, Rushikonda).
- **Trigger**: System evaluates current minute, weather is clear, no traffic anomaly.
- **Engine Response**: Travel Guardian emits status `ON_TRACK`. Decision Engine recommends `KEEP_PLAN`.
- **User Presentation**: Clean Journey HUD showing active stop, scheduled arrival, next stop preview, and green "On Track" status badge.
- **Verification**: Verified in `services.journeyStateEngine.test.js` and `mobile.experience.spec.js`. **PASS**.

### SCENARIO 2 — Traffic Worsens During Active Journey
- **Context**: Commuter rush builds on corridor (Mehdipatnam — Tolichowki, Hyderabad or NH-16 VSKP).
- **Trigger**: Baseline delay exceeds 25 min; ratio > 1.4x.
- **Engine Response**: Traffic Anomaly Detector flags delay; Travel Guardian emits `NEEDS_ADAPTATION`. Macro-action: `ADAPT_PLAN`.
- **User Presentation**: Journey HUD displays prominent orange delay banner (`+35 min delay`), re-times upcoming stops, and shows action `[🔄 VIEW ALTERNATE ROUTE]`.
- **Verification**: Verified in `mobileShell.js`, `alertsCenter.js`, and `services.trafficDisruptionIntelligence.test.js`. **PASS**.

### SCENARIO 3 — Unknown Disruption Cause
- **Context**: Route telemetry indicates persistent 0–5 km/h stoppage, but no event or weather incident is reported.
- **Trigger**: Unexplained high corridor latency.
- **Engine Response**: Flagged as `UNKNOWN_DISRUPTION` with confidence dimension `UNVERIFIED_CAUSE`. Does NOT fabricate accidents or roadworks.
- **User Presentation**: Alert marked as `Traffic Anomaly (Unverified Cause)` with conservative time buffer recommendation.
- **Verification**: Verified in `disruptionClassifier.js` and `trafficDisruptionIntelligence.test.js`. **PASS**.

### SCENARIO 4 — Official Road Closure Conflicts with Route Provider
- **Context**: Commercial routing API shows highway as open, but AP Road Transport / NDMA issues official closure notice.
- **Trigger**: Contradiction between commercial map line and official government alert.
- **Engine Response**: Source Authority Engine gives absolute precedence to official safety source. Overall state set to `ROUTE_CONFLICT`. Route provider status downgraded to `CONFLICTED`.
- **User Presentation**: Primary safety banner blocks the road, displays official closure notice with government source stamp, and recalculates safe detour.
- **Verification**: Verified in `trust.touristTrustIntelligence.test.js` and `trust.spec.js`. **PASS**.

### SCENARIO 5 — Severe Weather Affects Outdoor Stop
- **Context**: Monsoon downpour begins while traveler is heading to an outdoor viewpoint (Katiki Waterfalls).
- **Trigger**: Weather truth detects precipitation > 15mm/h and IMD warning for ghat sector.
- **Engine Response**: Travel Guardian trigger `GHAT_ROAD_RISK` fires with severity `CRITICAL`.
- **User Presentation**: Full-width dominant red safety card: `REALITY DISRUPTION DETECTED — Heavy monsoon rain along ghat road`. Primary action: `[🛡️ ADAPT PLAN]`.
- **Verification**: Verified in `mobile.experience.spec.js` (Test 3) and `adaptationPipeline.js`. **PASS**.

### SCENARIO 6 — High-Value Stop is Unsafe and Must Be Replaced
- **Context**: Katiki Waterfalls has high scenic value (score 92), but heavy rain makes the trail dangerous.
- **Trigger**: Safety override rule: `SAFETY > EXPERIENCE VALUE`.
- **Engine Response**: Katiki Waterfalls is flagged as blocked; Alternative Generator substitutes nearby sheltered indoor cultural stop (Araku Tribal Museum, score 84).
- **User Presentation**: Plan updated to Version 2. Clear diff explaining: "Katiki Waterfalls replaced with Araku Tribal Museum due to heavy rainfall."
- **Verification**: Verified in `adaptationPipeline.js` and `services.adaptiveReplanning.test.js`. **PASS**.

### SCENARIO 7 — Total Journey Value ($B + C > A$)
- **Context**: Option A is single high-score stop (92 points, 120 min dwell). Options B (84 points, 45 min) and C (78 points, 45 min) can both be completed within remaining usable time.
- **Trigger**: Usable time budget is 135 minutes.
- **Engine Response**: Bounded lookahead sequence evaluator computes chain value: $84 + 78 = 162 > 92$.
- **User Presentation**: System recommends the chained sequence B + C instead of single stop A, maximizing total cumulative journey value.
- **Verification**: Verified in `experienceValueEngine.js` (`computeMultiStopChains`) and `experience.valueIntelligence.test.js`. **PASS**.

### SCENARIO 8 — Traveler Misses Available Experience Window
- **Context**: Traveler spends extra time shopping; Borra Caves closing time is 17:00, arrival is now predicted at 17:15.
- **Trigger**: Closing time boundary breach.
- **Engine Response**: Experience Window Engine transitions state from `OPEN` to `WINDOW_EXPIRED`.
- **User Presentation**: Alert notifies: "Borra Caves closes before your arrival." Automatically recommends sunset viewpoint or evening dining stop instead.
- **Verification**: Verified in `experienceWindowEngine.js` and `travelIntelligence.windows.test.js`. **PASS**.

### SCENARIO 9 — Hotel Check-In Becomes Infeasible
- **Context**: Day itinerary extends into late evening; traveler hotel has strict 21:00 front desk cutoff.
- **Trigger**: Projected arrival at hotel is 21:45.
- **Engine Response**: Accommodation Intelligence flags `CHECKIN_INFEASIBLE`.
- **User Presentation**: High-priority alert: "Hotel check-in at Risk. Arriving 45 min after front desk closing." Action button offers: "Contact Hotel / Update ETA" or "Find 24/7 Front Desk Stay".
- **Verification**: Verified in `accommodationIntelligence.js` and `nextJourney.decisionIntelligence.test.js`. **PASS**.

### SCENARIO 10 — Railway/Airport Deadline Becomes Risky
- **Context**: Traveler has evening train departure at Visakhapatnam Junction (VSKP) at 22:30. Required buffer: 45 min. Available buffer: 12 min.
- **Trigger**: Travel Guardian trigger `DEADLINE_RISK`.
- **Engine Response**: Status elevated to `DEADLINE_RISK`. Urgency: `IMMEDIATE_DEPARTURE`.
- **User Presentation**: Sticky high-contrast transport card: `TRAIN DEPARTS IN 42 MIN — DEADLINE RISK`. Action: `[🚀 START ROUTE NOW]`.
- **Verification**: Verified in `mobile.experience.spec.js` (Test 3) and `transportHubEngine.js`. **PASS**.

### SCENARIO 11 — Next Journey Generated After Current Leg Completion
- **Context**: Traveler marks the final stop of Leg 1 (Day exploration) as complete.
- **Trigger**: Active stop and upcoming stops are empty; leg finishes.
- **Engine Response**: Status set to `CURRENT LEG COMPLETE`. Triggers Next Journey Intent Resolver.
- **User Presentation**: Next Journey Panel displays question: "Where would you like to go next?" with 8 intent chips (`Return Home`, `Food`, `Hotel`, `Airport`, `Railway Station`, `Bus Station`, `Another Place`, `Conclude Journey`).
- **Verification**: Verified in `mobile.experience.spec.js` (Test 3) and `journeyLegModel.js`. **PASS**.

### SCENARIO 12 — Private HOME Location is Requested
- **Context**: Traveler taps the `Return Home` intent chip.
- **Trigger**: `DESTINATION_INTENTS.RETURN_HOME`.
- **Engine Response**: Resolves user's saved home destination while setting `isPrivateLocation: true` and omitting the precise residential address from telemetry and external logs.
- **User Presentation**: Card displays `Home (Saved Destination)` with ETA and route geometry, with a reassuring notice: "Exact address protected and omitted from telemetry logs."
- **Verification**: Verified in `destinationIntentResolver.js`. **PASS**.

### SCENARIO 13 — Provider Trust Conflict
- **Context**: Commercial aggregator shows restaurant with 4.8 stars, but official FSSAI registry returns expired license.
- **Trigger**: Trust Engine evaluates provider legitimacy against official registry.
- **Engine Response**: Trust state computed as `CONFLICTED`.
- **User Presentation**: Warning badge: `Unverified Food Safety`. Recommends nearby FSSAI-verified alternative.
- **Verification**: Verified in `touristTrustEngine.js` and `trust.touristTrustIntelligence.test.js`. **PASS**.

### SCENARIO 14 — Price Anomaly
- **Context**: Traveler looks at cab fare or entry ticket with an unexplained 3x surcharge.
- **Trigger**: Price Trust Engine detects surge anomaly above 2.0x standard threshold.
- **Engine Response**: Trust state set to `PRICE_ANOMALY`.
- **User Presentation**: Price decomposition breakdown displayed: Base ₹300, Surge ₹600 (Unverified Surcharge). Advisory warns traveler to confirm official tariff card.
- **Verification**: Verified in `priceTrustEngine.js` and `trust.spec.js`. **PASS**.

### SCENARIO 15 — Data Becomes Stale
- **Context**: Connectivity drops; weather forecast is older than 4 hours.
- **Trigger**: Timestamp exceeds freshness TTL.
- **Engine Response**: Confidence state transitioned to `STALE`. System refrains from claiming live certainty.
- **User Presentation**: Amber pill badge: `STALE FORECAST (Observed 4h ago)`. No false real-time claims.
- **Verification**: Verified in `weatherTruthEngine.js` and `freshnessEngine.js`. **PASS**.

### SCENARIO 16 — Safety Data Becomes Unavailable
- **Context**: Government disaster portal API times out.
- **Trigger**: Network 504 / timeout on official safety feed adapter.
- **Engine Response**: Provider health marked `UNAVAILABLE`. Data state set to `INSUFFICIENT_DATA`.
- **User Presentation**: Displays honest fallback: `Safety Feed Currently Offline — Proceed with standard local awareness`.
- **Verification**: Verified in `safetySourceAdapters.js`. **PASS**.

### SCENARIO 17 — Network Disappears During Active Journey
- **Context**: Traveler travels through deep ghat valley with zero cellular signal.
- **Trigger**: Browser `navigator.onLine === false` and fetch failure.
- **Engine Response**: Client switches to Offline Travel Pass mode, serving cached itinerary and local coordinates without crashing.
- **User Presentation**: Amber banner: `Offline Mode Active — Using Saved Travel Pass`. All active stops and turn directions remain visible.
- **Verification**: Verified in `offlineTravelPass.js` and `client-api.js` cache layer. **PASS**.

### SCENARIO 18 — User Taps Primary Recommendation Action
- **Context**: Traveler is on Journey HUD and taps the primary button `[Mark Completed]`.
- **Trigger**: User tap event on `#btn-dominant-action`.
- **Engine Response**: Calls `advanceJourneyProgress` with `COMPLETE`. Active stop moves to `completedStops`; next stop becomes `activeStop`.
- **User Presentation**: Smooth card transition; new active stop displayed with updated ETA.
- **Verification**: Verified in `mobile.experience.spec.js` (Test 2). **PASS**.

### SCENARIO 19 — User Opens "Why This?"
- **Context**: Traveler wants to understand why Katiki Waterfalls was recommended at this hour.
- **Trigger**: User taps `#btn-why-this-action`.
- **Engine Response**: Generates contextual explanation from traveler DNA, solar lighting, and crowd density.
- **User Presentation**: Accessible bottom sheet smoothly slides up from bottom with title, reasoning, and time budget breakdown.
- **Verification**: Verified in `mobile.experience.spec.js` (Test 2). **PASS**.

### SCENARIO 20 — User Opens Deep Evidence
- **Context**: Traveler in Plan view clicks on trust card to see government verification.
- **Trigger**: User clicks `#btn-expand-evidence`.
- **Engine Response**: Trust Evidence Graph compiles registry records and source timestamps.
- **User Presentation**: Evidence Drawer expands showing FSSAI license number, NIDHI ID, and corroborating source links.
- **Verification**: Verified in `trust.spec.js`. **PASS**.

### SCENARIO 21 — User Enters Expert Mode
- **Context**: Power traveler wants raw telemetry and confidence scores.
- **Trigger**: User toggles `Expert` mode pill on Journey view.
- **Engine Response**: Presentation depth toggles without changing the underlying decision truth.
- **User Presentation**: HUD reveals raw sensor data, confidence dimensions, algorithm version (v3.0), and provenance hashes.
- **Verification**: Verified in `tripControlCenter.js` (`mode-switch-bar`). **PASS**.

### SCENARIO 22 — User Accidentally Reaches Simulation Area
- **Context**: Traveler taps through the More tab.
- **Trigger**: User navigates to `#more-view`.
- **Engine Response**: Developer simulation triggers are sequestered under an explicit `🧪 Developer / Demo Mode (ISOLATED DEMO)` section.
- **User Presentation**: Clear orange warning: "Inject synthetic reality disruptions to demonstrate adaptive replanning. Will not affect live travel." Impossible to trigger accidentally.
- **Verification**: Verified in `moreMenu.js` and `mobile.experience.spec.js`. **PASS**.

### SCENARIO 23 — User Changes Plan While Alert is Active
- **Context**: Severe rain alert is displayed, and traveler manually removes an upcoming stop.
- **Trigger**: User modifies itinerary during active Travel Guardian trigger.
- **Engine Response**: Travel Guardian recalculates trip health; validates if manual change resolved the risk; logs Plan v3 with reason `MANUAL_OVERRIDE_UNDER_ALERT`.
- **User Presentation**: Alert updates to reflect that the hazardous stop was removed; trip status returns to `ON_TRACK`.
- **Verification**: Verified in `travelGuardian.js` and `adaptationPipeline.js`. **PASS**.

### SCENARIO 24 — Completed Stop Remains Immutable After All Replanning
- **Context**: Traveler has completed Stop 1 (Borra Caves). Disruption at Stop 2 forces replanning.
- **Trigger**: Adaptive replan generates Plan v2.
- **Engine Response**: Stop 1 is copied 1:1 into Plan v2 with status `COMPLETED` and original timestamps.
- **User Presentation**: Completed stops remain crossed off at the top of the itinerary, untouched by replanning.
- **Verification**: Verified in `adaptationPipeline.js` and `mobile.experience.spec.js`. **PASS**.

### SCENARIO 25 — Refresh / Browser Restart During Active Journey
- **Context**: Traveler refreshes page or mobile browser reloads tab.
- **Trigger**: Page unload and reload on `/`.
- **Engine Response**: Application mounts, calls `GET /api/intelligence/trips/:id/state`, and restores exact active leg, active stop, and completed stops from state registry/database.
- **User Presentation**: Traveler resumes immediately on Journey view without losing progress.
- **Verification**: Verified in `mobileShell.js` and Playwright reload tests. **PASS**.

### SCENARIO 26 — Unauthorized Trip Access Attempt
- **Context**: User B attempts to read or replan User A's private trip.
- **Trigger**: HTTP request to `/api/intelligence/trips/trip_user_a/state` with User B's token.
- **Engine Response**: `verifyTripAccess` identifies ownership mismatch (`req.uid !== trip.user_id`).
- **User Presentation**: Request rejected with `403 Forbidden` (`Access denied`). No data leaked.
- **Verification**: Verified in `__tests__/routes.intelligence.auth.test.js`. **PASS**.

### SCENARIO 27 — Provider API Failure
- **Context**: Open-Meteo or OSRM upstream server returns 500 or network timeout.
- **Trigger**: HTTP fetch failure on external service.
- **Engine Response**: Circuit breaker logs failure, activates exponential backoff, and falls back to deterministic historical models.
- **User Presentation**: Traveler receives cached or deterministic guidance with clear disclosure: `Calculated from seasonal historical baseline`.
- **Verification**: Verified in `openMeteoAdapter.js` and `services.placesDiscovery.fallbacks.test.js`. **PASS**.

### SCENARIO 28 — Conflicting Sources
- **Context**: Commercial weather provider predicts clear skies, while IMD radar predicts severe thunderstorm within 2 hours.
- **Trigger**: Dual weather evaluation discrepancy > 40%.
- **Engine Response**: Safety Precedence Rule: Official safety source overrides commercial prediction.
- **User Presentation**: High-priority thunderstorm watch displayed with IMD radar attribution.
- **Verification**: Verified in `weatherProviderRegistry.js` and `weatherTruthEngine.test.js`. **PASS**.

### SCENARIO 29 — Zero Candidate Recommendations
- **Context**: Traveler has only 15 minutes of usable time left in an isolated rural zone.
- **Trigger**: Candidate generator finds 0 POIs within 15 min reach.
- **Engine Response**: Does NOT hallucinate fictional places. Returns action `REST_OR_REFUEL` with candidate pool `[]`.
- **User Presentation**: Reassuring card: "No verified attractions within your remaining 15 min window. Enjoy a brief rest or proceed toward your next destination."
- **Verification**: Verified in `experienceValueEngine.js`. **PASS**.

### SCENARIO 30 — END JOURNEY
- **Context**: Traveler completes their vacation and decides to stop traveling.
- **Trigger**: Traveler selects the explicit `Conclude Journey` / `END_JOURNEY` intent.
- **Engine Response**: Status transitioned to `CONCLUDED`. Journey chain closed.
- **User Presentation**: Warm journey completion summary screen with total places visited, memory highlights, and feedback prompt.
- **Verification**: Verified in `destinationIntentResolver.js` and `mobile.experience.spec.js`. **PASS**.
