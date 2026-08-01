// __tests__/routes.timeIntelligence.score.test.js — Regression test for the
// tripMode (solo/duo/trio/family/group) addition to POST /score. Mounts the
// real router so the request/response wiring is exercised end to end, not
// just the underlying personalizeScore unit.

const express = require('express');
const request = require('supertest');
const timeIntelligenceRouter = require('../routes/time-intelligence');

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/time-intelligence', timeIntelligenceRouter);
  return app;
}

describe('POST /api/time-intelligence/score — tripMode', () => {
  const app = buildTestApp();

  test('400s when places[] is missing', async () => {
    const res = await request(app).post('/api/time-intelligence/score').send({ tripMode: 'family' });
    expect(res.status).toBe(400);
  });

  test('applies tripMode weighting on top of the base score', async () => {
    const res = await request(app)
      .post('/api/time-intelligence/score')
      .send({
        tripMode: 'family',
        places: [{ name: 'Rooftop Bar', cat: 'bar', has_nightlife: true, baseScore: 10 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.scored).toHaveLength(1);
    expect(res.body.scored[0].name).toBe('Rooftop Bar');
    expect(res.body.scored[0].score).toBeCloseTo(5, 5); // family halves nightlife venues
  });

  test('works exactly as before when tripMode is omitted (backward compatible)', async () => {
    const res = await request(app)
      .post('/api/time-intelligence/score')
      .send({ places: [{ name: 'City Museum', cat: 'museum', baseScore: 10 }] });
    expect(res.status).toBe(200);
    expect(res.body.scored[0].score).toBe(10);
  });

  test('an invalid tripMode value does not error and is ignored', async () => {
    const res = await request(app)
      .post('/api/time-intelligence/score')
      .send({
        tripMode: 'friendsgiving',
        places: [{ name: 'City Museum', cat: 'museum', baseScore: 10 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.scored[0].score).toBe(10);
  });
});
