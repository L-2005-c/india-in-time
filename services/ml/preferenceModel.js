/**
 * Preference model — exponential moving average of category affinities
 * from saved trips + place feedback. Used to re-rank itinerary suggestions.
 */
const { getDb } = require('../../db/init');

const ALPHA = 0.15; // EMA learning rate
let affinities = Object.create(null); // cat -> score 0..1
let nUpdates = 0;

function getAffinity(cat) {
  const k = String(cat || 'default').toLowerCase();
  return affinities[k] != null ? affinities[k] : 0.5;
}

function observeCategory(cat, positive = true) {
  const k = String(cat || 'default').toLowerCase();
  const prev = getAffinity(k);
  const target = positive ? 1 : 0;
  affinities[k] = prev * (1 - ALPHA) + target * ALPHA;
  nUpdates += 1;
  return affinities[k];
}

function scorePlaceForUser(place) {
  const cat = place.cat || place.category || 'default';
  return getAffinity(cat);
}

function rerankPlaces(places) {
  return [...(places || [])]
    .map((p) => ({ place: p, preferenceScore: scorePlaceForUser(p) }))
    .sort((a, b) => b.preferenceScore - a.preferenceScore);
}

async function loadFromDb() {
  try {
    const pool = getDb();
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT weights_json, trained_n FROM ml_model_weights WHERE model_key = 'pref_v1' LIMIT 1`
    );
    if (rows[0]?.weights_json) {
      affinities = JSON.parse(rows[0].weights_json) || Object.create(null);
      nUpdates = rows[0].trained_n || 0;
    }
  } catch (_e) { /* optional */ }
}

async function persist() {
  try {
    const pool = getDb();
    if (!pool) return;
    await pool.query(
      `INSERT INTO ml_model_weights (model_key, weights_json, trained_n, updated_at)
       VALUES ('pref_v1', $1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (model_key) DO UPDATE SET
         weights_json = EXCLUDED.weights_json,
         trained_n = EXCLUDED.trained_n,
         updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(affinities), nUpdates]
    );
  } catch (_e) { /* fail open */ }
}

async function trainFromTripsAndFeedback() {
  await loadFromDb();
  try {
    const pool = getDb();
    if (!pool) return { updated: 0 };
    // Feedback: high rating → positive affinity for place category if present in notes pattern
    const { rows: fb } = await pool.query(
      `SELECT rating, place_name FROM place_feedback ORDER BY created_at DESC LIMIT 300`
    );
    for (const row of fb) {
      // Without category column, use heuristic tags from name
      const name = String(row.place_name || '').toLowerCase();
      let cat = 'default';
      if (/temple|mandir|church|mosque/.test(name)) cat = 'temple';
      else if (/beach|coast/.test(name)) cat = 'beach';
      else if (/fort|palace|museum|monument/.test(name)) cat = 'monument';
      else if (/market|bazaar|mall/.test(name)) cat = 'market';
      else if (/cafe|restaurant|food|dhaba/.test(name)) cat = 'food';
      observeCategory(cat, row.rating >= 4);
    }
    await persist();
    return { updated: fb.length, affinities: { ...affinities }, nUpdates };
  } catch (e) {
    return { updated: 0, error: e.message };
  }
}

function getInfo() {
  return { model: 'pref_v1', type: 'ema_category_affinity', nUpdates, affinities: { ...affinities } };
}

module.exports = {
  getAffinity,
  observeCategory,
  scorePlaceForUser,
  rerankPlaces,
  trainFromTripsAndFeedback,
  loadFromDb,
  persist,
  getInfo,
};
