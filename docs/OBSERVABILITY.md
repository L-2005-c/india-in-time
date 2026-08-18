# Production Observability

India In-Time uses structured Pino logging plus a configurable production error-reporting webhook.

For enforced production monitoring:
- `REQUIRE_ERROR_REPORTING=true`
- `ERROR_REPORTING_WEBHOOK_URL=https://<your-error-ingestion-or-alerting-endpoint>`
- `SERVICE_NAME=india-in-time-api`
- `REGION=<deployment region>`
- `RELEASE_VERSION=<immutable deployment version>`

The error handler reports 5xx failures asynchronously without blocking the user response. The payload contains request ID, route, status, service, environment and stack information for the operator-owned monitoring endpoint.

Optional Sentry support remains available through `lib/apm.js` when `@sentry/node` is installed by the deployment image or platform. It is not bundled into the core dependency lock so the application has no mandatory vendor SDK coupling.

Recommended operational integration: send the webhook to Sentry, Datadog, PagerDuty-compatible ingestion, or an internal incident service, then configure alerts for:
- API 5xx rate
- request p95 latency
- database failures
- Redis failures
- Gemini/provider failures
- routing/weather provider failures
- frontend exception telemetry
