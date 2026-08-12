# Service Level Objectives

| SLO | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.5% monthly | `/api/health` success from uptime monitor |
| API latency (p95 non-AI) | < 500ms | `api_usage.response_ms` |
| API latency (p95 AI) | < 8s | Gemini path + circuit |
| Error rate (5xx) | < 1% | `api_usage` status_code ≥ 500 |
| Auth success | N/A (client) | audit_log auth.* denials trend |

## Error budget
At 99.5% monthly availability ≈ 3.6 hours downtime/month.

## Alerting suggestions
- `/api/ready` ≠ 200 for 2m → page on-call
- Gemini circuit OPEN for 5m → warn
- 5xx rate > 2% for 5m → warn
- DB connection errors → page
