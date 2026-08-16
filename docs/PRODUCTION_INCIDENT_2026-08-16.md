# Production Incident: AI Cache Expiry Schema Ordering

## Symptom
Render startup failed with PostgreSQL error `42703: column "expires_at" does not exist`.

## Cause
The boot-time canonical schema attempted to create `idx_ai_cache_expires` before repairing legacy databases by adding `ai_cache.expires_at`. Fresh databases were fine; existing databases created before cache TTL hardening failed during startup.

## Fix
The schema now repairs `ai_cache.expires_at` before creating the index. A versioned migration is also included for environments that run migrations separately.

## Recovery
No destructive data migration is required. Existing rows receive an expiry of `created_at + 10 minutes`.
