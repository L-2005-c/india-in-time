# v5.2.3 — Fixed the 3 pre-existing test failures tracked in CHANGELOG_v5.2.2_MERGE.md

All 3 were investigated by running the actual code, not just editing test
assertions to match. Two test files had genuinely stale fixtures; the third
uncovered a real scheduling bug.

## 1. Stale algorithm-name assertions (test-only fix)
`services/travelIntelligence/{geoTemporalOptimizer,advancedItineraryEngine,
multiDayPlanner}.js` all consistently return
`'geo-temporal-beam-search-v5-world-class'` as the current algorithm name —
confirmed as the canonical value, not a leftover placeholder. Two test files
still asserted older names (`'requirement-aware-temporal-v1'` and
`'geo-temporal-beam-search-v4-structured'`). Updated both assertions to the
current value.
- `__tests__/services.advancedItineraryEngine.test.js`
- `__tests__/services.geoTemporalOptimizer.test.js`

## 2. `mealTimingBonus` was a flat 30 for *any* meal window (real bug fix)
`advancedItineraryEngine.js` gave every food stop landing in *any* of the
four meal windows (breakfast/lunch/snack/dinner) the same flat +30 bonus,
so a lunch-hour arrival and a late-afternoon "snack window" arrival scored
identically — collapsing a timing signal the scoring/beam-search relies on
to actually prefer proper meal-hour stops. Replaced the flat bonus with a
tiered `MEAL_TIMING_BONUS` map (breakfast 25, lunch 30, snack 15, dinner 30)
so snack-time still gets some credit but primary meals win out, matching
what the test (and the feature's intent) expects.

## 3. Places without coordinates were silently scheduled as real stops (real bug fix)
`multiDayPlanner.js` documents that places lacking coordinates "won't be
scheduled by the geo-temporal optimizer (it requires coords)" and reports
them in `unusedPlaces` with a "no coordinates" reason instead. In practice,
`requirementEngine.js`'s `candidateMatchesHardRequirements` never checked
for coordinates at all, so a coordinate-less place sailed through every hard
filter and got scheduled as an actual itinerary stop with `coords: undefined`
— a stop the frontend map/route rendering can't place, and a stop
`unusedPlaces` never got the chance to explain. Added a `hasUsableCoords`
check as the first hard-requirement gate, so these places are now correctly
rejected upstream and surfaced through the existing `unusedPlaces` /
"no coordinates" reporting path multiDayPlanner already had in place for
them.

## Verification
- `npx jest --runInBand --coverage --coverageThreshold=...` (same command as
  `npm run test:ci`): **62/62 suites, 611/611 tests pass**, coverage
  thresholds (70/60/70/70) clear.
- `npm run lint`: 0 errors (113 pre-existing warnings, unchanged).
- `npm run build:frontend`: builds cleanly (36 modules, Vite).

## Files changed
- `services/travelIntelligence/requirementEngine.js` — added coords gate
- `services/travelIntelligence/advancedItineraryEngine.js` — tiered meal bonus
- `__tests__/services.advancedItineraryEngine.test.js` — updated assertion
- `__tests__/services.geoTemporalOptimizer.test.js` — updated assertion
