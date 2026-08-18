'use strict';

const fs = require('fs');
const path = require('path');
const { planAdvancedItinerary } = require('../services/travelIntelligence/advancedItineraryEngine');

const places = [
  { id: 'yarada', name: 'Yarada Beach', cat: 'beach', coords: [17.65, 83.26], vt: 75, ot: '06:00', ct: '19:30', is_sunrise_spot: true, is_sunset_spot: true, isFree: true },
  { id: 'dolphin', name: 'Dolphin Nose Lighthouse', cat: 'scenic', coords: [17.675, 83.295], vt: 50, ot: '06:00', ct: '20:00', is_sunset_spot: true, isFree: true },
  { id: 'temple', name: 'Simhachalam Temple', cat: 'temple', coords: [17.766, 83.25], vt: 50, ot: '08:00', ct: '18:00', estimatedCost: 50 },
  { id: 'lunch', name: 'Daspalla Restaurant', cat: 'food', coords: [17.72, 83.30], vt: 50, ot: '11:00', ct: '15:00', estimatedCost: 300, vegetarian: true },
  { id: 'sunset', name: 'Kailasagiri', cat: 'scenic', coords: [17.748, 83.342], vt: 60, ot: '08:00', ct: '19:00', estimatedCost: 40, is_sunset_spot: true },
  { id: 'museum', name: 'INS Kursura Submarine Museum', cat: 'museum', coords: [17.717, 83.331], vt: 60, ot: '10:00', ct: '17:00', estimatedCost: 100 },
  { id: 'rk', name: 'Ramakrishna Beach', cat: 'beach', coords: [17.714, 83.323], vt: 75, ot: '06:00', ct: '20:00', isFree: true },
  { id: 'dinner', name: 'Beach Food Court', cat: 'food', coords: [17.713, 83.322], vt: 45, ot: '11:30', ct: '22:00', estimatedCost: 180, vegetarian: true },
  { id: 'market', name: 'Night Market', cat: 'market', coords: [17.72, 83.31], vt: 60, ot: '17:00', ct: '23:00', estimatedCost: 0, isFree: true },
];

const scenarios = [
  { title: 'Morning', request: 'I have 5 hours in Vizag from 8 AM. I want scenic places and photography.', options: { startMin: 8 * 60, endMin: 13 * 60, preferredCategories: ['scenic'], personas: ['photographer'] } },
  { title: 'Afternoon', request: 'I have 6 hours from 1 PM. I want food, a museum and low travel time.', options: { startMin: 13 * 60, endMin: 19 * 60, preferredCategories: ['food', 'museum'] } },
  { title: 'Evening', request: 'I have 4 hours from 4 PM. I want photography and sunset views.', options: { startMin: 16 * 60, endMin: 20 * 60, preferredCategories: ['scenic'], personas: ['photographer'] } },
  { title: 'Night', request: 'I have 3 hours from 7 PM. I want dinner and a relaxed evening.', options: { startMin: 19 * 60, endMin: 22 * 60, requiredMeals: ['dinner'], tripMode: 'relaxed' } },
  { title: 'Food focused', request: 'I have 6 hours from noon. Food is the priority and I need lunch.', options: { startMin: 12 * 60, endMin: 18 * 60, preferredCategories: ['food'], personas: ['food_lover'], requiredMeals: ['lunch'] } },
  { title: 'Photography', request: 'I have 6 hours from 2 PM. Maximize photography quality and scenic timing.', options: { startMin: 14 * 60, endMin: 20 * 60, preferredCategories: ['scenic', 'beach'], personas: ['photographer'] } },
  { title: 'Family', request: 'I have 6 hours from 10 AM. Plan a comfortable family-friendly day.', options: { startMin: 10 * 60, endMin: 16 * 60, personas: ['family'], tripMode: 'family' } },
  { title: 'Low crowd', request: 'I have 6 hours from 8 AM. Avoid crowded places and keep the trip relaxed.', options: { startMin: 8 * 60, endMin: 14 * 60, personas: ['low_crowd'], tripMode: 'relaxed' } },
  { title: 'Beach + food', request: 'I have 7 hours from 1 PM. I want beaches, good food and no temples.', options: { startMin: 13 * 60, endMin: 20 * 60, preferredCategories: ['beach', 'food'], excludedCategories: ['temple'], requiredMeals: ['lunch'] } },
  { title: 'Rain scenario', request: 'I have 5 hours from 2 PM. Heavy rain is expected until 4 PM, then it clears. Adapt the itinerary.', options: { startMin: 14 * 60, endMin: 19 * 60, preferredCategories: ['museum', 'beach', 'scenic'], weather: { hourly: [ { time: '14:00', tempC: 27, condition: 'Heavy Rain' }, { time: '15:00', tempC: 27, condition: 'Heavy Rain' }, { time: '16:00', tempC: 28, condition: 'Clear' }, { time: '17:00', tempC: 28, condition: 'Clear' }, { time: '18:00', tempC: 28, condition: 'Clear' } ] } } },
];

function fmt(obj) { return JSON.stringify(obj, null, 2); }
function reasons(stop) { return (stop.whyThisTime?.length ? stop.whyThisTime : stop.whyThisPlace || stop.reasons || []).slice(0, 4).join('; '); }

let md = '# India In Time — Generated Acceptance Examples\n\n';
md += '> Generated from the v5.1.0 authoritative planner using the same constraint-aware engine used by the application. These are deterministic acceptance fixtures, not claims about live venue conditions.\n\n';
scenarios.forEach((scenario, index) => {
  const result = planAdvancedItinerary(places, { ...scenario.options, originCoords: [17.72, 83.31] });
  md += `## ${index + 1}. ${scenario.title}\n\n`;
  md += `**USER REQUEST**\n\n${scenario.request}\n\n`;
  md += `**REQUIREMENTS EXTRACTED**\n\n\`\`\`json\n${fmt(result.requirements)}\n\`\`\`\n\n`;
  md += `**ITINERARY** — ${result.status}\n\n`;
  if (!result.stops.length) md += 'No itinerary returned because the strict hard constraints were infeasible.\n\n';
  else {
    result.stops.forEach((s) => {
      md += `- **${s.arriveAt}–${s.leaveAt} — ${s.name}** (${s.purpose}) — ${reasons(s)}\n`;
    });
    md += '\n';
  }
  md += `**REQUIREMENT SATISFACTION:** ${result.requirementSatisfaction.score}/100\n\n`;
  md += `**WHY THIS SEQUENCE:** ${result.objective}\n\n`;
});

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'ITINERARY_ACCEPTANCE_EXAMPLES_V5.md'), md);
console.log('Generated docs/ITINERARY_ACCEPTANCE_EXAMPLES_V5.md');
