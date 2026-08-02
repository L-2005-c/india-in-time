// __tests__/services.gemini.test.js
// services/gemini.js previously had 0% test coverage. This is the module
// that talks to the paid, external Gemini API, holds the circuit breaker,
// and is directly responsible for the "don't leak the API key in error
// messages" fix documented inline in _callGeminiOnce — all of which are
// exactly the kind of logic that should not go untested.

process.env.GEMINI_API_KEY = 'test-key-should-never-leak';

jest.mock('node-fetch');
jest.mock('../db/queries', () => ({
  getCachedAiResponse: jest.fn().mockResolvedValue(null),
  setCachedAiResponse: jest.fn().mockResolvedValue(undefined),
}));

function freshGeminiModule() {
  // The circuit breaker / stats are module-level singletons — reload the
  // module between tests so state from one test can't leak into the next.
  jest.resetModules();
  jest.mock('node-fetch');
  jest.mock('../db/queries', () => ({
    getCachedAiResponse: jest.fn().mockResolvedValue(null),
    setCachedAiResponse: jest.fn().mockResolvedValue(undefined),
  }));
  return require('../services/gemini');
}

function okResponse(text) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('services/gemini — happy path', () => {
  test('callGeminiText returns the model text on success', async () => {
    const gemini = freshGeminiModule();
    require('node-fetch').mockResolvedValue(okResponse('Visit the fort at sunrise.'));

    const result = await gemini.callGeminiText('What should I see in Jaipur?');
    expect(result).toBe('Visit the fort at sunrise.');
  });

  test('a successful call records success in getStats()', async () => {
    const gemini = freshGeminiModule();
    require('node-fetch').mockResolvedValue(okResponse('ok'));

    await gemini.callGeminiText('hi');
    const stats = gemini.getStats();
    expect(stats.total).toBe(1);
    expect(stats.success).toBe(1);
    expect(stats.circuitState).toBe('CLOSED');
  });

  test('callGeminiVision sends inline_data + text parts', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    mockFetch.mockResolvedValue(okResponse('That looks like a samosa.'));

    await gemini.callGeminiVision('base64imagedata', 'image/jpeg', 'What food is this?');

    const [, requestOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(requestOpts.body);
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('image/jpeg');
    expect(body.contents[0].parts[0].inline_data.data).toBe('base64imagedata');
    expect(body.contents[0].parts[1].text).toBe('What food is this?');
  });
});

describe('services/gemini — caching', () => {
  test('identical prompts hit the in-memory cache on the second call (fetch called once)', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    mockFetch.mockResolvedValue(okResponse('cached answer'));

    const first = await gemini.callGeminiText('same prompt');
    const second = await gemini.callGeminiText('same prompt');

    expect(first).toBe('cached answer');
    expect(second).toBe('cached answer');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('a DB-cached response is served without calling fetch, and hydrates the in-memory cache', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    require('../db/queries').getCachedAiResponse.mockResolvedValueOnce('from the db cache');

    const result = await gemini.callGeminiText('some prompt');
    expect(result).toBe('from the db cache');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('a successful fresh call writes through to the DB cache', async () => {
    const gemini = freshGeminiModule();
    require('node-fetch').mockResolvedValue(okResponse('fresh answer'));

    await gemini.callGeminiText('a brand new prompt');
    expect(require('../db/queries').setCachedAiResponse).toHaveBeenCalledWith(
      expect.any(String), 'fresh answer'
    );
  });
});

describe('services/gemini — error handling', () => {
  test('a network failure does not leak the API key into the thrown error message', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    mockFetch.mockRejectedValue(
      new Error(`request to https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=${process.env.GEMINI_API_KEY} failed, reason: getaddrinfo ENOTFOUND`)
    );

    await expect(gemini.callGeminiText('hello')).rejects.toThrow();
    try {
      await gemini.callGeminiText('hello again');
    } catch (err) {
      expect(err.message).not.toContain(process.env.GEMINI_API_KEY);
      expect(err.message).toContain('REDACTED');
    }
  }, 15000);

  test('a non-retryable 4xx error is not retried and fetch is called exactly once', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad request' });

    await expect(gemini.callGeminiText('bad prompt')).rejects.toThrow(/Gemini API error 400/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('services/gemini — fallback model', () => {
  test('after the primary model exhausts all retries on a retryable error, the fallback model is tried and can still succeed', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    // Primary model: always 503 (retryable) -> exhausts maxRetries (3).
    // Fallback model: succeeds. Distinguish by inspecting the URL.
    mockFetch.mockImplementation(async (url) => {
      if (url.includes(require('../config').gemini.fallbackModel)) {
        return okResponse('answer from fallback model');
      }
      return { ok: false, status: 503, text: async () => 'overloaded' };
    });

    const result = await gemini.callGeminiText('a prompt only the fallback model can answer');
    expect(result).toBe('answer from fallback model');
    expect(gemini.getStats().fallbackModelUsed).toBe(1);
  });

  test('a successful fallback-model response is still cached, same as a normal success', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    const config = require('../config');
    mockFetch.mockImplementation(async (url) => {
      if (url.includes(config.gemini.fallbackModel)) return okResponse('fallback answer');
      return { ok: false, status: 503, text: async () => 'overloaded' };
    });

    await gemini.callGeminiText('cache me via fallback');
    expect(require('../db/queries').setCachedAiResponse).toHaveBeenCalledWith(expect.any(String), 'fallback answer');

    // Second identical call should now hit the in-memory cache, not fetch again
    const callsBeforeSecond = mockFetch.mock.calls.length;
    await gemini.callGeminiText('cache me via fallback');
    expect(mockFetch.mock.calls.length).toBe(callsBeforeSecond);
  });

  test('if BOTH the primary and fallback models fail, the error from the fallback attempt is what surfaces', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    const config = require('../config');
    mockFetch.mockImplementation(async (url) => {
      if (url.includes(config.gemini.fallbackModel)) {
        return { ok: false, status: 500, text: async () => 'fallback model also down' };
      }
      return { ok: false, status: 503, text: async () => 'primary model overloaded' };
    });

    await expect(gemini.callGeminiText('nothing can answer this')).rejects.toThrow(/fallback model also down/);
  });

  test('a non-retryable (4xx) primary failure never attempts the fallback model at all', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });

    await expect(gemini.callGeminiText('malformed request')).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1); // only the primary attempt — no retries, no fallback
  });
});

describe('services/gemini — circuit breaker', () => {
  test('trips OPEN after failureThreshold (5) consecutive failures, then fails fast without calling fetch', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    // 5xx is retryable, but a distinct prompt per call means each is a fresh,
    // uncached, single-attempt-worth-of-failure against maxRetries=3 —
    // instead, force a non-retryable failure per call so each call maps to
    // exactly one consecutive-failure count, and use fake timers so retry
    // backoff (if any) doesn't slow the test down.
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' });

    for (let i = 0; i < 5; i++) {
      await expect(gemini.callGeminiText(`prompt ${i}`)).rejects.toThrow();
    }

    expect(gemini.getStats().circuitState).toBe('OPEN');

    // Circuit is now open — further calls must fail immediately without
    // hitting the network at all.
    const callsBeforeTrippedAttempt = mockFetch.mock.calls.length;
    await expect(gemini.callGeminiText('one more')).rejects.toThrow(/circuit breaker open/i);
    expect(mockFetch).toHaveBeenCalledTimes(callsBeforeTrippedAttempt); // no new fetch call
  });

  test('resetCircuit() manually closes an open circuit', async () => {
    const gemini = freshGeminiModule();
    const mockFetch = require('node-fetch');
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' });

    for (let i = 0; i < 5; i++) {
      await expect(gemini.callGeminiText(`prompt ${i}`)).rejects.toThrow();
    }
    expect(gemini.getStats().circuitState).toBe('OPEN');

    gemini.resetCircuit();
    expect(gemini.getStats().circuitState).toBe('CLOSED');
  });
});
