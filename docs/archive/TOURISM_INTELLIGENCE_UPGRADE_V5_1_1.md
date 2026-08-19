# India In Time — Tourism Intelligence Upgrade Report

Version: 5.1.1

This report is generated from the upgraded deterministic itinerary engine and the curated Visakhapatnam seed data. AI discovery candidates are treated as untrusted until they pass tourism eligibility.

## Architecture implemented

USER REQUEST → REQUIREMENT UNDERSTANDING → TOURISM POI DISCOVERY → TOURISM POI ELIGIBILITY → TOURISM QUALITY SCORE → GEO-SPATIAL FILTER → TIME-DEPENDENT INTELLIGENCE → WEATHER/CROWD/TRAFFIC/SCENIC → MEAL/SHOPPING → CONSTRAINT OPTIMIZER → HARD VALIDATION → ITINERARY → EXPLANATION/CONFIDENCE

## Core changes

- Added `services/travelIntelligence/tourismPoi/` with eligibility, blacklist, category classification, provenance and quality scoring.
- Localities, residential areas, infrastructure and unknown map entities cannot enter the itinerary as tourist stops.
- Food and shopping are first-class categories, but are only admitted when the request requires them.
- Added tourism quality score and tier to every accepted candidate and itinerary stop.
- Added rejected-candidate diagnostics so the API explains why map results were discarded.
- Added curated CMR Central and Inorbit Mall Visakhapatnam entries to the Vizag city seed.
- Added a deterministic 10-scenario regression suite.

## Tourism quality model

The score combines category validity, official/curated provenance, rating, review volume, tourism relevance, evidence confidence and repeated-source evidence. A small review count cannot automatically beat a highly evidenced attraction.

## 10 realistic behavior scenarios

### Only tourist attractions

**USER REQUEST:** I want only tourist places

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B), Dolphins Nose Lighthouse (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; Venkatadri Vantillu: tourism-only mode excludes food/shopping destinations; CMR Central: tourism-only mode excludes food/shopping destinations; Inorbit Mall Visakhapatnam: tourism-only mode excludes food/shopping destinations; Daspalla Restaurant: tourism-only mode excludes food/shopping destinations

**FINAL STATUS:** FEASIBLE; requirement satisfaction 100/100

**FINAL ITINERARY:**
1. 10:09–10:44 — Victory at Sea War Memorial (scenic); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Near previous stop (1 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
2. 11:08–12:08 — Lawsons Bay Beach (beach); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Near previous stop (2 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
3. 12:31–13:16 — Matsyadarshini Aquarium (scenic); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Near previous stop (3.3 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
4. 13:39–14:24 — Ross Hill Church (temple); tourism quality 71/100; experience 72/100; confidence 86%
   - Why: Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
5. 14:47–15:32 — VMRDA City Central Park (scenic); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
6. 15:55–16:40 — Sri Kanaka Mahalakshmi Temple (temple); tourism quality 71/100; experience 72/100; confidence 86%
   - Why: Near previous stop (2.6 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
7. 17:03–17:53 — TU 142 Aircraft Museum (scenic); tourism quality 71/100; experience 52/100; confidence 86%
   - Why: This is a high-value time window for the place; Weather suitability: Unknown; Travel source: estimated
   - Why this time: This is a high-value time window for the place; Weather suitability: Unknown

**VALIDATION:** PASSED; rejected-candidate diagnostics: 12.

### No localities

**USER REQUEST:** Do not include localities

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B), Dolphins Nose Lighthouse (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; Venkatadri Vantillu: food destination not requested; CMR Central: shopping destination not requested; Inorbit Mall Visakhapatnam: shopping destination not requested; Daspalla Restaurant: food destination not requested

**FINAL STATUS:** FEASIBLE; requirement satisfaction 100/100

**FINAL ITINERARY:**
1. 10:09–10:44 — Victory at Sea War Memorial (scenic); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Near previous stop (1 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
2. 11:08–12:08 — Lawsons Bay Beach (beach); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Near previous stop (2 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
3. 12:31–13:16 — Matsyadarshini Aquarium (scenic); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Near previous stop (3.3 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
4. 13:39–14:24 — Ross Hill Church (temple); tourism quality 71/100; experience 72/100; confidence 86%
   - Why: Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
5. 14:47–15:32 — VMRDA City Central Park (scenic); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
6. 15:55–16:40 — Sri Kanaka Mahalakshmi Temple (temple); tourism quality 71/100; experience 72/100; confidence 86%
   - Why: Near previous stop (2.6 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
7. 17:03–17:53 — TU 142 Aircraft Museum (scenic); tourism quality 71/100; experience 52/100; confidence 86%
   - Why: This is a high-value time window for the place; Weather suitability: Unknown; Travel source: estimated
   - Why this time: This is a high-value time window for the place; Weather suitability: Unknown

**VALIDATION:** PASSED; rejected-candidate diagnostics: 12.

### No temples

**USER REQUEST:** Do not include temples

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B), Dolphins Nose Lighthouse (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; Venkatadri Vantillu: food destination not requested; CMR Central: shopping destination not requested; Inorbit Mall Visakhapatnam: shopping destination not requested; Daspalla Restaurant: food destination not requested

**FINAL STATUS:** FEASIBLE; requirement satisfaction 100/100

**FINAL ITINERARY:**
1. 09:12–09:57 — Matsyadarshini Aquarium (scenic); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Matches photography preference; Matches preferred category: scenic; Near previous stop (0.4 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
2. 10:21–11:51 — Ramakrishna Beach (beach); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Matches photography preference; Matches preferred category: beach; Near previous stop (0.4 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
3. 12:14–12:49 — Victory at Sea War Memorial (scenic); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Matches photography preference; Matches preferred category: scenic; Near previous stop (1 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
4. 13:12–14:12 — Lawsons Bay Beach (beach); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Matches photography preference; Matches preferred category: beach; Near previous stop (2 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
5. 14:35–15:20 — Tenneti Park (scenic); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Matches photography preference; Matches preferred category: scenic; Near previous stop (1.8 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
6. 15:43–16:43 — Sagar Nagar Beach (beach); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Matches photography preference; Matches preferred category: beach; Near previous stop (1.9 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
7. 17:07–17:52 — VUDA Park (scenic); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: This is a high-value time window for the place; Matches photography preference; Matches preferred category: scenic; Weather suitability: Unknown; Travel source: estimated
   - Why this time: This is a high-value time window for the place; Weather suitability: Unknown

**VALIDATION:** PASSED; rejected-candidate diagnostics: 12.

### Beaches

**USER REQUEST:** I want beaches

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B), Dolphins Nose Lighthouse (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; Venkatadri Vantillu: food destination not requested; CMR Central: shopping destination not requested; Inorbit Mall Visakhapatnam: shopping destination not requested; Daspalla Restaurant: food destination not requested

**FINAL STATUS:** FEASIBLE; requirement satisfaction 100/100

**FINAL ITINERARY:**
1. 06:08–07:08 — Lawsons Bay Beach (beach); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: This is a high-value time window for the place; Lower predicted crowd; Matches preferred category: beach; Near previous stop (2.9 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: This is a high-value time window for the place; Lower predicted crowd; Weather suitability: Unknown
2. 07:30–08:30 — Sagar Nagar Beach (beach); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: This is a high-value time window for the place; Lower predicted crowd; Matches preferred category: beach; Weather suitability: Unknown; Travel source: estimated
   - Why this time: This is a high-value time window for the place; Lower predicted crowd; Weather suitability: Unknown
3. 08:58–10:28 — Rushikonda Beach (beach); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Lower predicted crowd; Matches preferred category: beach; Near previous stop (3.5 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Lower predicted crowd; Weather suitability: Unknown
4. 10:56–12:11 — Mangamaripeta Beach (beach); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Matches preferred category: beach; Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown

**VALIDATION:** PASSED; rejected-candidate diagnostics: 12.

### Food

**USER REQUEST:** I want food

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), Venkatadri Vantillu (68/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; CMR Central: shopping destination not requested; Inorbit Mall Visakhapatnam: shopping destination not requested

**FINAL STATUS:** FEASIBLE; requirement satisfaction 100/100

**FINAL ITINERARY:**
1. 11:40–12:25 — Venkatadri Vantillu (food); tourism quality 68/100; experience 100/100; confidence 86%
   - Why: Fits lunch window; Matches preferred category: food; Near previous stop (1.3 km); Waited 31 min to reach a better time window; Weather suitability: Unknown; Travel source: estimated
   - Why this time: Fits lunch window; Waited 31 min to reach a better time window; Weather suitability: Unknown
2. 12:48–13:33 — Daspalla Restaurant (food); tourism quality 68/100; experience 100/100; confidence 86%
   - Why: Fits lunch window; This is a high-value time window for the place; Matches preferred category: food; Near previous stop (2.7 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Fits lunch window; This is a high-value time window for the place; Weather suitability: Unknown
3. 13:56–14:41 — Ramakrishna Beach Food Court (food); tourism quality 68/100; experience 100/100; confidence 86%
   - Why: Fits lunch window; This is a high-value time window for the place; Matches preferred category: food; Near previous stop (2.4 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Fits lunch window; This is a high-value time window for the place; Weather suitability: Unknown

**VALIDATION:** PASSED; rejected-candidate diagnostics: 6.

### Shopping

**USER REQUEST:** I want shopping

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B), Dolphins Nose Lighthouse (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; Venkatadri Vantillu: food destination not requested; Daspalla Restaurant: food destination not requested; Ramakrishna Beach Food Court: food destination not requested; Sea Inn Raju Gari Dhaba: food destination not requested

**FINAL STATUS:** FEASIBLE; requirement satisfaction 100/100

**FINAL ITINERARY:**
1. 17:13–18:43 — CMR Central (shopping); tourism quality 74/100; experience 91/100; confidence 78%
   - Why: This is a high-value time window for the place; Matches preferred category: shopping; Near previous stop (2.3 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: This is a high-value time window for the place; Weather suitability: Unknown
2. 19:12–19:47 — Victory at Sea War Memorial (scenic); tourism quality 71/100; experience 8/100; confidence 86%
   - Why: Lower predicted crowd; Near previous stop (2.3 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Lower predicted crowd; Weather suitability: Unknown

**VALIDATION:** PASSED; rejected-candidate diagnostics: 10.

### Photography

**USER REQUEST:** I want photography

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B), Dolphins Nose Lighthouse (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; Venkatadri Vantillu: food destination not requested; CMR Central: shopping destination not requested; Inorbit Mall Visakhapatnam: shopping destination not requested; Daspalla Restaurant: food destination not requested

**FINAL STATUS:** FEASIBLE; requirement satisfaction 100/100

**FINAL ITINERARY:**
1. 15:09–15:54 — Matsyadarshini Aquarium (scenic); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Matches photography preference; Matches preferred category: scenic; Near previous stop (0.4 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
2. 16:17–17:07 — TU 142 Aircraft Museum (scenic); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: This is a high-value time window for the place; Matches photography preference; Matches preferred category: scenic; Near previous stop (1.2 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: This is a high-value time window for the place; Weather suitability: Unknown
3. 17:36–18:11 — Victory at Sea War Memorial (scenic); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: This is a high-value time window for the place; Matches photography preference; Matches preferred category: scenic; Near previous stop (0.3 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: This is a high-value time window for the place; Weather suitability: Unknown
4. 18:40–19:25 — Tenneti Park (scenic); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Lower predicted crowd; Matches photography preference; Matches preferred category: scenic; Weather suitability: Unknown; Travel source: estimated
   - Why this time: Lower predicted crowd; Weather suitability: Unknown

**VALIDATION:** PASSED; rejected-candidate diagnostics: 12.

### Low crowd

**USER REQUEST:** I want low crowd

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B), Dolphins Nose Lighthouse (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; Venkatadri Vantillu: food destination not requested; CMR Central: shopping destination not requested; Inorbit Mall Visakhapatnam: shopping destination not requested; Daspalla Restaurant: food destination not requested

**FINAL STATUS:** FEASIBLE; requirement satisfaction 100/100

**FINAL ITINERARY:**
1. 09:12–09:57 — Matsyadarshini Aquarium (scenic); tourism quality 71/100; experience 70/100; confidence 86%
   - Why: Near previous stop (0.4 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
2. 10:21–11:51 — Ramakrishna Beach (beach); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Near previous stop (0.4 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
3. 12:14–12:49 — Victory at Sea War Memorial (scenic); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Near previous stop (1 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
4. 13:12–13:57 — Sri Kanaka Mahalakshmi Temple (temple); tourism quality 71/100; experience 72/100; confidence 86%
   - Why: Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
5. 14:20–15:05 — VMRDA City Central Park (scenic); tourism quality 71/100; experience 73/100; confidence 86%
   - Why: Near previous stop (2.6 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown
6. 15:28–16:13 — Ross Hill Church (temple); tourism quality 71/100; experience 72/100; confidence 86%
   - Why: Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown

**VALIDATION:** PASSED; rejected-candidate diagnostics: 12.

### Afternoon trip

**USER REQUEST:** I have an afternoon trip

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B), Dolphins Nose Lighthouse (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; Venkatadri Vantillu: food destination not requested; CMR Central: shopping destination not requested; Inorbit Mall Visakhapatnam: shopping destination not requested; Daspalla Restaurant: food destination not requested

**FINAL STATUS:** FEASIBLE; requirement satisfaction 83/100

**FINAL ITINERARY:**
1. 13:09–13:44 — Victory at Sea War Memorial (scenic); tourism quality 71/100; experience 100/100; confidence 86%
   - Why: Matches photography preference; Matches preferred category: scenic; Near previous stop (1 km); Weather suitability: Unknown; Travel source: estimated
   - Why this time: Weather suitability: Unknown

**VALIDATION:** PASSED; rejected-candidate diagnostics: 12.

### Rain scenario

**USER REQUEST:** It is raining; prefer safe indoor options

**ELIGIBLE POIs:** Ramakrishna Beach (71/100, Tier B), INS Kursura Submarine Museum (71/100, Tier B), Kailasagiri (71/100, Tier B), Rushikonda Beach (71/100, Tier B), Tenneti Park (71/100, Tier B), Simhachalam Temple (71/100, Tier B), Yarada Beach (71/100, Tier B), Venkatadri Vantillu (68/100, Tier B), TU 142 Aircraft Museum (71/100, Tier B), Matsyadarshini Aquarium (71/100, Tier B), VUDA Park (71/100, Tier B), Ross Hill Church (71/100, Tier B)

**REJECTED POIs + REASON:** Marripalem: rejected non-tourism provider type; Seethammadhara: rejected non-tourism provider type; Dwaraka Nagar: rejected non-tourism provider type; Marripalem Bus Stop: rejected non-tourism provider type; CMR Central: shopping destination not requested; Inorbit Mall Visakhapatnam: shopping destination not requested

**FINAL STATUS:** FEASIBLE; requirement satisfaction 83/100

**FINAL ITINERARY:**
1. 14:09–14:54 — Venkatadri Vantillu (food); tourism quality 68/100; experience 100/100; confidence 95%
   - Why: Fits lunch window; This is a high-value time window for the place; Matches preferred category: food; Near previous stop (1.3 km); Weather suitability: Fair; Travel source: estimated
   - Why this time: Fits lunch window; This is a high-value time window for the place; Weather suitability: Fair
2. 15:17–16:02 — Daspalla Restaurant (food); tourism quality 68/100; experience 100/100; confidence 95%
   - Why: Fits lunch window; Matches preferred category: food; Near previous stop (2.7 km); Weather suitability: Fair; Travel source: estimated
   - Why this time: Fits lunch window; Weather suitability: Fair

**VALIDATION:** PASSED; rejected-candidate diagnostics: 6.

## Regression evidence

- `node scripts/tourism-poi-regression.js` — 10/10 passed.
- `node scripts/itinerary-regression.js` — 32/32 passed.

## Known limitations

- Live traffic, weather and crowd quality still depend on provider availability; the engine labels provenance rather than fabricating missing data.
- The curated tourism catalog is currently strongest for Visakhapatnam; other cities continue to depend more heavily on provider/AI discovery plus the deterministic eligibility layer.
- Official tourism recognition cannot be inferred from an LLM suggestion; it must be supplied by a trusted source or curated record.
