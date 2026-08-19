# India In Time — Tourism POI Eligibility Engine (v5.2)

**Production upgrade:** Real tourism value over raw map data.

## 1. Existing itinerary architecture

USER REQUEST → routes/places.js → placesDiscovery.js (Gemini/Wiki/Nominatim/seeds)
→ advancedItineraryEngine.js (beam-search) → requirementEngine + temporal/weather/crowd/scenic/routing
→ FINAL ITINERARY

## 2. Problems found

1. Localities entered the candidate pool (Marripalem, Seethammadhara, Dwaraka Nagar, MVP Colony, NAD Junction).
2. Map existence was treated as tourism worthiness.
3. NAME_BLOCK incorrectly rejected malls (plaza|mall blocked CMR Central / Inorbit Mall).
4. Gemini schema omitted shopping; prompt banned shopping malls.
5. No tourism quality score (tiny sample high ratings could outrank high-volume landmarks).
6. No S/A/B/C/D/REJECT tier system.
7. Shopping not first-class in seeds or category aliases.

## 3. Root causes

Ad-hoc regex only in discovery fallbacks; AI discovery trusted without post-validation; commercial blocks did not distinguish tourist malls; no curated whitelist authority.

## 4. Tourist POI filtering architecture

New module: `services/travelIntelligence/tourismPoi/`

- tourismEligibilityEngine.js — main gate
- tourismBlacklist.js — hard reject localities/roads/services
- tourismWhitelist.js — curated Vizag attractions + shopping
- tourismCategoryClassifier.js — tourism class taxonomy
- tourismQualityScore.js — 0–100 score + tiers
- index.js — public API

Pipeline: DISCOVERY → [TOURISM ELIGIBILITY GATE] → requirement filter → intelligence → optimizer

Integrated in planAdvancedItinerary() before filterCandidates().

## 5. Tourism quality scoring

Weighted: categoryValidity 22%, bayesianRating 20%, reviewVolume 12%, sourceAuthority 18%, uniqueness 8%, evidence 10%, multiSource 10%.

Bayesian prior mean 3.5 strength 20 prevents 4.9/8-review from beating 4.6/8000-review.

## 6. Category classification

Tourist classes: BEACH, TEMPLE, MUSEUM, VIEWPOINT, SCENIC, SHOPPING_MALL, FOOD_DESTINATION, PARK, HERITAGE, etc.
Reject classes: LOCALITY, RESIDENTIAL_AREA, ROAD, JUNCTION, HOSPITAL, SCHOOL, etc.
Product category `shopping` is first-class.

## 7. City-specific curated data

city-seeds.js (visakhapatnam + vizag): CMR Central, Inorbit Mall added as shopping.
tourismWhitelist.js: full curated set with tiers, aliases, coords.

## 8–12. Intelligence / GeoAI / Food / Scenic / Shopping

Eligibility runs before expensive intelligence. Shopping is first-class; malls allowed in Gemini + Nominatim. Optimizer input pool is tourism-clean.

## 13. AI changes

Gemini categories include shopping/museum/park. Explicit ban on localities. Major named malls allowed. Schema enum updated. AI candidates must still pass eligibility.

## 14. Optimization

Unchanged beam-search. Pre-step filterEligibleCandidates removes REJECT entities.

## 15. Requirement handling

Hard exclusions via requirementEngine. Soft prefs drive allowFood/allowShopping. requireTouristOnly drops tier D unless discovery mode.

## 16. Validation

Tourism Eligibility Validator added before existing validators.

## 17–18. Tests

__tests__/services.tourismPoi.eligibility.test.js + scripts/tourism-eligibility-demo.js (12 scenarios).

Verified: Marripalem and all locality-only noise rejected; beaches/museums/temples/malls accepted; batch filter clean.

## 19. Performance

Pure CPU gate (microseconds). Positive: filters before weather/crowd/routing/AI calls.

## 20. Security

No new attack surface. Prevents residential labels in itineraries.

## 21. Known limitations

Whitelist Vizag-first; exclusive "malls only" needs exclusiveCategories flag; seed ratings sparse; full live optimizer demos need server context.

## Final standard

Real tourism value > raw map data.
User intent > generic popularity.
Time-specific experience > static ranking.
Verified data > AI guessing.

**Marripalem can never appear as a tourist stop.**
