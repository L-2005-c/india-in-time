# Staging Acceptance

The CI staging job must execute, not merely document, the following:

1. PostgreSQL migration.
2. Production frontend build.
3. Application startup and `/api/health/live`.
4. Readiness check.
5. Public API secret-leak check.
6. Security-header check.
7. Browser E2E smoke.
8. Automated axe accessibility check.
9. Browser performance budget.
10. Load smoke.
11. PostgreSQL/Redis baseline and failure-readiness checks.
12. Backup creation.
13. Backup checksum/row-count verification.
14. Isolated restore verification.
15. Deployment structure verification.

The final gates must fail the CI job when any step fails.
