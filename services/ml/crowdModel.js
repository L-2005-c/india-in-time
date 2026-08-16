/**
 * Enterprise crowd model — online logistic regression with feature hashing.
 *
 * Features (fixed order):
 *  0 daypart_onehot[5]
 *  5 is_weekend
 *  6 is_peak
 *  7 month_sin, month_cos
 *  9 place_type_hash (bucketed)
 * 10 historical_score_norm
 * 11 bias
 *
 * Trained from place_feedback (rating + accurate) mapped to crowd intensity labels.
 * Persists weights to DB table ml_model_weights when available; otherwise memory.
 */
const { getDb } = require('../../db/init');

const FEATURE_DIM = 12;
const MODEL_VERSION = 2;
const LR = 0.05;
const L2 = 0.001;

let weights = new Float64Array(FEATURE_DIM);
let trainedN = 0;
let loaded = false;

// Init small random weights for symmetry breaking
for (let i = 0; i < FEATURE_DIM; i++) weights[i] = (Math.random() - 0.5) * 0.01;
weights[FEATURE_DIM - 1] = 0; // bias

const DAYPARTS = ['earlyMorning', 'morning', 'afternoon', 'evening', 'night'];

function sigmoid(z) {
  if (z < -20) return 0;
  if (z > 20) return 1;
  return 1 / (1 + Math.exp(-z));
}

function hashBucket(str, buckets = 8) {
  const s = String(str || 'default').toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % buckets) / (buckets - 1 || 1);
}

function buildFeatures({ daypart, isWeekend, isPeakHourNow, month, cat, historicalScore }) {
  const x = new Float64Array(FEATURE_DIM);
  const di = Math.max(0, DAYPARTS.indexOf(daypart));
  if (di >= 0 && di < 5) x[di] = 1;
  x[5] = isWeekend ? 1 : 0;
  x[6] = isPeakHourNow ? 1 : 0;
  const m = Number(month) || 1;
  x[7] = Math.sin((2 * Math.PI * m) / 12);
  x[8] = Math.cos((2 * Math.PI * m) / 12);
  x[9] = hashBucket(cat);
  x[10] = historicalScore != null ? Math.min(1, Math.max(0, historicalScore / 100)) : 0;
  x[11] = 1; // bias
  return x;
}

function predictProba(features) {
  let z = 0;
  for (let i = 0; i < FEATURE_DIM; i++) z += weights[i] * features[i];
  return sigmoid(z);
}

/** Map proba → crowd level + score 0–100 */
function predictCrowd(ctx) {
  const x = buildFeatures(ctx);
  const p = predictProba(x);
  const score = Math.round(p * 100);
  let level = 'Moderate';
  if (score < 25) level = 'Very Low';
  else if (score < 40) level = 'Low';
  else if (score < 60) level = 'Moderate';
  else if (score < 80) level = 'High';
  else level = 'Very High';
  return {
    level,
    score,
    probability: Math.round(p * 1000) / 1000,
    source: 'ml-logistic',
    modelVersion: MODEL_VERSION,
    featureAvailability: { historicalScore: ctx.historicalScore != null, category: !!ctx.cat && ctx.cat !== 'unknown', temporal: !!ctx.daypart && ctx.month != null },
    trainedN,
  };
}

/**
 * Online SGD update. label in {0,1} where 1 = high-crowd / poor experience.
 */
function updateOnline(ctx, label) {
  const x = buildFeatures(ctx);
  const p = predictProba(x);
  const y = label ? 1 : 0;
  const err = p - y;
  for (let i = 0; i < FEATURE_DIM; i++) {
    weights[i] -= LR * (err * x[i] + L2 * weights[i]);
  }
  trainedN += 1;
  return { trainedN, loss: Math.abs(err) };
}

/** rating 1–5 + accurate boolean → high-crowd label */
function feedbackToLabel(rating, accurate) {
  if (rating <= 2) return 1;
  if (rating >= 4 && accurate === true) return 0;
  if (accurate === false) return 1;
  return rating <= 3 ? 1 : 0;
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const pool = getDb();
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT weights_json, trained_n FROM ml_model_weights WHERE model_key = 'crowd_v2' LIMIT 1`
    );
    if (rows[0]?.weights_json) {
      const arr = JSON.parse(rows[0].weights_json);
      if (Array.isArray(arr) && arr.length === FEATURE_DIM) {
        weights = Float64Array.from(arr);
        trainedN = rows[0].trained_n || 0;
      }
    }
  } catch (_e) {
    /* table may not exist yet */
  }
}

async function persist() {
  try {
    const pool = getDb();
    if (!pool) return;
    await pool.query(
      `INSERT INTO ml_model_weights (model_key, weights_json, trained_n, updated_at)
       VALUES ('crowd_v2', $1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (model_key) DO UPDATE SET
         weights_json = EXCLUDED.weights_json,
         trained_n = EXCLUDED.trained_n,
         updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(Array.from(weights)), trainedN]
    );
  } catch (_e) {
    /* fail open */
  }
}

/**
 * Batch train from recent place_feedback rows.
 */
async function trainFromFeedback(limit = 500) {
  await ensureLoaded();
  try {
    const pool = getDb();
    if (!pool) return { updated: 0 };
    const { rows } = await pool.query(
      `SELECT rating, accurate, place_name, city, created_at
       FROM (
         SELECT rating, accurate, place_name, city, created_at,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
         FROM place_feedback
         WHERE user_id IS NOT NULL
       ) recent
       WHERE rn <= 20
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    let updated = 0;
    for (const row of rows) {
      const label = feedbackToLabel(row.rating, row.accurate);
      // Weak context when historical features unknown
      const created = new Date(row.created_at);
      const hour = created.getHours();
      const daypart = hour < 9 ? 'earlyMorning' : hour < 12 ? 'morning' : hour < 16 ? 'afternoon' : hour < 19 ? 'evening' : 'night';
      updateOnline(
        {
          daypart,
          isWeekend: created.getDay() === 0 || created.getDay() === 6,
          isPeakHourNow: false,
          month: created.getMonth() + 1,
          cat: 'unknown',
          historicalScore: null,
        },
        label
      );
      updated++;
    }
    if (updated) await persist();
    return { updated, trainedN };
  } catch (e) {
    return { updated: 0, error: e.message };
  }
}

async function learnFromSingleFeedback({ rating, accurate, daypart, isWeekend, cat, month }) {
  await ensureLoaded();
  const label = feedbackToLabel(rating, accurate);
  const result = updateOnline(
    {
      daypart: daypart || 'afternoon',
      isWeekend: !!isWeekend,
      isPeakHourNow: false,
      month: month || new Date().getMonth() + 1,
      cat: cat || 'default',
      historicalScore: null,
    },
    label
  );
  // Persist every 10 updates
  if (trainedN % 10 === 0) await persist();
  return result;
}

function getModelInfo() {
  return {
    model: 'crowd_v2',
    modelVersion: MODEL_VERSION,
    type: 'online_logistic_regression',
    featureDim: FEATURE_DIM,
    trainedN,
    weights: Array.from(weights),
  };
}

module.exports = {
  predictCrowd,
  updateOnline,
  feedbackToLabel,
  trainFromFeedback,
  learnFromSingleFeedback,
  getModelInfo,
  ensureLoaded,
  persist,
  buildFeatures,
};
