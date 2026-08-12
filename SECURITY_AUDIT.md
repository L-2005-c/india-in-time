# Security Audit — India In-Time v3.0

**Scope:** App code, auth, validation, deps, CI gates  
**Level:** Internal ASVS-L1 style review  

## Summary
| Severity | Count | Notes |
|----------|-------|-------|
| Critical | 0 | |
| High | 0 | brace-expansion pinned to 5.0.9; CI `npm audit --audit-level=high` |
| Medium | 1 | Frontend monolith residual XSS risk mitigated by CSP |
| Low | 2 | Legacy admin key; CORS operator config |

## Controls
- Firebase server-side token verify
- Parameterized SQL + ownership checks
- Helmet CSP (`script-src-attr 'none'`)
- Rate limits + Redis path for multi-instance
- Input validators on AI / places / time-intel
- Global error handler (no prod stacks)
- APM capture on 5xx

## Operator requirements before scale
1. `npm audit --audit-level=high` clean in CI
2. Explicit `CORS_ORIGIN`
3. `REDIS_URL` + `REQUIRE_REDIS_IN_PROD` for multi-worker
4. `SENTRY_DSN` or webhook
5. Disable legacy admin key
6. Third-party pen-test before payments
