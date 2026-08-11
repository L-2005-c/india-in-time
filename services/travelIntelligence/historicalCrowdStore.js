// historicalCrowdStore.js — load optional historical crowd hints and attach to places
const hints = require('../../data/historical-crowd-hints.json');

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function lookupHistoricalCrowd(place = {}, cityHint = null) {
  if (place.historicalCrowd && Number.isFinite(place.historicalCrowd.avgScore)) {
    return place.historicalCrowd;
  }
  const byName = hints.byPlaceName || {};
  const nameKey = Object.keys(byName).find((k) => normalizeName(k) === normalizeName(place.name));
  if (nameKey) {
    return { ...byName[nameKey], source: 'historical-json' };
  }
  const city = (cityHint || place.city || place.region || '').toLowerCase();
  const cat = (place.cat || 'default').toLowerCase();
  const composite = `${cat}|${city}`;
  const byCat = hints.byCategoryCity || {};
  if (city && byCat[composite]) {
    return { ...byCat[composite], source: 'historical-json-category' };
  }
  // partial city match
  for (const [key, val] of Object.entries(byCat)) {
    const [c, cit] = key.split('|');
    if (c === cat && city && cit && city.includes(cit)) return { ...val, source: 'historical-json-category' };
  }
  return null;
}

function attachHistoricalCrowd(place, cityHint = null) {
  const hist = lookupHistoricalCrowd(place, cityHint);
  if (!hist) return place;
  return { ...place, historicalCrowd: hist };
}

function attachHistoricalCrowdBatch(places, cityHint = null) {
  return (places || []).map((p) => attachHistoricalCrowd(p, cityHint));
}

module.exports = {
  lookupHistoricalCrowd,
  attachHistoricalCrowd,
  attachHistoricalCrowdBatch,
};
