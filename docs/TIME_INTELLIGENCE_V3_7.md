# India In-Time v3.7 — Time Intelligence / GeoAI Evolution

## Core architecture

**Time Intelligence** is the decision engine. It evaluates a place repeatedly across future timestamps and produces explicit experience windows rather than one static score.

**GeoAI** is the spatial-temporal optimizer. It sequences places using projected arrival time, route effort, timing fit, confidence, opening feasibility, diversity and future experience windows.

**Gemini** remains the explanation/personalization layer. It does not invent route, weather, crowd, opening, ETA or solar facts.

## v3.7 changes

- temporal profiles support up to 72h (default 48h) and 30-minute resolution;
- windows are grouped by local date so tomorrow is an explicit planning mode;
- `BEST_TOMORROW` and daily best windows are first-class outputs;
- confidence reports evidence gaps instead of manufacturing certainty;
- optimizer returns schedule risk, temporal modes and decision diagnostics;
- dynamic replanning advertises triggers for delay, weather, crowd, route and user changes;
- alternatives are surfaced when the trip state changes;
- GeoAI algorithm version is `geo-temporal-beam-search-v2`.
