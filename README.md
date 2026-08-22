# India In-Time 🇮🇳 ⏱️

**Enterprise-Grade GeoAI & Temporal Travel Intelligence Platform**

India In-Time is a full-stack, time-aware itinerary planning and navigation system for Indian cities. It combines deterministic astronomical solar calculations, real-time weather analytics, historical crowd modeling, multi-modal transport algorithms, and grounded Generative AI (Gemini) into a unified PWA and mobile-first experience.

---

## 🏛️ System Architecture

```mermaid
graph TD
    Client["Client (PWA / Mobile / Desktop Browser)"] -->|HTTPS / WSS| CDN["CDN / Reverse Proxy"]
    CDN --> Express["Express.js Server (Node.js 20+)"]
    
    subgraph "Core Backend Services"
        Express --> Auth["Auth & Security (Firebase + Rate Limiters)"]
        Express --> RoutingEngine["Temporal & Itinerary Optimizer (Beam Search)"]
        Express --> WeatherEngine["Weather & Solar Engine (OpenWeather + Astronomy)"]
        Express --> AIProxy["Grounded AI Service (Gemini 2.0 / 1.5 Pro)"]
        Express --> PlacesService["POI Discovery & Deduplication"]
    end

    subgraph "Data & Persistence Layer"
        RoutingEngine --> Redis[("Redis Cache (Cluster / TLS Memorystore)")]
        RoutingEngine --> Postgres[("PostgreSQL Database (User Data & Stamps)")]
        Express --> Fallback["In-Memory Resilient Fallbacks"]
    end
```

### Key Architectural Tenets
1. **Deterministic Travel Grounding**: Astronomical sunrise/sunset curves, real-world distance metrics (Haversine/OSRM), weather thresholds, and opening hours are calculated by deterministic engines — never hallucinated by LLMs.
2. **Resilience & Fail-Open**: Every external dependency (Redis, PostgreSQL, OpenWeather, Nominatim, Gemini) has automatic local fallback paths. If Redis or Postgres goes down, the app remains 100% operational with in-memory caching and local storage.
3. **Strict Zero-Inline-Handler Policy**: The UI adheres to strict Content Security Policy (CSP) with CSP nonces, zero inline `onclick`/`onchange` handlers in production HTML, and delegated DOM listeners.
4. **Architectural Guardrails**: Architectural limits (`scripts/architecture-check.js`) ratchet maximum file size (`app.js` ≤ 3600 lines, `server.js` ≤ 560 lines) to enforce ongoing modularization.

---

## 📂 Codebase Taxonomy

```text
india-in-time/
├── frontend/
│   ├── app-src/                # Vite + ES Module Source Code
│   │   ├── src/
│   │   │   ├── core/           # Main controller (app.js, client-api.js, state)
│   │   │   ├── modules/        # Extracted domain modules (budget, feedback, savedPlans, aiMedia, chat, transport)
│   │   │   ├── a11y/           # Accessibility controllers (modal, keyboard navigation)
│   │   │   └── utils/          # Geometry, sanitization, and helper utilities
│   │   └── styles.css          # Curated responsive design tokens & CSS
│   └── public/
│       └── dist/               # Content-hashed production build output (HTML, JS, CSS)
├── services/
│   ├── travelIntelligence/     # Beam search itinerary optimizer, temporal engine, scoring
│   ├── ai/                     # Grounded Gemini AI prompt templates & provider abstraction
│   ├── cache.js                # Distributed Redis + in-memory LRU multi-tier cache
│   ├── weatherEngine.js        # Deterministic weather scoring & temperature thresholds
│   └── gemini.js               # Resilient LLM proxy with circuit breaker & retry backoff
├── routes/                     # Express API endpoint controllers
├── middleware/                 # Rate limiting, security headers, SLO tracking, auth
├── db/                         # PostgreSQL connection pool, schema, migrations, queries
├── data/                       # Curated city seed POIs and cultural metadata
├── scripts/                    # Build, lint, architecture check, and load smoke test scripts
├── docs/                       # Technical runbooks, SLO specifications, OpenAPI docs
└── __tests__/                  # Comprehensive test suites (Unit, E2E, A11y, Hardening)
```

---

## 🚀 Getting Started & Local Development

### Prerequisites
- **Node.js**: v20.x or v22.x+
- **npm**: v10.x+
- *(Optional)* PostgreSQL & Redis (the app runs out-of-the-box in standalone mode without them)

### Installation
```bash
git clone https://github.com/your-org/india-in-time.git
cd india-in-time
npm ci
```

### Environment Configuration
Create a `.env` file in the root directory:
```bash
# Server Port & Environment
PORT=3001
NODE_ENV=development

# AI Provider Keys
GEMINI_API_KEY="your-gemini-api-key"
# Optional secondary AI key for fallback
GEMINI_API_KEY_SECONDARY="your-backup-key"

# Database & Cache (Optional - gracefully falls back to local memory if unset)
DATABASE_URL="postgres://user:password@localhost:5432/indiaintime"
REDIS_URL="redis://localhost:6379"

# Local Development DB Bypass
SKIP_DB_INIT=true
```

### Running Locally
```bash
# 1. Build the frontend production bundle
npm run build:frontend

# 2. Start the Express server
npm start
```
Access the application at `http://localhost:3001`.

---

## 🧪 Comprehensive Verification & QA Suite

All quality checks must exit 0 before deploying code:

| Verification Target | Command | Description |
| :--- | :--- | :--- |
| **Unit & Integration Tests** | `npm test` | Runs 69 test suites (855+ assertions) across all travel engines, services, and routes |
| **Playwright E2E & A11y** | `npm run test:e2e` | Runs headless Chromium journeys, WCAG 2 AA Axe checks, and responsive mobile viewports (375px & 320px) |
| **Architecture Limits** | `node scripts/architecture-check.js` | Enforces line count limits (`app.js` ≤ 3600, `server.js` ≤ 560) |
| **Inline Handler Guard** | `npm run check:inline-handlers` | AST/regex check guaranteeing zero inline `onclick`/`onload` HTML attributes |
| **Bundle Size Budget** | `npm run check:bundle` | Validates frontend bundle remains under the 1.5 MB production performance budget |
| **ESLint Static Analysis** | `npm run lint` | Ensures 0 errors and 0 warnings across frontend, backend, and test suites |
| **Itinerary Load Smoke** | `node scripts/itinerary-load-smoke.js` | Benchmarks beam search optimizer under concurrency, reporting p50/p95/p99 latencies |

---

## 🛡️ Security & Performance SLOs

- **CSP & Security Headers**: Strict HSTS, frame-options deny, script-src nonce injection, and complete XSS protection.
- **Fail-Open Architecture**: Complete Redis or PostgreSQL outages trigger zero 500 responses on planning or read APIs.
- **Latency SLOs**:
  - POI Lookup & Scored Places: p95 < 80ms (cached), p95 < 250ms (uncached)
  - Full Beam-Search Itinerary Planning: p95 < 500ms
  - PWA Initial Paint: LCP < 1.8s, CLS < 0.05 on standard 4G mobile networks

---

## 📚 Technical Documentation

- 📖 [Architecture Specification](docs/ARCHITECTURE.md)
- ⏱️ [Service Level Objectives (SLO)](docs/SLO.md)
- 🔴 [Redis Operations & Validation Runbook](docs/REDIS_RUNBOOK.md)
- 📊 [Quality Status & Test Evidence](CURRENT_QUALITY_STATUS.md)
- 🚀 [Production Hardening Checklist](PRODUCTION_STATUS.md)
- 📑 [OpenAPI API Documentation](docs/openapi.yaml)
