# Advanced Requirement-Aware Itinerary Engine — v5.1.0

## Authoritative pipeline

User request → `requirementEngine` (HARD/SOFT) → hard candidate filtering → bounded beam search →
projected route → actual arrival → time-specific intelligence → optional wait for a meaningful future window →
re-score at the new arrival → full-state expansion → final hard validator → structured itinerary.

There is **one planning authority**: `services/travelIntelligence/advancedItineraryEngine.js`.
`geoTemporalOptimizer.js` is retained only as a backward-compatible facade and does not make planning decisions.

## Hard constraints

- start/end time and total available duration
- maximum travel time per leg
- maximum stop count
- maximum waiting time when explicitly supplied
- must-visit places
- must-avoid places and excluded categories
- required meal windows
- opening hours
- dietary requirements (unknown data fails closed when hard)
- accessibility requirements (unknown data fails closed when hard)
- transport modes
- safety flags
- hard budget, including transport cost when pricing data is available
- no duplicate places
- no schedule overflow

## Soft preferences

- preferred categories
- photography / scenic timing
- low crowd
- food focus
- family
- relaxed pacing
- budget sensitivity

Preferred categories are treated as strong intent: unrelated fillers are not inserted while a requested category remains uncovered.

## Time intelligence

Every transition is evaluated at projected arrival. If the planner waits, the candidate is evaluated again at the **new** arrival time.
Weather forecast selection is conservative between hourly forecast points, so a 15:30 arrival still uses the 15:00 condition when 16:00 is the next clear forecast hour.

## Optimization

The planner uses bounded beam search. A state carries clock time, coordinates, selected places, category coverage, meal coverage, travel time, waiting time, cumulative cost and score.
The objective balances requirement satisfaction, temporal experience, scenic quality, food, weather, crowd, routing efficiency, confidence, diversity and trip style while minimizing travel, waiting, crowd risk, weather risk, schedule risk and cost.

## Provenance

Route results preserve `travelMinutes`, `distanceKm`, `travelSource`, `trafficState`, `trafficRisk`, `trafficConfidence` and computation time.
The engine never labels a heuristic route as live traffic.
Weather, crowd, traffic and scenic outputs retain their available data sources/provenance.

## Validation

An itinerary is returned as `FEASIBLE` only after the final validator passes. Otherwise the strict result is `INFEASIBLE` and the response explains which constraints prevented a valid plan rather than silently breaking them.

## Dynamic replanning

`replanAdvanced()` accepts completed stops and current time/location. Completed stops are immutable; only remaining itinerary state is optimized again.

## API

`POST /api/time-intelligence/optimize`

`POST /api/time-intelligence/day-plan`

`POST /api/time-intelligence/replan`

`POST /api/time-intelligence/multi-day-plan`

## Regression coverage

The repository includes `scripts/itinerary-regression.js` with 32 executable acceptance/regression checks covering start times, meals, exclusions, weather, crowd, budget, must-visit, replanning, missing data, accessibility and dietary constraints.
