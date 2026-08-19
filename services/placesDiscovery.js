'use strict';
const appLogger = require('../lib/logger');
// services/placesDiscovery.js
// All external-source discovery for places: Gemini (AI place names),
// Wikipedia geosearch, and Nominatim (geocoding + fallback search).
// Extracted out of routes/places.js — this is the "go get data from the
// outside world" layer; routes/places.js is left as the request/cache/
// merge orchestration layer that calls into this.
// No logic changed — same functions, same bodies, moved verbatim.

const fetch = require('node-fetch');
const { callGeminiText } = require('./gemini');
const { distKm } = require('../utils/geo');
const { keepAliveAgent } = require('../lib/httpAgent');
const {
  isConfidentWikiMatch, tokenOverlap, dedupePlacesByName,
  inferFallbackCategory, visitMinutesForCat,
} = require('../utils/placesMerge');
const { filterEligibleTourismCandidates } = require('./travelIntelligence/tourismPoi');

async function callGemini(prompt) {
  const text = await callGeminiText(prompt, {
    timeoutMs: 45000,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          places: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                category: { type: 'string', enum: ['scenic', 'temple', 'beach', 'food'] },
                importance: { type: 'string', enum: ['must_see', 'famous', 'local'] },
                visit_minutes: { type: 'integer' },
                open_time: { type: 'string', description: "24-hour format e.g. 09:00" },
                close_time: { type: 'string', description: "24-hour format e.g. 18:00" },
                best_visiting_hours: { type: 'string', description: "e.g. 06:00-09:00, or 16:00-19:00" },
                peak_hours: { type: 'string', description: "e.g. 11:00-15:00" },
                is_sunrise_spot: { type: 'boolean' },
                is_sunset_spot: { type: 'boolean' },
                has_nightlife: { type: 'boolean' },
                indoor_outdoor: { type: 'string', enum: ['indoor', 'outdoor', 'mixed'] },
                best_seasons: { type: 'string', description: "e.g. Winter, Monsoon" }
              },
              required: ['name', 'category', 'importance', 'visit_minutes', 'open_time', 'close_time', 'indoor_outdoor']
            }
          }
        },
        required: ['places']
      }
    }
  });
  appLogger.info('[places] Response length:', (text||'').length, '| First 200:', (text||'').slice(0,200));
  return text || '';
}

async function getPlaces(cityName, lat, lon, totalMinutes) {
  // Ask Gemini for place NAMES and metadata ONLY — no coordinates from AI.
  // All coordinates are geocoded via Nominatim after this step.
  // Scale count: enough landmark-first names for a full trip without flooding
  // Nominatim with low-value local suggestions.
  const daysEst   = Math.max(1, Math.ceil((totalMinutes || 600) / 600));
  const placeCount = Math.min(50, Math.max(30, daysEst * 12));
  const foodCount  = Math.max(6, Math.floor(placeCount * 0.25));
  const prompt = `List ${placeCount} real places a tourist should consider in ${cityName}, India.
  Return ONLY valid JSON, no markdown.
  Categories allowed: scenic, temple, beach, food.
  Importance allowed: must_see, famous, local.
  STRICT RULES:
  - Put the city's iconic must-see landmarks FIRST, then other famous and well-known tourist attractions, then a few worthwhile local additions.
  - Use importance "must_see" for signature landmarks tourists should not miss, "famous" for widely visited attractions, and "local" only for secondary additions.
  - At least half of the non-food entries must be must_see or famous attractions. Do not fill the list mostly with small local parks or minor neighbourhood places.
  - Only physical tourist destinations: beaches, forts, palaces, temples, mosques, churches, museums, parks, hills, lakes, viewpoints, ghats, waterfalls, gardens, monuments, caves, zoos, lighthouses, archaeological sites, nature reserves, botanical gardens.
  - Include only a few hidden gems or lesser-known spots after the famous attractions.
- Include at least ${foodCount} food entries: famous local restaurants, food streets, seafood spots, biryani joints, famous cafes, sweet shops — real named establishments only.
- DO NOT include: stores, shops, retail, supermarkets, boutiques, markets, shopping malls, roads, streets, highways, residential areas, colonies, layouts, towns, districts, neighbourhoods, bus stands, railway stations, airports, or generic areas.
- CRITICAL: Provide the EXACT, official, map-searchable name for each place so it can be accurately found on GPS and maps. Do NOT use generic or abbreviated names.
- Provide accurate 'open_time' and 'close_time' in 24-hour format. If open 24 hours, use 00:00 to 23:59.
- Provide 'indoor_outdoor' categorization (indoor, outdoor, mixed).
- Identify if the spot is famous for sunrise (is_sunrise_spot) or sunset (is_sunset_spot).
- Only real named places a tourist would visit. No coordinates. No duplicate entries.`;

  const raw = await callGemini(prompt);

  // Try to parse - handle partial JSON by finding complete objects
  let parsed = null;

  // Clean any markdown
  const clean = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();

  try {
    parsed = JSON.parse(clean);
  } catch (_e) {
    // Try to extract complete JSON array even if outer object is truncated
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      // Fix truncated JSON by finding last complete object
      let arrStr = arrMatch[0];
      // Find last complete '}' and close the array
      const lastClose = arrStr.lastIndexOf('}');
      if (lastClose > -1) {
        arrStr = arrStr.substring(0, lastClose + 1) + ']';
        try { parsed = { places: JSON.parse(arrStr) }; } catch (_e2) {}
      }
    }

    // Try finding any complete JSON objects manually
    if (!parsed) {
      const objects = [];
      const objRegex = /\{[^{}]*"name"[^{}]*\}/g;
      let match;
      while ((match = objRegex.exec(clean)) !== null) {
        try {
          const obj = JSON.parse(match[0]);
          if (obj.name) objects.push(obj);
        } catch (_e) {}
      }
      if (objects.length > 0) parsed = { places: objects };
    }
  }

  if (!parsed || !Array.isArray(parsed.places)) {
    appLogger.error('[places] Parse failed. Raw:', raw.slice(0,500));
    return [];
  }

  appLogger.info('[places] Parsed', parsed.places.length, 'places');

  return parsed.places.map((p, i) => {
    const rawCat = String(p.category || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    let cat = 'scenic';
    if (['food', 'local_food', 'food_spot', 'restaurant', 'restaurants', 'eatery', 'eateries', 'cafe', 'cafes', 'market', 'food_market', 'street_food', 'seafood'].includes(rawCat)) cat = 'food';
    else if (['temple', 'mandir', 'shrine', 'church', 'mosque', 'masjid'].includes(rawCat)) cat = 'temple';
    else if (['beach', 'coast', 'seaside'].includes(rawCat)) cat = 'beach';
    else if (['scenic', 'viewpoint', 'park', 'museum', 'fort', 'palace', 'lake', 'hill', 'garden', 'monument'].includes(rawCat)) cat = 'scenic';
    const name = String(p.name || '').trim();
    if (!name) return null;
    const rawImportance = String(p.importance || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const importance = ['must_see', 'famous', 'local'].includes(rawImportance) ? rawImportance : 'famous';
    const importanceScore = importance === 'must_see' ? 100 : importance === 'famous' ? 75 : 35;
    return {
      id: `ai_${i}`,
      name,
      cat,
      importance,
      importanceScore,
      vt: Math.min(Math.max(parseInt(p.visit_minutes)||60, 20), 240),
      ot: p.open_time  || (cat==='food'?'11:00':'06:00'),
      ct: p.close_time || (cat==='food'?'23:00':'20:00'),
      best_visiting_hours: p.best_visiting_hours || null,
      peak_hours: p.peak_hours || null,
      is_sunrise_spot: !!p.is_sunrise_spot,
      is_sunset_spot: !!p.is_sunset_spot,
      has_nightlife: !!p.has_nightlife,
      indoor_outdoor: p.indoor_outdoor || 'outdoor',
      best_seasons: p.best_seasons || null
    };
  }).filter(Boolean);
}

async function fetchWiki(lat, lon, _cityName) {
  // Wikipedia coords are ground-truth accurate — use them directly.
  // Query up to 500 entries (Wikipedia max) within 30 km.
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=30000&gscoord=${lat}|${lon}&gslimit=500&format=json&origin=*`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'IndiaInTime/1.0 (travel-planner-app)' },
    signal: AbortSignal.timeout(12000),
    agent: keepAliveAgent,
  });
  if (!res.ok) return [];
  const data = await res.json();
  const SKIP    = /\b(nagar|colony|peta|palle|village|layout|block|phase|mandal|taluk|district|ward|station|bypass|road|street|highway|slum|mohalla|chowk|circle|junction|sector|zone|area|suburb|locality|division|tehsil|residency|apartment|towers?|store|stores|shop|shops|supermarket|mart|boutique)\b/i;
  const TOURIST = /beach|fort|palace|mahal|haveli|chhatri|temple|church|mosque|museum|lake|park|garden|hill|falls|cave|zoo|monument|ghat|dam|island|sanctuary|mandir|masjid|shrine|bagh|maidan|viewpoint|lighthouse|harbour|harbor|waterfall|reservoir|valley|tower|bazaar|pier|aquarium|botanical|heritage|archaeological/i;
  return (data?.query?.geosearch || [])
    .filter(el => TOURIST.test(el.title) && !SKIP.test(el.title) && distKm(lat, lon, el.lat, el.lon) <= 35)
    .map(el => {
      const t = el.title.toLowerCase();
      const cat = t.match(/beach/)                                          ? 'beach'
                : t.match(/temple|church|mosque|mandir|masjid|shrine/)     ? 'temple'
                : 'scenic';
      return {
        id:     `wiki_${el.pageid}`,
        name:   el.title,
        cat,
        coords: [el.lat, el.lon],
        vt:     cat === 'beach' ? 90 : 60,
        ot:     '06:00',
        ct:     '20:00',
        importance: 'famous',
        importanceScore: 55,
      };
    })
    .slice(0, 60);
}

async function geocodePlaceViaNominatimOnly(placeName, cityName, cityLat, cityLon, category = 'scenic') {
  // Uses Nominatim to resolve the place name to GPS coords.
  // This is more reliable than trusting AI-provided lat/lon.
  const q = `${placeName}, ${cityName}, India`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}&countrycodes=in`;

  const res = await fetch(url, {
    headers: {
      'Accept-Language': 'en-US,en',
      'User-Agent': 'IndiaInTime/1.0 (travel-planner-app)',
    },
    signal: AbortSignal.timeout(9000),
    agent: keepAliveAgent,
  });
  if (!res.ok) return null;
  const results = await res.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  let best = null;
  const wantedCity = String(cityName || '').toLowerCase().trim();
  for (const r of results) {
    const rLat = parseFloat(r.lat);
    const rLon = parseFloat(r.lon);
    if (Number.isNaN(rLat) || Number.isNaN(rLon)) continue;
    const d = distKm(cityLat, cityLon, rLat, rLon);
    const label = String(r.display_name || '').toLowerCase();
    const exactName = String(r.name || '').toLowerCase();
    let score = -d;
    if (wantedCity && label.includes(wantedCity)) score += 100;
    if (exactName && exactName === String(placeName || '').toLowerCase()) score += 40;
    if (label.includes(String(placeName || '').toLowerCase())) score += 20;
    if (!best || score > best.score) best = { lat: rLat, lon: rLon, distKm: d, score, label };
  }

  // If the best match is too far from the city, likely wrong entity.
  if (!best) return null;
  const maxDistKm = category === 'food' ? 15 : 40;
  if (best.distKm > maxDistKm) { appLogger.warn(`[geocode] "${placeName}" rejected — ${best.distKm.toFixed(1)}km from city (limit ${maxDistKm}km)`); return null; }
  return { lat: best.lat, lon: best.lon };
}

// ── Photon fallback geocoder ─────────────────────────────────────────────
// Nominatim's public instance enforces a strict 1 req/sec global limit and
// actively blocks traffic it doesn't like (generic User-Agents, cloud/
// datacenter IPs, bursts from many concurrent users sharing one host IP —
// exactly the shape of traffic a deployed server produces). When that
// happens it doesn't error loudly — every call above just resolves to []
// or null, which is indistinguishable from "this place genuinely doesn't
// exist" from the caller's point of view. Cities with hardcoded seeds in
// data/city-seeds.js survive that silently because they never depend on
// geocoding at all; every other city (i.e. anything typed/selected outside
// that short curated list) has NO other source of coordinates and quietly
// falls to 0 results.
// Photon (photon.komoot.io) is a free, keyless geocoder built on the same
// OSM data with a much more permissive usage policy — used here as a
// second attempt only when Nominatim comes back empty, not as a replacement.
async function geocodePlaceViaPhoton(placeName, cityName, cityLat, cityLon, category = 'scenic') {
  const q = `${placeName}, ${cityName}`;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lat=${cityLat}&lon=${cityLon}`;

  let data;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IndiaInTime/1.0 (travel-planner-app)' },
      signal: AbortSignal.timeout(9000),
      agent: keepAliveAgent,
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch (_e) {
    return null;
  }

  const features = Array.isArray(data?.features) ? data.features : [];
  if (!features.length) return null;

  let best = null;
  const wantedCity = String(cityName || '').toLowerCase().trim();
  for (const f of features) {
    const rLon = f?.geometry?.coordinates?.[0];
    const rLat = f?.geometry?.coordinates?.[1];
    if (typeof rLat !== 'number' || typeof rLon !== 'number') continue;
    const d = distKm(cityLat, cityLon, rLat, rLon);
    const props = f.properties || {};
    const featCity = String(props.city || props.state || '').toLowerCase();
    const featName = String(props.name || '').toLowerCase();
    let score = -d;
    if (wantedCity && featCity.includes(wantedCity)) score += 100;
    if (featName && featName === String(placeName || '').toLowerCase()) score += 40;
    if (!best || score > best.score) best = { lat: rLat, lon: rLon, distKm: d, score };
  }

  if (!best) return null;
  const maxDistKm = category === 'food' ? 15 : 40;
  if (best.distKm > maxDistKm) return null;
  return { lat: best.lat, lon: best.lon };
}

async function geocodePlaceNominatim(placeName, cityName, cityLat, cityLon, category = 'scenic') {
  const viaNominatim = await geocodePlaceViaNominatimOnly(placeName, cityName, cityLat, cityLon, category).catch(() => null);
  if (viaNominatim) return viaNominatim;
  // Nominatim came back empty/blocked — try Photon before giving up. This is
  // what keeps non-curated cities from silently returning 0 places whenever
  // Nominatim is having a bad day (which, per its own usage policy, is often
  // for the exact traffic pattern a live server produces).
  return geocodePlaceViaPhoton(placeName, cityName, cityLat, cityLon, category).catch(() => null);
}

async function fixAiCoordsViaNominatim(aiPlaces, cityLat, cityLon, cityName) {
  const BAD_NAME = /\b(road|street|highway|nagar|colony|layout|phase|block|sector|ward|bypass|circle|junction|peta|palle|village|suburb|locality|apartment)\b/i;

  // Deduplicate and pre-filter bad names before geocoding
  const seen = new Set();
  const unique = aiPlaces.filter(p => {
    const k = String(p.name || '').trim().toLowerCase();
    if (!k || seen.has(k) || BAD_NAME.test(p.name)) return false;
    seen.add(k);
    return true;
  });

  const CONCURRENCY = 1;
  const out = [];
  let fixed = 0;

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(p => geocodePlaceNominatim(p.name, cityName, cityLat, cityLon, p.cat))
    );
    for (let j = 0; j < batch.length; j++) {
      const geo = results[j].status === 'fulfilled' ? results[j].value : null;
      if (geo) {
        out.push({ ...batch[j], coords: [geo.lat, geo.lon], nominatimFixed: true });
        fixed++;
      }
    }
    // Strict 1-second pause to respect Nominatim limits
    if (i + CONCURRENCY < unique.length) await new Promise(r => setTimeout(r, 1100));
  }

  appLogger.info(`[places] Nominatim geocoded ${fixed}/${unique.length} AI places`);
  return out;
}

async function fetchCuratedFoodFallback(lat, lon, cityName) {
  const CITY_FOOD_SEEDS = {
    visakhapatnam: ['Venkatadri Vantillu', 'Daspalla Restaurant', 'Ramakrishna Beach Food Court', 'Sea Inn Raju Gari Dhaba', 'Sai Priya Beach Restaurant'],
    vizag: ['Venkatadri Vantillu', 'Daspalla Restaurant', 'Ramakrishna Beach Food Court', 'Sea Inn Raju Gari Dhaba', 'Sai Priya Beach Restaurant'],
    vijayawada: ['Babai Hotel', 'RR Durbar', 'Minerva Coffee Shop', 'Southern Spice Restaurant', 'Brindavan Restaurant'],
    hyderabad: ['Bawarchi Restaurant', 'Paradise Biryani', 'Shah Ghouse', 'Cafe Niloufer', 'Pista House'],
  };
  const key = String(cityName || '').trim().toLowerCase();
  const seeds = CITY_FOOD_SEEDS[key] || [];
  const out = [];
  const seen = new Set();

  for (const name of seeds) {
    try {
      const geo = await geocodePlaceNominatim(name, cityName, lat, lon, 'food');
      if (!geo) continue;
      const dedupeKey = name.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({
        id: `cur_food_${out.length}`,
        name,
        cat: 'food',
        coords: [geo.lat, geo.lon],
        vt: 45,
        ot: '11:00',
        ct: '23:00',
        fallbackSource: 'curated_food_seed',
        importance: 'famous',
        importanceScore: 70,
      });
      await new Promise(r => setTimeout(r, 1100)); // Strict 1-second delay
    } catch (_e) {}
  }

  appLogger.info(`[places] Curated food fallback produced ${out.length} places`);
  return out;
}

async function fetchCuratedCityFallback(lat, lon, cityName) {
  const CITY_SEEDS = {
    visakhapatnam: [
      { name: 'Ramakrishna Beach', cat: 'beach', vt: 90 },
      { name: 'Rushikonda Beach', cat: 'beach', vt: 90 },
      { name: 'Kailasagiri', cat: 'scenic', vt: 75 },
      { name: 'Tenneti Park', cat: 'scenic', vt: 60 },
      { name: 'INS Kursura Submarine Museum', cat: 'scenic', vt: 60 },
      { name: 'TU 142 Aircraft Museum', cat: 'scenic', vt: 50 },
      { name: 'Matsyadarshini Aquarium', cat: 'scenic', vt: 45 },
      { name: 'VUDA Park', cat: 'scenic', vt: 45 },
      { name: 'Simhachalam Temple', cat: 'temple', vt: 60 },
      { name: 'Yarada Beach', cat: 'beach', vt: 90 },
    ],
    vizag: [
      { name: 'Ramakrishna Beach', cat: 'beach', vt: 90 },
      { name: 'Rushikonda Beach', cat: 'beach', vt: 90 },
      { name: 'Kailasagiri', cat: 'scenic', vt: 75 },
      { name: 'Tenneti Park', cat: 'scenic', vt: 60 },
      { name: 'INS Kursura Submarine Museum', cat: 'scenic', vt: 60 },
      { name: 'TU 142 Aircraft Museum', cat: 'scenic', vt: 50 },
      { name: 'Matsyadarshini Aquarium', cat: 'scenic', vt: 45 },
      { name: 'VUDA Park', cat: 'scenic', vt: 45 },
      { name: 'Simhachalam Temple', cat: 'temple', vt: 60 },
      { name: 'Yarada Beach', cat: 'beach', vt: 90 },
    ],
    vijayawada: [
      { name: 'Kanaka Durga Temple', cat: 'temple', vt: 60 },
      { name: 'Prakasam Barrage', cat: 'scenic', vt: 45 },
      { name: 'Bhavani Island', cat: 'scenic', vt: 75 },
      { name: 'Undavalli Caves', cat: 'scenic', vt: 60 },
      { name: 'Bapu Museum', cat: 'scenic', vt: 45 },
      { name: 'Gandhi Hill', cat: 'scenic', vt: 45 },
    ],
  };
  const key = String(cityName || '').trim().toLowerCase();
  const seeds = CITY_SEEDS[key] || [];
  const out = [];
  const seen = new Set();

  for (const seed of seeds) {
    try {
      const geo = await geocodePlaceNominatim(seed.name, cityName, lat, lon, seed.cat);
      if (!geo) continue;
      const dedupeKey = seed.name.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({
        id: `cur_city_${out.length}`,
        name: seed.name,
        cat: seed.cat,
        coords: [geo.lat, geo.lon],
        vt: seed.vt,
        ot: seed.cat === 'food' ? '11:00' : '06:00',
        ct: seed.cat === 'food' ? '23:00' : '20:00',
        fallbackSource: 'curated_city_seed',
        importance: 'must_see',
        importanceScore: Math.max(70, 98 - out.length * 3),
      });
      await new Promise(r => setTimeout(r, 1100)); // Strict 1-second delay
    } catch (_e) {}
  }

  appLogger.info(`[places] Curated city fallback produced ${out.length} places`);
  return out;
}

async function fetchNominatimFallback(lat, lon, cityName, opts = {}) {
  const { foodOnly = false } = opts;

  // ── Strict OSM class/type allowlists ──────────────────────────────────────
  // Only these OSM classes are accepted; everything else (highway, boundary,
  // administrative, natural generic, place, etc.) is rejected.
  const ALLOWED_CLASS = new Set([
    'tourism', 'amenity', 'leisure', 'historic', 'natural', 'waterway',
  ]);

  // Within allowed classes, only these specific OSM types pass
  const ALLOWED_TYPE = new Set([
    // tourism
    'attraction','viewpoint','museum','artwork','gallery','theme_park',
    'zoo','aquarium','picnic_site','information','camp_site',
    // amenity
    'restaurant','cafe','fast_food','food_court','marketplace',
    'place_of_worship','cinema','arts_centre','library',
    // leisure
    'park','garden','nature_reserve','beach_resort','marina',
    'miniature_golf','pitch','sports_centre','stadium','water_park',
    // historic
    'monument','memorial','castle','ruins','fort','archaeological_site',
    'building','church','mosque','temple','shrine','heritage',
    // natural
    'beach','cliff','peak','volcano','valley','bay','cave_entrance',
    'wetland','hot_spring','waterfall','spring',
    // waterway
    'waterfall',
  ]);

  // Name-level blocklist — reject anything whose name matches these patterns
  const NAME_BLOCK = /\b(road|street|highway|nagar|colony|layout|phase|block|sector|ward|bypass|circle|junction|cross|taluk|mandal|district|division|tehsil|zone|area|peta|palle|village|town|suburb|locality|apartment|residency|complex|towers?|plaza|mall|store|stores|shop|shops|supermarket|mart|boutique)\b/i;

  // Queries: tourist-specific so Nominatim returns tourist OSM nodes, not roads
  const queries = foodOnly
    ? ['famous restaurant', 'street food', 'local cafe', 'dhaba']
    : ['tourist attraction', 'historical', 'temple', 'museum', 'viewpoint', 'park', 'famous restaurant'];

  const seen = new Set();
  const out  = [];

  for (const query of queries) {
    try {
      const q   = `${query} in ${cityName}, India`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=10&q=${encodeURIComponent(q)}&countrycodes=in&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en-US,en', 'User-Agent': 'IndiaInTime/1.0 (travel-planner-app)' },
        signal: AbortSignal.timeout(9000),
        agent: keepAliveAgent,
      });
      if (!res.ok) continue;
      const rows = await res.json();

      for (const row of rows || []) {
        const rLat = parseFloat(row.lat);
        const rLon = parseFloat(row.lon);
        if (Number.isNaN(rLat) || Number.isNaN(rLon)) continue;

        const d = distKm(lat, lon, rLat, rLon);
        if (d > (foodOnly ? 15 : 35)) continue;

        // ── OSM class/type quality gate ──────────────────────────────────
        const osmClass = String(row.class || '').toLowerCase();
        const osmType  = String(row.type  || '').toLowerCase();

        // Must be a recognised tourist/amenity/leisure/historic/natural class
        if (!ALLOWED_CLASS.has(osmClass)) continue;
        // Must be a recognised specific type (not just a generic class node)
        if (!ALLOWED_TYPE.has(osmType)) continue;

        const name = String(row.name || '').trim() ||
                     String(row.display_name || '').split(',')[0].trim();
        if (!name || name.length < 3) continue;

        // Block roads, localities, residential areas by name pattern
        if (NAME_BLOCK.test(name)) continue;

        // Block pure numeric names and single-word generic fillers
        if (/^\d+$/.test(name)) continue;
        if (/^(india|karnataka|andhra|telangana|tamil|kerala|goa|mumbai|delhi|kolkata)$/i.test(name)) continue;

        const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) continue;
        seen.add(key);

        const cat = inferFallbackCategory(row, query);
        out.push({
          id:             `nom_${query.replace(/\s+/g,'_')}_${out.length}`,
          name, cat,
          coords:         [rLat, rLon],
          vt:             visitMinutesForCat(cat),
          ot:             cat === 'food' ? '11:00' : '06:00',
          ct:             cat === 'food' ? '23:00' : '20:00',
          fallbackSource: 'nominatim_search',
          importance:     'local',
          importanceScore: 25,
        });
      }
      await new Promise(r => setTimeout(r, 1100)); // Strict 1-second delay for Nominatim
    } catch (_e) {}
  }

  appLogger.info(`[places] Nominatim fallback produced ${out.length} places`);

  // ── Photon fallback for the broad search too ────────────────────────────
  // If Nominatim produced little/nothing (blocked/rate-limited — see the
  // comment above geocodePlaceViaPhoton), repeat the same tourist-category
  // searches against Photon so non-curated cities aren't left with zero
  // results just because Nominatim had a bad day.
  if (out.length < 5) {
    const PHOTON_OSM_VALUE_ALLOW = new Set([
      // tourism
      'attraction','viewpoint','museum','artwork','gallery','theme_park',
      'zoo','aquarium','picnic_site','information','camp_site',
      // amenity
      'restaurant','cafe','fast_food','food_court','marketplace',
      'place_of_worship','cinema','arts_centre','library',
      // leisure
      'park','garden','nature_reserve','beach_resort','marina',
      'miniature_golf','pitch','sports_centre','stadium','water_park',
      // historic
      'monument','memorial','castle','ruins','fort','archaeological_site',
      'church','mosque','temple','shrine','heritage',
      // natural
      'beach','cliff','peak','volcano','valley','bay','cave_entrance',
      'wetland','hot_spring','waterfall','spring',
    ]);

    for (const query of queries) {
      try {
        const q   = `${query} in ${cityName}`;
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lat=${lat}&lon=${lon}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'IndiaInTime/1.0 (travel-planner-app)' },
          signal: AbortSignal.timeout(9000),
          agent: keepAliveAgent,
        });
        if (!res.ok) continue;
        const data = await res.json();
        const features = Array.isArray(data?.features) ? data.features : [];

        for (const f of features) {
          const rLon = f?.geometry?.coordinates?.[0];
          const rLat = f?.geometry?.coordinates?.[1];
          if (typeof rLat !== 'number' || typeof rLon !== 'number') continue;

          const d = distKm(lat, lon, rLat, rLon);
          if (d > (foodOnly ? 15 : 35)) continue;

          const props = f.properties || {};
          const osmValue = String(props.osm_value || '').toLowerCase();
          if (!PHOTON_OSM_VALUE_ALLOW.has(osmValue)) continue;

          const name = String(props.name || '').trim();
          if (!name || name.length < 3) continue;
          if (NAME_BLOCK.test(name)) continue;
          if (/^\d+$/.test(name)) continue;

          const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (seen.has(key)) continue;
          seen.add(key);

          const cat = inferFallbackCategory({ class: osmValue, type: osmValue, name }, query);
          out.push({
            id:             `photon_${query.replace(/\s+/g,'_')}_${out.length}`,
            name, cat,
            coords:         [rLat, rLon],
            vt:             visitMinutesForCat(cat),
            ot:             cat === 'food' ? '11:00' : '06:00',
            ct:             cat === 'food' ? '23:00' : '20:00',
            fallbackSource: 'photon_search',
            importance:     'local',
            importanceScore: 25,
          });
        }
      } catch (_e) {}
    }
    appLogger.info(`[places] Photon fallback brought total to ${out.length} places`);
  }

  return out;
}

async function hydrateAiPlaces(aiPlaces, knownPlaces, lat, lon, cityName) {
  const candidates = (aiPlaces || []).slice(0, 18);
  const grounded = [];
  const unmatched = [];

  for (const aiPlace of candidates) {
    const exactKey = String(aiPlace?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let best = (knownPlaces || []).find(place =>
      String(place?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === exactKey
    );

    if (!best) {
      best = (knownPlaces || [])
        .filter(place => isConfidentWikiMatch(aiPlace, place))
        .sort((a, b) => {
          const overlapDiff = tokenOverlap(aiPlace.name, b.name) - tokenOverlap(aiPlace.name, a.name);
          if (overlapDiff) return overlapDiff;
          return (b.importanceScore || 0) - (a.importanceScore || 0);
        })[0];
    }

    if (best) {
      grounded.push({
        ...best,
        ...aiPlace,
        coords: best.coords,
        groundedSource: best.fallbackSource || (String(best.id || '').startsWith('wiki_') ? 'wikipedia' : 'known_place'),
        aiRanked: true,
        importanceScore: Math.max(aiPlace.importanceScore || 0, best.importanceScore || 0),
      });
    } else {
      unmatched.push(aiPlace);
    }
  }

  const geocoded = await fixAiCoordsViaNominatim(unmatched, lat, lon);

  const combined = dedupePlacesByName([
    ...grounded,
    ...geocoded.map(place => ({ ...place, aiRanked: true })),
  ]);
  const { eligible } = filterEligibleTourismCandidates(combined, { city: cityName, cityLat: lat, cityLon: lon });
  return eligible;
}


module.exports = {
  getPlaces,
  fetchWiki,
  geocodePlaceNominatim,
  fixAiCoordsViaNominatim,
  fetchCuratedFoodFallback,
  fetchCuratedCityFallback,
  fetchNominatimFallback,
  hydrateAiPlaces,
};
