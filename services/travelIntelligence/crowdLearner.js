// crowdLearner.js — Learn simple crowd adjustments from place_feedback
// Not a full ML model: Bayesian-ish smoothing of user ratings/accuracy
// into a per-place crowd prior that engines can blend.

const { getDb } = require('../../db/init');

const cache = new Map(); // key -> { score, n, updatedAt }
const TTL_MS = 15 * 60 * 1000;

function cacheKey(placeName, city) {
  return `${String(placeName || '').toLowerCase()}|${String(city || '').toLowerCase()}`;
}

/**
 * Derive a crowd score 0–100 from feedback:
 * - Low ratings + "not accurate" → treat as busier/worse experience → higher crowd penalty
 * - High ratings + accurate → lower effective crowd pressure
 */
async function getLearnedCrowdPrior(placeName, city) {
  const key = cacheKey(placeName, city);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.updatedAt < TTL_MS) return hit;

  try {
    const pool = getDb();
    if (!pool) return null;
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n,
              AVG(rating)::float AS avg_rating,
              AVG(CASE WHEN accurate = true THEN 1.0 WHEN accurate = false THEN 0.0 ELSE NULL END)::float AS accuracy_rate
       FROM place_feedback
       WHERE lower(place_name) = lower($1) AND lower(city) = lower($2)`,
      [placeName, city]
    );
    const row = rows[0];
    if (!row || row.n < 3) {
      const empty = { score: null, n: row?.n || 0, updatedAt: Date.now() };
      cache.set(key, empty);
      return empty;
    }
    // Map avg rating 1–5 → crowd prior 80–20 (low rating ⇒ higher perceived crowd/friction)
    const rating = row.avg_rating || 3;
    let score = Math.round(100 - (rating - 1) * 20);
    if (row.accuracy_rate != null && row.accuracy_rate < 0.4) {
      score = Math.min(100, score + 10); // system predictions felt wrong → more caution
    }
    const result = { score, n: row.n, avgRating: rating, accuracyRate: row.accuracy_rate, updatedAt: Date.now(), source: 'feedback-learner' };
    cache.set(key, result);
    return result;
  } catch (_e) {
    return null;
  }
}

/**
 * Blend learned prior into an existing crowd estimate object.
 */
function blendLearnedCrowd(crowd, learned, weight = 0.25) {
  if (!crowd || !learned || learned.score == null || learned.n < 3) return crowd;
  const base = typeof crowd.score === 'number' ? crowd.score : 50;
  const blended = Math.round(base * (1 - weight) + learned.score * weight);
  return {
    ...crowd,
    score: blended,
    learned: { score: learned.score, n: learned.n, source: learned.source },
    source: crowd.source ? `${crowd.source}+learned` : 'learned',
  };
}

function clearLearnerCache() {
  cache.clear();
}

/** Prefer true ML logistic model when trained; fall back to rating prior. */
async function getMlOrPriorCrowd(placeName, city, ctx = {}) {
  try {
    const crowdModel = require('../ml/crowdModel');
    await crowdModel.ensureLoaded();
    const info = crowdModel.getModelInfo();
    if (info.trainedN >= 10) {
      const pred = crowdModel.predictCrowd({
        daypart: ctx.daypart || 'afternoon',
        isWeekend: !!ctx.isWeekend,
        isPeakHourNow: !!ctx.isPeakHourNow,
        month: ctx.month || new Date().getMonth() + 1,
        cat: ctx.cat || 'default',
        historicalScore: ctx.historicalScore,
      });
      return pred;
    }
  } catch (_e) { /* optional */ }
  return getLearnedCrowdPrior(placeName, city);
}


module.exports = {
  getLearnedCrowdPrior,
  blendLearnedCrowd,
  clearLearnerCache,
  getMlOrPriorCrowd,
};
