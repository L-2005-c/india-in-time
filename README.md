# India In-Time 🇮🇳 ⏱️ (v3.0)

**India-Specific Travel Intelligence + Contextual Travel Decision Engine**  
*The AI Travel Operating System for India*

India In-Time is a contextual travel decision operating system for Indian journeys. While mapping platforms provide routes and AI models can generate static itineraries, India In-Time solves the real traveler dilemma:

$$\textbf{“Given everything known right now, what is the best next travel decision for THIS traveler?”}$$

It unifies astronomical solar timing, multi-provider weather truth (IMD official + global NWP models), 18-dimensional machine-learned crowd modeling, ghat road & highland hazard kinematics, and real-time journey adaptation into an explainable, trust-preserving travel operating system.

---

## 🏛️ v3.0 Core Product Loop

```
    PLAN → TRAVEL → OBSERVE → UNDERSTAND → DETECT CHANGE → EVALUATE IMPACT
                                                                 ↓
    LEARN ← FEEDBACK ← TRAVELER ACTS ← EXPLAIN ← ADAPT ← DECIDE (Keep vs Adapt)
```

---

## 🧠 Architectural Pillars of India In-Time v3.0

```mermaid
graph TD
    DNA["Traveler DNA (Preferences, Heat/Rain Tolerances, Evidence Log)"] --> JS["Authoritative Journey State (Active Stop, Completed [IMMUTABLE], Pacing Lag)"]
    JS --> CE["Context Engine & Data Trust Layer"]
    
    subgraph "Environmental Intelligence"
        CE --> WTE["Weather Truth Engine (IMD Official + Open-Meteo Consensus)"]
        CE --> RTE["Authoritative Routing (Live Traffic vs Road Estimates)"]
        CE --> CRW["Crowd Model v3 (18-dim Online Logistic Regression)"]
        CE --> SCN["Solar & Scenic Engine (Astronomical Golden Hour Curves)"]
    end

    CE --> TG["Travel Guardian (12 Event Triggers: Rain, Ghat Risk, Delay, Closure)"]
    TG --> DE["Contextual Decision Engine"]
    
    DE -->|Plan Still Optimal| Keep["KEEP PLAN (Continue on Track)"]
    DE -->|Disruption Detected| Alt["Alternative Generator (Sheltered Havens / Museums)"]
    Alt --> Replan["Adaptation Pipeline (Re-times upcoming stops only)"]
    Replan --> PV["Plan Versioning (Plan v1 -> Plan v2 Audit Trail)"]
    PV --> HUD["Trip Control Center HUD (One-Click Traveler Action)"]
    HUD --> FB["Feedback & Outcome Learning (Updates Traveler DNA)"]
```

### 1. Multi-Provider Weather Truth Engine
- Integrates official **India Meteorological Department (IMD)** station feeds with high-resolution global numerical weather prediction models (Open-Meteo).
- Models **altitude lapse rates** (-6.5°C / 1000m) for Indian hill stations and Eastern/Western Ghats (e.g., 910m Araku Valley vs coastal Visakhapatnam).
- **Preserves Uncertainty**: When providers disagree on precipitation, the engine flags `WEATHER_DISAGREEMENT` and reduces confidence to `LOW` rather than fabricating false 50% averages.
- **Accuracy Telemetry**: Continuously pairs forecast snapshots with subsequent ground observations to measure Mean Absolute Error (MAE) and rain detection calibration.

### 2. Authoritative Central Journey State
- Acts as the single source of truth for active trips (`tripId`, `activeStop`, `completedStops`, `upcomingStops`, `pacingLagMinutes`, `planVersion`).
- **Strict Immutability Guarantee**: Completed activities are immutable and can never be rewritten, deleted, or re-timed during dynamic replanning.
- **Pacing Lag Propagation**: Automatically shifts upcoming departure windows based on real-world transit delays without disrupting completed history.

### 3. Real-Time Travel Guardian
- Continuously evaluates journey health against 12 standardized event triggers:
  `WEATHER_DETERIORATION`, `GHAT_ROAD_RISK`, `HEAT_SURGE`, `FOG_HAZARD`, `CROWD_SURGE`, `TRAFFIC_DELAY`, `TRAVELER_DELAY`, `OPENING_HOURS_CONFLICT`, `SCENIC_WINDOW_MISSED`, `DESTINATION_CLOSURE`, `HAZARD_CHANGE`, `EMERGENCY`.
- Maps trip state to authoritative health bands: `ON_TRACK`, `WATCH`, `SUBOPTIMAL`, `REPLAN_RECOMMENDED`, `CRITICAL`.
- Built-in anti-churn hysteresis prevents false plan replanning from trivial traffic variations.

### 4. Contextual Decision Engine & Alternative Generator
- When severe rain, heat, or road closures degrade an upcoming outdoor stop (e.g., viewpoints, waterfalls), the system does not simply drop it.
- Dynamically discovers and substitutes **sheltered havens** (art museums, coffee roasteries, craft pavilions) aligned with Traveler DNA preferences.
- Re-times remaining stops and generates an explainable diff: `WHAT CHANGED`, `WHY`, `WHAT WAS PRESERVED`.

### 5. Plan Versioning & Audit Trail
- Maintains an immutable audit history of plan mutations: Plan v1 $\rightarrow$ Plan v2 $\rightarrow$ Plan vN.
- Logs trigger severity, changed stops, preserved stops, confidence score, and timestamp for every adaptation event.

---

## 📂 Codebase Taxonomy

```text
india-in-time/
├── frontend/
│   ├── app-src/                # Vite + ES Module Source Code
│   │   ├── src/
│   │   │   ├── core/           # Main controller (app.js ≤ 3500 lines)
│   │   │   ├── modules/        # Domain modules (tripControlCenter, whatIfSimulatorUi, timeAwarePlanner)
│   │   │   ├── a11y/           # Accessibility controllers (modal, keyboard navigation)
│   │   │   └── utils/          # Geometry, sanitization, and helper utilities
│   │   └── styles.css          # Curated responsive design tokens & CSS
│   └── public/
│       └── dist/               # Content-hashed production build output (HTML, JS, CSS)
├── services/
│   ├── travelIntelligence/     # Core intelligence & operating system layer
│   │   ├── weather/            # Multi-provider Weather Truth Engine (IMD + Open-Meteo)
│   │   ├── journey/            # Authoritative Journey State & Plan Versioning Engines
│   │   ├── guardian/           # Travel Guardian & 12-trigger framework
│   │   ├── decision/           # Contextual Adaptation Pipeline & Alternative Generator
│   │   ├── tourismPoi/         # Zero-Trust Canonical Place Resolver & Coordinate Integrity
│   │   ├── advancedItineraryEngine.js # Beam-search itinerary optimizer
│   │   └── personalTravelDna.js # 10-dim traveler preference vectors with recency decay
│   ├── ml/                     # Online crowd prediction model (18-dim logistic regression v3)
│   ├── cache.js                # Distributed Redis + in-memory LRU multi-tier cache
│   └── gemini.js               # Resilient LLM proxy with circuit breaker & retry backoff
├── routes/
│   ├── intelligence.js         # v3.0 Travel Operating System & Decision Intelligence APIs
│   ├── weather.js              # Multi-provider weather proxy
│   ├── trips.js                # Trip persistence & sharing
│   └── time-intelligence.js    # Temporal visit windows & badge endpoints
├── middleware/                 # Rate limiting, security headers, SLO tracking, auth
├── db/                         # PostgreSQL connection pool, schema, migrations, queries
├── scripts/                    # Build, lint, and architectural verification scripts
└── __tests__/                  # 124 test suites, 1,250+ unit and end-to-end tests
```

---

## 🚀 Getting Started & Local Development

### Prerequisites
- **Node.js**: v20.x or v22.x+
- **npm**: v10.x+
- *(Optional)* PostgreSQL & Redis (the system operates out-of-the-box in standalone mode with resilient local fallbacks)

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

## 🧪 Comprehensive Verification & Quality Gates

All quality checks must exit 0 cleanly:

| Verification Target | Command | Description |
| :--- | :--- | :--- |
| **Full Test Suite** | `npm test` | Runs **124 test suites (1,250+ assertions)** across all travel operating system engines, routers, and models |
| **Architecture Guardrails** | `node scripts/architecture-check.js` | Enforces line-count ratchets (`app.js` ≤ 3500, `server.js` ≤ 560) and zero circular dependency cycles |
| **End-to-End Simulation** | `npx jest __tests__/intelligence.operatingSystemE2E.test.js` | Simulates Visakhapatnam $\rightarrow$ Araku Valley rainy ghat journey adaptation |
| **Frontend Production Build**| `npm run build:frontend` | Compiles Vite production bundle into content-hashed assets |
| **Bundle Budget** | `node scripts/check-bundle-size.js` | Validates bundle remains under 1.5 MB (currently ~482 KB) |
| **ESLint Analysis** | `npm run lint` | Ensures 0 syntax and style violations |

---

## 🛡️ Operational & Security Invariants

1. **Truth in Provenance**: All meteorological and routing telemetry carries strict data states: `OBSERVED`, `PREDICTED`, `ESTIMATED`, `HISTORICAL`, `STALE`, `UNAVAILABLE`, or `SIMULATED`. Simulated demo data is NEVER represented as live observation.
2. **Deterministic Precedence**: Safety rules, opening hours, and solar calculations are deterministic. AI language models only explain decisions; they never invent coordinates, closures, or weather data.
3. **CSP & Security**: Strict CSP nonces, HSTS, frame-deny, and zero inline event handlers guarantee XSS defense.
4. **Resilience**: Redis or database connection failures fail open into memory caches without service disruption.

---

## 📑 Technical Documentation

- ⏱️ [Service Level Objectives (SLO)](docs/SLO.md)
- 🔴 [Redis Operations & Validation Runbook](docs/REDIS_RUNBOOK.md)
- 📑 [OpenAPI API Documentation](docs/openapi.yaml)
