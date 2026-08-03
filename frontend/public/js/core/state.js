// ══════════════════════════════════════════════════
// Centralized application state — single source of truth
// Every module reads/writes through this instead of bare globals.
// ══════════════════════════════════════════════════

export const state = {
  // ── City & Places ──────────────────────────────────────────────────────────
  currentCityName: 'India',
  currentCityId: 'india',
  LOCS: [],                    // active city's place pool
  placeCache: new Map(),       // cacheKey → places[]
  placeLoadPromises: new Map(),

  // ── Plan & Itinerary ───────────────────────────────────────────────────────
  mdPlan: [],                  // multi-day plan: Array<Array<stop>>
  dayIdx: 0,                   // current day tab index
  itin: [],                    // today's working itinerary (includes breaks)

  // ── Trip State ─────────────────────────────────────────────────────────────
  tripActive: false,
  tripStart: null,

  // ── GPS ────────────────────────────────────────────────────────────────────
  cLat: null,
  cLon: null,
  wid: null,                   // geolocation.watchPosition id
  lastHeading: null,
  lastHeadingSample: null,

  // ── Live Navigation ────────────────────────────────────────────────────────
  autoFollowLive: true,
  navVoiceEnabled: true,
  lastSpokenNavInstruction: '',
  lastSpokenAt: 0,

  // ── Map Objects ────────────────────────────────────────────────────────────
  map: null,
  liveMkr: null,               // live GPS marker
  mkrs: [],                    // route stop markers
  rLine: null,                 // route polyline
  allPlacesMkrs: [],           // preview place markers

  // ── Route Info ─────────────────────────────────────────────────────────────
  nsDist: '--',
  nsEta: '--',
  lastRouteRenderPos: null,
  lastRouteRenderAt: 0,

  // ── Weather ────────────────────────────────────────────────────────────────
  realTemp: null,
  realWeatherMain: 'Clear',

  // ── User & Auth ────────────────────────────────────────────────────────────
  currentUser: null,
  userPickedCity: false,

  // ── Budget ─────────────────────────────────────────────────────────────────
  expenses: [],
  tripBudgetData: null,

  // ── Passport ───────────────────────────────────────────────────────────────
  stamps: new Set(),

  // ── Street Quest ───────────────────────────────────────────────────────────
  streetQuestActive: false,
  streetQuestScore: 0,
  streetQuestLevel: 1,
  streetQuestHealth: 3,
  streetQuestCoins: 0,
  streetQuestShield: 0,
  streetQuestBoostUntil: 0,
  streetQuestItems: [],
  streetQuestHazards: [],
  streetQuestLayers: [],
  streetQuestDestinationReached: false,

  // ── UI State ───────────────────────────────────────────────────────────────
  isDark: true,
  voiceOn: false,
  notifTimers: [],

  // ── Personas & Trip Mode ───────────────────────────────────────────────────
  selectedPersonas: [],
  selectedTripMode: null,

  // ── Time Simulation ────────────────────────────────────────────────────────
  globalSimulationTime: null, // set on init
};

// Keep window-level references for compatibility with client-api.js
// and any external consumers during the migration period.
window.state = state;
