'use strict';
/**
 * Request tracing — OpenTelemetry when available, else structured request spans.
 */
let otel = null;
try { otel = require('@opentelemetry/api'); } catch (_e) { otel = null; }

const active = new Map(); // requestId -> span data

function startSpan(name, fn) {
  if (otel?.trace) {
    const tracer = otel.trace.getTracer('india-in-time');
    return tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: 1 });
        return result;
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: 2, message: err.message });
        throw err;
      } finally {
        span.end();
      }
    });
  }
  return fn({ setAttribute() {}, recordException() {}, end() {}, setStatus() {} });
}

function withRequestContext(req, attributes = {}) {
  return { requestId: req.requestId, method: req.method, path: req.path, ...attributes };
}

/** Express middleware: attach trace context + timing attributes */
function tracingMiddleware() {
  return function trace(req, res, next) {
    const start = Date.now();
    const name = `${req.method} ${req.path}`;
    if (req.requestId) {
      active.set(req.requestId, { name, start });
    }
    res.on('finish', () => {
      if (req.requestId) active.delete(req.requestId);
      // attributes available for log correlation
      req.traceDurationMs = Date.now() - start;
    });
    next();
  };
}

module.exports = { startSpan, withRequestContext, tracingMiddleware };
