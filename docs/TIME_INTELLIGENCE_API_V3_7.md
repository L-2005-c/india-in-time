# Time Intelligence API v3.7

## Temporal profile
`POST /api/time-intelligence/temporal-profile`

The response evaluates a place in 30-minute intervals (configurable) over up to 72 hours. It returns per-date windows plus:

- `BEST_NOW`
- `BEST_LATER`
- `BEST_TOMORROW`
- `BEST_MORNING`
- `BEST_EVENING`
- `BEST_PHOTOGRAPHY_WINDOW`
- `BEST_OVERALL`

Each window includes score, confidence, reasons, and weather/crowd/traffic/scenic sources.

## GeoAI optimizer
`POST /api/time-intelligence/optimize`

Uses projected arrival time and beam-search sequencing to balance experience score, temporal fit, confidence, route effort, diversity, opening feasibility, and future windows.

## Dynamic replanning
`POST /api/time-intelligence/replan`

Recomputes the remaining itinerary from the current state. Supported triggers include delay, weather change, crowd change, route change, and user change.

## AI boundary
Gemini receives deterministic structured results for explanation and personalization. It must not invent ETA, weather, crowd, opening, routing, or solar facts.
