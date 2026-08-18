# India In-Time v4.0 — Deploy

```bash
cp .env.example .env   # DATABASE_URL, REDIS_URL, FIREBASE_SERVICE_ACCOUNT, GEMINI_API_KEY
npm ci
npm run migrate:up
npm run build:frontend
npm start
```

Docker: `docker build -t india-in-time . && docker run -p 3000:3000 --env-file .env india-in-time`

Verify:
- `GET /api/health`
- `GET /api/flags/public`
- Response headers include `X-Request-Id` and `X-Response-Time`

See `docs/NEXT_LEVEL.md`.
