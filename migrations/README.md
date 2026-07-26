# Database Migrations

This project uses [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate)
for schema changes, backed by `DATABASE_URL`.

## Why this exists

Previously, all schema was created via `CREATE TABLE IF NOT EXISTS` inline in
`db/init.js`, run on every server boot. That works for *additive* changes
(new tables, new indexes) but has no safe path for altering or renaming an
existing column, and no rollback mechanism if a change goes wrong.

`1700000000000_baseline-schema.js` in this folder mirrors the schema
`db/init.js` already creates — it's written with `IF NOT EXISTS` guards so
it's a no-op against a database that already has these tables (i.e. any
existing production deployment), and creates everything from scratch on a
fresh database.

**`db/init.js`'s own schema-bootstrap block is left in place for now** as a
safety net for any environment that boots the app without running migrations
first (e.g. a fresh `npm start` with an empty database and no CI/CD migration
step wired up yet). The intent is to fully cut over to migrations-only once
a migration step is part of the standard deploy process — see the "Known
gaps" list in the root `README.md`.

## Making a schema change from now on

Don't hand-edit `db/init.js`'s SQL for new changes. Instead:

```bash
# 1. Create a new migration file
npm run migrate:create -- add-some-column

# 2. Edit the generated file in migrations/ — implement both up() and down()

# 3. Run it locally against your DATABASE_URL
npm run migrate:up

# 4. To roll back the most recent migration
npm run migrate:down
```

## Running migrations against a deployed environment

This is **not yet wired into `render.yaml`'s build/start commands** —
running migrations automatically on every deploy needs a bit of care (e.g.
making sure only one instance runs migrations, not every cluster worker).
For now, run `npm run migrate:up` manually (or via a one-off CI job) against
the target `DATABASE_URL` before deploying code that depends on a new
migration.
