// middleware/apiVersion.js — Lightweight API versioning
//
// Accepts version via:
//   - Accept header: application/vnd.indiaintime.v1+json
//   - X-API-Version: 1
//   - ?api_version=1 query param
//
// Default is v1. Unknown versions get 400. Response includes
// X-API-Version so clients can detect negotiation result.
//
// Full OpenAPI surface is tracked as a follow-up; this middleware
// establishes the contract so new breaking changes can ship under v2
// without silent client breakage.

const SUPPORTED = new Set(['1', 'v1', '1.0']);
const DEFAULT = '1';

function parseVersion(req) {
  const q = req.query && (req.query.api_version || req.query.v);
  if (q) return String(q).replace(/^v/i, '');

  const header = req.get('X-API-Version');
  if (header) return String(header).replace(/^v/i, '');

  const accept = req.get('Accept') || '';
  const m = accept.match(/vnd\.indiaintime\.v?(\d+)/i);
  if (m) return m[1];

  return DEFAULT;
}

function apiVersion(req, res, next) {
  const raw = parseVersion(req);
  const normalized = String(raw).replace(/^v/i, '');
  if (!SUPPORTED.has(normalized) && !SUPPORTED.has('v' + normalized)) {
    return res.status(400).json({
      error: `Unsupported API version "${raw}". Supported: v1`,
      code: 'UNSUPPORTED_API_VERSION',
      supported: ['1'],
    });
  }
  req.apiVersion = normalized;
  res.set('X-API-Version', normalized);
  next();
}

module.exports = { apiVersion, SUPPORTED, DEFAULT };
