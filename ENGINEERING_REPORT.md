# India In Time — Travel Intelligence Engine
## Engineering Report

### 1. Existing architecture
- Deterministic `services/timeIntelligence.js` (open/closed, sun, daypart, crowd labels, personalizeScore)
- Rules in `data/time-intelligence-rules.json`
- Routes: `/api/time-intelligence/status`, `/score`
- Weather via Open-Meteo proxy; frontend client-side traffic/crowd helpers

### 2. New architecture
```
services/travelIntelligence/
  index.js              orchestrator
  timeEngine.js         IST, sun, golden hour, daypart
  openingHoursEngine.js OPEN / CLOSING_SOON / CLOSED / OPENS_SOON / UNKNOWN
  crowdEngine.js        multi-factor crowd + source labels
  trafficEngine.js      travel time + arrival windows
  weatherEngine.js      activity suitability
  scenicEngine.js       scenic / photography windows
  scoringEngine.js      configurable multi-factor visitScore
  confidenceEngine.js   data-availability confidence
  explanationEngine.js  WHY bullets
  itineraryEngine.js    day plan + dynamic advice
  routingEngine.js      OSRM live routing (timeout + fallback)
  festivalEngine.js     festival/event crowd impact
  routingEngine.js      OSRM + optional Google Directions
  historicalCrowdStore.js  historical crowd hints blend
```
`timeIntelligence.js` is a backward-compatible facade.

### 3. Files changed
- Added: all modules under `services/travelIntelligence/`
- Updated: `services/timeIntelligence.js`, `data/time-intelligence-rules.json`, `routes/time-intelligence.js`, `frontend/public/client-api.js`, `frontend/public/app.js` (premium card renderer)
- Tests: `__tests__/services.travelIntelligence.test.js`, `__tests__/routes.timeIntelligence.recommend.test.js`

### 4. Algorithms
- Crowd: daypart × weekend × holiday × peak × season × placeType × weather dampening; optional historical blend
- Traffic: Haversine + time-of-day congestion; live override when provided
- Weather: maps temp/rain/wind/cloud → 0–100 suitability
- Visit score: weighted sum by place-type profile; closed places gated
- Day plan: greedy timed sequencing with openness, proximity, meal slots, buffers

### 5. Data sources
- Place catalog hours/coords/flags (provided)
- Open-Meteo weather (observed/forecast)
- Astronomical sun model (computed)
- Rules JSON (rule-based)
- Optional `liveTraffic` body field (live)
- Optional `historicalCrowd` on place (historical)

### 6. Scoring methodology
Configurable weights in rules; profiles for beach, viewpoint, temple, restaurant, indoor, monument, nature, market. Bands: Exceptional 90–100 … Poor 0–39.

### 7. Confidence methodology
Base 55 + bonuses for weather, coords, hours, category rules, traffic, historical. Capped ~95. Never manufactured beyond data availability.

### 8. API changes
- `POST /status` — additive advanced fields
- `POST /score` — unchanged
- `POST /recommend` — ranked list with explanation
- `POST /day-plan` — timed multi-stop plan
- `POST /advice` — dynamic actions for one place

### 9. UI changes
- `ti_renderIntelligenceCard` in `app.js` when `visitScore`/`explanation` present
- Client helpers: `timeIntelligenceRecommend`, `timeIntelligenceDayPlan`, `timeIntelligenceAdvice`

### 10. Tests
- 51 existing TI tests still pass
- +17 new travel-intelligence / recommend / day-plan / advice tests
- **68/68 TI-related tests green**

### 11. Performance
- No mandatory extra upstream calls; weather/traffic optional
- Batch capped at 200 places
- Graceful degradation when data missing

### 12. Security
- No new auth surface; existing rate limits apply
- Persona/tripMode allow-listed
- Opening hours never invented when missing

### Validation (2026-08-11)
- Full suite: **492/492 tests passed**
- Frontend production build: **success** (Vite)
- TI modules: lint clean (prefer-const fixed)
- Pre-existing eslint parser issues in frontend/app-src ESM (unrelated)

### 13. Known limitations
- Festival calendar is static JSON (extend yearly)
- Google Directions optional via GOOGLE_MAPS_API_KEY; else OSRM
- Historical crowd from static JSON hints (extend or replace with DB)
- Historical crowd needs data pipeline
- Day plan is greedy (not full TSP solver)
- Premium card is chat/best-time path; not every map popup rewritten

### 14. Future ML opportunities
- Learn per-place crowd curves from feedback
- City-specific traffic calibration from routing APIs
- Preference embeddings from trip history
- Sequence model for day itineraries
