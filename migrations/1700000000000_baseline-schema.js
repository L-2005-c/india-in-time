// 1700000000000_baseline-schema.js — Baseline migration
//
// This runs the exact same SQL as db/init.js's boot-time bootstrap — both
// require the shared canonical definition in db/schema.js, so there is now
// exactly one place the schema is written, not two independently-maintained
// copies that could silently drift apart. All statements use IF NOT EXISTS,
// so this is safe to run against:
//   (a) a brand new empty database (creates everything), and
//   (b) an existing production database that already has these tables
//       from db/init.js's own bootstrapping (all statements become no-ops).
//
// Going forward, schema changes should be made by editing db/schema.js and
// adding a NEW migration file (`npm run migrate:create -- <name>`) for the
// change itself — not by re-copying SQL into a new migration file inline.

const { SCHEMA_SQL } = require('../db/schema');

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(SCHEMA_SQL);
};

exports.down = (pgm) => {
  // Deliberately NOT dropping tables in the down migration for this
  // baseline — this is the production schema with real user data
  // (trips, favorites, feedback). A destructive down-migration here would
  // be a data-loss footgun. If you need to actually tear this down (e.g.
  // in a disposable test database), do it explicitly and intentionally,
  // not via `migrate down`.
  pgm.sql(`SELECT 1;`); // no-op
};
