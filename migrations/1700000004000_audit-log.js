exports.shorthands = undefined;
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          SERIAL PRIMARY KEY,
      action      VARCHAR(128) NOT NULL,
      actor       VARCHAR(255),
      resource    VARCHAR(255),
      outcome     VARCHAR(64),
      meta_json   TEXT,
      ip          VARCHAR(45),
      request_id  VARCHAR(64),
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
  `);
};
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS audit_log;`);
};
