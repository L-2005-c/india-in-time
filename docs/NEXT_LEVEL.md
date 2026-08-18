# India In-Time v4.0 — Next Level

## What “next level” means here
Not a rewrite — a **platform step-up** on top of the modular GeoAI travel product:

1. **Modular frontend domains** — transport, time-aware planner, street quest, chat UI, notifications
2. **Crowd ML v3** — 18 features, calibration, uncertainty, feedback blend
3. **Client platform kit** — event bus, feature flags hydration, performance marks
4. **API discipline** — standard envelope helpers (`lib/apiResponse.js`), public flags, request IDs, Server-Timing
5. **CI gates** — architecture ratchet, tests, build, security
6. **Ops** — Docker multi-stage, health/ready, SLO hooks, audit log

## New in v4.0
| Area | Addition |
|------|----------|
| `lib/apiResponse.js` | `ok` / `fail` / `page` envelopes |
| `middleware/responseTime.js` | `X-Response-Time` + `Server-Timing` |
| `routes/flags.js` | `GET /api/flags/public` |
| `platform/eventBus.js` | Decoupled UI events |
| `platform/featureFlags.js` | Client flag hydration |
| `platform/perf.js` | Journey marks + nav timing |
| Frontend modules | streetQuest, timeAwarePlanner, transport, chatUi |

## Power level
- **Before modularization:** strong MVP ~7/10  
- **After SaaS + models + modular app.js:** ~8–8.5/10  
- **v4.0 next-level platform kit:** aimed at **~8.5–9/10 Professional SaaS**

Remaining to true “enterprise 9.5+”: full `generatePlan` extraction, measured multi-region load tests, deeper TS types, formal chaos drills.

## Deploy
See `DEPLOY.md`. Health: `GET /api/health`. Flags: `GET /api/flags/public`.
