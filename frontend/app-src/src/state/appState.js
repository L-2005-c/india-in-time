/**
 * Shared app state — single source of truth for mutable UI/session data.
 * The remaining core orchestration still has legacy logic; this module is the
 * single source of truth for shared mutable UI/session state so further extraction
 * (chat, budget, nav, street-quest) can import state instead of closing over
 * a 5k-line file.
 *
 * Migration path: new modules read/write via `state.*`; legacy code in
 * core/app.js continues to use local lets until each domain is moved.
 */
export const state = {
  currentUser: null,
  currentCityName: 'India',
  currentCityId: 'india',
  LOCS: [],
  credits: 50,
  mdPlan: [],
  dayIdx: 0,
  itin: [],
  map: null,
  rLine: null,
  mkrs: [],
  liveMkr: null,
  cLat: null,
  cLon: null,
  tripActive: false,
  tripStart: null,
  userPickedCity: false,
  expenses: [],
  stamps: new Set(),
  isDark: true,
  voiceOn: false,
  autoFollowLive: true,
  streetQuestActive: false,
  streetQuestScore: 0,
  streetQuestHealth: 3,
  globalSimulationTime: null,
};

export function resetTripState() {
  state.mdPlan = [];
  state.dayIdx = 0;
  state.itin = [];
  state.tripActive = false;
  state.tripStart = null;
  state.expenses = [];
}

export function setCity(id, name, locs = []) {
  state.currentCityId = id;
  state.currentCityName = name;
  state.LOCS = locs;
  state.userPickedCity = true;
}

export function setUser(user) {
  state.currentUser = user;
}
export function setOnline(online) { state.isOnline = !!online; }
export function setLastError(err) { state.lastError = err ? { message: String(err.message||err), ts: Date.now() } : null; }
if (!('featureFlags' in state)) state.featureFlags = Object.create(null);
if (!('isOnline' in state)) state.isOnline = true;
if (!('lastError' in state)) state.lastError = null;
