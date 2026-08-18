# India In-Time — Time Intelligence + GeoAI V3

## Core model
India In-Time is a deterministic time-aware travel decision engine. Gemini is an explanation/personalization layer, not the source of route, weather, crowd, opening, or astronomical facts.

### 1. Temporal intelligence
Each place is evaluated every 30 minutes across a future horizon. The engine returns:
- BEST_NOW
- BEST_LATER
- BEST_MORNING
- BEST_EVENING
- BEST_PHOTOGRAPHY_WINDOW
- peak experience window
- confidence and source provenance

### 2. Arrival-time intelligence
Every itinerary candidate is evaluated using projected arrival time after route estimation. A sunset viewpoint can therefore be scheduled for sunset instead of being scored only at trip start.

### 3. Geo-temporal optimization
The `/api/time-intelligence/optimize` endpoint uses a bounded beam-search optimizer that jointly considers:
- experience score
- projected arrival time
- weather suitability
- crowd intelligence
- traffic/routing estimate
- scenic/solar window
- opening feasibility
- confidence
- route distance/time
- category diversity
- optional waiting to preserve high-value time windows

### 4. Dynamic replanning
`POST /api/time-intelligence/replan` recomputes the remaining itinerary from the user's current position/time. It is intended to react to delays, weather changes, missed stops, or user-driven schedule changes.

### 5. Weather intelligence
The weather API returns current conditions plus two days of hourly forecast context. The temporal engine only uses forecast data when a matching hourly record exists; it does not fabricate future weather values.

## API additions
- `POST /api/time-intelligence/temporal-profile`
- `POST /api/time-intelligence/optimize`
- `POST /api/time-intelligence/replan`

## Product positioning
The system should be described as a **time-aware GeoAI travel decision engine**, not merely an AI itinerary generator.
