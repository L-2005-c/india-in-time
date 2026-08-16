// middleware/errorHandler.js — Global error handler
// Catches all unhandled errors and returns structured JSON responses.

const config = require('../config');
const logger = require('../lib/logger');
const apm = require('../lib/apm');

// ── Optional error-reporting webhook (lightweight APM/alerting hook) ───────
// Sentry integration is available through lib/apm.js. This generic webhook
// remains as an optional secondary alerting/ingestion hook so operators can
// forward 5xx events to their existing incident system without coupling the
// core error path to a single vendor:
// if ERROR_REPORTING_WEBHOOK_URL is set, every 5xx error is POSTed there
// as JSON (compatible with a Slack/Discord incoming webhook, a serverless
// function that forwards to Sentry/Datadog, or any custom ingestion
// endpoint). Unset (the default) — completely inert, matching prior
// behavior exactly. Fire-and-forget: never awaited by the response path,
// has its own timeout, and any failure is logged, never thrown — a flaky
// or unreachable webhook endpoint must never turn a handled error into an
// unhandled one.
const REPORT_TIMEOUT_MS = 3000;

function reportErrorAsync(err, logData) {
  const url = process.env.ERROR_REPORTING_WEBHOOK_URL;
  if (!url || typeof fetch !== 'function') return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: 'india-in-time-backend',
      env: config.isProd ? 'production' : 'development',
      ...logData,
      // Full stack is deliberately included here even in production — this
      // payload goes to the operator's own error-tracking endpoint, not to
      // the end user (that distinction is enforced separately below, in
      // the actual HTTP response).
      stack: err.stack,
    }),
    signal: controller.signal,
  })
    .catch((reportErr) => {
      logger.warn(
        { err: reportErr.message },
        '[errorHandler] error-reporting webhook failed — the original error above was still logged/handled normally'
      );
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Global error handler middleware.
 * Must be registered LAST with app.use(errorHandler).
 * Express recognises 4-param middleware as error handlers.
 */
function errorHandler(err, req, res, _next) {
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Log the error
  const logData = {
    timestamp: new Date().toISOString(),
    requestId: req.requestId || '-',
    method:    req.method,
    path:      req.path,
    status:    statusCode,
    error:     err.message,
  };

  if (statusCode >= 500) {
    logData.stack = err.stack;
    logger.error('[ERROR]', JSON.stringify(logData, null, 2));
    reportErrorAsync(err, logData);
    try { apm.captureException(err, logData); } catch (_e) {}
  } else {
    logger.warn('[WARN]', JSON.stringify(logData));
  }

  // Build response
  const response = {
    error:     err.message || 'Internal server error',
    code:      err.code || 'INTERNAL_ERROR',
    requestId: req.requestId || undefined,
  };

  // Include stack trace in development only
  if (!config.isProd && err.stack) {
    response.stack = err.stack.split('\n').slice(0, 5);
  }

  // Don't leak internal details in production for 5xx errors
  if (config.isProd && statusCode >= 500) {
    response.error = 'An unexpected error occurred. Please try again.';
    delete response.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * 404 handler for unknown routes.
 */
function notFoundHandler(req, res) {
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    // SPA fallback — serve index.html for navigation requests. Uses
    // config.resolveIndexHtmlPath() so this picks up the minified,
    // content-hashed build (frontend/public/dist/) in production when one
    // has been built (see scripts/build-frontend.js), falling back to the
    // raw source file otherwise.
    return res.sendFile(config.resolveIndexHtmlPath());
  }
  res.status(404).json({
    error: 'Not found',
    code:  'NOT_FOUND',
    path:  req.originalUrl,
  });
}

module.exports = { errorHandler, notFoundHandler };
