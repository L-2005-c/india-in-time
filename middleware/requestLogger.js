'use strict';
const appLogger = require('../lib/logger');
// middleware/requestLogger.js — Structured request logging
// Logs every request with method, path, status, response time, IP.

const crypto = require('crypto');
const config = require('../config');

/**
 * Generate a short unique request ID.
 */
function generateRequestId() {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Color codes for console output (dev mode only).
 */
const STATUS_COLORS = {
  2: '\x1b[32m', // green for 2xx
  3: '\x1b[36m', // cyan for 3xx
  4: '\x1b[33m', // yellow for 4xx
  5: '\x1b[31m', // red for 5xx
};
const RESET = '\x1b[0m';

/**
 * Request logger middleware.
 * Attaches req.requestId for tracing through error handler.
 */
function requestLogger(req, res, next) {
  const requestId = generateRequestId();
  const start     = Date.now();

  // Attach request ID
  req.requestId = requestId;
  res.set('X-Request-Id', requestId);

  // Hook into response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status   = res.statusCode;
    const ip       = req.ip || req.connection?.remoteAddress || '-';

    // Skip noisy static file requests in production
    if (config.isProd && status < 400 && !req.path.startsWith('/api/')) {
      return;
    }

    if (config.isProd) {
      // Structured JSON log for production
      appLogger.info(JSON.stringify({
        ts:        new Date().toISOString(),
        rid:       requestId,
        method:    req.method,
        path:      req.path,
        status,
        ms:        duration,
        ip,
        ua:        (req.headers['user-agent'] || '').slice(0, 80),
      }));
    } else {
      // Pretty colored output for development
      const statusGroup = Math.floor(status / 100);
      const color = STATUS_COLORS[statusGroup] || '';
      const method = req.method.padEnd(6);
      const path = req.path.length > 50 ? req.path.slice(0, 47) + '...' : req.path.padEnd(50);
      const ms = `${duration}ms`.padStart(7);
      appLogger.info(`  ${color}${method}${RESET} ${path} ${color}${status}${RESET} ${ms}  ${requestId}`);
    }
  });

  next();
}

module.exports = { requestLogger };
