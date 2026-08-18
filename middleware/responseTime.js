'use strict';

/** Attach Server-Timing / X-Response-Time for observability. */
function responseTime() {
  return function responseTimeMiddleware(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      try {
        const end = process.hrtime.bigint();
        const ms = Number(end - start) / 1e6;
        if (!res.headersSent) return;
        // Header may already be sent; set only if possible via append at writeHead
      } catch (_e) {}
    });
    const origWriteHead = res.writeHead;
    res.writeHead = function patchedWriteHead() {
      try {
        const end = process.hrtime.bigint();
        const ms = Number(end - start) / 1e6;
        res.setHeader('X-Response-Time', `${ms.toFixed(1)}ms`);
        res.setHeader('Server-Timing', `app;dur=${ms.toFixed(1)}`);
      } catch (_e) {}
      return origWriteHead.apply(this, arguments);
    };
    next();
  };
}

module.exports = { responseTime };
