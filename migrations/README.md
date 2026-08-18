# Database Migrations

This project uses [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate)
for schema changes, backed by `DATABASE_URL`.

## Why this exists

Previously, all schema was created via `CREATE TABLE IF NOT EXISTS` inline in
`db/init.js`, run on every server boot. That works for *additive* changes
(new tables, new indexes) but has no safe path for altering or renaming an
existing column, and no rollback mechanism if a change goes wrong.

**Update:** `db/init.js` and `1700000000000_baseline-schema.js` used to be
two independently-maintained copies of the same SQL — a real risk, since
nothing stopped them from silently drifting apart if one was edited and the
other forgotten. They're now both sourced from `db/schema.js`, one canonical
definition (`SCHEMA_SQL`), so there's exactly one place the schema is
written. `db/init.js` runs it directly on boot (an `IF NOT EXISTS`-guarded
no-op on a database that already has these tables); the migration runs the
exact same string via `pgm.sql(SCHEMA_SQL)`. See `__tests__/db.init.test.js`
for a test that fails if they ever stop matching.

**`db/init.js`'s own schema-bootstrap block is left in place** as a
safety net for any environment that boots the app without running migrations
first (e.g. a fresh `npm start` with an empty database and no CI/CD migration
step wired up yet — see "Running migrations against a deployed environment"
below, still not wired into the deploy process).

## Making a schema change from now on

Don't hand-edit the SQL in a new migration file directly. Instead:

```bash
# 1. Edit db/schema.js — this is the one place the schema lives now

# 2. Create a new migration file for the change itself
npm run migrate:create -- add-some-column

# 3. In the generated file, reference db/schema.js if the change belongs in
#    the baseline, or write the targeted ALTER TABLE for an incremental change

# 4. Run it locally against your DATABASE_URL
npm run migrate:up

# 5. To roll back the most recent migration
npm run migrate:down
```

## Running migrations against a deployed environment

This is **not yet wired into `render.yaml`'s build/start commands** —
running migrations automatically on every deploy needs a bit of care (e.g.
making sure only one instance runs migrations, not every cluster worker).
For now, run `npm run migrate:up` manually (or via a one-off CI job) against
the target `DATABASE_URL` before deploying code that depends on a new
migration.
