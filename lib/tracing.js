/**
 * Lightweight tracing helpers (OpenTelemetry-compatible shape without hard dep).
 * If @opentelemetry/api is installed, uses it; otherwise no-op with request IDs.
 */
let otel = null;
try {
  otel = require('@opentelemetry/api');
} catch (_e) {
  otel = null;
}

function startSpan(name, fn) {
  if (otel?.trace) {
    const tracer = otel.trace.getTracer('india-in-time');
    return tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: 1 }); // OK
        return result;
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: 2, message: err.message }); // ERROR
        throw err;
      } finally {
        span.end();
      }
    });
  }
  return fn({ setAttribute() {}, recordException() {}, end() {} });
}

function withRequestContext(req, attributes = {}) {
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ...attributes,
  };
}

module.exports = { startSpan, withRequestContext };
