// middleware/errorHandler.js — Global error handler
// Catches all unhandled errors and returns structured JSON responses.

const config = require('../config');

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
    console.error('[ERROR]', JSON.stringify(logData, null, 2));
  } else {
    console.warn('[WARN]', JSON.stringify(logData));
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
    // SPA fallback — serve index.html for navigation requests
    return res.sendFile(require('path').join(config.publicDir, 'index.html'));
  }
  res.status(404).json({
    error: 'Not found',
    code:  'NOT_FOUND',
    path:  req.originalUrl,
  });
}

module.exports = { errorHandler, notFoundHandler };
