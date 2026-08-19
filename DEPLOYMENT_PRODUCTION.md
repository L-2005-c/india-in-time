# India In-Time — Production Deployment

## Render

Build command:
```
npm ci --include=dev && npm run build:frontend && npm prune --omit=dev
```

Start command:
```
node server.js
```

Health check:
```
/api/health
```

## Required production variables

- `NODE_ENV=production`
- `DATABASE_URL`
- `GEMINI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT`
- `REDIS_URL`
- `CORS_ORIGIN` set to the exact public frontend origin
- `DATABASE_SSL_REJECT_UNAUTHORIZED=true`
- `REQUIRE_REDIS_IN_PROD=true`

Optional intelligence variables include `GEMINI_API_KEY_SECONDARY`, `GEMINI_MODEL`, MapTiler keys, and routing provider settings.

## Release verification

Run:
```
npm run release:audit
npm run check:production
npm run check:architecture
npm run test:tourism-poi-regression
npm run test:itinerary-regression
npm run lint
npm run build:frontend
```

The production server intentionally fails closed when the built frontend or required production secrets are missing.
