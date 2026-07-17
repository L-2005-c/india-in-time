// routes/places.js — v6 (uses unified services)
const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();
const config  = require('../config');
const { callGeminiText } = require('../services/gemini');
const { placesCache } = require('../services/cache');
const { distKm } = require('../utils/geo');
const PLACE_CACHE_TTL_MS = config.cache.placesTtlMs;

function cacheKey(cityName, lat, lon, totalMinutes, prefs = []) {
  return [
    String(cityName || '').trim().toLowerCase(),
    Number(lat).toFixed(3),
    Number(lon).toFixed(3),
    parseInt(totalMinutes, 10) || 600,
    Array.isArray(prefs) ? [...prefs].sort().join(',') : '',
  ].join('|');
}

function getCachedPlaces(key) {
  return placesCache.get(key) || null;
}

function setCachedPlaces(key, payload) {
  if (!payload || !Array.isArray(payload.places) || payload.places.length === 0) return;
  placesCache.set(key, payload, PLACE_CACHE_TTL_MS);
}

function staticCityPlaces(cityName) {
  const key = String(cityName || '').trim().toLowerCase();
  const staticSeedsByCity = {
    visakhapatnam: [
      ['Ramakrishna Beach','beach',17.7140,83.3237,90,'05:30','21:00'],
      ['INS Kursura Submarine Museum','scenic',17.7177,83.3300,60,'10:00','20:00'],
      ['Kailasagiri','scenic',17.7492,83.3424,75,'06:00','20:00'],
      ['Rushikonda Beach','beach',17.7828,83.3853,90,'05:30','21:00'],
      ['Tenneti Park','scenic',17.7438,83.3493,45,'06:00','20:00'],
      ['Simhachalam Temple','temple',17.7668,83.2500,75,'06:00','20:30'],
      ['Yarada Beach','beach',17.6549,83.2691,90,'06:00','19:00'],
      ['Venkatadri Vantillu','food',17.7234,83.3075,45,'11:00','23:00'],
      ['TU 142 Aircraft Museum','scenic',17.7165,83.3291,50,'10:00','20:00'],
      ['Matsyadarshini Aquarium','scenic',17.7148,83.3248,45,'09:00','20:30'],
      ['VUDA Park','scenic',17.7216,83.3365,45,'08:30','20:30'],
      ['Ross Hill Church','temple',17.6885,83.2960,45,'06:00','19:00'],
      ['Dolphins Nose Lighthouse','scenic',17.6868,83.2892,60,'10:00','17:00'],
      ['Bheemili Beach','beach',17.8907,83.4523,90,'06:00','20:00'],
      ['Thotlakonda Buddhist Complex','scenic',17.8286,83.4081,60,'09:00','18:00'],
      ['Bavikonda Buddhist Complex','scenic',17.8200,83.3615,60,'09:00','18:00'],
      ['Bojjana Konda','scenic',17.6862,82.9998,75,'09:00','18:00'],
      ['Indira Gandhi Zoological Park','scenic',17.7678,83.3465,120,'09:00','17:00'],
      ['Kambalakonda Wildlife Sanctuary','scenic',17.8076,83.3068,90,'09:00','17:30'],
      ['Appikonda Beach','beach',17.5800,83.1806,75,'06:00','19:00'],
      ['Gangavaram Beach','beach',17.6262,83.2339,75,'06:00','19:00'],
      ['Victory at Sea War Memorial','scenic',17.7160,83.3275,35,'06:00','21:00'],
      ['Sri Kanaka Mahalakshmi Temple','temple',17.7040,83.3002,45,'05:00','21:00'],
      ['ISKCON Temple Visakhapatnam','temple',17.7795,83.3850,50,'07:30','20:30'],
      ['VMRDA City Central Park','scenic',17.7171,83.3039,45,'05:00','21:00'],
      ['Sagar Nagar Beach','beach',17.7638,83.3664,60,'06:00','20:00'],
      ['Mangamaripeta Beach','beach',17.8269,83.4022,75,'06:00','19:30'],
      ['Lawsons Bay Beach','beach',17.7362,83.3506,60,'06:00','20:00'],
      ['Daspalla Restaurant','food',17.7195,83.3069,45,'11:00','23:00'],
      ['Ramakrishna Beach Food Court','food',17.7142,83.3224,45,'11:00','22:30'],
      ['Sea Inn Raju Gari Dhaba','food',17.7521,83.3567,50,'11:00','23:00'],
      ['Sai Priya Beach Restaurant','food',17.7838,83.3867,50,'11:00','23:00'],
      ['Alpha Hotel Vizag','food',17.7268,83.3054,40,'07:00','22:30'],
    ],
    vizag: [
      ['Ramakrishna Beach','beach',17.7140,83.3237,90,'05:30','21:00'],
      ['INS Kursura Submarine Museum','scenic',17.7177,83.3300,60,'10:00','20:00'],
      ['Kailasagiri','scenic',17.7492,83.3424,75,'06:00','20:00'],
      ['Rushikonda Beach','beach',17.7828,83.3853,90,'05:30','21:00'],
      ['Tenneti Park','scenic',17.7438,83.3493,45,'06:00','20:00'],
      ['Simhachalam Temple','temple',17.7668,83.2500,75,'06:00','20:30'],
      ['Yarada Beach','beach',17.6549,83.2691,90,'06:00','19:00'],
      ['Venkatadri Vantillu','food',17.7234,83.3075,45,'11:00','23:00'],
      ['TU 142 Aircraft Museum','scenic',17.7165,83.3291,50,'10:00','20:00'],
      ['Matsyadarshini Aquarium','scenic',17.7148,83.3248,45,'09:00','20:30'],
      ['VUDA Park','scenic',17.7216,83.3365,45,'08:30','20:30'],
      ['Ross Hill Church','temple',17.6885,83.2960,45,'06:00','19:00'],
      ['Dolphins Nose Lighthouse','scenic',17.6868,83.2892,60,'10:00','17:00'],
      ['Bheemili Beach','beach',17.8907,83.4523,90,'06:00','20:00'],
      ['Thotlakonda Buddhist Complex','scenic',17.8286,83.4081,60,'09:00','18:00'],
      ['Bavikonda Buddhist Complex','scenic',17.8200,83.3615,60,'09:00','18:00'],
      ['Bojjana Konda','scenic',17.6862,82.9998,75,'09:00','18:00'],
      ['Indira Gandhi Zoological Park','scenic',17.7678,83.3465,120,'09:00','17:00'],
      ['Kambalakonda Wildlife Sanctuary','scenic',17.8076,83.3068,90,'09:00','17:30'],
      ['Appikonda Beach','beach',17.5800,83.1806,75,'06:00','19:00'],
      ['Gangavaram Beach','beach',17.6262,83.2339,75,'06:00','19:00'],
      ['Victory at Sea War Memorial','scenic',17.7160,83.3275,35,'06:00','21:00'],
      ['Sri Kanaka Mahalakshmi Temple','temple',17.7040,83.3002,45,'05:00','21:00'],
      ['ISKCON Temple Visakhapatnam','temple',17.7795,83.3850,50,'07:30','20:30'],
      ['VMRDA City Central Park','scenic',17.7245,83.3126,45,'05:00','21:00'],
      ['Sagar Nagar Beach','beach',17.7638,83.3664,60,'06:00','20:00'],
      ['Mangamaripeta Beach','beach',17.8269,83.4022,75,'06:00','19:30'],
      ['Lawsons Bay Beach','beach',17.7362,83.3506,60,'06:00','20:00'],
      ['Daspalla Restaurant','food',17.7195,83.3069,45,'11:00','23:00'],
      ['Ramakrishna Beach Food Court','food',17.7142,83.3224,45,'11:00','22:30'],
      ['Sea Inn Raju Gari Dhaba','food',17.7521,83.3567,50,'11:00','23:00'],
      ['Sai Priya Beach Restaurant','food',17.7838,83.3867,50,'11:00','23:00'],
      ['Alpha Hotel Vizag','food',17.7268,83.3054,40,'07:00','22:30'],
    ],
    hyderabad: [
      ['Charminar','scenic',17.3616,78.4747,60,'09:00','17:30'],
      ['Golconda Fort','scenic',17.3833,78.4011,90,'09:00','17:30'],
      ['Salar Jung Museum','scenic',17.3713,78.4804,90,'10:00','17:00'],
      ['Birla Mandir','temple',17.4062,78.4691,60,'07:00','21:00'],
      ['Chowmahalla Palace','scenic',17.3578,78.4717,75,'10:00','17:00'],
      ['Paradise Biryani','food',17.4416,78.4870,45,'11:00','23:00'],
    ],
    goa: [
      ['Baga Beach','beach',15.5553,73.7517,90,'06:00','22:00'],
      ['Calangute Beach','beach',15.5439,73.7553,90,'06:00','22:00'],
      ['Fort Aguada','scenic',15.4922,73.7730,75,'09:30','18:00'],
      ['Basilica of Bom Jesus','temple',15.5009,73.9116,60,'09:00','18:30'],
      ['Miramar Beach','beach',15.4744,73.8076,60,'06:00','21:00'],
      ['Ritz Classic Panaji','food',15.4989,73.8278,45,'11:00','23:00'],
    ],
    jaipur: [
      ['Amber Fort','scenic',26.9855,75.8513,90,'08:00','18:00'],
      ['Hawa Mahal','scenic',26.9239,75.8267,45,'09:00','16:30'],
      ['City Palace Jaipur','scenic',26.9258,75.8237,75,'09:30','17:00'],
      ['Jantar Mantar Jaipur','scenic',26.9248,75.8246,60,'09:00','16:30'],
      ['Birla Mandir Jaipur','temple',26.8923,75.8155,45,'06:00','21:00'],
      ['Rawat Mishthan Bhandar','food',26.9207,75.8007,45,'08:00','22:30'],
    ],
    'new delhi': [
      ['India Gate','scenic',28.6129,77.2295,45,'06:00','22:00'],
      ['Red Fort','scenic',28.6562,77.2410,90,'09:30','16:30'],
      ['Qutub Minar','scenic',28.5245,77.1855,75,'07:00','17:00'],
      ['Humayun Tomb','scenic',28.5933,77.2507,75,'06:00','18:00'],
      ['Lotus Temple','temple',28.5535,77.2588,60,'09:00','17:30'],
      ['Karim Hotel','food',28.6495,77.2334,45,'11:00','23:30'],
    ],
    delhi: [
      ['India Gate','scenic',28.6129,77.2295,45,'06:00','22:00'],
      ['Red Fort','scenic',28.6562,77.2410,90,'09:30','16:30'],
      ['Qutub Minar','scenic',28.5245,77.1855,75,'07:00','17:00'],
      ['Humayun Tomb','scenic',28.5933,77.2507,75,'06:00','18:00'],
      ['Lotus Temple','temple',28.5535,77.2588,60,'09:00','17:30'],
      ['Karim Hotel','food',28.6495,77.2334,45,'11:00','23:30'],
    ],
  };
  const seeds = staticSeedsByCity[key] || [];
  return seeds.map((s, i) => ({
    id: `static_${key.replace(/[^a-z0-9]/g, '_')}_${i}`,
    name: s[0], cat: s[1], coords: [s[2], s[3]], vt: s[4], ot: s[5], ct: s[6],
    fallbackSource: 'static_city_seed',
    importance: s[1] === 'food' ? 'famous' : i < 8 ? 'must_see' : i < 20 ? 'famous' : 'local',
    importanceScore: s[1] === 'food' ? 70 : Math.max(35, 100 - i * 3),
  }));
}

function deleteCachedPlaces(key) {
  placesCache.delete(key);
}

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
  console.log('[places] Response length:', (text||'').length, '| First 200:', (text||'').slice(0,200));
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
  } catch(e) {
    // Try to extract complete JSON array even if outer object is truncated
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      // Fix truncated JSON by finding last complete object
      let arrStr = arrMatch[0];
      // Find last complete '}' and close the array
      const lastClose = arrStr.lastIndexOf('}');
      if (lastClose > -1) {
        arrStr = arrStr.substring(0, lastClose + 1) + ']';
        try { parsed = { places: JSON.parse(arrStr) }; } catch(e2) {}
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
        } catch(e) {}
      }
      if (objects.length > 0) parsed = { places: objects };
    }
  }

  if (!parsed || !Array.isArray(parsed.places)) {
    console.error('[places] Parse failed. Raw:', raw.slice(0,500));
    return [];
  }

  console.log('[places] Parsed', parsed.places.length, 'places');

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

async function fetchWiki(lat, lon, cityName) {
  // Wikipedia coords are ground-truth accurate — use them directly.
  // Query up to 500 entries (Wikipedia max) within 30 km.
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=30000&gscoord=${lat}|${lon}&gslimit=500&format=json&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];
  const data = await res.json();
  const SKIP    = /\b(nagar|colony|peta|palle|village|layout|block|phase|mandal|taluk|district|ward|station|bypass|road|street|highway|slum|mohalla|chowk|circle|junction|sector|zone|area|suburb|locality|division|tehsil|residency|apartment|towers?|store|stores|shop|shops|supermarket|mart|boutique)\b/i;
  const TOURIST = /beach|fort|palace|temple|church|mosque|museum|lake|park|garden|hill|falls|cave|zoo|monument|ghat|dam|island|sanctuary|mandir|masjid|shrine|bagh|maidan|viewpoint|lighthouse|harbour|harbor|waterfall|reservoir|valley|tower|bazaar|pier|aquarium|botanical|heritage|archaeological/i;
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

async function geocodePlaceNominatim(placeName, cityName, cityLat, cityLon, category = 'scenic') {
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
  if (best.distKm > maxDistKm) { console.warn(`[geocode] "${placeName}" rejected — ${best.distKm.toFixed(1)}km from city (limit ${maxDistKm}km)`); return null; }
  return { lat: best.lat, lon: best.lon };
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

  console.log(`[places] Nominatim geocoded ${fixed}/${unique.length} AI places`);
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

  console.log(`[places] Curated food fallback produced ${out.length} places`);
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

  console.log(`[places] Curated city fallback produced ${out.length} places`);
  return out;
}

function fallbackCategoryForQuery(query) {
  if (['food', 'market', 'restaurant', 'cafe', 'seafood'].includes(query)) return 'food';
  if (query === 'temple') return 'temple';
  if (query === 'beach') return 'beach';
  return 'scenic';
}

function inferFallbackCategory(row, query) {
  const text = `${row?.class || ''} ${row?.type || ''} ${row?.name || ''} ${row?.display_name || ''}`.toLowerCase();
  if (/\b(restaurant|cafe|cafeteria|fast_food|food_court|food|eatery|dhaba|bakery|seafood|market|biryani|sweet)\b/.test(text)) return 'food';
  if (/\b(temple|church|mosque|shrine|mandir|masjid|place_of_worship)\b/.test(text)) return 'temple';
  if (/\b(beach|coast|seaside|beach_resort)\b/.test(text)) return 'beach';
  return fallbackCategoryForQuery(query);
}

function visitMinutesForCat(cat) {
  if (cat === 'food') return 45;
  if (cat === 'beach') return 90;
  if (cat === 'temple') return 60;
  return 60;
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
        if (name.toLowerCase() === cityName.toLowerCase()) continue;

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

  console.log(`[places] Nominatim fallback produced ${out.length} places`);
  return out;
}

function filterPlacesByPrefs(places, prefs = []) {
  if (!Array.isArray(prefs) || prefs.length === 0) return Array.isArray(places) ? places : [];
  return (places || []).filter(p => prefs.includes(p.cat));
}

function minDistKm(fromLat, fromLon, toPlaces) {
  let best = { place: null, distKm: Infinity };
  for (const p of toPlaces) {
    if (!p?.coords?.length) continue;
    const d = distKm(fromLat, fromLon, p.coords[0], p.coords[1]);
    if (d < best.distKm) best = { place: p, distKm: d };
  }
  return best;
}

function normalizeTokens(str) {
  const STOP = new Set(['park','temple','beach','garden','museum','fort','palace','lake','hill','caves','zoo','monument','ghat','dam','island','sanctuary','mandir','masjid','shrine','bagh','maidan']);
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(s => s.trim())
    // Allow short-but-important tokens like "mvp", "mg", "ram", etc.
    .filter(s => s.length >= 3)
    .filter(s => !STOP.has(s));
}

function dedupePlacesByName(list) {
  const seen = new Set();
  const out = [];
  for (const p of (list || [])) {
    const key = String(p?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    if (!key || key.length < 2 || seen.has(key)) continue;
    if (!p?.coords || p.coords.length < 2) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function snapAiPlaceToWiki(aiPlace, wikiPlaces, maxSnapKm) {
  const [aLat, aLon] = aiPlace.coords || [];
  const aiTokens = normalizeTokens(aiPlace.name);
  if (aiTokens.length === 0) return null;

  // Key change: snap primarily by name-token overlap, not by distance.
  // AI coords can be wrong, so distance-based snapping can pick a nearby but different place.
  let best = null;
  for (const wp of wikiPlaces) {
    if (!wp?.coords?.length) continue;
    const wName = (wp.name || '').toLowerCase();
    let overlap = 0;
    for (const t of aiTokens) {
      if (wName.includes(t)) overlap += 1;
    }
    // If there is no meaningful name overlap, don't snap at all.
    if (overlap === 0) continue;

    // Use distance only as a tie-breaker.
    const d = (aLat != null && aLon != null && !Number.isNaN(aLat) && !Number.isNaN(aLon))
      ? distKm(aLat, aLon, wp.coords[0], wp.coords[1])
      : Infinity;

    // Within same overlap, prefer closer candidates (to reduce bad snaps).
    // We do not hard-reject by maxSnapKm; AI coords might be wrong.
    const score = overlap * 1000000 - (Number.isFinite(d) ? d : 0);
    if (!best || score > best.score) best = { place: wp, score };
  }
  return best?.place || null;
}

function tokenOverlap(aiName, wikiName) {
  const aiTokens = normalizeTokens(aiName);
  const wikiTokens = new Set(normalizeTokens(wikiName));
  if (aiTokens.length === 0 || wikiTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of aiTokens) {
    if (wikiTokens.has(token)) overlap += 1;
  }
  return overlap;
}

function isConfidentWikiMatch(aiPlace, wikiPlace) {
  const overlap = tokenOverlap(aiPlace?.name, wikiPlace?.name);
  const aiTokens = normalizeTokens(aiPlace?.name);
  if (overlap === 0) return false;
  if (aiTokens.length === 1) return overlap === 1;
  return overlap >= Math.min(2, aiTokens.length);
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

  const geocoded = await fixAiCoordsViaNominatim(unmatched, lat, lon, cityName);
  return dedupePlacesByName([
    ...grounded,
    ...geocoded.map(place => ({ ...place, aiRanked: true })),
  ]);
}

router.post('/', async (req, res) => {
  const { lat, lon, cityName, totalMinutes, refresh, prefs = [] } = req.body;
  const wantFoodOnly = Array.isArray(prefs) && prefs.length === 1 && prefs[0] === 'food';
  if (lat==null||lon==null) return res.status(400).json({ error:'Missing lat/lon' });
  console.log(`\n[places] ${cityName} (${lat},${lon})`);
  const key = cacheKey(cityName, lat, lon, totalMinutes, prefs);
  if (refresh) {
    console.log(`[places] Refresh requested for ${cityName}; bypassing cache`);
    deleteCachedPlaces(key);
  }
  const cached = refresh ? null : getCachedPlaces(key);
  if (!refresh && cached) {
    console.log(`[places] Cache hit for ${cityName}`);
    return res.json(cached);
  }
  const staticPlaces = filterPlacesByPrefs(staticCityPlaces(cityName), prefs);
  try {
    // ── Fetch ALL sources in parallel ────────────────────────────────────────────
    // Strategy: gather every reliable source simultaneously, then merge & dedup.
    // Never return early — always combine AI names (Nominatim-geocoded) +
    // Wikipedia (ground-truth coords) + Nominatim fallback search.
    // ── Fetch sources safely without overloading Nominatim ──────────────────
    // Wikipedia and Gemini API can run concurrently.
    const pWiki = wantFoodOnly ? Promise.resolve([]) : fetchWiki(lat, lon, cityName);
    const pAi   = wantFoodOnly ? Promise.resolve([]) : getPlaces(cityName, lat, lon, totalMinutes);

    // Nominatim strictly limits to 1 request per second globally per IP.
    // We MUST execute Curated (which geocodes) and Nominatim Fallback sequentially
    // to avoid HTTP 429 Too Many Requests, which breaks the subsequent AI geocoding.
    let curatedCity = [];
    if (!wantFoodOnly) {
      curatedCity = await fetchCuratedCityFallback(lat, lon, cityName).catch(e => {
        console.error('[places] Curated fallback failed:', e.message); return [];
      });
    }

    const nominatimRaw = await fetchNominatimFallback(lat, lon, cityName, { foodOnly: wantFoodOnly }).catch(e => {
      console.error('[places] Nominatim fallback failed:', e.message); return [];
    });

    const wikiResult = await pWiki.catch(e => { console.error('[places] Wiki failed:', e.message); return []; });
    const aiResult   = await pAi.catch(e => { console.error('[places] AI discovery failed:', e.message); return []; });

    const wiki = Array.isArray(wikiResult) ? wikiResult : [];
    const aiPlacesRaw = Array.isArray(aiResult) ? aiResult : [];
    
    // Now that fallbacks are done, hydrate AI places (this also geocodes sequentially)
    const aiRanked = filterPlacesByPrefs(
      await hydrateAiPlaces(aiPlacesRaw, [...staticPlaces, ...curatedCity, ...wiki, ...nominatimRaw], lat, lon, cityName),
      prefs
    );

    console.log(`[places] Sources: AI-ranked:${aiRanked.length} Static:${staticPlaces.length} Wiki:${wiki.length} Curated:${curatedCity.length} Nominatim:${nominatimRaw.length}`);

    // ── Merge all sources, dedup by normalised name ───────────────────────────
    const seen    = new Set();
    const merged  = [];

    function addPlaces(list) {
      for (const p of (list || [])) {
        const k = String(p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        if (!k || k.length < 2 || seen.has(k)) continue;
        if (!p.coords || p.coords.length < 2) continue;
        seen.add(k);
        merged.push(p);
      }
    }

    // Priority order: AI geocoded (has open/close times) → Wikipedia (trusted coords)
    // → curated seeds → Nominatim fallback search
    addPlaces(aiRanked);
    addPlaces(staticPlaces);
    addPlaces(filterPlacesByPrefs(curatedCity, prefs));
    
    // Only pull from Wikipedia if we have fewer than 30 places
    if (merged.length < 30) {
      addPlaces(filterPlacesByPrefs(wiki, prefs).slice(0, 30 - merged.length));
    }
    
    // Only pull from raw Nominatim search if we STILL have fewer than 20 places 
    // (Nominatim raw searches return very low quality data in India like random nodes/roads)
    if (merged.length < 20) {
      addPlaces(filterPlacesByPrefs(nominatimRaw, prefs).slice(0, 25 - merged.length));
    }

    // If food-only, also add curated food seeds
    if (wantFoodOnly) {
      const curatedFood = await fetchCuratedFoodFallback(lat, lon, cityName).catch(() => []);
      addPlaces(curatedFood);
    }

    // Hard limit the total places sent to the frontend to prevent map clutter with bad data
    const finalPlaces = merged.slice(0, Math.min(50, Math.max(30, Math.ceil((totalMinutes || 600) / 600) * 12)));

    console.log(`[places] Final merged pool: ${finalPlaces.length} places (prefs: ${prefs.join(',') || 'all'})`);

    if (finalPlaces.length >= 3) {
      const payload = { places: finalPlaces, source: 'ranked_sources', count: finalPlaces.length };
      setCachedPlaces(key, payload);
      return res.json(payload);
    }

    // Last resort: return whatever we have unfiltered
    const anything = filterPlacesByPrefs(
      [...aiRanked, ...staticPlaces, ...curatedCity, ...wiki, ...nominatimRaw].filter((p, i, arr) =>
        p?.coords?.length >= 2 &&
      arr.findIndex(x => String(x.name||'').toLowerCase() === String(p.name||'').toLowerCase()) === i
      ).slice(0, 30),
      prefs
    );
    const payload = { places: anything, source: 'last_resort', count: anything.length };
    setCachedPlaces(key, payload);
    return res.json(payload);

  } catch(err) {
    console.error('[places] Error:', err.message);
    try {
      const wiki = await fetchWiki(lat, lon, cityName).catch(() => []);
      const curatedCity = await fetchCuratedCityFallback(lat, lon, cityName).catch(() => []);
      const nominatimFallback = await fetchNominatimFallback(lat, lon, cityName, { foodOnly: wantFoodOnly }).catch(() => []);
      const all = filterPlacesByPrefs(
          [...staticPlaces, ...curatedCity, ...wiki, ...nominatimFallback].filter((p, i, arr) =>
          p?.coords?.length >= 2 &&
          arr.findIndex(x => String(x.name||'').toLowerCase() === String(p.name||'').toLowerCase()) === i
        ).slice(0, 30),
        prefs
      );
      const payload = { places: all, source: 'error_fallback', count: all.length };
      setCachedPlaces(key, payload);
      return res.json(payload);
    } catch(e) {
      return res.status(500).json({ error: 'Places fetch failed' });
    }
  }
});

module.exports = router;
