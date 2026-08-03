// __tests__/routes.ai.smoke.test.js
//
// routes.ai.test.js already covers the handler() wrapper thoroughly and a
// representative sample (/chat, /budget, /lens, /hartaalAlert) in depth —
// deliberately, per its own comment, rather than testing all 23 endpoints'
// prompt wording individually (low marginal value, high brittleness).
//
// That left two real gaps this file closes:
//   1. Wiring risk: an endpoint whose route path has a typo, or whose
//      handler throws on basic input, would previously go unnoticed unless
//      someone happened to call it manually. A table-driven smoke test
//      hits every remaining endpoint once and asserts it's actually
//      reachable and returns the expected shape.
//   2. A few endpoints have real aggregation/defaulting logic (summing
//      expenses, mapping remaining-stop visit times, slicing to N stops)
//      that's worth asserting directly, not just "did it 200".

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
  callGeminiText.mockResolvedValue('ok');
  callGeminiVision.mockResolvedValue('ok');
});

// Every remaining text endpoint, with a minimal-but-realistic body.
const TEXT_ENDPOINTS = [
  { path: '/vibe', body: { vibe: 'chill', city: 'Goa', locations: ['Beach', 'Cafe'] } },
  { path: '/prep', body: { city: 'Jaipur', stops: ['Fort'] } },
  { path: '/insta', body: { city: 'Udaipur', stops: ['Lake Palace'] } },
  { path: '/souvenir', body: { city: 'Jaipur' } },
  { path: '/alternative', body: { city: 'Delhi', currentStop: 'Red Fort' } },
  { path: '/triprating', body: { city: 'Goa', stops: ['Beach'], duration: '3 days', expenses: [{ n: 'Food', c: 500 }], stamps: [1, 2] } },
  { path: '/replanner', body: { city: 'Agra', completedStops: ['Taj Mahal'], remainingStops: [{ name: 'Fort', vt: 60 }], minutesLate: 20 } },
  { path: '/foodrecommend', body: { city: 'Chennai', stopName: 'Marina Beach', timeOfDay: 'evening' } },
  { path: '/voicechat', body: { message: 'where to eat', city: 'Mumbai' } },
  { path: '/festival', body: { city: 'Kolkata' } },
  { path: '/hiddenGem', body: { city: 'Pune', prefs: ['nature'] } },
  { path: '/crowdPredict', body: { city: 'Jaipur', stopName: 'Amber Fort' } },
  { path: '/fareNegotiator', body: { city: 'Mumbai', fromPlace: 'Airport', toPlace: 'Colaba', distanceKm: 25 } },
  { path: '/tripTribe', body: { city: 'Goa', userName: 'Alex', interests: ['food'] } },
];

// Every remaining vision endpoint.
const VISION_ENDPOINTS = [
  { path: '/caption', body: { imageBase64: 'b64', imageType: 'image/jpeg', city: 'Jaipur', stopName: 'Fort' } },
  { path: '/translate', body: { imageBase64: 'b64', imageType: 'image/jpeg', city: 'Kerala' } },
  { path: '/arOverlay', body: { imageBase64: 'b64', imageType: 'image/jpeg', city: 'Delhi' } },
  { path: '/foodSafety', body: { imageBase64: 'b64', imageType: 'image/jpeg', city: 'Delhi' } },
];

describe('AI text endpoints — reachable and correctly wired', () => {
  test.each(TEXT_ENDPOINTS)('POST /api/ai$path calls callGeminiText and returns { text }', async ({ path, body }) => {
    const res = await request(app).post(`/api/ai${path}`).send(body);

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('ok');
    expect(callGeminiText).toHaveBeenCalledTimes(1);
    expect(callGeminiVision).not.toHaveBeenCalled();
  });

  test.each(TEXT_ENDPOINTS)('POST /api/ai$path still responds (not a 500) with an empty body', async ({ path }) => {
    const res = await request(app).post(`/api/ai${path}`).send({});
    // Every one of these builds its prompt from optional fields with
    // fallbacks — an empty body should never throw inside the route itself.
    expect(res.status).toBe(200);
  });
});

describe('AI vision endpoints — reachable and correctly wired', () => {
  test.each(VISION_ENDPOINTS)('POST /api/ai$path calls callGeminiVision and returns { text }', async ({ path, body }) => {
    const res = await request(app).post(`/api/ai${path}`).send(body);

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('ok');
    expect(callGeminiVision).toHaveBeenCalledTimes(1);
    expect(callGeminiText).not.toHaveBeenCalled();
    const [imageBase64, imageType] = callGeminiVision.mock.calls[0];
    expect(imageBase64).toBe(body.imageBase64);
    expect(imageType).toBe(body.imageType);
  });
});

describe('POST /api/ai/vibe — real logic worth checking directly', () => {
  test('joins the locations array into the prompt and requests caching', async () => {
    await request(app).post('/api/ai/vibe').send({ vibe: 'romantic', city: 'Udaipur', locations: ['Lake Palace', 'Sunset Point'] });
    const [prompt, opts] = callGeminiText.mock.calls[0];
    expect(prompt).toContain('Lake Palace, Sunset Point');
    expect(opts).toEqual({ cache: true });
  });
});

describe('POST /api/ai/triprating — expense/stamp aggregation', () => {
  test('sums expense costs and counts stamps into the prompt', async () => {
    await request(app).post('/api/ai/triprating').send({
      city: 'Goa',
      stops: ['Beach', 'Fort'],
      expenses: [{ n: 'Food', c: 500 }, { n: 'Taxi', c: 200 }],
      stamps: [1, 2, 3],
    });
    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('₹700'); // 500 + 200
    expect(prompt).toContain('3'); // stamp count appears in the prompt
  });

  test('defaults gracefully when expenses/stamps are omitted', async () => {
    const res = await request(app).post('/api/ai/triprating').send({ city: 'Goa' });
    expect(res.status).toBe(200);
    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('₹0');
    expect(prompt).toContain('various spots');
  });
});

describe('POST /api/ai/replanner — remaining-stop visit-time mapping', () => {
  test('maps remainingStops into "name(minutes)" format', async () => {
    await request(app).post('/api/ai/replanner').send({
      city: 'Agra',
      completedStops: ['Taj Mahal'],
      remainingStops: [{ name: 'Agra Fort', vt: 45 }, { name: 'Baby Taj', vt: 30 }],
      minutesLate: 15,
    });
    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('Agra Fort(45min)');
    expect(prompt).toContain('Baby Taj(30min)');
  });

  test('defaults to "none yet"/"none" when stops are omitted', async () => {
    await request(app).post('/api/ai/replanner').send({ city: 'Agra' });
    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('none yet');
    expect(prompt).toContain('Remaining stops with visit times: none');
  });
});

describe('POST /api/ai/prep and /api/ai/insta — stop-list slicing', () => {
  test('/prep slices to at most 3 stops', async () => {
    await request(app).post('/api/ai/prep').send({ city: 'Jaipur', stops: ['A', 'B', 'C', 'D', 'E'] });
    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('A, B, C');
    expect(prompt).not.toContain('D, E');
  });

  test('/insta slices to at most 2 stops joined with "and"', async () => {
    await request(app).post('/api/ai/insta').send({ city: 'Udaipur', stops: ['Lake Palace', 'City Palace', 'Fort'] });
    const prompt = callGeminiText.mock.calls[0][0];
    expect(prompt).toContain('Lake Palace and City Palace');
    expect(prompt).not.toContain('Fort');
  });
});
