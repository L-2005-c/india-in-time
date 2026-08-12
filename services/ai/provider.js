// services/ai/provider.js — Multi-provider AI abstraction
//
// Today the only fully wired provider is Gemini (services/gemini.js).
// This module defines a stable interface so a second provider (OpenAI,
// Anthropic, etc.) can be plugged in without touching route handlers.
//
// Selection order:
//   1. Explicit opts.provider
//   2. AI_PROVIDER env (default: gemini)
//   3. Automatic failover to AI_FALLBACK_PROVIDER when primary throws a
//      retryable error (optional; only if that provider is configured)

const config = require('../../config');
const logger = require('../../lib/logger');

const providers = Object.create(null);

function registerProvider(name, impl) {
  if (!name || typeof impl?.callText !== 'function') {
    throw new Error('Provider must expose callText(prompt, opts)');
  }
  providers[name] = impl;
}

function getProvider(name) {
  const key = (name || process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const impl = providers[key];
  if (!impl) {
    throw new Error(`AI provider "${key}" is not registered. Available: ${Object.keys(providers).join(', ') || '(none)'}`);
  }
  return { name: key, impl };
}

function isRetryable(err) {
  const msg = String(err?.message || err || '');
  const code = err?.status || err?.statusCode;
  return code === 429 || code >= 500 || /timeout|ECONNRESET|ENOTFOUND|circuit/i.test(msg);
}

/**
 * callText — primary entry for text generation across providers.
 */
async function callText(prompt, opts = {}) {
  const primaryName = opts.provider || process.env.AI_PROVIDER || 'gemini';
  const { name, impl } = getProvider(primaryName);
  try {
    return await impl.callText(prompt, opts);
  } catch (err) {
    const fallbackName = opts.fallbackProvider || process.env.AI_FALLBACK_PROVIDER || '';
    if (fallbackName && fallbackName !== name && isRetryable(err) && providers[fallbackName]) {
      logger.warn({ module: 'ai-provider', from: name, to: fallbackName, err: err.message }, 'Primary AI provider failed — trying fallback');
      return providers[fallbackName].callText(prompt, { ...opts, provider: fallbackName });
    }
    throw err;
  }
}

/**
 * callVision — image+text; providers without vision throw a clear error.
 */
async function callVision(imageBase64, imageType, textPrompt, opts = {}) {
  const primaryName = opts.provider || process.env.AI_PROVIDER || 'gemini';
  const { name, impl } = getProvider(primaryName);
  if (typeof impl.callVision !== 'function') {
    throw new Error(`Provider "${name}" does not support vision`);
  }
  try {
    return await impl.callVision(imageBase64, imageType, textPrompt, opts);
  } catch (err) {
    const fallbackName = opts.fallbackProvider || process.env.AI_FALLBACK_PROVIDER || '';
    if (fallbackName && fallbackName !== name && isRetryable(err) && providers[fallbackName]?.callVision) {
      logger.warn({ module: 'ai-provider', from: name, to: fallbackName }, 'Vision primary failed — trying fallback');
      return providers[fallbackName].callVision(imageBase64, imageType, textPrompt, opts);
    }
    throw err;
  }
}

function listProviders() {
  return Object.keys(providers).map((name) => ({
    name,
    vision: typeof providers[name].callVision === 'function',
    primary: name === (process.env.AI_PROVIDER || 'gemini'),
  }));
}

// Register Gemini adapter (lazy require to avoid circular init issues)
function registerGemini() {
  const gemini = require('../gemini');
  registerProvider('gemini', {
    callText: (prompt, opts) => gemini.callGeminiText(prompt, opts),
    callVision: (imageBase64, imageType, textPrompt, opts) =>
      gemini.callGeminiVision(imageBase64, imageType, textPrompt, opts),
    getStats: () => gemini.getStats(),
  });
}

try {
  registerGemini();
} catch (e) {
  logger.warn({ err: e.message }, 'Gemini provider registration deferred');
}

// Optional OpenAI adapter — only active when OPENAI_API_KEY is set
function registerOpenAIIfConfigured() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return;
  registerProvider('openai', {
    async callText(prompt, opts = {}) {
      const fetch = require('node-fetch');
      const model = opts.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: opts.temperature ?? 0.7,
        }),
        timeout: opts.timeoutMs || 20000,
      });
      if (!res.ok) {
        const err = new Error(`OpenAI HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    },
    async callVision(imageBase64, imageType, textPrompt, opts = {}) {
      const fetch = require('node-fetch');
      const model = opts.model || process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: textPrompt },
              { type: 'image_url', image_url: { url: `data:${imageType || 'image/jpeg'};base64,${imageBase64}` } },
            ],
          }],
        }),
        timeout: opts.timeoutMs || 30000,
      });
      if (!res.ok) {
        const err = new Error(`OpenAI vision HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    },
  });
  logger.info({ module: 'ai-provider' }, 'OpenAI provider registered');
}

try {
  registerOpenAIIfConfigured();
} catch (e) {
  logger.warn({ err: e.message }, 'OpenAI provider registration skipped');
}

module.exports = {
  registerProvider,
  getProvider,
  callText,
  callVision,
  listProviders,
};
