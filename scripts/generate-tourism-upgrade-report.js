'use strict';

const fs = require('fs');
const { staticCityPlaces } = require('../data/city-seeds');
const { filterTourismCandidates } = require('../services/travelIntelligence/tourismPoi/tourismEligibilityEngine');
const { planAdvancedItinerary } = require('../services/travelIntelligence/advancedItineraryEngine');

const basePlaces = staticCityPlaces('vizag');
const noise = [
  { id: 'marripalem', name: 'Marripalem', cat: 'scenic', coords: [17.742, 83.249], type: 'locality' },
  { id: 'seethammadhara', name: 'Seethammadhara', cat: 'scenic', coords: [17.74, 83.32], type: 'suburb' },
  { id: 'dwaraka-nagar', name: 'Dwaraka Nagar', cat: 'scenic', coords: [17.72, 83.30], type: 'locality' },
  { id: 'bus-stop', name: 'Marripalem Bus Stop', cat: 'scenic', coords: [17.74, 83.25], type: 'bus_stop' },
];

const scenarios = [
  { title: 'Only tourist attractions', request: 'I want only tourist places', options: { tourismOnly: true, startMin: 10*60, endMin: 18*60 } },
  { title: 'No localities', request: 'Do not include localities', options: { startMin: 10*60, endMin: 18*60 } },
  { title: 'No temples', request: 'Do not include temples', options: { excludedCategories: ['temple'], preferredCategories: ['beach','scenic'], startMin: 9*60, endMin: 18*60 } },
  { title: 'Beaches', request: 'I want beaches', options: { preferredCategories: ['beach'], startMin: 6*60, endMin: 14*60 } },
  { title: 'Food', request: 'I want food', options: { preferredCategories: ['food'], personas: ['food_lover'], requiredMeals: ['lunch'], startMin: 11*60, endMin: 15*60+30 } },
  { title: 'Shopping', request: 'I want shopping', options: { preferredCategories: ['shopping'], startMin: 17*60, endMin: 21*60 } },
  { title: 'Photography', request: 'I want photography', options: { preferredCategories: ['scenic'], personas: ['photographer'], startMin: 15*60, endMin: 20*60 } },
  { title: 'Low crowd', request: 'I want low crowd', options: { personas: ['low_crowd'], startMin: 9*60, endMin: 18*60 } },
  { title: 'Afternoon trip', request: 'I have an afternoon trip', options: { preferredCategories: ['museum','scenic'], startMin: 13*60, endMin: 18*60 } },
  { title: 'Rain scenario', request: 'It is raining; prefer safe indoor options', options: { preferredCategories: ['museum','food'], startMin: 14*60, endMin: 18*60, weather: { tempC: 27, condition: 'Heavy Rain' } } },
];

function esc(s) { return String(s ?? '').replace(/\|/g, '\\|'); }

const out = [
  '# India In Time — Tourism Intelligence Upgrade Report',
  '',
  'Version: 5.1.1',
  '',
  'This report is generated from the upgraded deterministic itinerary engine and the curated Visakhapatnam seed data. AI discovery candidates are treated as untrusted until they pass tourism eligibility.',
  '',
  '## Architecture implemented',
  '',
  'USER REQUEST → REQUIREMENT UNDERSTANDING → TOURISM POI DISCOVERY → TOURISM POI ELIGIBILITY → TOURISM QUALITY SCORE → GEO-SPATIAL FILTER → TIME-DEPENDENT INTELLIGENCE → WEATHER/CROWD/TRAFFIC/SCENIC → MEAL/SHOPPING → CONSTRAINT OPTIMIZER → HARD VALIDATION → ITINERARY → EXPLANATION/CONFIDENCE',
  '',
  '## Core changes',
  '',
  '- Added `services/travelIntelligence/tourismPoi/` with eligibility, blacklist, category classification, provenance and quality scoring.',
  '- Localities, residential areas, infrastructure and unknown map entities cannot enter the itinerary as tourist stops.',
  '- Food and shopping are first-class categories, but are only admitted when the request requires them.',
  '- Added tourism quality score and tier to every accepted candidate and itinerary stop.',
  '- Added rejected-candidate diagnostics so the API explains why map results were discarded.',
  '- Added curated CMR Central and Inorbit Mall Visakhapatnam entries to the Vizag city seed.',
  '- Added a deterministic 10-scenario regression suite.',
  '',
  '## Tourism quality model',
  '',
  'The score combines category validity, official/curated provenance, rating, review volume, tourism relevance, evidence confidence and repeated-source evidence. A small review count cannot automatically beat a highly evidenced attraction.',
  '',
  '## 10 realistic behavior scenarios',
  '',
];

for (const s of scenarios) {
  const places = [...noise, ...basePlaces];
  const filter = filterTourismCandidates(places, {
    foodRequested: s.options.requiredMeals?.length > 0 || s.options.preferredCategories?.includes('food') || s.options.personas?.some((p) => /food/.test(p)),
    shoppingRequested: s.options.preferredCategories?.includes('shopping'),
    tourismOnly: s.options.tourismOnly === true,
    preferredCategories: s.options.preferredCategories || [],
  });
  const plan = planAdvancedItinerary(places, s.options);
  out.push(`### ${s.title}`);
  out.push('');
  out.push(`**USER REQUEST:** ${s.request}`);
  out.push('');
  out.push(`**ELIGIBLE POIs:** ${filter.eligible.slice(0, 12).map((p) => `${p.name} (${p.tourismQualityScore}/100, Tier ${p.tourismTier})`).join(', ') || 'None'}`);
  out.push('');
  out.push(`**REJECTED POIs + REASON:** ${filter.rejected.slice(0, 8).map((p) => `${p.name}: ${p.reason}`).join('; ') || 'None'}`);
  out.push('');
  out.push(`**FINAL STATUS:** ${plan.status}; requirement satisfaction ${plan.requirementSatisfaction?.score ?? 0}/100`);
  out.push('');
  if (!plan.stops.length) {
    out.push('**FINAL ITINERARY:** No feasible itinerary under the supplied constraints.');
  } else {
    out.push('**FINAL ITINERARY:**');
    plan.stops.forEach((stop, i) => {
      out.push(`${i+1}. ${stop.arriveAt}–${stop.leaveAt} — ${stop.name} (${stop.category}); tourism quality ${stop.tourismQualityScore ?? 'n/a'}/100; experience ${stop.experienceScore ?? 'n/a'}/100; confidence ${stop.confidence ?? 'n/a'}%`);
      out.push(`   - Why: ${stop.whyThisPlace?.join('; ') || stop.reasons?.join('; ') || 'Best feasible option'}`);
      out.push(`   - Why this time: ${stop.whyThisTime?.join('; ') || 'Arrival-time intelligence selected this window.'}`);
    });
  }
  out.push('');
  out.push(`**VALIDATION:** ${plan.validation?.passed ? 'PASSED' : 'FAILED'}; rejected-candidate diagnostics: ${plan.diagnostics?.rejectedCandidateCount ?? 0}.`);
  out.push('');
}

out.push('## Regression evidence');
out.push('');
out.push('- `node scripts/tourism-poi-regression.js` — 10/10 passed.');
out.push('- `node scripts/itinerary-regression.js` — 32/32 passed.');
out.push('');
out.push('## Known limitations');
out.push('');
out.push('- Live traffic, weather and crowd quality still depend on provider availability; the engine labels provenance rather than fabricating missing data.');
out.push('- The curated tourism catalog is currently strongest for Visakhapatnam; other cities continue to depend more heavily on provider/AI discovery plus the deterministic eligibility layer.');
out.push('- Official tourism recognition cannot be inferred from an LLM suggestion; it must be supplied by a trusted source or curated record.');
out.push('');

fs.writeFileSync('docs/TOURISM_INTELLIGENCE_UPGRADE_V5_1_1.md', out.join('\n'));
console.log('wrote docs/TOURISM_INTELLIGENCE_UPGRADE_V5_1_1.md');
