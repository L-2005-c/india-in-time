// __tests__/routes.favorites.test.js
// routes/favorites.js previously had 0% test coverage.

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.uid = req.headers['x-test-uid'] || 'user-1';
    next();
  },
}));

jest.mock('../db/queries', () => ({
  addFavorite: jest.fn(),
  getUserFavorites: jest.fn(),
  removeFavorite: jest.fn(),
  isFavorite: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const favoritesRouter = require('../routes/favorites');
const queries = require('../db/queries');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/favorites', favoritesRouter);
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
});

describe('POST /api/favorites', () => {
  test('rejects a request missing placeName/city', async () => {
    const res = await request(app).post('/api/favorites').send({ placeName: 'Hawa Mahal' });
    expect(res.status).toBe(400);
    expect(queries.addFavorite).not.toHaveBeenCalled();
  });

  test('rejects a duplicate favorite with 409', async () => {
    queries.isFavorite.mockResolvedValue(true);
    const res = await request(app)
      .post('/api/favorites')
      .send({ placeName: 'Hawa Mahal', city: 'Jaipur' });
    expect(res.status).toBe(409);
    expect(res.body.alreadyFavorited).toBe(true);
    expect(queries.addFavorite).not.toHaveBeenCalled();
  });

  test('adds a favorite scoped to the authenticated uid', async () => {
    queries.isFavorite.mockResolvedValue(false);
    queries.addFavorite.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/favorites')
      .set('x-test-uid', 'real-user')
      .send({ placeName: 'Hawa Mahal', city: 'Jaipur', userId: 'attacker-supplied' });

    expect(res.status).toBe(201);
    const savedArgs = queries.addFavorite.mock.calls[0][0];
    expect(savedArgs.userId).toBe('real-user');
  });
});

describe('GET /api/favorites', () => {
  test('lists only the authenticated user\'s favorites', async () => {
    queries.getUserFavorites.mockResolvedValue([{ place_name: 'Hawa Mahal' }]);
    const res = await request(app).get('/api/favorites').set('x-test-uid', 'real-user');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(queries.getUserFavorites).toHaveBeenCalledWith('real-user', null);
  });

  test('passes an optional ?city= filter through', async () => {
    queries.getUserFavorites.mockResolvedValue([]);
    await request(app).get('/api/favorites?city=Jaipur').set('x-test-uid', 'real-user');
    expect(queries.getUserFavorites).toHaveBeenCalledWith('real-user', 'Jaipur');
  });
});

describe('DELETE /api/favorites/:id', () => {
  test('scopes deletion to the authenticated uid, never a client-supplied one', async () => {
    queries.removeFavorite.mockResolvedValue(undefined);
    await request(app).delete('/api/favorites/42').set('x-test-uid', 'real-user');
    expect(queries.removeFavorite).toHaveBeenCalledWith(42, 'real-user');
  });
});
