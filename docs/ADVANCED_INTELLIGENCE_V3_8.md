# India In-Time — Advanced Time Intelligence + GeoAI v3.8

## Core model

India In-Time now treats trip planning as a robust multi-objective time-space optimization problem. The deterministic engine remains responsible for factual travel state; Gemini remains the explanation and personalization layer.

## Intelligence layers

1. **Temporal opportunity** — compares current arrival quality with future experience windows and exposes regret/opportunity to wait.
2. **Evidence-aware uncertainty** — weather, crowd, routing and scenic signals contribute different confidence depending on source quality and freshness.
3. **Robust scoring** — candidate itineraries are stress-tested across bounded uncertainty scenarios before being ranked.
4. **Geo-temporal routing** — projected arrival time is scored against future conditions; route effort, traffic risk and spatial distance affect the decision.
5. **Scenic orientation** — where a POI provides `view_orientation_deg`, solar azimuth alignment contributes to scenic/photography quality.
6. **Dynamic itinerary sequencing** — the optimizer uses robust multi-objective beam search rather than nearest-place ordering.

## Decision model

The optimizer combines: experience, temporal fit, route fit, robustness, preference fit, category diversity and opening feasibility.

The decision output includes:

- `decisionScore`
- `decisionComponents`
- `robustness`
- `temporalOpportunity`
- `bestWindow`
- `temporalModes`
- `confidence`

## What Gemini does

Gemini does not calculate ETA, weather, crowd, scenic state, opening status or routing truth. It receives structured deterministic intelligence and turns it into explanations, summaries and personalized language.

## Data truth policy

The engine must continue to distinguish `observed`, `predicted`, `estimated` and `unavailable` signals. Missing data lowers robustness/confidence; it is never replaced with fabricated live values.

## Multi-day trip planning (`multiDayPlanner.js`)

`POST /api/time-intelligence/multi-day-plan` extends the single-day optimizer to a full trip:

1. **Geographic clustering** — candidate places are split into `days` groups with farthest-point seeding + nearest-cluster assignment (a soft per-cluster size cap stops one dense pocket from swallowing the whole trip into a single day). Places without coordinates are distributed round-robin so they still get considered.
2. **Per-day beam search** — each day's cluster is handed to `geoTemporalOptimizer.optimizeItinerary` with that calendar date advanced correctly, so opening hours, sunrise/sunset, festivals and (if supplied via `weatherByDay`) that day's forecast all apply.
3. **Pacing profiles** — `relaxed` / `moderate` / `packed` set sensible defaults for stops-per-day, inter-stop buffer and day-start/end window; any of these can still be overridden per request.
4. **Weather-aware rebalancing suggestions** — outdoor stops (`beach`, `scenic`, `park`, `garden`, `waterfall`, `hill`, `fort`, `monument`) landing on a day with `Poor`/`Very Poor` forecast suitability are flagged with a suggested cleaner day. This is advisory only: swapping a stop across days requires re-solving both days, so the caller decides whether to apply it and re-request.

Request body: `places[]`, `startDate`, `days` (max 21), `pacing`, `fromCoords`, `personas`, `tripMode`, `region`, `weatherByDay[]` (per-day forecast, optional), plus per-day overrides `maxStopsPerDay`, `bufferMin`, `startMin`, `endMin`.

Response: `{ itinerary: [{ dayIndex, date, stops, stopCount, totalTravelMinutes, returnToOrigin, ... }], totalStops, totalTravelMinutes, rebalanceSuggestions, unusedPlaces, tripQuality }`. Day dates are formatted in IST (`Asia/Kolkata`), not UTC, so a midnight-IST start date doesn't roll back onto the previous UTC day in the response.

## Planning-intelligence update (2026-08)

The multi-day planner and single-day beam search picked up several targeted
improvements on top of the v3.8 model above, without changing its core
decision math:

- **Travel-flow day ordering** — geographic clusters used to keep whatever
  order farthest-point seeding produced them in, which could put day 1 and
  day 3 on the same side of the city with day 2 across town. `multiDayPlanner`
  now walks cluster centroids as a nearest-neighbour tour anchored to
  `originCoords` (when supplied), so the trip moves through the destination
  in roughly one direction instead of zig-zagging day to day.
- **Meal-time nudging** — `geoTemporalOptimizer` now applies a small additive
  bonus/penalty (`mealTimingBonus` on each stop) that favors scheduling
  `food`-category candidates inside plausible lunch (11:30–15:00) or dinner
  (18:30–21:30) windows, instead of letting a food stop land at an arbitrary
  hour purely because it scored well on other dimensions. It's a soft nudge,
  not a hard constraint — an exceptional stop can still win an off-hour slot
  if nothing else fits.
- **Bidirectional, capacity-aware weather rebalancing** — `rebalanceSuggestions`
  now only points at a target day that actually has spare stop capacity
  (`stops.length < maxStopsPerDay`), so a suggestion is realistic to act on
  rather than proposing to overload an already-full day.
- **Transparent unused-place reasons** — `unusedPlaces` entries now include a
  `reason`: places without usable coordinates are labeled as such (they were
  never eligible for the geo-temporal optimizer, which requires coords,
  even though they're grouped into a day's candidate pool), and places that
  were considered but not selected report which day's budget they lost out
  to.
- **Return-to-origin leg** — each day in the response carries an informational
  `returnToOrigin` (estimated minutes/km back to `originCoords` from the
  day's last stop). It's advisory only — it doesn't affect stop selection —
  but surfaces the actual end-of-day commute so pacing decisions the
  optimizer itself doesn't make (e.g. "should today end earlier?") can be
  made with real numbers.
- **Trip-quality rollup** — a new `tripQuality` object aggregates the
  per-stop `decisionScore`, `robustness` and `confidence` signals the
  optimizer already computes (average decision score, average robustness,
  average confidence, count of stops that required waiting, count of days
  left without any stops), so callers get an at-a-glance read on overall
  plan quality without re-averaging every stop themselves.
