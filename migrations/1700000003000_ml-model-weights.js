exports.shorthands = undefined;
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS ml_model_weights (
      model_key    VARCHAR(64) PRIMARY KEY,
      weights_json TEXT NOT NULL,
      trained_n    INTEGER DEFAULT 0,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
};
exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS ml_model_weights;`);
};
