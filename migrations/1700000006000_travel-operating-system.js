'use strict';

/**
 * migrations/1700000006000_travel-operating-system.js
 *
 * Migration: India In-Time v3.0 Travel Operating System Schema Expansion
 * Adds tables for Journey State, Plan Versions, Adaptation Events,
 * and Weather Accuracy Tracking.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Authoritative Journey State for active trips
    CREATE TABLE IF NOT EXISTS journey_state (
      trip_id              VARCHAR(255) PRIMARY KEY,
      user_id              VARCHAR(255),
      current_status       VARCHAR(64) DEFAULT 'ON_TRACK',
      current_location_lat DOUBLE PRECISION,
      current_location_lon DOUBLE PRECISION,
      current_minute       INTEGER DEFAULT 0,
      active_stop_id       VARCHAR(255),
      active_plan_version  INTEGER DEFAULT 1,
      state_json           TEXT NOT NULL,
      updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_journey_state_user ON journey_state(user_id);
    CREATE INDEX IF NOT EXISTS idx_journey_state_updated ON journey_state(updated_at DESC);

    -- Plan Versions audit trail (Plan v1 -> Plan v2)
    CREATE TABLE IF NOT EXISTS plan_versions (
      id                   SERIAL PRIMARY KEY,
      trip_id              VARCHAR(255) NOT NULL,
      version_number       INTEGER NOT NULL,
      trigger_type         VARCHAR(64),
      trigger_reason       TEXT,
      plan_json            TEXT NOT NULL,
      changed_stops_json   TEXT,
      preserved_stops_json TEXT,
      confidence           VARCHAR(32),
      created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_trip_plan_version UNIQUE (trip_id, version_number)
    );
    CREATE INDEX IF NOT EXISTS idx_plan_versions_trip ON plan_versions(trip_id, version_number DESC);

    -- Adaptation Events Log (Disruptions detected & adaptations accepted/rejected)
    CREATE TABLE IF NOT EXISTS adaptation_events (
      id                   SERIAL PRIMARY KEY,
      trip_id              VARCHAR(255) NOT NULL,
      trigger_name         VARCHAR(64) NOT NULL,
      severity             VARCHAR(32) NOT NULL,
      event_data_json      TEXT NOT NULL,
      decision_outcome     VARCHAR(64) NOT NULL,
      user_action          VARCHAR(32) DEFAULT 'PENDING',
      created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_adaptation_trip ON adaptation_events(trip_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_adaptation_trigger ON adaptation_events(trigger_name);

    -- Forecast snapshots for ground-truth accuracy tracking
    CREATE TABLE IF NOT EXISTS weather_forecast_snapshots (
      id                   SERIAL PRIMARY KEY,
      provider             VARCHAR(64) NOT NULL,
      poi_id               VARCHAR(255),
      lat                  DOUBLE PRECISION NOT NULL,
      lon                  DOUBLE PRECISION NOT NULL,
      forecast_made_at     TIMESTAMP NOT NULL,
      forecast_target_at   TIMESTAMP NOT NULL,
      forecast_temp_c      DOUBLE PRECISION,
      forecast_rain_prob   DOUBLE PRECISION,
      forecast_rain_mm     DOUBLE PRECISION,
      condition_code       VARCHAR(64),
      created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_weather_snapshots_target ON weather_forecast_snapshots(lat, lon, forecast_target_at);

    -- Accuracy verification records comparing forecasts to actual observations
    CREATE TABLE IF NOT EXISTS weather_accuracy_records (
      id                      SERIAL PRIMARY KEY,
      snapshot_id             INTEGER REFERENCES weather_forecast_snapshots(id) ON DELETE CASCADE,
      observed_at             TIMESTAMP NOT NULL,
      observed_temp_c         DOUBLE PRECISION,
      observed_rain_mm        DOUBLE PRECISION,
      temp_absolute_error     DOUBLE PRECISION,
      rain_detected_actual    BOOLEAN,
      accuracy_classification VARCHAR(32),
      recorded_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_weather_acc_snapshot ON weather_accuracy_records(snapshot_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS weather_accuracy_records;
    DROP TABLE IF EXISTS weather_forecast_snapshots;
    DROP TABLE IF EXISTS adaptation_events;
    DROP TABLE IF EXISTS plan_versions;
    DROP TABLE IF EXISTS journey_state;
  `);
};
