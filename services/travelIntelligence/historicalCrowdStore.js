// historicalCrowdStore.js — load optional historical crowd hints and attach to places
// Primary source: static JSON (data/historical-crowd-hints.json).
// Pipeline target: historical_crowd table (see db/schema.js). When DB rows
// exist they override JSON for the same place+city. Callers that only have
// sync context continue to use the JSON path; async DB enrichment is
// available via lookupHistoricalCrowdAsync for batch status endpoints.

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

/**
 * Optional async enrichment from historical_crowd table.
 * Fails open (returns JSON result) if DB is unavailable.
 */
async function lookupHistoricalCrowdAsync(place = {}, cityHint = null) {
  const jsonHit = lookupHistoricalCrowd(place, cityHint);
  try {
    const { getDb } = require('../../db/init');
    const pool = getDb();
    if (!pool) return jsonHit;
    const city = cityHint || place.city || place.region || '';
    const { rows } = await pool.query(
      `SELECT crowd_level, crowd_score, source, sample_size, daypart,
              AVG(crowd_score)::float AS avg_score, COUNT(*)::int AS n
       FROM historical_crowd
       WHERE lower(place_name) = lower($1) AND ($2 = '' OR lower(city) = lower($2))
       GROUP BY crowd_level, crowd_score, source, sample_size, daypart
       ORDER BY n DESC
       LIMIT 5`,
      [place.name || '', city]
    );
    if (!rows.length) return jsonHit;
    const avg = rows.reduce((s, r) => s + (r.avg_score || r.crowd_score || 0), 0) / rows.length;
    return {
      avgScore: Math.round(avg),
      level: rows[0].crowd_level,
      source: 'historical-db',
      samples: rows.reduce((s, r) => s + (r.n || r.sample_size || 1), 0),
      dayparts: rows.map((r) => r.daypart).filter(Boolean),
    };
  } catch (_e) {
    return jsonHit;
  }
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
  lookupHistoricalCrowdAsync,
  attachHistoricalCrowd,
  attachHistoricalCrowdBatch,
};
