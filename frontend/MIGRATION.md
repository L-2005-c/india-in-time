# Frontend: single-file → Vite-bundled ES modules

## What changed

The frontend used to be one 4,884-line `frontend/public/app.js`, loaded directly
by the browser with no build step. It's now a proper Vite project at
`frontend/app-src/`, bundled into `frontend/public/dist/` for production.

```
frontend/
  public/            ← UNCHANGED. Old monolithic app.js/index.html/styles.css
                       still here and still fully functional — see "Safety net"
                       below. Also holds true static assets (icons, manifest.json,
                       sw.js, admin-feedback.html) which the new build still
                       serves from here, not by copying them.
  app-src/           ← NEW. The actual source of truth going forward.
    index.html
    vite.config.js
    src/
      main.js         entry point — just `import './core/app.js'`
      data/
        cities.js     CITIES / LOCAL_PLACE_SEEDS / HIDDEN_GEM_SEEDS / transport config
      utils/
        geo.js         route ordering, clustering, distance math (incl. hvKm)
        time-intel.js  traffic/crowd/sun/daypart scoring
        budget-calc.js trip cost estimation
        format.js      escaping/sanitizing/formatting helpers
      core/
        app.js         everything else — auth, planner, live nav, street quest,
                        chat, budget UI, PWA/theme, ~3,700 lines (see "What's
                        still left" below)
```

## How the split was done (and why it's safe)

Rather than manually rewriting the whole file, every top-level function was
checked programmatically for whether it touches any shared mutable app state
(`currentCityId`, `itin`, `mdPlan`, `map`, `expenses`, etc.) or only its own
arguments. ~65 functions plus the city/place data were provably state-free —
those were mechanically extracted byte-for-byte into `data/` and `utils/`.
Everything state-coupled (~110 functions that call each other constantly and
share module-level `let` variables) was left untouched inside `core/app.js`,
just with the extracted pieces now imported instead of inline. This means
`core/app.js`'s internal behavior is unchanged from the original — only
genuinely independent code was moved.

Both the extracted modules and the reassembled `core/app.js` have been
syntax-checked, and `npm run build:frontend` has been run end-to-end
successfully (see below) — this isn't just a plan, it's a working build.

## What's still left

`core/app.js` (~3,700 lines) is still one file. It's the right next target,
but splitting it further means untangling ~110 functions that read and write
shared state via bare variables (`currentCityId = x`, not `state.currentCityId
= x`) — safe to do, but it means converting those to a shared state object and
touching every reference, which is a bigger and riskier pass than this one.
Reasonable next slices, roughly in order of how self-contained they are:
street-quest game logic, chat/AI-tools panel, budget UI, auth/save-load, then
the core planner/navigation logic last (most interconnected).

## Dev workflow

**Before:** `npm run dev` (nodemon) served `frontend/public/` directly, no build step.

**Now, two options:**

- **Fastest iteration (recommended):** run the backend and the new frontend
  dev server side by side:
  ```
  npm run dev              # backend on :3000
  npm run dev:frontend     # Vite dev server on :5173, HMR, proxies /api to :3000
  ```
  Open `http://localhost:5173`.

- **Old workflow, unchanged:** `npm run dev` alone still serves the original
  `frontend/public/index.html` + `app.js` exactly as before — nothing about
  that path was touched. Useful as a fallback or for comparing behavior.

**Production:** `npm run build:frontend` now runs `vite build` (previously
ran an esbuild minify pass over the old single file). Output goes to
`frontend/public/dist/`, which `config.resolveIndexHtmlPath()` / `server.js`
already knew how to serve in production — no server-side changes were needed.
Static assets (icons, manifest.json, sw.js) keep being served straight from
`frontend/public/` either way, so nothing needed to be duplicated into `dist/`.

## Safety net

`frontend/public/app.js`, `index.html`, and `styles.css` are untouched and
still fully working — they're just no longer built by `npm run build:frontend`.
If anything about the new build ever needs to be rolled back in production,
reverting `scripts/build-frontend.js` (or just not running it) falls straight
back to the old path with zero other changes.

## Known follow-ups (not yet done)

- `client-api.js` (plain global script, not a module — intentionally *not*
  bundled by Vite) still lives in `frontend/public/` and is loaded via an
  absolute `<script src="/client-api.js">` tag rather than being part of the
  module graph. That's deliberate, not an oversight.
- ESLint's `frontend/public` ignore pattern doesn't cover `frontend/app-src/`
  — the new source will now get linted, which may need a browser-globals env
  tweak in the ESLint config depending on what rules fire.
- `sw.js` wasn't changed. It's already network-first for the app shell and
  cache-first for everything else, so Vite's hashed `dist/assets/*` filenames
  are naturally cache-safe without any changes — but worth a look if you
  change the caching strategy later.
