// middleware/adminAuth.js — Shared gate for internal/admin-only endpoints.
// Requires ADMIN_FEEDBACK_KEY to be set in the environment and matched via
// the x-admin-key header. Query-string (?key=) support has been removed —
// secrets in URLs get logged (server access logs, browser history, proxies)
// and this key protects real user data, so it shouldn't be one.
function requireAdminKey(req, res, next) {
  const configured = process.env.ADMIN_FEEDBACK_KEY;
  if (!configured) {
    return res.status(503).json({ error: 'Admin access is not configured. Set ADMIN_FEEDBACK_KEY in your environment.' });
  }
  const provided = req.headers['x-admin-key'];
  if (provided !== configured) {
    return res.status(401).json({ error: 'Invalid or missing admin key' });
  }
  next();
}

module.exports = { requireAdminKey };
