// lib/logger.js — Structured, leveled logging (pino)
//
// Previously, operational/lifecycle events (server startup, worker
// fork/crash, graceful shutdown, Gemini circuit breaker state changes) went
// through plain console.log/warn/error with emoji-prefixed strings — fine
// to read in a terminal, hard to filter/query/alert on in a real log
// aggregator, and with no way to turn down verbosity in production.
//
// (Note: middleware/requestLogger.js and middleware/errorHandler.js already
// emit structured JSON for per-request/per-error logs directly via
// console.log(JSON.stringify(...)) in production — that pattern was already
// reasonable and is left as-is / also routed through this logger below for
// consistency. This module's main value-add is for the *other* ~40 scattered
// console.* calls across server.js/services/db that were plain strings.)
//
// Set LOG_LEVEL to control verbosity (fatal|error|warn|info|debug|trace),
// defaults to 'info' in production and 'debug' in development.

const config = require('../config');

const level = process.env.LOG_LEVEL || (config.isProd ? 'info' : 'debug');

const pino = require('pino');

const logger = pino({
  level,
  // Pretty, colorized output locally; raw JSON lines in production (what
  // Render/Railway/Vercel/Docker log collectors expect on stdout).
  transport: config.isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
  base: config.isProd ? { service: 'india-in-time-api' } : undefined,
});

module.exports = logger;
