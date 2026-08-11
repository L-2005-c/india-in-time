// __tests__/routes.timeIntelligence.errors.test.js
//
// The other time-intelligence route tests mount the real service to test
// realistic behavior end to end. That approach can't reach the try/catch
// 500 branches in routes/time-intelligence.js, since the real service
// doesn't throw on well-formed input. This file mocks services/
// timeIntelligence specifically to exercise those branches, plus /score's
// MAX_PLACES cap (mirroring /status's, but never separately asserted).

jest.mock('../services/timeIntelligence', () => ({
  getBatchState: jest.fn(),
  personalizeScore: jest.fn(),
  suggestOpenAlternatives: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const {
  getBatchState,
  personalizeScore,
} = require('../services/timeIntelligence');
const timeIntelligenceRouter = require('../routes/time-intelligence');

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/time-intelligence', timeIntelligenceRouter);
  return app;
}

describe('POST /api/time-intelligence/status — error handling', () => {
  const app = buildTestApp();
  afterEach(() => jest.clearAllMocks());

  test('returns 500 (not a crash) when getBatchState throws', async () => {
    getBatchState.mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await request(app)
      .post('/api/time-intelligence/status')
      .send({ places: [{ name: 'X', cat: 'cafe' }] });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to compute time intelligence status/);
  });

  test('does not leak the raw error message in the response body', async () => {
    getBatchState.mockImplementation(() => {
      throw new Error('super secret internal stack detail');
    });

    const res = await request(app)
      .post('/api/time-intelligence/status')
      .send({ places: [{ name: 'X', cat: 'cafe' }] });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/super secret internal stack detail/);
  });
});

describe('POST /api/time-intelligence/score — error handling and capping', () => {
  const app = buildTestApp();
  afterEach(() => jest.clearAllMocks());

  test('returns 500 (not a crash) when personalizeScore throws', async () => {
    personalizeScore.mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await request(app)
      .post('/api/time-intelligence/score')
      .send({ places: [{ name: 'X', baseScore: 1 }] });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to compute personalized scores/);
  });

  test('caps an oversized places[] array at MAX_PLACES (50) rather than processing it unbounded', async () => {
    personalizeScore.mockImplementation((base) => base);
    const places = Array.from({ length: 250 }, (_, i) => ({ name: `P${i}`, baseScore: 1 }));

    const res = await request(app).post('/api/time-intelligence/score').send({ places });

    expect(res.status).toBe(200);
    expect(res.body.scored).toHaveLength(50);
    expect(personalizeScore).toHaveBeenCalledTimes(50);
  });

  test('defaults baseScore to 1 when a place omits it', async () => {
    personalizeScore.mockImplementation((base) => base);

    const res = await request(app)
      .post('/api/time-intelligence/score')
      .send({ places: [{ name: 'No Base Score' }] });

    expect(res.status).toBe(200);
    expect(res.body.scored[0].score).toBe(1);
  });
});
