// __tests__/routes.ai.test.js
// routes/ai.js previously had 0% test coverage. This is the core AI-proxy
// surface of the product (23 near-identical prompt-building endpoints all
// routed through one shared handler() wrapper). Testing all 23 individually
// would mostly test string concatenation with little marginal value; instead
// this focuses on:
//   1. The handler() wrapper itself — this is where a prior bug lived
//      (raw err.message, including a potential leaked API key, went straight
//      to the client). That's exactly the kind of regression a test should
//      catch even if nobody reads this file closely again.
//   2. A representative sample of endpoints: a cached text endpoint (/chat),
//      a non-cached one (/budget), and a vision endpoint (/lens) — enough to
//      confirm the request/response wiring is correct for each shape.

jest.mock('../services/gemini', () => ({
  callGeminiText: jest.fn(),
  callGeminiVision: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const aiRouter = require('../routes/ai');
const { callGeminiText, callGeminiVision } = require('../services/gemini');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
});

describe('handler() wrapper — error sanitization', () => {
  test('a generic/internal error is never sent to the client as-is', async () => {
    callGeminiText.mockRejectedValue(new Error('request to https://...?key=SECRET_API_KEY_VALUE failed'));
    const res = await request(app).post('/api/ai/chat').send({ message: 'hi', city: 'Jaipur' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('The AI assistant is temporarily unavailable. Please try again in a moment.');
    expect(JSON.stringify(res.body)).not.toContain('SECRET_API_KEY_VALUE');
  });

  test('the allow-listed circuit-breaker message IS passed through verbatim (it is safe/user-facing by design)', async () => {
    callGeminiText.mockRejectedValue(new Error('Gemini service temporarily unavailable (circuit breaker open). Try again shortly.'));
    const res = await request(app).post('/api/ai/chat').send({ message: 'hi', city: 'Jaipur' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Gemini service temporarily unavailable (circuit breaker open). Try again shortly.');
  });

  test('a client-safe 4xx statusCode on the error is preserved, not forced to 503', async () => {
    const err = new Error('Bad request to Gemini');
    err.statusCode = 400;
    callGeminiText.mockRejectedValue(err);
    const res = await request(app).post('/api/ai/chat').send({ message: 'hi', city: 'Jaipur' });
    expect(res.status).toBe(400);
  });

  test('a 5xx statusCode on the error is also normalized to 503 (not leaked verbatim)', async () => {
    const err = new Error('Gemini API error 502 upstream');
    err.statusCode = 502;
    callGeminiText.mockRejectedValue(err);
    const res = await request(app).post('/api/ai/chat').send({ message: 'hi', city: 'Jaipur' });
    expect(res.status).toBe(503);
  });

  test('a successful call returns { text } from the service response', async () => {
    callGeminiText.mockResolvedValue('Visit the fort at sunrise! 🏰');
    const res = await request(app).post('/api/ai/chat').send({ message: 'hi', city: 'Jaipur' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Visit the fort at sunrise! 🏰');
  });
});

describe('POST /api/ai/chat', () => {
  test('builds the prompt with city/message/plan and requests caching', async () => {
    callGeminiText.mockResolvedValue('ok');
    await request(app).post('/api/ai/chat').send({
      message: 'What should I see?', city: 'Jaipur', plan: ['Hawa Mahal', 'City Palace'], tripMode: 'family',
    });

    const [prompt, opts] = callGeminiText.mock.calls[0];
    expect(prompt).toContain('Jaipur');
    expect(prompt).toContain('What should I see?');
    expect(prompt).toContain('Hawa Mahal, City Palace');
    expect(prompt).toContain('FAMILY'); // trip mode guidance line
    expect(opts).toEqual({ cache: true });
  });

  test('handles a missing plan array without throwing', async () => {
    callGeminiText.mockResolvedValue('ok');
    const res = await request(app).post('/api/ai/chat').send({ message: 'hi', city: 'Goa' });
    expect(res.status).toBe(200);
    expect(callGeminiText.mock.calls[0][0]).toContain('none');
  });

  test('an unknown tripMode is silently ignored (no guidance line, no crash)', async () => {
    callGeminiText.mockResolvedValue('ok');
    await request(app).post('/api/ai/chat').send({ message: 'hi', city: 'Goa', tripMode: 'not-a-real-mode' });
    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).not.toContain('undefined');
  });
});

describe('POST /api/ai/budget — a non-cached endpoint', () => {
  test('does not request caching (budget figures are per-request, not reusable)', async () => {
    callGeminiText.mockResolvedValue('ok');
    await request(app).post('/api/ai/budget').send({
      city: 'Jaipur', limit: 5000, spent: 1200, expenses: [{ n: 'Lunch', c: 300 }],
    });
    const [prompt, opts] = callGeminiText.mock.calls[0];
    expect(prompt).toContain('₹5000');
    expect(prompt).toContain('Lunch(₹300)');
    expect(opts).toBeUndefined();
  });
});

describe('POST /api/ai/lens — vision endpoint', () => {
  test('passes the image data/type straight through to callGeminiVision', async () => {
    callGeminiVision.mockResolvedValue('That is the Hawa Mahal.');
    const res = await request(app).post('/api/ai/lens').send({
      imageBase64: 'base64data', imageType: 'image/jpeg', city: 'Jaipur',
    });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('That is the Hawa Mahal.');
    const [imageBase64, imageType, prompt] = callGeminiVision.mock.calls[0];
    expect(imageBase64).toBe('base64data');
    expect(imageType).toBe('image/jpeg');
    expect(prompt).toContain('Jaipur');
  });
});

describe('POST /api/ai/hartaalAlert — cache TTL override', () => {
  test('requests a 1-hour cache TTL, not the default', async () => {
    callGeminiText.mockResolvedValue('ok');
    await request(app).post('/api/ai/hartaalAlert').send({ city: 'Jaipur' });
    const [, opts] = callGeminiText.mock.calls[0];
    expect(opts).toEqual({ cache: true, cacheTtlMs: 60 * 60 * 1000 });
  });
});
