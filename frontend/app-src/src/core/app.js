// frontend/app-src/src/core/app.js — Core Bootstrap & Dispatch Table Coordinator
// v5.2.2 Modularized Core
'use strict';

import { browserLogger } from '../utils/browser-logger.js';
import { installLeafletSafetyGuards } from './mapGuards.js';
import { openTravelDnaModal } from '../modules/travelDna.js';
import { createAuthSession } from '../modules/auth-session.js';
import { calculateStopBudget as _calculateStopBudget, calculateTripBudget as _calculateTripBudget } from '../modules/budget.js';
import { getTransportOptions as _getTransportOptionsMod, getTrafficLevel as _modTrafficLevel, getCrowdLevel as _modCrowdLevel, getCrowdMultiplier as _modCrowdMultiplier } from '../modules/transport.js';
import { escapeHtml, formatAiText } from '../utils/html-safe.js';
import { openSettings, closeSettings, clearLocalData, advanceOnboarding, skipOnboarding } from '../modules/settingsPanel.js';
import { addMsg as _addMsgMod } from '../modules/chatUi.js';
import { promptStopFeedback, rateStop, showAppFeedback, fbSetStar, fbSetCat, updateFbCounter, fbSkip, fbSubmit } from '../modules/feedback.js';
import { showToast as _showMicroToast } from '../modules/toastEngine.js';
import { getTimeBadgesHtml as _getTimeBadgesHtml } from '../utils/time-badges.js';
import { createGpsFixCoordinator } from '../utils/gps.js';
import { CITIES, getTransportConfig } from '../data/cities.js';
import { hvKm, m2t, t2m, fmtM } from '../utils/geo.js';
import { filterCommands, renderPaletteListHtml, PALETTE_COMMANDS } from '../modules/commandPalette.js';
import {
  auth,
  db,
  provider,
  signInWithPopup,
  onAuthStateChanged,
  fbSignOut,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from './firebase.js';

import { createChatController } from './chatController.js';
import { createCityController } from './cityController.js';
import { createMapController } from './mapController.js';
import { createItineraryRenderer } from './itineraryRenderer.js';
import { createTripController } from './tripController.js';

// Resolve window.API at call-time.
const API = new Proxy({}, {
  get(_t, prop) {
    const a = window.API;
    if (!a) {
      throw new Error("API not loaded — /client-api.js missing or failed (check Network tab)");
    }
    const v = a[prop];
    return typeof v === "function" ? v.bind(a) : v;
  },
});

let currentUser = null;
let resolveAuthChecked = () => {};
const authCheckedPromise = new Promise(resolve => { resolveAuthChecked = resolve; });

// App State
const appState = {
  currentCityName: 'India',
  currentCityId: 'india',
  LOCS: [],
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
  autoFollowLive: true,
  lastHeading: null,
  displayedLat: null,
  displayedLon: null,
  realTemp: 28,
  realWeatherMain: 'Clear',
  expenses: [],
  stamps: new Set(),
};

function getState() { return appState; }
function setState(updates) { Object.assign(appState, updates); }

function addMsg(html, isBot = true) { return _addMsgMod(html, isBot); }
function addTypingIndicator() {
  const container = document.getElementById('chat-msgs');
  const typing = document.createElement('div');
  typing.className = 'chat-msg bot typing';
  typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  if (container) container.appendChild(typing);
  return typing;
}

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-IN';
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  } catch (_e) {}
}

const _gpsCoord = createGpsFixCoordinator();
function waitForFirstGpsFix(timeoutMs) {
  return _gpsCoord.waitForFirst(timeoutMs, { lat: appState.cLat, lon: appState.cLon });
}

function initGPS() {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.watchPosition(pos => {
    if (!Number.isFinite(pos?.coords?.latitude) || !Number.isFinite(pos?.coords?.longitude)) return;
    appState.cLat = pos.coords.latitude;
    appState.cLon = pos.coords.longitude;
    _gpsCoord.notifyFix(appState.cLat, appState.cLon);
    const gpsTxt = document.getElementById('gps-txt');
    if (gpsTxt) gpsTxt.textContent = appState.cLat.toFixed(3);
    if (mapCtrl && mapCtrl.animateLiveMarkerTo) {
      mapCtrl.animateLiveMarkerTo(appState.cLat, appState.cLon);
    }
  }, err => {
    _gpsCoord.notifyError(err);
    const gpsTxt = document.getElementById('gps-txt');
    if (gpsTxt) gpsTxt.textContent = 'No GPS';
  }, { enableHighAccuracy: true, timeout: 15000 });
}

function updatePlannerShowcase() {
  const cityEl = document.getElementById('hero-city');
  const weatherEl = document.getElementById('hero-weather');
  const placesEl = document.getElementById('hero-places');
  if (cityEl) cityEl.textContent = appState.currentCityName || 'Select city';
  if (weatherEl) weatherEl.textContent = Number.isFinite(appState.realTemp) ? `${appState.realTemp} C` : '--';
  if (placesEl) placesEl.textContent = appState.LOCS.length ? `${appState.LOCS.length} loaded` : 'AI curating';
}

function fetchWeatherUI(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  // Populate sensible seasonal estimate immediately so UI is never stuck on --°C
  if (!Number.isFinite(appState.realTemp)) {
    const month = new Date().getMonth();
    const isSummer = month >= 3 && month <= 6;
    const isWinter = month >= 11 || month <= 1;
    appState.realTemp = isSummer ? 34 : (isWinter ? 22 : 28);
    appState.realWeatherMain = 'Clear';
    const disp = document.getElementById('wx-display');
    if (disp) disp.textContent = `⛅ ${appState.realTemp}°C`;
    updatePlannerShowcase();
  }

  API.fetchWeather(lat, lon).then(d => {
    if (d && (d.temp != null || d.tempC != null)) {
      appState.realTemp = d.temp ?? d.tempC;
      appState.realWeatherMain = d.main || 'Clear';
      const disp = document.getElementById('wx-display');
      if (disp) disp.textContent = d.display || `${d.emoji || '☀️'} ${appState.realTemp}°C`;
      updatePlannerShowcase();
    }
  }).catch(() => {});
}

function resetPlanUI() {
  appState.mdPlan = [];
  appState.itin = [];
  appState.dayIdx = 0;
  const list = document.getElementById('itin-list');
  if (list) list.innerHTML = '';
}

function setTripMinutes(totalMinutes) {
  const safe = Math.max(30, Math.min(24 * 60, parseInt(totalMinutes, 10) || 480));
  const hidden = document.getElementById('t-time');
  if (hidden) hidden.value = safe;
  return safe;
}

function syncPlannerTimeFields(_source) {
  const duration = parseInt(document.getElementById('t-time')?.value, 10) || 480;
  const startEl = document.getElementById('s-time');
  const endEl = document.getElementById('e-time');
  if (startEl && endEl) {
    const sMin = t2m(startEl.value || '09:00');
    endEl.value = m2t(sMin + duration);
  }
}

function renderRoute() {
  if (mapCtrl && mapCtrl.renderMapMarkers) mapCtrl.renderMapMarkers();
}

function applyBreakPlanToCurrentItinerary(stops) {
  return stops || [];
}

// Controller Instances
const sharedCtx = {
  API,
  getState,
  setState,
  addMsg,
  addTypingIndicator,
  speak,
  formatAiText,
  escapeHtml,
  t2m,
  m2t,
  hvKm,
  fmtM,
  fetchWeatherUI,
  resetPlanUI,
  updatePlannerShowcase,
  renderRoute,
  initGPS,
  waitForFirstGpsFix,
  getTimeBadgesHtml: _getTimeBadgesHtml,
  getTravelIntelPanelHtml: () => '',
  calculateStopBudget: (stop, prevCoords, cityId) => _calculateStopBudget(stop, prevCoords, cityId, { hvKm, getTransportConfig }),
  calculateTripBudget: (plan, cityId, startCoords) => _calculateTripBudget(plan, cityId, startCoords, { hvKm, getTransportConfig }),
  renderBudgetBreakdown: () => {},
  getTransportOptions: (fromCoords, toCoords, cityId, arriveMin) => _getTransportOptionsMod(fromCoords, toCoords, cityId, arriveMin),
  getTrafficLevel: (mult) => _modTrafficLevel(mult),
  getCrowdLevel: (mult) => _modCrowdLevel(mult),
  getCrowdMultiplier: (stop, dow, min) => _modCrowdMultiplier(stop, dow, min),
  getCityCenter: () => (CITIES[appState.currentCityId]?.lat ? [CITIES[appState.currentCityId].lat, CITIES[appState.currentCityId].lon] : null),
  sync: () => { if (appState.mdPlan.length > 0) appState.mdPlan[appState.dayIdx] = appState.itin; },
  applyBreakPlanToCurrentItinerary,
  syncPlannerTimeFields,
  setTripMinutes,
  resetTrimNotice: () => {},
  installLeafletSafetyGuards,
};

const chatCtrl = createChatController({ ...sharedCtx, switchToView: (v, i) => itinRenderer.switchToView(v, i) });
const cityCtrl = createCityController({ ...sharedCtx, switchToView: (v, i) => itinRenderer.switchToView(v, i), renderMapMarkers: () => mapCtrl.renderMapMarkers(), generatePlan: () => tripCtrl.generatePlan() });
const mapCtrl = createMapController(sharedCtx);
const itinRenderer = createItineraryRenderer(sharedCtx);
const tripCtrl = createTripController({ ...sharedCtx, switchToView: (v, i) => itinRenderer.switchToView(v, i), updateItinUI: () => itinRenderer.updateItinUI(), renderTabs: () => itinRenderer.renderTabs(), switchDay: (i) => itinRenderer.switchDay(i) });

let isDark = true;
function applyTheme(themeName) {
  const t = themeName || (isDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('tt_theme', t);
}
function toggleTheme() {
  isDark = !isDark;
  applyTheme(isDark ? 'dark' : 'light');
  _showMicroToast(isDark ? 'Obsidian Dark theme activated' : 'High-Contrast Light theme activated', { icon: isDark ? '🌙' : '☀️' });
}

const authSession = createAuthSession({
  auth, provider, signInWithPopup, onAuthStateChanged, signOut: fbSignOut, db,
  firestore: { doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp },
  getUser: () => currentUser,
  setUser: user => { currentUser = user; },
  getStamps: () => appState.stamps,
  setStamps: value => { appState.stamps = value; },
  getExpenses: () => appState.expenses,
  setExpenses: value => { appState.expenses = value; },
  resetTripData: () => { appState.mdPlan = []; appState.itin = []; },
  onAuthChecked: () => resolveAuthChecked(),
  addMessage: (m) => { if (m) addMsg(m); },
});
const { saveUserData, loadUserData: _loadUserData, signInWithGoogle, doSignOut, toggleUserMenu, continueAsGuest } = authSession;

function openLoadPanelFromMenu() { toggleUserMenu(); }
function openBudgetFromMenu() { itinRenderer.switchToView('tools-view', 3); chatCtrl.renderBudget(); toggleUserMenu(); }
function openPassportFromMenu() { itinRenderer.switchToView('tools-view', 3); chatCtrl.renderPassport(); toggleUserMenu(); }
function toggleLoadPanel() {}
function closeNotifToast() { const el = document.getElementById('notif-toast'); if (el) el.style.display = 'none'; }
function focusCitySelect() { cityCtrl.focusCitySelect(); }
function installPWA() {}

let paletteQuery = '';
let paletteSelectedIndex = 0;
let paletteFiltered = [];

function openCommandPalette() {
  const modal = document.getElementById('command-palette-modal');
  const input = document.getElementById('palette-search-input');
  if (!modal) return;
  modal.style.display = 'flex';
  paletteQuery = '';
  paletteSelectedIndex = 0;
  if (input) { input.value = ''; input.focus(); }
  updatePaletteUI();
}

function closeCommandPalette() {
  const modal = document.getElementById('command-palette-modal');
  if (modal) modal.style.display = 'none';
}

function closePaletteOverlay(e) {
  if (e && e.target && e.target.id === 'command-palette-modal') closeCommandPalette();
}

function updatePaletteUI() {
  const list = document.getElementById('palette-list');
  if (!list) return;
  paletteFiltered = filterCommands(paletteQuery);
  list.innerHTML = renderPaletteListHtml(paletteFiltered, paletteSelectedIndex);
}

function execPaletteCmd(btn) {
  const cmdId = btn?.dataset?.paletteId;
  const cmd = PALETTE_COMMANDS.find(c => c.id === cmdId);
  closeCommandPalette();
  if (cmd && cmd.actionKey && STATIC_ACTIONS[cmd.actionKey]) {
    STATIC_ACTIONS[cmd.actionKey](btn);
  }
}

// ── In-Chat Widget Actions Table ─────────────────────────────────────────────
const CHAT_ACTIONS = Object.create(null);
Object.assign(CHAT_ACTIONS, {
  fbSetStar, fbSetCat, fbSubmit, fbSkip,
  rateStopClick: (btn) => { const n = btn?.dataset?.name; if (n) rateStop({ name: n }); },
  runReplannerClick: () => tripCtrl.smartExtend(),
});

// ── Static DOM Actions Dispatch Table ────────────────────────────────────────
const STATIC_ACTIONS = {
  addNearby: () => tripCtrl.addNearby(),
  aiSuggestAlternative: (btn) => chatCtrl.aiSuggestAlternative(btn?.dataset?.name || ''),
  applyCustomPlaces: () => cityCtrl.applyCustomPlaces(),
  closeAiDrawer: () => chatCtrl.closeAiDrawer(),
  closeCustomizeModal: () => cityCtrl.closeCustomizeModal(),
  closeNotifToast,
  compassTap: () => mapCtrl.compassTap(),
  doSignOut,
  focusCitySelect,
  generatePlan: () => tripCtrl.generatePlan(),
  goBack: () => itinRenderer.goBack(),
  handleChat: () => chatCtrl.handleChat(),
  installPWA,
  locateMe: () => cityCtrl.locateMe(),
  openAiDrawer: () => chatCtrl.openAiDrawer(),
  openBudgetFromMenu,
  openCustomizeModal: () => cityCtrl.openCustomizeModal(),
  openLoadPanelFromMenu,
  openPassportFromMenu,
  openTravelDnaModal,
  optimizeRoute: () => tripCtrl.optimizeRoute(),
  resetGPS: () => cityCtrl.resetGPS(),
  saveIt: () => tripCtrl.saveIt(),
  searchCity: () => cityCtrl.searchCity(),
  shareIt: () => tripCtrl.shareIt(),
  showAppFeedback,
  skipStop: () => tripCtrl.skipStop(),
  smartExtend: () => tripCtrl.smartExtend(),
  startTrip: () => tripCtrl.startTrip(),
  startVoiceInput: () => chatCtrl.startVoiceInput(),
  toggleLiveFollow: (btn) => mapCtrl.toggleLiveFollow(btn),
  toggleLoadPanel,
  toggleNavCardCollapsed: (btn) => mapCtrl.toggleNavCardCollapsed(btn),
  toggleStreetQuest: (btn) => mapCtrl.toggleStreetQuest && mapCtrl.toggleStreetQuest(btn),
  toggleUserMenu,
  toggleVoice: () => chatCtrl.toggleVoice(),
  waShare: () => tripCtrl.waShare(),
  openOfflinePass: () => tripCtrl.openOfflinePass(),
  closeOfflinePassModal: () => tripCtrl.closeOfflinePassModal(),
  shareWhatsAppPass: () => tripCtrl.shareWhatsAppPass(),
  pivotMonsoonMode: () => tripCtrl.pivotMonsoonMode(),
  pivotHeatEscapeMode: () => tripCtrl.pivotHeatEscapeMode(),
  printPass: () => window.print(),
  openCommandPalette,
  closeCommandPalette,
  closePaletteOverlay,
  execPaletteCmd,
  toggleTheme,
  switchCity: (btn) => cityCtrl.switchCity(btn?.value || btn?.dataset?.city || btn?.dataset?.arg),
  continueAsGuest,
  openSettings,
  closeSettings,
  clearLocalData,
  advanceOnboarding,
  skipOnboarding,
  renderToolsHome: () => chatCtrl.renderToolsHome(),
  renderLingo: () => chatCtrl.renderLingo(),
  renderSafety: () => chatCtrl.renderSafety(),
  renderBudget: () => chatCtrl.renderBudget(),
  renderPassport: () => chatCtrl.renderPassport(),
  prepGuide: () => chatCtrl.prepGuide(),
  postcard: () => chatCtrl.postcard(),
  getInstaSpots: () => chatCtrl.getInstaSpots(),
  getSouvenirGuide: () => chatCtrl.getSouvenirGuide(),
  showTripRating: () => chatCtrl.showTripRating(),
  showReplanner: () => chatCtrl.showReplanner(),
  showWeatherAlerts: () => chatCtrl.showWeatherAlerts(),
  generateTripPDF: () => chatCtrl.generateTripPDF(),
  setupNotifications: () => chatCtrl.setupNotifications(),
  showFestivalRadar: () => chatCtrl.showFestivalRadar(),
  showHiddenGems: () => chatCtrl.showHiddenGems(),
  showHartaalAlert: () => chatCtrl.showHartaalAlert(),
  showCrowdPredictor: () => chatCtrl.showCrowdPredictor(),
  showFareNegotiator: () => chatCtrl.showFareNegotiator(),
  showTripTribe: () => chatCtrl.showTripTribe(),
  shareEmergency: () => tripCtrl.shareEmergency(),
  addExpense: () => chatCtrl.addExpense(),
  analyzeBudget: () => chatCtrl.analyzeBudget(),
  selectAllCustomPlaces: (btn) => cityCtrl.selectAllCustomPlaces(btn.dataset.arg === 'true'),
  switchToView: (btn) => itinRenderer.switchToView(btn.dataset.view, Number(btn.dataset.idx)),
  signInWithGoogle: (btn) => signInWithGoogle({ currentTarget: btn }),
  delExp: (btn) => chatCtrl.delExp(Number(btn.dataset.id)),
  delPlan: (btn) => tripCtrl.delPlan(btn.dataset.id),
  loadCloudPlan: (btn) => tripCtrl.loadCloudPlan(btn),
  loadPlan: (btn) => tripCtrl.loadPlan(btn.dataset.plan),
  speak: (btn) => speak(btn.dataset.text || ''),
  chatAbout: (btn) => { if (btn.dataset.name) chatCtrl.chatAbout(btn.dataset.name); },
  aiFoodCard: (btn) => chatCtrl.aiFoodCard(btn.dataset.name || '', btn.dataset.cat || ''),
  clickFileInput: (btn) => {
    const id = btn.dataset.inputId;
    const el = id && document.getElementById(id);
    if (el) el.click();
  },
  drawerRun: (btn) => {
    chatCtrl.closeAiDrawer();
    const name = btn.dataset.run;
    const fn = name && (STATIC_ACTIONS[name] || (typeof window[name] === 'function' ? window[name] : null));
    if (typeof fn === 'function') setTimeout(() => fn(btn), 50);
  },
  drawerFile: (btn) => {
    chatCtrl.closeAiDrawer();
    const id = btn.dataset.inputId;
    setTimeout(() => {
      const el = id && document.getElementById(id);
      if (el) el.click();
    }, 350);
  },
};

// Expose legacy event bridge
Object.assign(window, {
  STATIC_ACTIONS,
  CHAT_ACTIONS,
  saveUserData,
  signInWithGoogle,
  doSignOut,
  toggleUserMenu,
  continueAsGuest,
});

// ── Event Delegation Listeners ───────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const fn = CHAT_ACTIONS[btn.dataset.action] || STATIC_ACTIONS[btn.dataset.action];
  if (fn) fn(btn);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('[role="button"][data-action]');
  if (!el) return;
  e.preventDefault();
  const fn = CHAT_ACTIONS[el.dataset.action] || STATIC_ACTIONS[el.dataset.action];
  if (fn) fn(el);
});

// Dynamic template references for static actions scanner:
// data-action="closeOfflinePassModal"

// Universal Command Palette ⌘K listener
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const modal = document.getElementById('command-palette-modal');
    if (modal && modal.style.display !== 'none') closeCommandPalette();
    else openCommandPalette();
  }
});

// App Boot
window.onload = () => {
  applyTheme();
  Promise.race([authCheckedPromise, new Promise(res => setTimeout(res, 4000))])
    .then(() => new Promise(res => setTimeout(res, 500)))
    .then(() => {
      const s = document.getElementById('splash');
      if (s) { s.style.opacity = '0'; setTimeout(() => s.style.display = 'none', 300); }
    });
  if (mapCtrl && mapCtrl.initMap) {
    mapCtrl.initMap();
  }
  initGPS();
  cityCtrl.switchCity('visakhapatnam', true);
  fetchWeatherUI(17.6868, 83.2185);
};

export {
  appState,
  STATIC_ACTIONS,
  CHAT_ACTIONS,
};

