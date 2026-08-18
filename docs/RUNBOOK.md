# India In-Time — Production Runbook (Enterprise)

## Deploy checklist
1. `DATABASE_URL` (Neon **pooled**), `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `CORS_ORIGIN` (not `*`)
2. Recommended: `REDIS_URL`, `REQUIRE_REDIS_IN_PROD=true` for multi-worker
3. `npm ci && npm run build:frontend && npm run migrate:up`
4. Health: `GET /api/health` → 200; Ready: `GET /api/ready` → 200
5. Metrics: `GET /api/metrics` (admin key)

## Incident: AI outage
- Check `/api/health/ready` → `gemini.circuitState`
- Disable AI: `POST /api/admin/flags` `{ "name": "aiEnabled", "value": false }`
- Or set `FF_AI_ENABLED=false` and restart

## Incident: maintenance window
- `POST /api/admin/flags` `{ "name": "maintenanceMode", "value": true }`
- Health endpoints remain up; API returns 503

## Incident: DB down
- `/api/ready` returns 503 — orchestrator should stop traffic
- Restore Neon; verify `SELECT 1`

## Incident: rate-limit inconsistency across workers
- Ensure `REDIS_URL` is set; do not run `CLUSTER_WORKERS>1` without Redis

## Audit
- Table `audit_log` + structured logs `audit:*`
- Auth denials are written automatically

## ML
- Retrain crowd model: `POST /api/analytics/ml/crowd/train` (admin)
- Inspect: `GET /api/analytics/ml/crowd`

## Rollback
- Previous Render deploy / Docker image tag
- `migrate:down` only for reversible migrations; prefer forward fixes
