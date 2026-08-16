# Render Build Fix — 2026-08-16

## Failure

Render failed during the Vite build because `frontend/app-src/src/main.js`
imports `../utils/browser-logger.js`, but that module was absent from the
GitHub commit deployed by Render.

## Fix

`frontend/app-src/src/utils/browser-logger.js` is now part of the production
source tree, and `scripts/check-frontend-imports.js` fails early if the module
or import is missing.

## Required deployment action

Commit and push the corrected files to the GitHub `main` branch before
redeploying Render. The archive itself does not update GitHub automatically.
