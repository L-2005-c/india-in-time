# India In-Time — Current Quality Status

This document describes the current repository after the production/code-quality hardening pass. Historical audits are stored under `docs/archive/` and are not the current source of truth.

## Fixes applied from the previous audit

- Retired the legacy `frontend/public/app.js`, `index.html`, `styles.css`, and `api.js` runtime path. The canonical frontend is `frontend/app-src/`; production serves only the validated Vite build.
- Reduced `frontend/app-src/src/core/app.js` by removing duplicated domain helpers and isolating Firebase bootstrap in `core/firebase.js`.
- Raised the coverage gate to 70% statements / 60% branches / 70% functions / 70% lines.
- Replaced deployed shared-key admin authentication with Firebase custom claims; the shared-key authentication has been removed.
- Added role-based admin authorization (`owner`, `admin`, `analytics`).
- Migrated admin dashboards to Firebase bearer authentication.
- Added CI-published JSON dependency-audit artifacts.
- Replaced MD5 cache-key hashing with SHA-256.
- Marked archived audit documents explicitly as historical.
- Added a development-only frontend shell and removed stale service-worker references to the legacy app shell.

## Intentional architecture decision

India In-Time is a B2C travel product, not a multi-tenant enterprise SaaS product. There is therefore no unnecessary tenant/org model in the core data plane. User data is isolated by verified Firebase UID, while privileged operational access is separated with Firebase admin roles.

## Verification performed in this environment

- JavaScript syntax check: 0 failures.
- Inline event-handler assertion: PASS across 35 frontend source files.
- Production invariant checks: PASS.
- `npm ci --dry-run`: PASS (821 packages resolved).
- Package JSON and lockfile parsing: PASS.
- CI workflow YAML parsing: PASS.

A full dependency-backed Jest/lint/build/E2E run was not completed in this environment because the runtime did not successfully install executable dependencies. Those checks remain CI gates and are not marked as passed here.

- Extracted cluster worker-count and primary lifecycle orchestration to `lib/clusterBootstrap.js`; `server.js` remains the HTTP composition root.

## Remaining engineering work

The Vite frontend is the sole production runtime. `core/app.js` is still a large orchestration module and is being reduced incrementally rather than replaced wholesale. The server cluster lifecycle is now isolated in `lib/clusterBootstrap.js`. Shared admin-key authentication has been removed completely.

- Added an architecture regression ratchet (`npm run check:architecture`) to prevent the frontend core/server composition roots from growing while modularization continues.
