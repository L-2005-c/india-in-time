exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS gemini_usage (
      id          SERIAL PRIMARY KEY,
      endpoint    VARCHAR(255),
      model       VARCHAR(100),
      tokens_in   INTEGER DEFAULT 0,
      tokens_out  INTEGER DEFAULT 0,
      latency_ms  INTEGER,
      success     BOOLEAN DEFAULT true,
      cached      BOOLEAN DEFAULT false,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gemini_usage_time ON gemini_usage(created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS gemini_usage;`);
};
