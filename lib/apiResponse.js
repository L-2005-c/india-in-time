/**
 * Standard API envelope — Professional / next-level SaaS consistency.
 */
'use strict';

function ok(res, data, meta = {}) {
  const body = {
    ok: true,
    data,
    meta: {
      requestId: res.req?.requestId || undefined,
      ts: Date.now(),
      ...meta,
    },
  };
  return res.json(body);
}

function fail(res, status, code, message, details = undefined) {
  const body = {
    ok: false,
    error: {
      code,
      message,
      details: details || undefined,
    },
    meta: {
      requestId: res.req?.requestId || undefined,
      ts: Date.now(),
    },
  };
  return res.status(status).json(body);
}

function page(res, items, { page = 1, pageSize = 20, total = null } = {}) {
  return ok(res, items, {
    page: Number(page),
    pageSize: Number(pageSize),
    total: total != null ? Number(total) : undefined,
    hasMore: total != null ? Number(page) * Number(pageSize) < Number(total) : items.length >= pageSize,
  });
}

module.exports = { ok, fail, page };
