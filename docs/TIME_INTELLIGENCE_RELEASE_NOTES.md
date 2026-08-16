# Time Intelligence Release — v3.6.0

India In-Time now treats itinerary generation as a **time-aware GeoAI optimization problem**.

### New capabilities

- 30-minute future temporal profiles for every place.
- Best-now, best-later, morning, evening and photography windows.
- Projected-arrival scoring in itinerary optimization.
- Geo-temporal beam-search sequencing instead of nearest-neighbor-only planning.
- Explicit waiting when a higher-value experience window is worth preserving.
- Weather forecast ingestion for two days from the weather proxy.
- Dynamic re-planning from current location/time.
- Confidence and source provenance carried into optimized stops.
- Gemini remains an explanation/personalization layer rather than a source of factual route/weather/crowd/astronomy values.

### Main endpoints

- `POST /api/time-intelligence/temporal-profile`
- `POST /api/time-intelligence/optimize`
- `POST /api/time-intelligence/replan`

The existing `/api/time-intelligence/day-plan` endpoint now delegates to the advanced optimizer for backward compatibility.
