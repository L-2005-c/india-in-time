# Dependency Security Monitoring

CI runs both full and production-only npm audits. The JSON outputs are stored as CI artifacts so dependency-vulnerability state is reviewable per build instead of being visible only in transient console output.

Commands:
- `npm run security:audit:json`
- `npm run security:audit:prod:json`

High/critical findings remain deployment blockers. Audit JSON files are generated at runtime and are intentionally not committed.
