// services/gemini.js — Unified Gemini AI Service
// Single source of truth for all Gemini API calls.
// Features: retry with backoff, circuit breaker, concurrency queue, response caching.

const fetch  = require('node-fetch');
const config = require('../config');
const { geminiCache } = require('./cache');
const crypto = require('crypto');
const { getCachedAiResponse, setCachedAiResponse } = require('../db/queries');

// ── State ────────────────────────────────────────────────────────────────────

let circuitState = 'CLOSED';       // CLOSED | OPEN | HALF_OPEN
let consecutiveFailures = 0;
let circuitOpenedAt = 0;
let activeRequests = 0;
const requestQueue = [];           // queued promises when at max concurrency
const stats = { total: 0, success: 0, failure: 0, cached: 0, retries: 0, circuitTrips: 0 };

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashPrompt(parts) {
  const serialised = JSON.stringify(parts);
  return crypto.createHash('md5').update(serialised).digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Circuit Breaker ─────────────────────────────────────────────────────────

function checkCircuit() {
  if (circuitState === 'CLOSED') return true;

  const elapsed = Date.now() - circuitOpenedAt;
  if (elapsed >= config.gemini.circuitBreaker.resetTimeMs) {
    circuitState = 'HALF_OPEN';
    console.log('[gemini] Circuit breaker → HALF_OPEN (trying one request)');
    return true;
  }

  return false; // still OPEN
}

function recordSuccess() {
  consecutiveFailures = 0;
  if (circuitState === 'HALF_OPEN') {
    circuitState = 'CLOSED';
    console.log('[gemini] Circuit breaker → CLOSED (recovered)');
  }
}

function recordFailure() {
  consecutiveFailures++;
  if (circuitState === 'HALF_OPEN') {
    // Failed during half-open test → reopen
    circuitState = 'OPEN';
    circuitOpenedAt = Date.now();
    console.log('[gemini] Circuit breaker → OPEN (half-open test failed)');
    return;
  }
  if (consecutiveFailures >= config.gemini.circuitBreaker.failureThreshold) {
    circuitState = 'OPEN';
    circuitOpenedAt = Date.now();
    stats.circuitTrips++;
    console.log(`[gemini] ⚡ Circuit breaker TRIPPED after ${consecutiveFailures} consecutive failures. Cooling down for ${config.gemini.circuitBreaker.resetTimeMs / 1000}s`);
  }
}

// ── Concurrency Queue ───────────────────────────────────────────────────────

async function acquireSlot() {
  if (activeRequests < config.gemini.maxConcurrent) {
    activeRequests++;
    return;
  }
  // Wait for a slot to open
  await new Promise(resolve => requestQueue.push(resolve));
  activeRequests++;
}

function releaseSlot() {
  activeRequests--;
  if (requestQueue.length > 0) {
    const next = requestQueue.shift();
    next();
  }
}

// ── Core API Call (single attempt) ──────────────────────────────────────────

async function _callGeminiOnce(parts, opts = {}) {
  const timeoutMs = opts.timeoutMs || config.gemini.timeoutMs;
  const genConfig = opts.generationConfig || {};

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`;

  const body = {
    contents: [{ parts }],
    ...(Object.keys(genConfig).length > 0 ? { generationConfig: genConfig } : {}),
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(timeoutMs),
  }).catch(err => {
    // node-fetch v2 embeds the FULL request URL — including our API key
    // querystring — into its error message on any network-level failure
    // (DNS error, connection refused, TLS error, or an AbortSignal timeout):
    //   FetchError: request to https://...?key=AIzaSy... failed, reason: ...
    // That raw message used to propagate straight out through routes/ai.js
    // and back to the browser as JSON, i.e. any Gemini network hiccup could
    // leak the live API key to whoever's request happened to trigger it.
    // Strip the key before this error goes anywhere else.
    const safe = new Error(`Gemini request failed: ${String(err.message || err).replace(/key=[^&\s]+/i, 'key=***REDACTED***')}`);
    safe.retryable = true; // network failures are always worth retrying
    throw safe;
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`Gemini API error ${res.status}: ${errText.slice(0, 200)}`);
    err.statusCode = res.status;
    // Don't retry on 4xx client errors (except 429 rate limit)
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Call Gemini with automatic retry, circuit breaker, concurrency control, and caching.
 *
 * @param {Array} parts    - Gemini content parts (e.g. [{text: "..."}] or [{inline_data: ...}, {text: "..."}])
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]        - Override timeout for this call
 * @param {boolean} [opts.cache]           - Enable response caching (default: false)
 * @param {number} [opts.cacheTtlMs]       - Override cache TTL for this call
 * @param {object} [opts.generationConfig] - Gemini generation config overrides
 * @returns {Promise<string|null>}
 */
async function callGemini(parts, opts = {}) {
  stats.total++;

  // ── Check cache first ──────────────────────────────────────────────────
  const cacheKey = hashPrompt(parts); // Always check DB cache regardless of opts.cache to save quota
  
  // 1. Check in-memory LRU
  const memCached = geminiCache.get(cacheKey);
  if (memCached !== undefined) {
    stats.cached++;
    return memCached;
  }
  
  // 2. Check persistent DB cache
  try {
    const dbCached = await getCachedAiResponse(cacheKey);
    if (dbCached) {
      stats.cached++;
      geminiCache.set(cacheKey, dbCached, opts.cacheTtlMs); // Hydrate mem cache
      return dbCached;
    }
  } catch (err) {
    console.warn('[gemini] DB Cache read error:', err.message);
  }

  // ── Circuit breaker check ──────────────────────────────────────────────
  if (!checkCircuit()) {
    throw new Error('Gemini service temporarily unavailable (circuit breaker open). Try again shortly.');
  }

  // ── Acquire concurrency slot ───────────────────────────────────────────
  await acquireSlot();

  try {
    const maxRetries = config.gemini.maxRetries;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await _callGeminiOnce(parts, opts);

        // Success
        recordSuccess();
        stats.success++;

        // Cache in memory and DB
        if (cacheKey && result) {
          geminiCache.set(cacheKey, result, opts.cacheTtlMs);
          try {
            await setCachedAiResponse(cacheKey, result);
          } catch (err) {
            console.warn('[gemini] DB Cache write error:', err.message);
          }
        }

        return result;
      } catch (err) {
        lastError = err;

        // Don't retry non-retryable errors
        if (err.retryable === false) {
          stats.failure++;
          recordFailure();
          throw err;
        }

        // Retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          stats.retries++;
          console.log(`[gemini] Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    // All retries exhausted
    stats.failure++;
    recordFailure();
    throw lastError || new Error('Gemini call failed after all retries');

  } finally {
    releaseSlot();
  }
}

/**
 * Simple text prompt helper.
 */
async function callGeminiText(prompt, opts = {}) {
  return callGemini([{ text: prompt }], opts);
}

/**
 * Image + text prompt helper (for lens, food safety, AR overlay, etc.)
 */
async function callGeminiVision(imageBase64, imageType, textPrompt, opts = {}) {
  const parts = [
    { inline_data: { mime_type: imageType || 'image/jpeg', data: imageBase64 } },
    { text: textPrompt },
  ];
  return callGemini(parts, { timeoutMs: config.gemini.imageTimeoutMs, ...opts });
}

/**
 * Get service statistics.
 */
function getStats() {
  return {
    ...stats,
    circuitState,
    consecutiveFailures,
    activeRequests,
    queuedRequests: requestQueue.length,
    cacheStats: geminiCache.getStats(),
  };
}

/**
 * Reset circuit breaker manually (for admin use).
 */
function resetCircuit() {
  circuitState = 'CLOSED';
  consecutiveFailures = 0;
  circuitOpenedAt = 0;
  console.log('[gemini] Circuit breaker manually reset → CLOSED');
}

module.exports = {
  callGemini,
  callGeminiText,
  callGeminiVision,
  getStats,
  resetCircuit,
};
