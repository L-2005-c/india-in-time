# India In Time v5.2.1 — Production Validation Report

## 1. Current itinerary architecture

The itinerary system now has one authoritative decision engine:

`services/travelIntelligence/advancedItineraryEngine.js`

The public itinerary routes (`/optimize`, `/day-plan`, `/replan`) call the same planner. `geoTemporalOptimizer.js` remains only as a backward-compatible facade and delegates to the same engine. The multi-day planner also delegates directly to the authoritative engine.

## 2. Problems fixed

- competing itinerary authorities
- post-hoc meal insertion / resequencing overriding optimization
- greedy planning despite a beam-width contract
- stale time scores after waiting
- weak hard-constraint validation
- unsafe treatment of unknown accessibility/dietary data
- missing must-avoid place handling
- hard budget checks without transport-cost provenance
- non-preferred filler places being selected ahead of requested categories
- conservative hourly weather selection between forecast points
- missing route provenance fields
- missing production CI workflow

## 3. Root cause

The previous planner mixed local heuristics with post-processing repairs. That created multiple places where the final schedule could diverge from the optimized state. The replacement planner keeps all decision variables inside the search state and runs one final validator before returning `FEASIBLE`.

## 4. Algorithms

The planner uses bounded beam search. Each state carries:

- current local time
- current coordinates
- selected places
- category coverage
- meal coverage
- travel time
- waiting time
- cumulative cost
- confidence / experience score

Every candidate is re-evaluated at its projected arrival. Future waiting targets are re-scored at the new arrival time rather than reusing an old score.

## 5. Requirement engine

Hard support now covers start/end time, duration, maximum travel time, stop count, maximum waiting time, must-visit places, must-avoid places, exclusions, required meals, dietary restrictions, accessibility requirements, transport modes, safety flags, and hard budgets.

Soft support covers category preferences, food focus, photography, low crowd, family, relaxed pacing and budget sensitivity.

## 6. Data integrity

The planner never claims heuristic routing is live traffic. Route output exposes source, congestion state, risk, confidence and computation time.

Missing weather remains unavailable rather than fabricated. Hourly forecast selection is conservative between forecast points.

## 7. Meal intelligence

Breakfast, lunch, snack and dinner are explicit time windows. Explicit required meals are treated as hard planning requirements, not inserted after optimization.

## 8. Dynamic replanning

`replanAdvanced()` preserves completed stops and re-solves only the remaining itinerary from the current clock and coordinates.

## 9. Validation and failure behavior

The planner returns `FEASIBLE` only when the final validator passes. Otherwise it returns `INFEASIBLE` with reasons and strict/relaxed guidance instead of silently violating the request.

## 10. Tests verified in this environment

- Architecture check: PASS
- Frontend runtime invariants: PASS
- Inline-handler audit: PASS
- 32 itinerary regression/acceptance checks: PASS
- Modified JavaScript syntax checks: PASS
- 10 generated acceptance examples: PASS / generated

## 11. Full dependency-backed verification

The container does not contain `node_modules`, and npm's local cache is empty. Therefore the Jest, Playwright, ESLint and production-config checks that depend on installed npm packages could not be honestly reported as executed here. The project retains those commands and its lockfile so they can run after dependency installation in CI/deployment.

## 12. Production safeguards

- CI workflow present
- no silent optimizer repair stage
- hard constraints fail closed where data is insufficient
- route/weather/crowd provenance retained
- memoization used inside candidate evaluation
- Gemini is not called inside candidate loops
- external routing is not mislabeled as live traffic
- compatibility facade does not introduce a second optimizer

## 13. Known limitations

True live traffic quality still depends on a configured routing provider supplying live traffic data; the engine deliberately falls back to labeled estimates when that signal is unavailable. ML crowd enrichment in the existing stack remains optional and provider/database dependent; the deterministic planner never fabricates it.
