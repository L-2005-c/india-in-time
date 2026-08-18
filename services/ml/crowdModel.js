'use strict';
const { getDb } = require('../../db/init');
const FEATURE_DIM = 18;
const MODEL_VERSION = 3;
const MODEL_KEY = 'crowd_v3';
const BASE_LR = 0.04;
const L2 = 0.002;
const TEMPERATURE = 1.15;
let weights = new Float64Array(FEATURE_DIM);
let trainedN = 0;
let loaded = false;
let lastTrainAt = null;
for (let i = 0; i < FEATURE_DIM; i++) weights[i] = (Math.random() - 0.5) * 0.01;
weights[FEATURE_DIM - 1] = 0;
const DAYPARTS = ['earlyMorning', 'morning', 'afternoon', 'evening', 'night'];
function sigmoid(z) { if (z < -20) return 0; if (z > 20) return 1; return 1 / (1 + Math.exp(-z)); }
function hashBucket(str, buckets = 16) {
  const s = String(str || 'default').toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % buckets) / (buckets - 1 || 1);
}
function hourCyclic(hour) {
  const h = Number.isFinite(hour) ? hour : 12;
  const ang = (2 * Math.PI * h) / 24;
  return [Math.sin(ang), Math.cos(ang)];
}
function buildFeatures(ctx) {
  const x = new Float64Array(FEATURE_DIM);
  const di = DAYPARTS.indexOf(ctx.daypart);
  if (di >= 0 && di < 5) x[di] = 1;
  x[5] = ctx.isWeekend ? 1 : 0;
  x[6] = ctx.isPeakHourNow ? 1 : 0;
  const m = Number(ctx.month) || 1;
  x[7] = Math.sin((2 * Math.PI * m) / 12);
  x[8] = Math.cos((2 * Math.PI * m) / 12);
  x[9] = hashBucket(ctx.cat);
  x[10] = ctx.historicalScore != null ? Math.min(1, Math.max(0, Number(ctx.historicalScore) / 100)) : 0.5;
  const [hs, hc] = hourCyclic(ctx.hour);
  x[11] = hs; x[12] = hc;
  x[13] = ctx.isFestival ? 1 : 0;
  x[14] = Math.min(1, Math.max(0, Number(ctx.weatherPenalty) || 0));
  x[15] = ctx.learnedPrior != null ? Math.min(1, Math.max(0, Number(ctx.learnedPrior) / 100)) : 0.5;
  x[16] = Math.min(1, Math.log1p(Number(ctx.sampleSize) || 0) / Math.log1p(50));
  x[17] = 1;
  return x;
}
function predictProba(features) {
  let z = 0;
  for (let i = 0; i < FEATURE_DIM; i++) z += weights[i] * features[i];
  return sigmoid(z / TEMPERATURE);
}
function levelFromScore(score) {
  if (score < 20) return 'Very Low';
  if (score < 35) return 'Low';
  if (score < 55) return 'Moderate';
  if (score < 75) return 'High';
  return 'Very High';
}
function estimateUncertainty(p, sampleSize) {
  const edge = 1 - 2 * Math.abs(p - 0.5);
  const data = 1 / (1 + Math.log1p(sampleSize || trainedN));
  return Math.round(Math.min(1, 0.6 * edge + 0.4 * data) * 1000) / 1000;
}
function predictCrowd(ctx = {}) {
  const x = buildFeatures(ctx);
  const p = predictProba(x);
  const score = Math.round(p * 100);
  const uncertainty = estimateUncertainty(p, ctx.sampleSize);
  return {
    level: levelFromScore(score), score,
    probability: Math.round(p * 1000) / 1000,
    uncertainty, confidence: Math.round((1 - uncertainty) * 100),
    source: trainedN >= 20 ? 'ml-logistic-v3' : 'ml-logistic-v3-cold',
    modelVersion: MODEL_VERSION, trainedN,
    featureAvailability: {
      daypart: !!ctx.daypart, historical: ctx.historicalScore != null,
      weather: ctx.weatherPenalty != null, festival: ctx.isFestival != null,
      learnedPrior: ctx.learnedPrior != null,
    },
  };
}
function feedbackToLabel(rating, accurate) {
  let y = 0.5;
  if (rating != null) y = Math.min(1, Math.max(0, (5 - Number(rating)) / 4));
  if (accurate === false) y = Math.min(1, y + 0.15);
  if (accurate === true) y = Math.max(0, y - 0.05);
  return y;
}
function updateOnline(ctx, label) {
  const x = buildFeatures(ctx);
  const p = predictProba(x);
  const y = Math.min(1, Math.max(0, label));
  const lr = BASE_LR / (1 + trainedN / 2000);
  const err = p - y;
  for (let i = 0; i < FEATURE_DIM; i++) weights[i] -= lr * (err * x[i] + L2 * weights[i]);
  trainedN += 1;
  lastTrainAt = new Date().toISOString();
  return { p, y, trainedN };
}
async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const pool = getDb();
    if (!pool) return;
    const { rows } = await pool.query(`SELECT weights_json, trained_n FROM ml_model_weights WHERE model_key = $1 LIMIT 1`, [MODEL_KEY]);
    if (rows[0]?.weights_json) {
      const arr = JSON.parse(rows[0].weights_json);
      if (Array.isArray(arr) && arr.length === FEATURE_DIM) {
        weights = Float64Array.from(arr);
        trainedN = rows[0].trained_n || 0;
      }
    }
  } catch (_e) {}
}
async function persist() {
  try {
    const pool = getDb();
    if (!pool) return;
    await pool.query(
      `INSERT INTO ml_model_weights (model_key, weights_json, trained_n, updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
       ON CONFLICT (model_key) DO UPDATE SET weights_json=EXCLUDED.weights_json, trained_n=EXCLUDED.trained_n, updated_at=CURRENT_TIMESTAMP`,
      [MODEL_KEY, JSON.stringify(Array.from(weights)), trainedN]
    );
  } catch (_e) {}
}
async function trainFromFeedback(limit = 800) {
  await ensureLoaded();
  try {
    const pool = getDb();
    if (!pool) return { updated: 0, trainedN };
    const { rows } = await pool.query(`SELECT rating, accurate, created_at FROM place_feedback WHERE user_id IS NOT NULL AND rating IS NOT NULL ORDER BY created_at DESC LIMIT $1`, [limit]);
    let updated = 0;
    for (const row of rows) {
      const created = new Date(row.created_at);
      const hour = created.getHours();
      const daypart = hour < 9 ? 'earlyMorning' : hour < 12 ? 'morning' : hour < 16 ? 'afternoon' : hour < 19 ? 'evening' : 'night';
      updateOnline({ daypart, isWeekend: created.getDay()===0||created.getDay()===6, isPeakHourNow:(hour>=10&&hour<14)||(hour>=16&&hour<18), month: created.getMonth()+1, hour, cat:'unknown', sampleSize: trainedN }, feedbackToLabel(row.rating, row.accurate));
      updated++;
    }
    if (updated) await persist();
    return { updated, trainedN, modelVersion: MODEL_VERSION };
  } catch (e) { return { updated: 0, error: e.message, trainedN }; }
}
async function learnFromSingleFeedback(payload = {}) {
  await ensureLoaded();
  const result = updateOnline({
    daypart: payload.daypart || 'afternoon', isWeekend: !!payload.isWeekend, isPeakHourNow: !!payload.isPeakHourNow,
    month: payload.month || new Date().getMonth() + 1, hour: payload.hour != null ? payload.hour : new Date().getHours(),
    cat: payload.cat || 'unknown', historicalScore: payload.historicalScore, weatherPenalty: payload.weatherPenalty || 0,
    isFestival: !!payload.isFestival, learnedPrior: payload.learnedPrior, sampleSize: trainedN,
  }, feedbackToLabel(payload.rating, payload.accurate));
  if (trainedN % 10 === 0) await persist();
  return result;
}
function getModelInfo() {
  return { modelKey: MODEL_KEY, modelVersion: MODEL_VERSION, featureDim: FEATURE_DIM, trainedN, lastTrainAt, temperature: TEMPERATURE };
}
module.exports = { predictCrowd, updateOnline, trainFromFeedback, learnFromSingleFeedback, ensureLoaded, persist, getModelInfo, buildFeatures, feedbackToLabel, MODEL_VERSION, FEATURE_DIM };
