// __tests__/routes.feedback.test.js
// routes/feedback.js previously had 0% test coverage. Covers the userId
// trust fix (route's own comment: previously trusted body.userId outright,
// letting anyone attribute feedback to someone else's account), input
// validation bounds, and admin-gating on the summary/list endpoints.

jest.mock('../db/queries', () => ({
  submitPlaceFeedback: jest.fn(),
  getPlaceFeedbackSummary: jest.fn(),
  getAllPlaceFeedback: jest.fn(),
  submitAppFeedback: jest.fn(),
  getAppFeedbackSummary: jest.fn(),
}));
jest.mock('../middleware/auth', () => ({
  optionalAuth: (req, _res, next) => {
    if (req.headers['x-test-uid']) req.uid = req.headers['x-test-uid'];
    next();
  },
}));

const express = require('express');
const request = require('supertest');
const feedbackRouter = require('../routes/feedback');
const queries = require('../db/queries');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/feedback', feedbackRouter);
  return app;
}

let app;
const ORIGINAL_KEY = process.env.ADMIN_FEEDBACK_KEY;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_FEEDBACK_KEY = 'test-key';
  app = buildApp();
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ADMIN_FEEDBACK_KEY;
  else process.env.ADMIN_FEEDBACK_KEY = ORIGINAL_KEY;
});

describe('POST /api/feedback/place', () => {
  test('allows signed-out submission (no auth required) with userId null', async () => {
    queries.submitPlaceFeedback.mockResolvedValue(undefined);
    const res = await request(app).post('/api/feedback/place').send({
      placeName: 'Hawa Mahal', city: 'Jaipur', rating: 5,
    });
    expect(res.status).toBe(201);
    expect(queries.submitPlaceFeedback.mock.calls[0][0].userId).toBeNull();
  });

  test('never trusts a client-supplied userId — always uses the verified req.uid', async () => {
    queries.submitPlaceFeedback.mockResolvedValue(undefined);
    await request(app)
      .post('/api/feedback/place')
      .set('x-test-uid', 'real-verified-uid')
      .send({ placeName: 'Hawa Mahal', city: 'Jaipur', rating: 5, userId: 'attacker-supplied-uid' });

    expect(queries.submitPlaceFeedback.mock.calls[0][0].userId).toBe('real-verified-uid');
  });

  test('rejects a missing rating', async () => {
    const res = await request(app).post('/api/feedback/place').send({ placeName: 'X', city: 'Y' });
    expect(res.status).toBe(400);
  });

  test.each([0, 6, 3.5, -1])('rejects an out-of-range or non-integer rating: %p', async (rating) => {
    const res = await request(app).post('/api/feedback/place').send({ placeName: 'X', city: 'Y', rating });
    expect(res.status).toBe(400);
    expect(queries.submitPlaceFeedback).not.toHaveBeenCalled();
  });

  test('rejects a comment over 1000 characters', async () => {
    const res = await request(app).post('/api/feedback/place').send({
      placeName: 'X', city: 'Y', rating: 4, comment: 'a'.repeat(1001),
    });
    expect(res.status).toBe(400);
  });

  test('accepts a comment at exactly the 1000-char boundary', async () => {
    queries.submitPlaceFeedback.mockResolvedValue(undefined);
    const res = await request(app).post('/api/feedback/place').send({
      placeName: 'X', city: 'Y', rating: 4, comment: 'a'.repeat(1000),
    });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/feedback/place — admin-gated', () => {
  test('rejects without a valid admin key', async () => {
    const res = await request(app).get('/api/feedback/place?placeName=X&city=Y');
    expect(res.status).toBe(401);
  });

  test('rejects a request missing placeName/city even with a valid key', async () => {
    const res = await request(app).get('/api/feedback/place').set('x-admin-key', 'test-key');
    expect(res.status).toBe(400);
  });

  test('returns the summary with a valid admin key and both params', async () => {
    queries.getPlaceFeedbackSummary.mockResolvedValue({ count: 3, avg_rating: 4.5 });
    const res = await request(app)
      .get('/api/feedback/place?placeName=Hawa+Mahal&city=Jaipur')
      .set('x-admin-key', 'test-key');
    expect(res.status).toBe(200);
    expect(res.body.avg_rating).toBe(4.5);
  });
});

describe('GET /api/feedback/place/all — admin-gated, capped limit', () => {
  test('caps the limit at 500 even if a larger value is requested', async () => {
    queries.getAllPlaceFeedback.mockResolvedValue([]);
    await request(app).get('/api/feedback/place/all?limit=99999').set('x-admin-key', 'test-key');
    expect(queries.getAllPlaceFeedback).toHaveBeenCalledWith(500);
  });
});

describe('POST /api/feedback/app', () => {
  test('rejects an unknown category by silently substituting "general" rather than rejecting', async () => {
    queries.submitAppFeedback.mockResolvedValue(undefined);
    await request(app).post('/api/feedback/app').send({ rating: 5, category: 'not_a_real_category', message: 'hi' });
    expect(queries.submitAppFeedback.mock.calls[0][0].category).toBe('general');
  });

  test('accepts a valid category as-is', async () => {
    queries.submitAppFeedback.mockResolvedValue(undefined);
    await request(app).post('/api/feedback/app').send({ rating: 5, category: 'bug', message: 'found a bug' });
    expect(queries.submitAppFeedback.mock.calls[0][0].category).toBe('bug');
  });

  test('rejects a message over 2000 characters', async () => {
    const res = await request(app).post('/api/feedback/app').send({ rating: 5, message: 'a'.repeat(2001) });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/feedback/app — admin-gated', () => {
  test('rejects without a valid admin key', async () => {
    const res = await request(app).get('/api/feedback/app');
    expect(res.status).toBe(401);
  });

  test('caps the limit at 200', async () => {
    queries.getAppFeedbackSummary.mockResolvedValue({ count: 0, avg_rating: null, recent: [] });
    await request(app).get('/api/feedback/app?limit=99999').set('x-admin-key', 'test-key');
    expect(queries.getAppFeedbackSummary).toHaveBeenCalledWith(200);
  });
});
