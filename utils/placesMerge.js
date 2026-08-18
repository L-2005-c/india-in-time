// utils/placesMerge.js
// Pure, deterministic helpers for filtering/deduping/classifying place
// results — no network calls, no external state. Extracted out of
// routes/places.js so the route file only holds request handling and the
// discovery service only holds network calls.
//
// Two functions that used to live alongside these were NOT moved here:
// minDistKm and snapAiPlaceToWiki. Both were dead code — grep confirms
// zero call sites anywhere in the codebase beyond their own declaration.
// Dropped rather than carried forward into the new structure.

function filterPlacesByPrefs(places, prefs = []) {
  if (!Array.isArray(prefs) || prefs.length === 0) return Array.isArray(places) ? places : [];
  return (places || []).filter(p => prefs.includes(p.cat));
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


module.exports = {
  filterPlacesByPrefs,
  normalizeTokens,
  tokenOverlap,
  isConfidentWikiMatch,
  dedupePlacesByName,
  fallbackCategoryForQuery,
  inferFallbackCategory,
  visitMinutesForCat,
};
