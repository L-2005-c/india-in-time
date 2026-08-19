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


## Production deployment contract (v5.2.2)

Render must run the frontend build with devDependencies available:

```sh
npm ci --include=dev && npm run build:frontend && npm prune --omit=dev
```

The repository intentionally does not ship `node_modules`; Render/CI must install from the committed lockfile. Production startup remains `node server.js`, with `/api/health` as the deployment health check. `npm run release:audit` verifies this contract (and the presence of the tourism/GeoAI eligibility engine, its Jest regression suite, and SEO assets) before a release ships — see `DEPLOYMENT_PRODUCTION.md` for the full checklist.
