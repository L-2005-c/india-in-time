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
