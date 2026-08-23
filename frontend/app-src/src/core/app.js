import { browserLogger } from '../utils/browser-logger.js';
import { openModal, closeModal } from '../a11y/modal.js';
import {
  createAuthSession,
} from '../modules/auth-session.js';
import {
  calculateStopBudget as _calculateStopBudget,
  calculateDayBudget as _calculateDayBudget,
  calculateTripBudget as _calculateTripBudget,
  renderBudgetBreakdownHTML as _renderBudgetBreakdownHTML,
} from '../modules/budget.js';
import {
  getRouteStopsForDay as _getRouteStopsForDay,
  createBreakStop as _createBreakStop,
  estimateStopLoadMinutes as _estimateStopLoadMinutes,
} from '../modules/planner.js';

import {
  getTransportOptions as _getTransportOptionsMod,
  getTrafficMultiplierForCity as _getTrafficMultiplierForCity,
  getSmartTravelTimeForCity as _getSmartTravelTimeForCity,
  getTrafficLevel as _modTrafficLevel,
  getCrowdLevel as _modCrowdLevel,
  getCrowdMultiplier as _modCrowdMultiplier,
  getSmartVisitTime as _modSmartVisitTime,
} from '../modules/transport.js';
import { buildTimeAwareDay as _buildTimeAwareDayMod } from '../modules/timeAwarePlanner.js';
import { createStreetQuest } from '../modules/streetQuest.js';
import {
  escapeHtml as _escapeHtml,
  sanitizeChatHtml as _sanitizeChatHtml,
  formatAiText as _formatAiText,
} from '../utils/html-safe.js';
import { showToast as _showToastMod } from '../modules/notifications.js';
import {
  openSettings, closeSettings, clearLocalData,
  maybeShowOnboarding, advanceOnboarding, skipOnboarding,
} from '../modules/settingsPanel.js';
import { addMsg as _addMsgMod } from '../modules/chatUi.js';
import {
  promptStopFeedback as _promptStopFeedbackMod,
  rateStop as _rateStopMod,
  showAppFeedback as _showAppFeedbackMod,
  fbSetStar as _fbSetStarMod,
  fbSetCat as _fbSetCatMod,
  updateFbCounter as _updateFbCounterMod,
  fbSkip as _fbSkipMod,
  fbSubmit as _fbSubmitMod,
} from '../modules/feedback.js';
import {
  readLocalPlans as _readLocalPlansMod,
  writeLocalPlans as _writeLocalPlansMod,
  savePlan as _savePlanMod,
  deletePlan as _deletePlanMod,
  renderSavedPlansListUI as _renderSavedPlansListUIMod,
  shareTripText as _shareTripTextMod,
  shareTripWhatsApp as _shareTripWhatsAppMod,
  shareTripEmergency as _shareTripEmergencyMod,
} from '../modules/savedPlans.js';
import {
  generateWhatsAppShareText as _genWhatsAppText,
  buildOfflineTravelPassHtml as _buildOfflinePassHtml,
} from '../modules/offlineTravelPass.js';
import {
  filterCommands,
  renderPaletteListHtml,
  PALETTE_COMMANDS,
} from '../modules/commandPalette.js';
import { showToast as _showMicroToast } from '../modules/toastEngine.js';
import {
  startVoiceInput as _startVoiceInputMod,
  handleCaption as _handleCaptionMod,
  handleTranslate as _handleTranslateMod,
} from '../modules/aiMedia.js';

import {
  getDaypartClient as _getDaypartClient,
  getOpeningStatusPure as _getOpeningStatusPure,
  getCrowdPredictionPure as _getCrowdPredictionPure,
  calculateExperienceScorePure as _calculateExperienceScorePure,
} from '../utils/experience-score.js';
import {
  isPlausibleGpsFix as _isPlausibleGpsFix,
  createGpsFixCoordinator as _createGpsFixCoordinator,
} from '../utils/gps.js';
import {
  closestPointOnSegment as _closestPointOnSegment,
  snapToRoute as _snapToRoute,
  turnArrowForInstruction as _turnArrowForInstruction,
  shouldSpeakNavInstruction as _shouldSpeakNavInstruction,
} from '../utils/nav-route.js';
import {
  shouldRetryWeather as _shouldRetryWeather,
  weatherRetryDelayMs as _weatherRetryDelayMs,
  detectWeatherChange as _detectWeatherChange,
} from '../utils/weather-ui.js';
import {
  CITIES,
  getHiddenGems,
  getTransportConfig,
  getLocalPlaces,
} from '../data/cities.js';
import {
  normalizeFetchedPlaces as _normalizeFetchedPlaces,
  pickNearestCityId as _pickNearestCityId,
} from '../utils/city-load.js';
import {
  hvKm,
  hasValidCoords,
  withHiddenGems as _geoWithHiddenGems,
  mergePlacePools as _geoMergePools,
  sortNearestNeighbor as _geoSortNN,
  routeDistanceKm as _geoRouteKm,
  centroidOfStops as _geoCentroid,
  clusterStopsByArea as _geoCluster,
  orderStopsAreaWise as _geoOrderArea,
  estimateTimeFitPenaltyKm as _geoTimeFit,
  optimizeStopOrder as _geoOptimize,
  bearingBetween as _geoBearing,
  keepNearbyCluster as _geoKeepNearby,
  famousPlaceScore as _geoFamous,
  prioritizePlanStops as _geoPrioritize,
  getRouteStopsForDay as _geoRouteStops,
  estimateStopLoadMinutes as _geoLoadMins,
  normalizeLatLon as _geoNormalizeLatLon,
} from '../utils/geo.js';
import {
  dayPartForMinutes as _dayPartForMinutes,
  stopTimeScore as _stopTimeScore,
  stopClimateNote as _stopClimateNote,
} from '../utils/stop-scoring.js';
import {
  getSunTimesClient as _getSunTimesClient,
  placeSunTimes as _placeSunTimes,
} from '../utils/sun-times.js';
import { getTimeBadgesHtml as _getTimeBadgesHtml } from '../utils/time-badges.js';
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
// Resolve window.API at call-time. Capturing `const API = window.API` at module
// init freezes `undefined` if client-api.js failed or ordered after the bundle.
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

// Firebase initialization is isolated in core/firebase.js.

// ── Expose functions to HTML onclick ─────────────────────────────────────────

// ── Transport & Traffic Intelligence ──────────────────────────────────────────
// ── Transport (modules/transport.js) ──────────────────────────────────────────
function getTrafficLevel(multiplier){ return _modTrafficLevel(multiplier); }
function getCrowdMultiplier(stop, dayOfWeek, minuteOfDay){
  return _modCrowdMultiplier(stop, dayOfWeek, minuteOfDay);
}
function getCrowdLevel(multiplier){ return _modCrowdLevel(multiplier); }
function getSmartTravelTime(fromCoords, toCoords, cityId, arriveMin, isFirstStop){
  return _getSmartTravelTimeForCity(fromCoords, toCoords, cityId, arriveMin, isFirstStop);
}
function getSmartVisitTime(stop, arriveMin, dayOfWeek){
  return _modSmartVisitTime(stop, arriveMin, dayOfWeek);
}
function getTransportOptions(fromCoords, toCoords, cityId, arriveMin){
  return _getTransportOptionsMod(fromCoords, toCoords, cityId, arriveMin);
}

// ── Budget Calculator ─────────────────────────────────────────────────────────
let tripBudgetData = null;
function calculateStopBudget(stop, prevCoords, cityId){
  return _calculateStopBudget(stop, prevCoords, cityId, { hvKm, getTransportConfig });
}
function calculateTripBudget(plan, cityId, startCoords){
  return _calculateTripBudget(plan, cityId, startCoords, { hvKm, getTransportConfig });
}

function renderBudgetBreakdown(){
  const el = document.getElementById('budget-breakdown');
  if(!el || !tripBudgetData) { if(el) el.style.display='none'; return; }
  el.style.display='block';
  const userBudget = parseFloat(document.getElementById('trip-budget-input')?.value) || 0;
  el.innerHTML = _renderBudgetBreakdownHTML(tripBudgetData, dayIdx, userBudget);
}

// Explicit auth/session state. These must be initialized before the
// authentication module is constructed; relying on legacy globals caused
// production Vite temporal-dead-zone failures.
let currentUser = null;
let resolveAuthChecked = () => {};
const authCheckedPromise = new Promise(resolve => {
  resolveAuthChecked = resolve;
});

// ── App State ─────────────────────────────────────────────────────────────────
let currentCityName='India',currentCityId='india',LOCS=[];
const credits=50;
let mdPlan=[],dayIdx=0,itin=[];
let map,rLine,mkrs=[],liveMkr=null;

// …
function isFiniteLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

let cLat=null,cLon=null,tripActive=false,tripStart=null;
// Set once the user manually picks a city (search box or dropdown), so the
// background auto-detect/fallback logic below never overwrites their choice.
let userPickedCity=false;

// ── Shared GPS-fix coordination ──────────────────────────────────────────────
// Previously, detectAndLoadCity() (below) issued its own independent
// …
const _gpsCoord = _createGpsFixCoordinator();
function notifyGpsFix(lat, lon) { _gpsCoord.notifyFix(lat, lon); }
function notifyGpsError(err) { _gpsCoord.notifyError(err); }
function waitForFirstGpsFix(timeoutMs) {
  return _gpsCoord.waitForFirst(timeoutMs, { lat: cLat, lon: cLon });
}
let nsDist='--',nsEta='--',realTemp=28,realWeatherMain='Clear',wid=null,voiceOn=false;
// Tracks where/when the route line was last drawn from, so the live-tracking
// polyline can be refreshed as the user moves (see initGPS()) instead of
// staying frozen at the very first GPS fix of the trip.
let lastRouteRenderPos=null,lastRouteRenderAt=0;
let expenses=[],stamps=new Set();
let isDark=true; // forced dark mode
let notifTimers=[];
let autoFollowLive=true;
let streetQuestActive=false;
let streetQuestScore=0;
let streetQuestHealth=3;
let streetQuestCoins=0;
let streetQuestLevel=1;
const _streetQuestShield=0;
const _streetQuestBoostUntil=0;
let streetQuestItems=[];
let streetQuestHazards=[];
let streetQuestDestinationReached=false;
let streetQuestLayers=[];
let navVoiceEnabled=true;
let lastSpokenNavInstruction='';
let lastSpokenAt=0;
let lastHeading=null;
let lastHeadingSample=null;
// ── Live-nav marker smoothing/accuracy state ─────────────────────────────
// displayedLat/displayedLon: where the marker is actually drawn right now —
// kept separate from cLat/cLon (the raw last-accepted GPS fix) so the
// marker can be animated smoothly toward each new fix instead of teleporting
// the instant a new coordinate arrives. See animateLiveMarkerTo().
let displayedLat=null, displayedLon=null, markerAnimFrame=null;
// Last fix actually accepted into cLat/cLon (post-filtering), used by
// isPlausibleGpsFix() below to reject spurious/noisy fixes.
let lastAcceptedFix=null, lastAcceptedFixAt=0;
const placeCache=new Map();
const placeLoadPromises=new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
const t2m=(s,fallback=0)=>{
  const raw=String(s||'').trim(); if(!raw) return fallback;
  const ampm=raw.match(/\b(am|pm)\b/i);
  const parts=raw.replace(/\s*(am|pm)\s*/i,'').split(':');
  let h=Number(parts[0]); const m=Number(parts[1]||0);
  if(!Number.isFinite(h)||!Number.isFinite(m)) return fallback;
  if(ampm){ h=h%12; if(/pm/i.test(ampm[1])) h+=12; }
  return Math.max(0,Math.min(23,h))*60+Math.max(0,Math.min(59,m));
};
const fmtM=m=>{if(!m||isNaN(m))return'0m';const a=Math.abs(m);return a<60?`${a}m`:`${Math.floor(a/60)}h${a%60?` ${a%60}m`:''}`;};
const sync=()=>{if(mdPlan.length>0)mdPlan[dayIdx]=itin;};
// …

// ── Global Leaflet safety net ───────────────────────────────────────────────
// hasValidCoords() above fixed the call sites we could find (renderMapMarkers,
// …
const m2t=m=>{const safe=((m%(24*60))+(24*60))%(24*60);const hh=String(Math.floor(safe/60)).padStart(2,'0');const mm=String(safe%60).padStart(2,'0');return `${hh}:${mm}`;};

// --- TIME BASED BEHAVIOUR HELPERS ---
function getCurrentLocalMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// …
function placeSunTimes(loc, date = new Date()) {
  return _placeSunTimes(loc, date);
}

function onTimeSliderChange(_val) {
  // Time Simulator UI removed — always use real local clock minutes
  try {
    const now = new Date();
    window.globalSimulationTime = now.getHours() * 60 + now.getMinutes();
  } catch (_e) {
    window.globalSimulationTime = 12 * 60;
  }
}

// Time Simulator removed — seed simulation time from real clock
try {
  const _n = new Date();
  window.globalSimulationTime = _n.getHours() * 60 + _n.getMinutes();
} catch (_e) {
  window.globalSimulationTime = 12 * 60;
}

function calculateExperienceScore(loc, simTime = window.globalSimulationTime) {
  const sun = placeSunTimes(loc);
  const ctx = {
    sunriseMin: sun.sunriseMin,
    sunsetMin: sun.sunsetMin,
    tempC: typeof realTemp !== 'undefined' ? realTemp : null,
    weatherMain: typeof realWeatherMain !== 'undefined' ? realWeatherMain : '',
    windKph: (typeof window !== 'undefined' && window.realWind) || 0,
    isWeekend: [0, 6].includes(new Date().getDay()),
  };
  const pure = _calculateExperienceScorePure(loc, simTime, ctx);
  return pure;
}

function getCrowdPrediction(loc, evalTime) {
  const now = evalTime !== undefined ? evalTime : getCurrentLocalMin();
  const isWeekend = [0, 6].includes(new Date().getDay());
  const { sunsetMin } = placeSunTimes(loc);
  return _getCrowdPredictionPure(loc, now, { isWeekend, sunsetMin });
}
function getPlaceDynamicStatus(loc, evalTime) {
  const now = evalTime !== undefined ? evalTime : getCurrentLocalMin();
  return _getOpeningStatusPure(loc, now);
}

function getTimeBadgesHtml(loc, evalTime) {
  return _getTimeBadgesHtml(loc, evalTime, {
    getPlaceDynamicStatus,
    getCrowdPrediction,
    calculateExperienceScore,
    placeSunTimes,
    realTemp: typeof realTemp !== 'undefined' ? realTemp : null,
    realWeatherMain: typeof realWeatherMain !== 'undefined' ? realWeatherMain : '',
    realWind: (typeof window !== 'undefined' && window.realWind) || 0,
    nowMin: getCurrentLocalMin(),
  });
}

function getTravelIntelPanelHtml(loc) {
  const ti = loc && loc._ti;
  if (!ti || ti.visitScore == null) return '';
  const why = (ti.explanation && ti.explanation.bullets) ? ti.explanation.bullets.slice(0, 4).map(b => {
    const icon = b.type === 'positive' ? '✓' : b.type === 'caution' ? '!' : '·';
    return `${icon} ${b.text}`;
  }).join('<br>') : (ti.explanation && ti.explanation.summary) || '';
  const depart = ti.arrival && ti.arrival.recommendedDeparture ? ti.arrival.recommendedDeparture : '';
  return `<div class="ti-panel" style="margin-top:8px;padding:10px;border-radius:10px;border:1px solid var(--border-subtle,#333);background:var(--bg-layer2,#1a1a1a);font-size:11px;line-height:1.4;">
    <div style="font-weight:600;margin-bottom:4px;">Travel Intelligence · ⭐ ${ti.visitScore}/100 ${ti.visitLabel||''}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;opacity:.9;">
      <span>👥 ${ti.crowdLevel||ti.crowd?.level||'—'}</span>
      <span>🌦 ${ti.weather?.suitability||'—'}</span>
      <span>🚗 ${ti.traffic?.trafficLevel||'—'}</span>
      <span>🌅 ${ti.scenic?.suitability||'—'}</span>
    </div>
    ${why ? `<div style="margin-top:6px;opacity:.85;">${why}</div>` : ''}
    ${depart ? `<div style="margin-top:6px;">Leave ~<strong>${depart}</strong></div>` : ''}
  </div>`;
}

// ── Real-time notifications (spec §7): "closes in 45 minutes", "golden
// hour starts in 25 minutes", "heavy crowd expected after 6 PM" — checked
// once a minute against whatever is currently on the plan/route, and only
// surfaced once per stop so the chat isn't spammed on every tick.
window._tiNotified = window._tiNotified || new Set();
function checkTimeIntelNotifications(){
  try{
    const stops = (typeof itin !== 'undefined' && itin && itin.length) ? itin.filter(s=>!s.isBreak) : [];
    if(!stops.length || typeof addMsg !== 'function') return;
    const now = getCurrentLocalMin();
    stops.forEach(loc=>{
      const ct = t2m(loc.ct || '23:00');
      const minsToClose = ct - now;
      const closeKey = `close-${loc.id}`;
      if(minsToClose > 0 && minsToClose <= 45 && !window._tiNotified.has(closeKey)){
        window._tiNotified.add(closeKey);
        addMsg(`🟡 <strong>${loc.name}</strong> closes in ${minsToClose} minutes.`);
      }
      if(loc.is_sunset_spot){
        const sunsetMin = 18*60; // approx local sunset; refined by realSunsetMin when available
        const target = (typeof realSunsetMin === 'number') ? realSunsetMin : sunsetMin;
        const minsToSunset = target - now;
        const goldenKey = `golden-${loc.id}`;
        if(minsToSunset > 0 && minsToSunset <= 25 && !window._tiNotified.has(goldenKey)){
          window._tiNotified.add(goldenKey);
          addMsg(`🌇 Golden hour starts in ${minsToSunset} minutes near <strong>${loc.name}</strong>.`);
        }
      }
      const crowd = getCrowdPrediction(loc, now);
      const crowdKey = `crowd-${loc.id}`;
      if((crowd === 'High' || crowd === 'Very High') && !window._tiNotified.has(crowdKey)){
        window._tiNotified.add(crowdKey);
        addMsg(`👥 Heavy crowd expected at <strong>${loc.name}</strong> right now.`);
      }
    });
  }catch(_e){}
}
setInterval(checkTimeIntelNotifications, 60000);

function getTripMinutes(){return Math.max(30,parseInt(document.getElementById('t-time')?.value,10)||600);}
function getBreakEveryMinutes(){return Math.max(0,parseInt(document.getElementById('break-every')?.value,10)||0);}
function getBreakDurationMinutes(){return Math.max(0,parseInt(document.getElementById('break-duration')?.value,10)||0);}
function getWaterReminderMinutes(){return Math.max(0,parseInt(document.getElementById('water-every')?.value,10)||0);}
function setTripMinutes(totalMinutes){
  const safe=Math.max(30,Math.min(24*60,parseInt(totalMinutes,10)||600));
  const hrs=document.getElementById('t-hours');
  const mins=document.getElementById('t-minutes');
  const hidden=document.getElementById('t-time');
  if(hidden) hidden.value=safe;
  if(hrs) hrs.value=Math.floor(safe/60);
  if(mins) mins.value=safe%60;
  return safe;
}
function syncPlannerTimeFields(source='duration'){
  const startEl=document.getElementById('s-time');
  const endEl=document.getElementById('e-time');
  const hourEl=document.getElementById('t-hours');
  const minuteEl=document.getElementById('t-minutes');
  const hidden=document.getElementById('t-time');
  if(!startEl||!endEl||!hourEl||!minuteEl||!hidden) return;
  if(source==='start'||source==='end'){
    const diff=((t2m(endEl.value||'19:00',19*60)-t2m(startEl.value||'09:00',9*60))+(24*60))%(24*60);
    const duration=setTripMinutes(diff||24*60);
    hidden.value=duration;
  }else{
    const rawHours=Math.max(0,parseInt(hourEl.value,10)||0);
    const rawMinutes=Math.max(0,parseInt(minuteEl.value,10)||0);
    const normalized=setTripMinutes((rawHours*60)+rawMinutes);
    hidden.value=normalized;
    endEl.value=m2t(t2m(startEl.value||'09:00',9*60)+normalized);
  }
}
function createBreakStop(anchorStop,index,duration){
  const coords=Array.isArray(anchorStop?.coords)?[...anchorStop.coords]:[CITIES[currentCityId]?.lat||20.5937,CITIES[currentCityId]?.lon||78.9629];
  return {
    id:`break-${dayIdx}-${index}-${duration}`,
    name:'Take a Break',
    cat:'break',
    coords,
    tt:0,
    vt:duration,
    ot:'00:00',
    ct:'23:59',
    slotLabel:'Recovery pause',
    climateNote:`${fmtM(duration)} to reset, hydrate, and breathe`,
    isBreak:true,
  };
}
function applyBreakPlanToCurrentItinerary(baseStops){
  const routeStops=(baseStops||getRouteStopsForDay(itin)).filter(s=>!s?.isBreak).map(stop=>({ ...stop }));
  const breakEvery=getBreakEveryMinutes(), breakDuration=getBreakDurationMinutes();
  if(!breakEvery || !breakDuration) return routeStops;
  const rebuilt=[]; let activeSinceBreak=0;
  routeStops.forEach(stop=>{
    const travel=Math.max(0,parseInt(stop.tt,10)||0), visit=Math.max(15,parseInt(stop.vt,10)||45);
    if(rebuilt.length && activeSinceBreak>0 && activeSinceBreak+travel+visit>breakEvery){
      rebuilt.push(createBreakStop(rebuilt[rebuilt.length-1], rebuilt.length, breakDuration));
      activeSinceBreak=0;
    }
    rebuilt.push(stop); activeSinceBreak += travel+visit;
  });
  return rebuilt;
}
function getCityCenter(){
  const city=CITIES[currentCityId];
  if(city?.lat&&city?.lon) return [city.lat,city.lon];
  return null;
}
function getRouteStart(){
  if(cLat&&cLon) return [cLat,cLon];
  return getCityCenter();
}

function getPreviewRouteStart(){
  // Only trust live GPS as the route start once a trip is actually live —
// …
  if (tripActive && cLat && cLon) return [cLat, cLon];
  return getCityCenter() || ((cLat && cLon) ? [cLat, cLon] : null);
}

function withHiddenGems(cityId, list){ return _geoWithHiddenGems(list, getHiddenGems(cityId)); }
function mergePlacePools(...pools){ return _geoMergePools(...pools); }
function _sortNearestNeighbor(arr,sLat,sLon){ return _geoSortNN(arr,sLat,sLon); }
function _routeDistanceKm(stops,start){ return _geoRouteKm(stops,start); }
function _centroidOfStops(stops){ return _geoCentroid(stops); }
function _clusterStopsByArea(stops){ return _geoCluster(stops); }
function _orderStopsAreaWise(stops,start){ return _geoOrderArea(stops,start); }
function _estimateTimeFitPenaltyKm(stops, start) { return _geoTimeFit(stops, start); }
function optimizeStopOrder(stops,start){ return _geoOptimize(stops,start); }
function bearingBetween(from,to){ return _geoBearing(from,to); }
function keepNearbyCluster(stops,start,maxRadiusKm=6){ return _geoKeepNearby(stops,start,maxRadiusKm); }
function _famousPlaceScore(stop,start){ return _geoFamous(stop,start); }
function prioritizePlanStops(stops,start,prefs=[]){ return _geoPrioritize(stops,start,prefs); }
function getRouteStopsForDay(dayStops){ return _geoRouteStops(dayStops); }
function estimateStopLoadMinutes(stops){ return _geoLoadMins(stops); }
function normalizeLatLon(coords){ return _geoNormalizeLatLon(coords); }

function updateFollowButton(){
  const btn=document.getElementById('btn-follow-live');
  if(!btn) return;
  btn.textContent=autoFollowLive?'🎯 Following':'🧭 Follow Me';
  btn.style.opacity=autoFollowLive?'1':'0.85';
}

// Minimize/expand the floating live-navigation card. On phones it can cover
// close to half the map, so let the user shrink it down to just the top
// badge/weather row and bring it back with the same tap.
const NAV_CARD_COLLAPSED_KEY='iit_nav_card_collapsed';
function toggleNavCardCollapsed(forceState){
  const card=document.getElementById('nav-card');
  const btn=document.getElementById('nav-card-collapse-btn');
  if(!card) return;
  const collapsed=typeof forceState==='boolean' ? forceState : !card.classList.contains('collapsed');
  card.classList.toggle('collapsed',collapsed);
  if(btn){
    btn.textContent=collapsed?'▸':'▾';
    btn.setAttribute('aria-label',collapsed?'Expand live navigation':'Minimize live navigation');
  }
  try{ localStorage.setItem(NAV_CARD_COLLAPSED_KEY, collapsed?'1':'0'); }catch(_e){}
}
// Exposed for compatibility with the browser action bridge and debugging.
window.toggleNavCardCollapsed=toggleNavCardCollapsed;
function restoreNavCardCollapsed(){
  let wasCollapsed=false;
  try{ wasCollapsed=localStorage.getItem(NAV_CARD_COLLAPSED_KEY)==='1'; }catch(_e){}
  if(wasCollapsed) toggleNavCardCollapsed(true);
}

function followLivePosition(force=false){
  if(!map||!isFiniteLatLon(cLat,cLon)) return;
  if(!force && (!tripActive || !autoFollowLive)) return;
  const rawZ=map.getZoom(), zoom=Math.max(Number.isFinite(rawZ)?rawZ:14,15);
  if(!Number.isFinite(zoom)) return;
  let tLat=cLat, tLon=cLon;
  if(tripActive){
    try{
      const pt=map.project([cLat,cLon],zoom);
      if(Number.isFinite(pt?.x)&&Number.isFinite(pt?.y)){
        const u=map.unproject(L.point(pt.x,pt.y+110),zoom);
        if(isFiniteLatLon(u.lat,u.lng)){ tLat=u.lat; tLon=u.lng; }
      }
    }catch(_e){}
  }
  if(!isFiniteLatLon(tLat,tLon)) return;
  const cur=map.getCenter();
  if(cur && isFiniteLatLon(cur.lat,cur.lng) && map.distance(cur,[tLat,tLon])<3) return;
  try{ map.stop(); }catch(_e){}
  // Prefer setView during live nav — flyTo can throw Invalid LatLng mid-animation on some Leaflet builds
  try{ map.setView([tLat,tLon],zoom,{animate:true}); }
  catch(_e){ try{ map.setView([cLat,cLon],zoom); }catch(_e2){} }
}

function toggleLiveFollow(forceState){
  autoFollowLive=typeof forceState==='boolean' ? forceState : !autoFollowLive;
  updateFollowButton();
  if(autoFollowLive) followLivePosition(true);
}

function applyMapHeadingRotation(){
  // Rotating Leaflet's map pane can blank the tile layer because Leaflet uses
  // the same transform for its own positioning. Keep heading on the player
  // marker only and leave the map tiles unrotated.
}

function updateLiveMarkerHeading(){
  if(!liveMkr || lastHeading==null) return;
  const icon=liveMkr.getElement()?.firstElementChild;
  if(icon){
    icon.style.transform=`rotate(${lastHeading}deg)`;
    icon.style.transition='transform .35s ease';
  }
  const needle=document.getElementById('compass-needle');
  if(needle) needle.style.transform=`rotate(${lastHeading}deg)`;
}

function deriveHeading(pos){
  const raw=pos?.coords?.heading;
  if(Number.isFinite(raw) && raw>=0) return raw;
  const next=[pos.coords.latitude,pos.coords.longitude];
  if(lastHeadingSample){
    const moved=hvKm(lastHeadingSample[0],lastHeadingSample[1],next[0],next[1]);
    if(moved>0.015) return bearingBetween(lastHeadingSample,next);
  }
  return lastHeading;
}

// ── GPS fix quality filter ───────────────────────────────────────────────
// Raw phone GPS is noisy: a single bad fix (accuracy circle of 100m+, or a
// …
function isPlausibleGpsFix(pos){
  return _isPlausibleGpsFix(pos, lastAcceptedFix, lastAcceptedFixAt, hvKm);
}

// …
function animateLiveMarkerTo(lat, lon){
  if(!liveMkr){ displayedLat=lat; displayedLon=lon; return; }
  if(markerAnimFrame) cancelAnimationFrame(markerAnimFrame);
  const fromLat=displayedLat??lat, fromLon=displayedLon??lon;
  const distM=hvKm(fromLat,fromLon,lat,lon)*1000;
  // Skip animating near-zero movement (avoids a constant no-op rAF loop
  // while stationary) and huge jumps (city switch, very first fix) — those
  // should snap instantly rather than visibly "fly" across the whole map.
  if(distM<0.5 || distM>150){ displayedLat=lat; displayedLon=lon; liveMkr.setLatLng([lat,lon]); return; }
  const duration=400, start=performance.now();
  const step=(now)=>{
    const t=Math.min(1,(now-start)/duration);
    const eased=1-Math.pow(1-t,3);
    displayedLat=fromLat+(lat-fromLat)*eased;
    displayedLon=fromLon+(lon-fromLon)*eased;
    liveMkr.setLatLng([displayedLat,displayedLon]);
    if(t<1) markerAnimFrame=requestAnimationFrame(step);
    else markerAnimFrame=null;
  };
  markerAnimFrame=requestAnimationFrame(step);
}

// ── Snap-to-road ──────────────────────────────────────────────────────────
// Projects a raw GPS point onto the nearest point of the currently-drawn
// …
function snapToRoute(lat, lon){
  if(!rLine) return [lat, lon];
  const latlngs=rLine.getLatLngs();
  if(!latlngs || latlngs.length<2) return [lat, lon];
  const p=L.latLng(lat, lon);
  let best=null, bestDist=Infinity;
  for(let i=0;i<latlngs.length-1;i++){
    const candidate=closestPointOnSegment(p, latlngs[i], latlngs[i+1]);
    const d=p.distanceTo(candidate);
    if(d<bestDist){ bestDist=d; best=candidate; }
  }
  if(!best || bestDist>40) return [lat, lon];
  return [best.lat, best.lng];
}
function closestPointOnSegment(p, a, b){
  // Simple equirectangular projection — fine at the scale of one road
  // segment (tens of metres), far cheaper than great-circle math for
  // something recomputed on every GPS fix during live tracking.
  const cosLat=Math.cos(a.lat*Math.PI/180);
  const toXY=(pt)=>({x:pt.lng*cosLat, y:pt.lat});
  const A=toXY(a), B=toXY(b), P=toXY(p);
  const dx=B.x-A.x, dy=B.y-A.y;
  const lenSq=dx*dx+dy*dy;
  let t=lenSq>0 ? ((P.x-A.x)*dx+(P.y-A.y)*dy)/lenSq : 0;
  t=Math.max(0,Math.min(1,t));
  return L.latLng(a.lat+(b.lat-a.lat)*t, a.lng+(b.lng-a.lng)*t);
}

function maybeSpeakNavInstruction(text, force=false){
  if(!tripActive || !navVoiceEnabled || !text || !window.speechSynthesis) return;
  const normalized=String(text).replace(/\s+/g,' ').trim();
  const now=Date.now();
  if(!force && !_shouldSpeakNavInstruction(normalized, lastSpokenNavInstruction, lastSpokenAt, now, 5000)) return;
  lastSpokenNavInstruction=normalized;
  lastSpokenAt=now;
  speak(normalized);
}

function turnArrowForInstruction(text){ return _turnArrowForInstruction(text); }

function stopTimeScore(stop, arriveMin, temp, priorityIndex=0, wind=0, personas=null, tripMode=null){
  return _stopTimeScore(stop, arriveMin, temp, priorityIndex, wind, personas, tripMode);
}

function buildTimeAwareDay(stops, startMin, maxT, startCoords, temp, breakEvery=0, breakDuration=0){
  const preferredCategories = Array.from(document.querySelectorAll('.pref:checked, .exp-chip input:checked'))
    .map(c => c.value).filter(Boolean);
  const personas = Array.from(document.querySelectorAll('.pref:checked')).map(c => c.value);
  return _buildTimeAwareDayMod(stops, startMin, maxT, startCoords, temp, breakEvery, breakDuration, {
    getSmartTravelTime,
    getSmartVisitTime,
    cityId: currentCityId,
    allLocs: typeof LOCS !== 'undefined' ? LOCS : [],
    stopTimeScore: typeof stopTimeScore === 'function' ? stopTimeScore : null,
    personas,
    tripMode: window.selectedTripMode || null,
    preferredCategories,
    getOpeningStatus: (loc, arriveMin) => {
      try {
        if (typeof getPlaceDynamicStatus === 'function') {
          const st = getPlaceDynamicStatus(loc, arriveMin);
          return { isOpenNow: st?.open != null ? st.open : true };
        }
      } catch (_e) {}
      return { isOpenNow: true };
    },
  });
}

// ── Street Quest (modules/streetQuest.js) ─────────────────────────────────────
const _sqCtx = {
  get map(){ return map; },
  get rLine(){ return rLine; },
  get itin(){ return itin; },
  get tripActive(){ return tripActive; },
  get cLat(){ return cLat; },
  get cLon(){ return cLon; },
  get streetQuestActive(){ return streetQuestActive; },
  set streetQuestActive(v){ streetQuestActive = v; },
  get streetQuestScore(){ return streetQuestScore; },
  set streetQuestScore(v){ streetQuestScore = v; },
  get streetQuestHealth(){ return streetQuestHealth; },
  set streetQuestHealth(v){ streetQuestHealth = v; },
  get streetQuestCoins(){ return streetQuestCoins; },
  set streetQuestCoins(v){ streetQuestCoins = v; },
  get streetQuestLevel(){ return streetQuestLevel; },
  set streetQuestLevel(v){ streetQuestLevel = v; },
  get streetQuestItems(){ return streetQuestItems; },
  set streetQuestItems(v){ streetQuestItems = v; },
  get streetQuestHazards(){ return streetQuestHazards; },
  set streetQuestHazards(v){ streetQuestHazards = v; },
  get streetQuestLayers(){ return streetQuestLayers; },
  set streetQuestLayers(v){ streetQuestLayers = v; },
  get streetQuestDestinationReached(){ return streetQuestDestinationReached; },
  set streetQuestDestinationReached(v){ streetQuestDestinationReached = v; },
};
const _sq = createStreetQuest(_sqCtx);
function clearStreetQuestLayers(){ return _sq.clearStreetQuestLayers(); }
function setStreetQuestMessage(msg){ return _sq.setStreetQuestMessage(msg); }
function updateStreetQuestUI(){ return _sq.updateStreetQuestUI(); }
function setupStreetQuest(){ return _sq.setupStreetQuest(); }
function toggleStreetQuest(forceState){ return _sq.toggleStreetQuest(forceState); }
function updateStreetQuestProgress(){ return _sq.updateStreetQuestProgress(); }
function _updateQuestLevel(){ return _sq.updateQuestLevel(); }

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(themeName){
  const t = themeName || (isDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('tt_theme', t);
}
function toggleTheme(){
  isDark = !isDark;
  applyTheme(isDark ? 'dark' : 'light');
  _showMicroToast(isDark ? 'Obsidian Dark theme activated' : 'High-Contrast Light theme activated', { icon: isDark ? '🌙' : '☀️' });
}

// ── Firebase Auth / Firestore session boundary ────────────────────────────────
const authSession = createAuthSession({
  auth,
  provider,
  signInWithPopup,
  onAuthStateChanged,
  signOut: fbSignOut,
  db,
  firestore: { doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp },
  getUser: () => currentUser,
  setUser: user => { currentUser = user; },
  getStamps: () => stamps,
  setStamps: value => { stamps = value; },
  getExpenses: () => expenses,
  setExpenses: value => { expenses = value; },
  resetTripData: () => { mdPlan=[]; itin=[]; expenses=[]; stamps=new Set(); },
  onAuthChecked: () => resolveAuthChecked(),
  addMessage: (message, options = {}) => {
    if (options.resetUi) {
      document.getElementById('plan-list').innerHTML = '<div class="empty-state"><div class="empty-icon">🗺️</div><p class="empty-txt">Sign in to access your saved trips</p></div>';
    } else if (message) {
      addMsg(message);
    }
  },
});

const { saveUserData, loadUserData: _loadUserData, signInWithGoogle, doSignOut, toggleUserMenu, continueAsGuest } = authSession;
// Legacy HTML event bridge. Registered only after auth/session lexical
// bindings are initialized, preventing top-level temporal-dead-zone failures.
Object.assign(window, {
  switchCity, searchCity, generatePlan, startTrip, skipStop, optimizeRoute,
  smartExtend, addNearby, aiSuggestAlternative, prepGuide, postcard,
  handleAiLens, getInstaSpots, getSouvenirGuide, switchToView, toggleTheme,
  installPWA, resetGPS, locateMe, compassTap, toggleVoice, handleChat, saveIt, shareIt, waShare,
  toggleLoadPanel, loadPlan, delPlan, addExpense, delExp, updateBudget,
  analyzeBudget, renderToolsHome, renderLingo, renderSafety, renderBudget,
  renderPassport, switchDay, chatAbout, shareEmergency, speak,
  showWeatherAlerts, generateTripPDF, setupNotifications, showToast,
  signInWithGoogle, doSignOut, toggleUserMenu, continueAsGuest, toggleLiveFollow, toggleStreetQuest,
  onTimeSliderChange,
  showReplanner, showTripRating, handleCaption, handleTranslate,
  startVoiceInput, aiFoodCard, runReplanner,
  goBack, loadCityPlaces,
  showFestivalRadar, showHiddenGems, handleArOverlay, showHartaalAlert,
  handleFoodSafety, showCrowdPredictor, showFareNegotiator, showTripTribe,
  openAiDrawer, closeAiDrawer, renderAiToolsGrid,
  showAppFeedback, maybeShowOnboarding,
});

document.addEventListener('click', event => {
  const menu = document.getElementById('user-menu');
  const avatar = document.getElementById('user-avatar');
  if (menu && !menu.contains(event.target) && event.target !== avatar) menu.classList.remove('open');
});

// ── Weather ───────────────────────────────────────────────────────────────────
window.realWind = window.realWind || 0;
window._lastWeatherSnapshot = window._lastWeatherSnapshot || null;

async function fetchWeatherUI(lat,lon,attempt=0){
  try{
    window._lastKnownLatLon = [lat, lon];
    const d=await API.fetchWeather(lat,lon);
    window._weatherFailToastShown=false; // reset so a later real failure can toast again
    realTemp=d.temp;
    realWeatherMain=d.main || (d.weathercode>=51 ? 'Rain' : 'Clear');
    window.realWind = d.windKph || 0;
    document.getElementById('wx-display').textContent=d.display;
    updatePlannerShowcase();
    detectWeatherChangeAndReoptimize({ temp: realTemp, main: realWeatherMain, wind: window.realWind });
  }catch(e){
    // Free-tier hosting can be cold-starting (502/503 for the first ~20-30s
    // after being idle). Back off and retry a few times before treating it
    // as a genuine failure, instead of showing "offline" for a server that's
    // simply still waking up.
    const status=parseInt(String(e.message).match(/(\d{3})$/)?.[1]||'0',10);
    if(_shouldRetryWeather(status, attempt, 3)){
      setTimeout(()=>fetchWeatherUI(lat,lon,attempt+1), _weatherRetryDelayMs(attempt));
      return;
    }
    const el=document.getElementById('wx-display');
    if(el && (!el.textContent || el.textContent.includes('--'))) el.textContent='⚠️ Weather unavailable';
    if(!window._weatherFailToastShown){
      window._weatherFailToastShown=true;
      showToast('⚠️','Weather offline','Couldn\'t reach the weather service — everything else still works fine.',4000);
    }
  }
}

// Poll weather every 10 minutes while a plan is active so conditions that
// change mid-trip (rain starting, a heat spike, wind picking up) can trigger
// a live re-optimization instead of the user being stuck with a stale plan.
setInterval(()=>{
  if(typeof mdPlan!=='undefined' && mdPlan && mdPlan.flat && mdPlan.flat().length && window._lastKnownLatLon){
    fetchWeatherUI(window._lastKnownLatLon[0], window._lastKnownLatLon[1]);
  }
}, 10*60*1000);

function detectWeatherChangeAndReoptimize(snap){
  const prev = window._lastWeatherSnapshot;
  window._lastWeatherSnapshot = snap;
  const { changed, reason } = _detectWeatherChange(prev, snap);
  if(changed) reoptimizeRemainingPlan(reason);
}

// Rebuilds only the *not-yet-visited* stops for today using the latest
// weather (skips closed places, avoids outdoor stops in extreme heat,
// deprioritizes beaches/viewpoints in strong wind — all via stopTimeScore).
function reoptimizeRemainingPlan(reason, nowOverride){
  try{
    if(typeof itin==='undefined' || !itin || !itin.length) return;
    const now = typeof nowOverride === 'number' ? nowOverride : getCurrentLocalMin();
    const upcoming = itin.filter(s=>!s.isBreak && t2m(s.ct||'23:00') > now && !s._visited);
    if(upcoming.length < 2) return; // not enough left in the day to meaningfully reorder
    const startCoords = upcoming[0].coords;
    const dayEndMin = t2m(document.getElementById('e-time')?.value || '19:00');
    const budget = Math.max(30, dayEndMin - now);
    const _rp = buildTimeAwareDay(upcoming, now, budget, startCoords, realTemp || 28, 0, 0);
    const replanned = Array.isArray(_rp) ? _rp : (_rp?.day || []);
    if(replanned && replanned.length){
      // Splice the replanned stretch back into today's plan, keeping anything already visited untouched.
      const visitedPrefix = itin.filter(s=>s.isBreak || t2m(s.ct||'23:00') <= now || s._visited);
      itin = [...visitedPrefix, ...replanned];
      if(typeof updateItinUI === 'function') updateItinUI();
      if(typeof addMsg === 'function') addMsg(`🔄 <strong>Plan updated</strong> — ${reason}, so I reordered your remaining stops for better conditions.`);
    }
  }catch(_e){}
}

function getSelectedPrefs(){
  return Array.from(document.querySelectorAll('.pref:checked')).map(el => el.value);
}

function formatTripWindow(days, minutesPerDay){
  return `${days} day${days===1?'':'s'} / ${fmtM(minutesPerDay)}`;
}

function updatePlannerShowcase(){
  const days = parseInt(document.getElementById('n-days')?.value, 10) || 1;
  const minutes = getTripMinutes();
  const startTime = document.getElementById('s-time')?.value || '09:00';
  const endTime = document.getElementById('e-time')?.value || m2t(t2m(startTime)+minutes);
  const breakEvery = getBreakEveryMinutes();
  const breakDuration = getBreakDurationMinutes();
  const waterEvery = getWaterReminderMinutes();
  const prefs = getSelectedPrefs();
  const vibe = (document.getElementById('vibe')?.value || '').trim();
  const cityEl = document.getElementById('hero-city');
  const weatherEl = document.getElementById('hero-weather');
  const placesEl = document.getElementById('hero-places');
  const modeEl = document.getElementById('hero-mode');
  const styleEl = document.getElementById('insight-style');
  const styleCopyEl = document.getElementById('insight-style-copy');
  const timeEl = document.getElementById('insight-time');
  const timeCopyEl = document.getElementById('insight-time-copy');
  const focusEl = document.getElementById('insight-focus');
  const focusCopyEl = document.getElementById('insight-focus-copy');
  const banner = document.getElementById('plan-summary-banner');
  const totalStops = mdPlan.length ? mdPlan.reduce((sum, day) => sum + day.length, 0) : itin.length;
  const focusLabel = prefs.length ? prefs.slice(0,2).map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(' + ') : 'Balanced';
  const modeLabel = mdPlan.length ? 'Route ready' : vibe ? 'Mood-based' : prefs.length >= 3 ? 'Discovery-rich' : 'Balanced';

  if(cityEl) cityEl.textContent = currentCityName || 'Select city';
  if(weatherEl) weatherEl.textContent = Number.isFinite(realTemp) ? `${realTemp} C` : '--';
  if(placesEl) placesEl.textContent = LOCS.length ? `${LOCS.length} loaded` : 'AI curating';
  if(modeEl) modeEl.textContent = modeLabel;

  if(styleEl) styleEl.textContent = vibe ? 'Tailored itinerary' : 'Balanced luxury';
  if(styleCopyEl) styleCopyEl.textContent = vibe ? `The plan is tuned around "${vibe.slice(0,48)}${vibe.length>48?'...':''}" for a more intentional story.` : 'Designed to feel premium while staying approachable for first-time users.';
  if(timeEl) timeEl.textContent = formatTripWindow(days, minutes);
  if(timeCopyEl) timeCopyEl.textContent = `${fmtM(minutes)} per day from ${startTime} to ${endTime}, with ${breakEvery>0&&breakDuration>0?`${fmtM(breakDuration)} breaks every ${fmtM(breakEvery)}`:'nonstop pacing'} and ${waterEvery>0?`water nudges every ${fmtM(waterEvery)}`:'no water reminders'}.`;
  if(focusEl) focusEl.textContent = focusLabel;
  if(focusCopyEl) focusCopyEl.textContent = prefs.length ? `Current experience mix favors ${prefs.join(', ')}.` : 'Select experience filters to steer recommendations, routing, and stop density.';

  if(!banner) return;
  if(!mdPlan.length){
    banner.style.display = 'none';
    return;
  }

  const summaryTitle = document.getElementById('plan-summary-title');
  const summaryCopy = document.getElementById('plan-summary-copy');
  const chipDays = document.getElementById('plan-summary-chip-days');
  const chipStops = document.getElementById('plan-summary-chip-stops');
  const chipDuration = document.getElementById('plan-summary-chip-duration');

  banner.style.display = 'block';
  if(summaryTitle) summaryTitle.textContent = `${currentCityName} is now staged as a polished ${days}-day experience.`;
  if(summaryCopy) summaryCopy.textContent = `This route balances discovery, practicality, and visual polish with ${totalStops} curated stops, smart pacing, clear start/end timing, and live utilities for a smooth travel experience.`;
  if(chipDays) chipDays.textContent = `${days} day${days===1?'':'s'}`;
  if(chipStops) chipStops.textContent = `${totalStops} curated stops`;
  if(chipDuration) chipDuration.textContent = `${fmtM(minutes)} planned coverage`;
}

// ── City switch ───────────────────────────────────────────────────────────────
function switchCity(cityId, silent=false){
  if(!CITIES[cityId])return;
  if(!silent) userPickedCity=true;
  const city=CITIES[cityId];currentCityId=cityId;currentCityName=city.name;
  const citySelect=document.getElementById('city-select');
  if(citySelect && citySelect.value!==cityId) citySelect.value=cityId;
  document.getElementById('city-input').value=city.name;
  LOCS=getLocalPlaces(cityId, city.name);
  document.getElementById('hdr-city').textContent=currentCityName;
  if(map){
    if(isFiniteLatLon(city.lat,city.lon)){
      map.stop();
      map.flyTo([city.lat,city.lon],12,{duration:1.1});
    } else {
      browserLogger.warn('[switchCity] skipped flyTo — invalid coordinates for city:', cityId, city.lat, city.lon);
    }
    setTimeout(()=>map.invalidateSize(),100);
  }
  fetchWeatherUI(city.lat,city.lon);
  resetPlanUI();
  updatePlannerShowcase();
  if(!silent){
    switchToView('plan-view',1);
    if(LOCS.length){
      addMsg(`✅ Loaded <strong>${LOCS.length} ready-to-plan places</strong> for ${city.name}. You can generate now while I refresh more options in the background.`);
      showToast(city.emoji||'📍',`${city.name} loaded`,`${LOCS.length} places ready — build your plan whenever you like.`,3500);
    }
    // Fetch richer places dynamically in the background.
    loadCityPlaces(city.lat, city.lon, city.name);
  }
}

// Dynamically fetch places for any city via AI backend
function _placesFromCityCache(cityKey, minLen=8){
  for(const [k, places] of placeCache.entries()){
    if((k===`${cityKey}|any`||k.startsWith(cityKey+'|'))&&Array.isArray(places)&&places.length>=minLen)
      return places.map(p=>({...p,coords:normalizeLatLon(p.coords)}));
  }
  return null;
}
async function loadCityPlaces(lat, lon, cityName, opts = {}) {
  const { silent = false, force = false } = opts;
  const tTime  = parseInt(document.getElementById('t-time')?.value)  || 600;
  const nDaysL = parseInt(document.getElementById('n-days')?.value)  || 1;
  const totalTripMinutesL = tTime * nDaysL;
  const fetchMinutes = Math.min(totalTripMinutesL, 1800); // cap discovery (server already caps place count)
  const cityKey = String(cityName||'').toLowerCase();
  const cacheKey = `${cityKey}|${totalTripMinutesL}`;
  if(!force && placeCache.has(cacheKey)){
    const cachedPlaces = (placeCache.get(cacheKey) || []).map(p => ({ ...p, coords: normalizeLatLon(p.coords) }));
    if(cachedPlaces.length){ LOCS = cachedPlaces; return { places: LOCS, source: 'cache' }; }
    placeCache.delete(cacheKey);
  }
  // Reuse same-city cache when day count changes (avoid slow multi-day re-fetch)
  if(!force){
    const fb=_placesFromCityCache(cityKey,8);
    if(fb){
      if(LOCS.length < 8) LOCS=fb;
      placeCache.set(cacheKey, (LOCS.length?LOCS:fb).map(p=>({...p,coords:[...p.coords]})));
      if(LOCS.length >= 8 && !force) return { places:LOCS, source:'cache-city-fallback' };
    }
  }
  // Already have a solid pool — skip network unless forced refresh
  if(!force && LOCS.length >= 16) return { places: LOCS, source: 'existing-pool' };
  if(!force && placeLoadPromises.has(cacheKey)){
    try {
      const pending = await placeLoadPromises.get(cacheKey);
      LOCS = withHiddenGems(currentCityId, (pending.places || []).map(p => ({ ...p, coords: normalizeLatLon(p.coords), id: p.id || String(p.name||'').toLowerCase().replace(/[^a-z0-9]/g,'') })));
      return pending;
    } catch (_pe) { placeLoadPromises.delete(cacheKey); }
  }
  const localPlaces=getLocalPlaces(currentCityId, cityName);
  if(localPlaces.length && !LOCS.length){ LOCS=localPlaces; updatePlannerShowcase(); }
  if(!silent && !localPlaces.length && !LOCS.length) addMsg(`🤖 <strong>Finding the best places in ${cityName}...</strong> This usually takes a few seconds.`);
  const doFetch = () => API.fetchPlaces(lat, lon, cityName, fetchMinutes, { refresh: force });
  try {
    let result;
    try {
      const request = doFetch(); placeLoadPromises.set(cacheKey, request); result = await request;
    } catch (firstErr) {
      const isTimeout = firstErr?.name==='TimeoutError' || /timed out|timeout|abort/i.test(String(firstErr?.message||''));
      if(!isTimeout) throw firstErr;
      browserLogger.warn('loadCityPlaces timeout, retrying once…', firstErr);
      const retry = doFetch(); placeLoadPromises.set(cacheKey, retry); result = await retry;
    }
    placeLoadPromises.delete(cacheKey);
    const fetchedPlaces=(result.places || []).map(p => ({ ...p, coords: normalizeLatLon(p.coords) }));
    LOCS = withHiddenGems(currentCityId, mergePlacePools(localPlaces.length ? localPlaces : LOCS, fetchedPlaces));
    if(LOCS.length){
      const snap=LOCS.map(p=>({...p,coords:[...p.coords]}));
      placeCache.set(cacheKey, snap); placeCache.set(`${cityKey}|any`, snap);
    } else { placeCache.delete(cacheKey); }
    if(LOCS.length >= 3){
      updatePlannerShowcase();
      if(!silent){ addMsg(`✅ Refreshed <strong>${LOCS.length} places</strong> in ${cityName}. Generate when ready ✨`); switchToView('plan-view', 1); }
    } else if(!silent){ addMsg(`⚠️ AI couldn't find enough places for ${cityName} right now. Please try again in a moment.`); }
    return result;
  } catch(e) {
    placeLoadPromises.delete(cacheKey);
    if(!LOCS.length && localPlaces.length){ LOCS = localPlaces; updatePlannerShowcase(); }
    // Recoverable timeout with existing places → warn, not error (avoids red console noise)
    if(LOCS.length){
      browserLogger.warn('loadCityPlaces timed out; using existing places:', e?.message||e);
      if(!silent) showToast('⚠️','Places refresh timed out',`Using ${LOCS.length} places already loaded for ${cityName}. You can still generate.`,4500);
      return { places: LOCS, source: 'stale-after-error' };
    }
    browserLogger.error('loadCityPlaces error:', e);
    if(!silent){ addMsg(`⚠️ We couldn't load places for ${cityName} right now. Please try again in a moment.`); showToast('⚠️','Couldn\'t refresh places',`Showing what we have for ${cityName} — will retry automatically.`,4500); }
    throw e;
  }
}

async function ensureCityPlaces(city, minCount=1){
  if(!city) return false;
  const tTime  = parseInt(document.getElementById('t-time')?.value)  || 600;
  const nDaysV = parseInt(document.getElementById('n-days')?.value)  || 1;
  const cityKey = String(city.name||'').toLowerCase();
  const cacheKey = `${cityKey}|${tTime * nDaysV}`;
  if(placeLoadPromises.has(cacheKey)){
    try{
      const pending = await placeLoadPromises.get(cacheKey);
      LOCS = withHiddenGems(currentCityId, (pending?.places || []).map(p => ({ ...p, coords: normalizeLatLon(p.coords), id: p.id || String(p.name||'').toLowerCase().replace(/[^a-z0-9]/g,'') })));
    }catch(_e){}
  }
  if(LOCS.length < minCount){ const fb=_placesFromCityCache(cityKey,minCount); if(fb) LOCS=fb; }
  if(LOCS.length>=minCount) return true;
  try{ await loadCityPlaces(city.lat, city.lon, city.name, { silent:true }); }catch(_e){}
  if(LOCS.length>=minCount) return true;
  try{ await loadCityPlaces(city.lat, city.lon, city.name, { silent:false, force:true }); }catch(_e){}
  return LOCS.length >= minCount || LOCS.length > 0;
}

async function searchCity(q){
  q=q||document.getElementById('city-input').value.trim();if(!q)return;
  for(const k in CITIES){if(CITIES[k].name.toLowerCase()===q.toLowerCase()||k===q.toLowerCase()){switchCity(k);return;}}
  switchToView('chat-view',2);
  addMsg(`🔍 Searching for <strong>${q}</strong>...`);
  const typing=addTypingIndicator();
  try{
    const nd=await API.geocode(q);
    if(!nd.length){typing.remove();addMsg(`❌ Could not find "${q}". Check spelling and try again.`);return;}
    const lat=parseFloat(nd[0].lat),lon=parseFloat(nd[0].lon);
    if(!isFiniteLatLon(lat,lon)){
      browserLogger.warn('[searchCity] geocode result had invalid coordinates for query:', q, nd[0]);
      typing.remove();
      addMsg(`❌ Got an unexpected result while looking up "${q}". Try a different spelling or a nearby major city.`);
      return;
    }
    currentCityName=nd[0].name?.split(',')[0]||q;
    currentCityId=q.toLowerCase();
    document.getElementById('hdr-city').textContent=currentCityName;
    document.getElementById('city-input').value=currentCityName;
    const citySelect=document.getElementById('city-select');
    if(citySelect) citySelect.value='';
    if(map){map.setView([lat,lon],12);setTimeout(()=>map.invalidateSize(),100);}
    fetchWeatherUI(lat,lon);
    updatePlannerShowcase();
    typing.remove();
    addMsg(`📍 Found <strong>${currentCityName}</strong>! 🤖 AI is fetching places now...`);
    const typing2=addTypingIndicator();
    const tTime=parseInt(document.getElementById('t-time')?.value)||600;
    const result=await API.fetchPlaces(lat,lon,currentCityName,tTime);
    LOCS=withHiddenGems(currentCityId, _normalizeFetchedPlaces(result.places, normalizeLatLon));
    typing2.remove();
    if(LOCS.length>=3){
      updatePlannerShowcase();
      addMsg(`✅ Found <strong>${LOCS.length} places</strong> in ${currentCityName}! Go to Plan tab → tap Generate ✨`);
      resetPlanUI();switchToView('plan-view',1);
    } else {
      addMsg(`⚠️ Could not find enough tourist spots in ${currentCityName}. Try again or search a nearby larger city.`);
    }
  }catch(e){
    browserLogger.error('searchCity error:',e);
    addMsg(`❌ Error: ${e.message}. Please try again.`);
  }
}

function resetPlanUI(){
  mdPlan=[];itin=[];dayIdx=0;
  document.getElementById('phase2-section').style.display='none';
  document.getElementById('aitools-section').style.display='none';
  document.getElementById('day-tabs').style.display='none';
  document.getElementById('plan-list').innerHTML=`<div class="empty-state"><div class="empty-icon">🗺️</div><p class="empty-txt">Ready! Shape the experience and generate a polished plan for ${escapeHtml(currentCityName)}.</p><p class="empty-sub">Set the mood, confirm timing, then let AI stage the route.</p></div>`;
  updatePlannerShowcase();
}

// ── Plan Generation ───────────────────────────────────────────────────────────
async function generatePlan(){
  const _genBtn=document.querySelector('[data-action="generatePlan"]');
  const _genBtnOrigHtml=_genBtn?_genBtn.innerHTML:null;
  if(_genBtn){_genBtn.disabled=true;_genBtn.style.cursor='wait';_genBtn.innerHTML='<span>Generating…</span> <span>✦</span>';}
  try{
  tripActive=false;
  tripStart=null;
  lastHeading=null;
  lastSpokenNavInstruction='';
  streetQuestActive=false;
  clearStreetQuestLayers();
  updateStreetQuestUI();
  updateFollowButton();
  // ── Ensure places are loaded before planning ──────────────────────────────
  // Compute totalTripMinutes early so loadCityPlaces uses the right cache key
  syncPlannerTimeFields('end');
  const _maxT0    = getTripMinutes();
  const _nDays0   = parseInt(document.getElementById('n-days').value)||1;
  const _totalMin = _maxT0 * _nDays0;
  // Floor raised from 8 → 16: with the day optimizer now allowed up to 12
  // stops (see maxStops below), an 8-place candidate pool for a 1-day trip
  // left it almost no real choice, so "nearby" alternatives it could have
  // routed through never even made it into the candidate set.
  const minPlacePool = Math.min(45, Math.max(16, _nDays0 * 6));
  const cityId = document.getElementById('city-select')?.value || currentCityId;
  const city   = CITIES[cityId];
  if(LOCS.length>0 && LOCS.length<minPlacePool && city){
    const ready = await ensureCityPlaces(city, minPlacePool);
    if(!ready && LOCS.length<minPlacePool){
      addMsg(`ℹ️ I found <strong>${LOCS.length}</strong> ready places. For a fuller ${_nDays0}-day trip, enable more experience types or tap Generate again after the background refresh finishes.`);
    }
  }
  if(!LOCS.length){
    if(city){
      switchToView('chat-view',2);
      addMsg(`🤖 <strong>Fetching places for ${city.name}…</strong> Building your options now — this can take up to 30 seconds for the first load.`);
      const loadTyping = addTypingIndicator();
      try{
        const ready = await ensureCityPlaces(city, minPlacePool);
        if(!ready){
          // ensureCityPlaces already tried force-refresh internally; just log
          browserLogger.warn('generatePlan: ensureCityPlaces returned false for', city.name);
        }
      }catch(_e){ browserLogger.error('generatePlan load error:', _e); }
      loadTyping.remove();
    }
    if(!LOCS.length){
      addMsg(city
        ? `⚠️ We couldn't load places for <strong>${city.name}</strong> this time. Please tap Generate again.`
        : '⚠️ Please select a city from the dropdown first, then tap Generate!');
      switchToView('plan-view',1);
      return;
    }
    switchToView('plan-view',1);
  }
  const prefs=Array.from(document.querySelectorAll('.pref:checked')).map(c=>c.value);
  if(!prefs.length){addMsg('⚠️ Select at least one experience type.');return;}
  const vibe=document.getElementById('vibe').value.trim();
  const maxT=getTripMinutes();
  const si=document.getElementById('s-time').value||'09:00';
  const nDays=parseInt(document.getElementById('n-days').value)||1;
  const breakEvery=getBreakEveryMinutes();
  const breakDuration=getBreakDurationMinutes();
  const totalTripMinutes = maxT * nDays; // tell backend how many total minutes needed
  mdPlan=[];itin=[];dayIdx=0;
  let avail=LOCS.filter(l=>prefs.includes(l.cat) || l.isHiddenGem);
  
  if (window.customSelectedPlaces && window.customSelectedPlaces.length > 0) {
    avail = LOCS.filter(l => window.customSelectedPlaces.includes(String(l.id)));
    if(!avail.length) { addMsg('⚠️ None of your custom selected places could be found. Using filters instead.'); avail = LOCS.filter(l=>prefs.includes(l.cat)); }
  }

  if(!avail.length && prefs.length===1 && prefs[0]==='food'){
    const cityId=document.getElementById('city-select')?.value || currentCityId;
    const city=CITIES[cityId];
    if(city){
      try{
        const result = await API.fetchPlaces(city.lat, city.lon, city.name, totalTripMinutes, { refresh:true, prefs:['food'] });
        const foodPlaces=_normalizeFetchedPlaces(result.places, normalizeLatLon);
        avail=foodPlaces.filter(l=>prefs.includes(l.cat));
      }catch(_e){}
      if(!avail.length) avail=LOCS.filter(l=>prefs.includes(l.cat));
    }
  }
  if(!avail.length){addMsg('⚠️ No places match your selections. Enable more experiences.');return;}
  const routeStart=getCityCenter() || getRouteStart();
  const onlyFood=prefs.length===1 && prefs[0]==='food';
  avail=prioritizePlanStops(avail,routeStart,prefs);
  if(onlyFood){
    avail=keepNearbyCluster(avail,routeStart,4);
  }
  switchToView('plan-view',1);
  if(vibe){
    const typing=addTypingIndicator();
    addMsg(`✨ Analyzing your vibe: "<em>${vibe}</em>"...`);
    try{
      const aiResp=await API.aiVibe(vibe,currentCityName,avail.map(l=>l.name));
      typing.remove();
      if(aiResp){
        const preferred=aiResp.split(',').map(s=>s.trim().toLowerCase());
        let aiM=avail.filter(l=>preferred.some(n=>l.name.toLowerCase().includes(n)));
        let nonM=avail.filter(l=>!preferred.some(n=>l.name.toLowerCase().includes(n)));
        if(aiM.length){aiM=optimizeStopOrder(aiM,routeStart);const last=aiM[aiM.length-1];nonM=optimizeStopOrder(nonM,last?.coords||routeStart);avail=[...aiM,...nonM];addMsg('🔮 AI tailored your stops to your vibe!');}
        else{avail=prioritizePlanStops(avail,routeStart,prefs);}
      }
    }catch{typing.remove();avail=prioritizePlanStops(avail,routeStart,prefs);}
  }else{avail=prioritizePlanStops(avail,routeStart,prefs);}
  mdPlan=[];let rem=[...avail];
  const startMin=t2m(si);
  // GeoAI /optimize is one day per call; fill remaining days locally.
  const cityCenterForDays = (CITIES[currentCityId]?.lat && CITIES[currentCityId]?.lon)
    ? [CITIES[currentCityId].lat, CITIES[currentCityId].lon] : routeStart;
  try{
    const _prefsSel=Array.from(document.querySelectorAll('.pref:checked')).map(c=>c.value);
    const _preferredCats=_prefsSel.filter(v=>['beach','temple','food','scenic','museum','fort','park','market'].includes(String(v).toLowerCase()));
    const geoDays=[];
    for(let d=0; d<nDays; d++){
      if(!rem.length) break;
      const dayStart = d===0 ? routeStart : cityCenterForDays;
      const dayDate = new Date(Date.now() + d*24*60*60*1000);
      const wx = d===0
        ? { tempC: typeof realTemp==='number' ? realTemp : null, condition: realWeatherMain || null, windKph: window.realWind }
        : null; // only "now" weather is known client-side; later days let the backend use seasonal/heuristic estimates
      let optimized=null;
      try{
        optimized=await API.timeIntelligenceOptimize(Array.isArray(rem)?rem:[],{
          weather:wx,
          at:dayDate.toISOString(),
          fromCoords:dayStart,
          personas:_prefsSel,
          preferredCategories:_preferredCats,
          tripMode:window.selectedTripMode||null,
          startMin,
          endMin:startMin+maxT,
          maxStops:Math.min(8,Math.max(3,Math.ceil(maxT/40))), beamWidth:6,
          bufferMin:Math.max(10,breakDuration||15),
          region:currentCityName||null,
        });
      }catch(e){
        browserLogger.warn(`[GeoAI optimizer] day ${d+1} failed, stopping GeoAI multi-day build:`,e);
        break;
      }
      if(!Array.isArray(optimized?.stops) || !optimized.stops.length) break;
      const usedThisDay=new Set(optimized.stops.map(s=>String(s.id||s.name)));
      const _geoStops=[...optimized.stops].sort((a,b)=>t2m(a.arriveAt||'09:00',startMin)-t2m(b.arriveAt||'09:00',startMin)).map(stop=>{
        const arriveMin=t2m(stop.arriveAt||'09:00', startMin);
        const leaveMin=t2m(stop.leaveAt||stop.arriveAt||'09:00', arriveMin+(stop.stayMinutes||45));
        return {...stop, id:stop.id||stop.name, cat:stop.category||stop.cat||'default', coords:stop.coords,
          vt:stop.stayMinutes||45, tt:stop.travelMinutes||0, arriveMin, leaveMin,
          arriveAt:m2t(arriveMin), leaveAt:m2t(leaveMin), temporalScore:stop.timingFit,
          slotLabel:_dayPartForMinutes(arriveMin), climateNote:stop.weather?.suitability||'',
          bestWindow:stop.bestWindow||null, optimizationScore:stop.optimizationScore,
          waitingMinutes:stop.waitingMinutes||0, geoOptimized:true, scheduleLocked:true};
      });
      geoDays.push(_geoStops);
      window.__iitLastGeoAIPlan=optimized;
      // Remove today's stops from the candidate pool so day 2+ doesn't repeat them.
      rem=(Array.isArray(rem)?rem:[]).filter(loc=>!usedThisDay.has(String(loc.id||loc.name)));
    }
    // Accept partial GeoAI results, then fill remaining days with the local planner.
    // Previously we only kept geoDays when non-empty and skipped local fill — so after a
    // successful 1-day GeoAI run, switching to multi-day left mdPlan stuck at 1 day when
    // day 2+ optimize timed out or returned empty.
    if(geoDays.length){
      mdPlan=geoDays;
      const totalGeoStops=mdPlan.reduce((s,day)=>s+day.length,0);
      const full=mdPlan.length>=nDays;
      addMsg(full
        ? `🧠 <strong>GeoAI Time Intelligence optimized your itinerary</strong> — ${mdPlan.length} day${mdPlan.length>1?'s':''}, ${totalGeoStops} stops, arrival-time scoring, scenic windows, weather/crowd context and route efficiency applied.`
        : `🧠 <strong>GeoAI optimized day${mdPlan.length>1?'s':''} 1${mdPlan.length>1?'–'+mdPlan.length:''}</strong> (${totalGeoStops} stops). Filling remaining day${nDays-mdPlan.length>1?'s':''} with the local planner…`);
    }
  }catch(e){
    browserLogger.warn('[GeoAI optimizer] backend unavailable, using local planner:',e);
  }
  // Fill missing days (full local path, or remainder after partial GeoAI)
  if(mdPlan.length < nDays){
    for(let d=mdPlan.length;d<nDays;d++){
      const remainingDays = nDays - d;
      const adaptiveTarget = d === nDays - 1 ? maxT : Math.max(180, Math.min(maxT, Math.ceil(estimateStopLoadMinutes(rem || []) / Math.max(1, remainingDays))));
      const dayStart = d===0 ? routeStart : (CITIES[currentCityId]?.lat&&CITIES[currentCityId]?.lon ? [CITIES[currentCityId].lat,CITIES[currentCityId].lon] : routeStart);
      const plannedDay = buildTimeAwareDay(Array.isArray(rem) ? rem : [], startMin, adaptiveTarget, dayStart, realTemp || 28, breakEvery, breakDuration);
      const dayStops = Array.isArray(plannedDay) ? plannedDay : (plannedDay?.day || []);
      if(dayStops.length){
        mdPlan.push(dayStops);
        const usedIds = new Set(dayStops.map(s => s.id || s.name));
        rem = (Array.isArray(rem) ? rem : []).filter(loc => !usedIds.has(loc.id) && !usedIds.has(loc.name));
      }
    }
  }
  if(!mdPlan.length){
    mdPlan=[];rem=[...avail];
    for(let d=0;d<nDays;d++){const day=[],unv=[];let cur=startMin,used=0;
      rem.forEach(loc=>{
        const tr=day.length?20:0,arr=cur+tr,dep=arr+(loc.vt||45);
        if(used+(loc.vt||45)+tr<=maxT&&arr>=t2m(loc.ot||'06:00')&&dep<=t2m(loc.ct||'22:00')){
          day.push({...loc,tt:tr,vt:loc.vt||45,arriveMin:arr,leaveMin:dep,arriveAt:m2t(arr),leaveAt:m2t(dep),scheduleLocked:true,slotLabel:_dayPartForMinutes(arr),climateNote:_stopClimateNote(loc,arr,realTemp||28)});
          used+=(loc.vt||45)+tr;cur=dep;
        }else unv.push(loc);
      });
      if(day.length)mdPlan.push(day);rem=unv;
    }
  }
  if(!mdPlan.length){addMsg('No locations fit your time limit. Try different preferences.');return;}
  document.getElementById('phase2-section').style.display='block';
  document.getElementById('aitools-section').style.display='block';
  renderAiToolsGrid();
  ['btn-save','btn-share','btn-pass','btn-wa','btn-replay','btn-ls'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'inline-flex'; });
  const pivotBar = document.getElementById('weather-pivot-bar');
  if (pivotBar) pivotBar.style.display = 'flex';
  renderTabs();
  resetTrimNotice(); // fresh plan — allow the "stops didn't fit" notice to fire again if it applies
  const plannedStopCount = mdPlan.flat().length;
  const cityCenterCoords = (CITIES[currentCityId]?.lat && CITIES[currentCityId]?.lon) ? [CITIES[currentCityId].lat, CITIES[currentCityId].lon] : routeStart;
  for(let d=0; d<mdPlan.length; d++){
    const savedItin=itin, savedDayIdx=dayIdx;
    itin=mdPlan[d]; dayIdx=d;
    const raw=Array.isArray(itin)?itin:[];
    const hasTimed=raw.some(s=>s&&!s.isBreak&&(s.arriveMin!=null||(s.arriveAt&&/^\d{1,2}:\d{2}$/.test(String(s.arriveAt)))));
    if(hasTimed) itin=raw.map(s=>({...s}));
    else { const stops=getRouteStopsForDay(raw); itin=applyBreakPlanToCurrentItinerary(d>0?optimizeStopOrder(stops,cityCenterCoords):stops); }
    recalcTimes({trimToWindow:true, dayLabel:`Day ${d+1}`});
    itin.forEach(s=>{
      if(s.isBreak) return;
      s.scheduleLocked=true;
      if(s.std instanceof Date){ const am=s.std.getHours()*60+s.std.getMinutes(); s.arriveAt=m2t(am); s.arriveMin=am; }
      if(s.etd instanceof Date) s.leaveAt=m2t(s.etd.getHours()*60+s.etd.getMinutes());
    });
    mdPlan[d]=itin; itin=savedItin; dayIdx=savedDayIdx;
  }
  await switchDay(0,true);
  mdPlan[dayIdx]=itin;
  const actualStopCount=mdPlan.flat().length;
  const trimmedNote = actualStopCount<plannedStopCount
    ? `<br><small style="color:var(--text-muted)">${plannedStopCount-actualStopCount} stop${plannedStopCount-actualStopCount>1?'s':''} didn't fit the time window and ${plannedStopCount-actualStopCount>1?'were':'was'} dropped — see note above.</small>`
    : '';
  addMsg(`✅ Built a <strong>${mdPlan.length}-day</strong> climate-aware plan with <strong>${actualStopCount} stops</strong>!<br><small style="color:var(--text-muted)">${mdPlan.length===nDays?'The route has been spread across your requested trip length.':'The available stops and opening windows could only support fewer full day plans this time.'}</small>${trimmedNote}`);
  updatePlannerShowcase();
  switchToView('plan-view',1);
  }finally{
    if(_genBtn){_genBtn.disabled=false;_genBtn.style.cursor='';_genBtn.innerHTML=_genBtnOrigHtml;}
  }
}

function renderTabs(){const c=document.getElementById('day-tabs');if(mdPlan.length<=1){c.style.display='none';return;}c.style.display='flex';c.innerHTML='';mdPlan.forEach((_,i)=>{const b=document.createElement('div');b.textContent=`Day ${i+1}`;b.className='day-tab'+(i===0?' active':'');b.addEventListener('click', () => switchDay(i));c.appendChild(b);});}
async function switchDay(idx,_init=false){
  dayIdx=idx;itin=mdPlan[dayIdx]||[];
  document.querySelectorAll('.day-tab').forEach((b,i)=>b.classList.toggle('active',i===idx));
  document.getElementById('btn-start').textContent='🚀 Start Live Tracking';
  document.getElementById('btn-start').disabled=false;
  tripActive=false;tripStart=null;lastHeading=null;lastSpokenNavInstruction='';
  autoFollowLive=true;streetQuestActive=false;clearStreetQuestLayers();
  applyMapHeadingRotation();updateStreetQuestUI();updateFollowButton();
  document.getElementById('trip-st').textContent=`DAY ${idx+1}`;
  // Render only — never re-optimize on tab switch (that shifted timeslots).
  await renderRoute();
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function chatAbout(name){switchToView('chat-view',2);setTimeout(()=>{document.getElementById('chat-in').value=`Tell me about ${name}`;handleChat();},200);}
function escapeHtml(str){ return _escapeHtml(str); }
function formatAiText(str){ return _formatAiText(str); }
function addMsg(html,isBot=true){ return _addMsgMod(html,isBot); }

// ── Delegated action handling for in-chat widget buttons ────────────────────
// Buttons rendered through addMsg() go through sanitizeChatHtml(), which
// …
const CHAT_ACTIONS = Object.create(null);
function registerChatActions() {
  Object.assign(CHAT_ACTIONS, {
    fbSetStar, fbSetCat, fbSubmit, fbSkip,
    rateStopClick, runReplannerClick,
  });
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const fn = CHAT_ACTIONS[btn.dataset.action];
  if (typeof fn === 'function') {
    e.preventDefault();
    e.stopImmediatePropagation(); // prevent STATIC_ACTIONS listener from double-firing (e.g. fbSetCat toggle on+off)
    fn(btn);
  }
});
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-role="fb-comment"]')) updateFbCounter(e.target);
});

// ── Delegated action handling for index.html's static onclick= buttons ──────
// Converts index.html's inline onclick="fn(args)" attributes to the same
// …
function openLoadPanelFromMenu(){ toggleLoadPanel(); toggleUserMenu(); }
function openBudgetFromMenu(){ switchToView('tools-view',3); renderBudget(); toggleUserMenu(); }
function openPassportFromMenu(){ switchToView('tools-view',3); renderPassport(); toggleUserMenu(); }
// These two replace onclick="document.getElementById(...).____" inline DOM
// expressions — trivial, but still had to move out of an attribute like
// everything else here.
function closeNotifToast(){ const el=document.getElementById('notif-toast'); if(el) el.style.display='none'; }
function focusCitySelect(){ const el=document.getElementById('city-select'); if(el) el.focus(); }

// ── Universal Command Palette (⌘K) ──
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
  if (input) {
    input.value = '';
    input.focus();
  }
  updatePaletteUI();
}

function closeCommandPalette() {
  const modal = document.getElementById('command-palette-modal');
  if (modal) modal.style.display = 'none';
}

function closePaletteOverlay(e) {
  if (e && e.target && e.target.id === 'command-palette-modal') {
    closeCommandPalette();
  }
}

function updatePaletteUI() {
  const list = document.getElementById('palette-list');
  if (!list) return;
  paletteFiltered = filterCommands(paletteQuery);
  if (paletteSelectedIndex >= paletteFiltered.length) {
    paletteSelectedIndex = Math.max(0, paletteFiltered.length - 1);
  }
  list.innerHTML = renderPaletteListHtml(paletteFiltered, paletteSelectedIndex);
}

function execPaletteCmd(btn) {
  const cmdId = btn?.dataset?.paletteId;
  const cmd = PALETTE_COMMANDS.find(c => c.id === cmdId) || paletteFiltered[Number(btn?.dataset?.paletteIdx || 0)];
  if (!cmd) return;
  closeCommandPalette();

  if (cmd.type === 'city' && cmd.cityKey) {
    const key = cmd.cityKey === 'visakhapatnam' ? 'vizag' : cmd.cityKey;
    switchCity(key);
    _showMicroToast(`Destination set to ${cmd.title.replace('Switch Destination: ', '')}`, { icon: cmd.icon });
    generatePlan();
    return;
  }

  if (cmd.actionKey) {
    const fn = STATIC_ACTIONS[cmd.actionKey];
    if (typeof fn === 'function') {
      fn();
    }
  }
}

const STATIC_ACTIONS = {
  addNearby, aiSuggestAlternative, applyCustomPlaces, closeAiDrawer, closeCustomizeModal,
  closeNotifToast, compassTap, doSignOut, focusCitySelect, generatePlan, goBack, handleChat,
  installPWA, locateMe, openAiDrawer, openBudgetFromMenu, openCustomizeModal,
  openLoadPanelFromMenu, openPassportFromMenu, optimizeRoute, resetGPS, saveIt, searchCity,
  shareIt, showAppFeedback, skipStop, smartExtend, startTrip, startVoiceInput,
  toggleLiveFollow, toggleLoadPanel, toggleNavCardCollapsed, toggleStreetQuest,
  toggleUserMenu, toggleVoice, waShare,
  openOfflinePass, closeOfflinePassModal, shareWhatsAppPass, pivotMonsoonMode, pivotHeatEscapeMode,
  printPass: () => window.print(),
  openCommandPalette, closeCommandPalette, closePaletteOverlay, execPaletteCmd, toggleTheme,
  switchCity: (btn) => switchCity(btn?.value || btn?.dataset?.city || btn?.dataset?.arg),
  continueAsGuest,
  setDays: (btn) => {
    const days = parseInt(btn.dataset.days, 10);
    if (!days) return;
    const input = document.getElementById('n-days');
    if (input) {
      input.value = days;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.querySelectorAll('.day-chip').forEach(c => {
      c.classList.toggle('active', parseInt(c.dataset.days, 10) === days);
    });
  },
  setPace: (btn) => {
    const pace = btn.dataset.pace;
    if (!pace) return;
    const sTime = document.getElementById('s-time');
    const eTime = document.getElementById('e-time');
    const tHours = document.getElementById('t-hours');
    const breakEv = document.getElementById('break-every');
    if (pace === 'relaxed') {
      if (sTime) sTime.value = '10:00';
      if (eTime) eTime.value = '16:00';
      if (tHours) tHours.value = '6';
      if (breakEv) breakEv.value = '90';
    } else if (pace === 'balanced') {
      if (sTime) sTime.value = '09:00';
      if (eTime) eTime.value = '19:00';
      if (tHours) tHours.value = '10';
      if (breakEv) breakEv.value = '120';
    } else if (pace === 'packed') {
      if (sTime) sTime.value = '08:00';
      if (eTime) eTime.value = '20:00';
      if (tHours) tHours.value = '12';
      if (breakEv) breakEv.value = '180';
    }
    document.querySelectorAll('.pace-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.pace === pace);
    });
  },
  // Settings modal & onboarding
  openSettings, closeSettings, clearLocalData, advanceOnboarding, skipOnboarding,
  // Tools / AI grid (no-arg handlers — converted from onclick= for CSP)
  renderToolsHome, renderLingo, renderSafety, renderBudget, renderPassport,
  prepGuide, postcard, getInstaSpots, getSouvenirGuide, showTripRating, showReplanner,
  showWeatherAlerts, generateTripPDF, setupNotifications, showFestivalRadar,
  showHiddenGems, showHartaalAlert, showCrowdPredictor, showFareNegotiator, showTripTribe,
  shareEmergency, addExpense, analyzeBudget,
  // These read extra args off the button's own dataset rather than taking
  // none — kept in the same table since dispatch below doesn't care.
  selectAllCustomPlaces: (btn) => selectAllCustomPlaces(btn.dataset.arg === 'true'),
  switchToView: (btn) => switchToView(btn.dataset.view, Number(btn.dataset.idx)),
  // event.currentTarget is what signInWithGoogle uses to find+disable the
// …
  signInWithGoogle: (btn) => signInWithGoogle({ currentTarget: btn }),
  // Arg-bearing handlers (data-* attributes)
  delExp: (btn) => delExp(Number(btn.dataset.id)),
  delPlan: (btn) => delPlan(btn.dataset.id),
  loadCloudPlan: (btn) => loadCloudPlan(btn),
  loadPlan: (btn) => loadPlan(btn.dataset.plan),
  speak: (btn) => speak(btn.dataset.text || ''),
  chatAbout: (btn) => { if (btn.dataset.name) chatAbout(btn.dataset.name); },
  aiFoodCard: (btn) => aiFoodCard(btn.dataset.name || '', btn.dataset.cat || ''),
  clickFileInput: (btn) => {
    const id = btn.dataset.inputId;
    const el = id && document.getElementById(id);
    if (el) el.click();
  },
  drawerRun: (btn) => {
    closeAiDrawer();
    const name = btn.dataset.run;
    const fn = name && (STATIC_ACTIONS[name] || (typeof window[name] === 'function' ? window[name] : null));
    if (typeof fn === 'function') {
      // Allow drawer animation to finish before running heavy UI work
      setTimeout(() => fn(btn), 50);
    }
  },
  drawerFile: (btn) => {
    closeAiDrawer();
    const id = btn.dataset.inputId;
    setTimeout(() => {
      const el = id && document.getElementById(id);
      if (el) el.click();
    }, 350);
  },
};
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  // Buttons handled by CHAT_ACTIONS above (in-chat widgets) use the exact
// …
  const fn = CHAT_ACTIONS[btn.dataset.action] || STATIC_ACTIONS[btn.dataset.action];
  if (fn) fn(btn);
});

// …
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('[role="button"][data-action]');
  if (!el) return;
  e.preventDefault();
  const fn = CHAT_ACTIONS[el.dataset.action] || STATIC_ACTIONS[el.dataset.action];
  if (fn) fn(el);
});

// …
// Universal Command Palette (⌘K) Keyboard Shortcuts & Search Input
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const modal = document.getElementById('command-palette-modal');
    if (modal && modal.style.display !== 'none') {
      closeCommandPalette();
    } else {
      openCommandPalette();
    }
    return;
  }

  const modal = document.getElementById('command-palette-modal');
  if (!modal || modal.style.display === 'none') return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeCommandPalette();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (paletteFiltered.length > 0) {
      paletteSelectedIndex = (paletteSelectedIndex + 1) % paletteFiltered.length;
      updatePaletteUI();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (paletteFiltered.length > 0) {
      paletteSelectedIndex = (paletteSelectedIndex - 1 + paletteFiltered.length) % paletteFiltered.length;
      updatePaletteUI();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = paletteFiltered[paletteSelectedIndex];
    if (item) {
      const mockBtn = { dataset: { paletteId: item.id } };
      execPaletteCmd(mockBtn);
    }
  }
});

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'palette-search-input') {
    paletteQuery = e.target.value;
    paletteSelectedIndex = 0;
    updatePaletteUI();
  }
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action="onTimeSliderChange"]');
  if (el) onTimeSliderChange(el.value);
});
document.addEventListener('change', (e) => {
  const fileEl = e.target.closest('[data-file-action]');
  if (fileEl) {
    const handlers = { handleArOverlay, handleFoodSafety, handleCaption, handleTranslate, handleAiLens };
    const fn = handlers[fileEl.dataset.fileAction];
    if (typeof fn === 'function') fn(e);
    return;
  }
  const cityEl = e.target.closest('#city-select, [data-action="switchCity"]');
  if (cityEl) {
    switchCity(cityEl.value || cityEl.dataset?.city || cityEl.dataset?.arg);
  }
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input-action]');
  if (!el) return;
  if (el.dataset.inputAction === 'updateBudget') updateBudget();
});

function addTypingIndicator(){return addMsg('<span style="display:flex;gap:4px;align-items:center"><span style="width:6px;height:6px;border-radius:50%;background:var(--text-muted);animation:blink 1s ease infinite"></span><span style="width:6px;height:6px;border-radius:50%;background:var(--text-muted);animation:blink 1s ease .2s infinite"></span><span style="width:6px;height:6px;border-radius:50%;background:var(--text-muted);animation:blink 1s ease .4s infinite"></span></span>');}
function getRecentBotText(){const rows=[...document.querySelectorAll('#chat-messages .msg-row')].reverse();for(const row of rows){if(row.classList.contains('from-user')) continue;const bubble=row.querySelector('.bubble');const text=String(bubble?.textContent||'').trim();if(text) return text.toLowerCase();}return '';}

function localChatReply(message){
  const lq=String(message||'').toLowerCase().trim();
  const nextStop=itin[0];
  const recentBotText=getRecentBotText();
  if(/^(hi+|he+y+|hel+o+|h+l+o+|hola|namaste|yo+)\b/.test(lq) || /\b(buddy|bro|dude|friend)\b/.test(lq)){
    return `Hi! I can help with ${currentCityName} plans, food, timings, fares, weather, and your next stop${nextStop?` near <strong>${nextStop.name}</strong>`:''}.`;
  }
  if(/\b(yeah|yes|yep|ok|okay|cool|nice|great|awesome)\b/.test(lq)){
    if(/\b(coffee|rose milk|tea|drink|cafe)\b/.test(recentBotText)) return `No problem. Start with one local drink first, then tell me whether you want something sweet, strong, or chilled and I’ll suggest the next best pick nearby.`;
    return `Nice. Tell me what you want next and I’ll keep it practical: nearby food, next stop, timings, fares, or a quick local suggestion.`;
  }
  if(/\b(not try|didn'?t try|havent tried|haven't tried|not yet|never tried)\b/.test(lq)){
    if(/\b(coffee|rose milk|tea|drink|cafe)\b/.test(recentBotText)) return `Fair point. You don’t need to imagine it before trying it. Start with one easy local drink first, and after that I can suggest what to try next based on your taste.`;
    return `Fair point. Try one simple nearby experience first, then I’ll help you choose the next step based on what you actually liked.`;
  }
  if(/\b(funny|weird|confused|doesn'?t make sense|how can i feel)\b/.test(lq)){
    return `You’re right. Let’s keep it real and useful. Tell me what you want right now: a nearby food stop, the next attraction, cab fare, or today’s exact timings.`;
  }
  if(/\b(arrived|just arrived|reached|landed|came here|here now|reached vizag|arrived in)\b/.test(lq)){
    return `Welcome to <strong>${currentCityName}</strong>! ${nextStop?`Your next planned stop is <strong>${nextStop.name}</strong>${nextStop.sts?` around ${nextStop.sts}`:''}.`:''} If you want, ask me for a quick first meal, nearby attraction, cab fare, or today’s timings.`;
  }
  if(/\b(food|eat|restaurant|lunch|dinner|breakfast|cafe)\b/.test(lq)){
    const foodStops=itin.filter(s=>s.cat==='food').slice(0,3);
    if(foodStops.length){
      return `Best food picks in your plan: <strong>${foodStops.map(s=>s.name).join('</strong>, <strong>')}</strong>. Ask me "best dinner" or tap the food card on a stop for more details.`;
    }
    return `I can help you find food in ${currentCityName}. Try selecting <strong>Local Food</strong> in the plan preferences first.`;
  }
  if(/\b(time|timing|schedule|plan|today)\b/.test(lq) && itin.length){
    return `<strong>Today's plan</strong><br>${itin.slice(0,5).map((x,i)=>`${i+1}. <strong>${x.name}</strong> ${x.sts||'--'}–${x.ets||'--'}${x.slotLabel?` • ${x.slotLabel}`:''}`).join('<br>')}`;
  }
  if(/\b(where|next|stop|destination)\b/.test(lq) && nextStop){
    return `Your next stop is <strong>${nextStop.name}</strong>${nextStop.sts?`, planned around ${nextStop.sts}`:''}. ${nextStop.climateNote||'I can also help with fare, food, or timings for this stop.'}`;
  }
  if(/\b(weather|hot|cold|rain|temperature|temp|climate)\b/.test(lq)){
    return `${currentCityName} is around <strong>${realTemp}°C</strong> right now. ${realTemp>32?'It is hot, so evening sightseeing and indoor afternoon stops are better.':realTemp>25?'Weather is fairly good for sightseeing.':'It is cool and comfortable for longer visits.'}`;
  }
  return '';
}

// …
function ti_placePayload(p){
  const cat=p.cat||'default';
  const sunsetCats=['beach','scenic','hill','fort','lake'];
  const sunriseCats=['beach','hill','scenic'];
  return {
    name:p.name, cat, coords:p.coords, ot:p.ot, ct:p.ct,
    is_sunrise_spot: p.is_sunrise_spot ?? sunriseCats.includes(cat),
    is_sunset_spot: p.is_sunset_spot ?? sunsetCats.includes(cat),
    indoor_outdoor: p.indoor_outdoor,
  };
}

const TI_STOPWORDS=['best','time','when','should','visit','place','the','for','experience','possible','good','right','to','go','see','is','it','a','an','what','should','can','i','now','today'];
function ti_findPlace(query){
  const q=String(query||'').toLowerCase();
  const pool=[...itin, ...LOCS];
  let best=null,bestLen=0;
  for(const p of pool){
    const n=String(p.name||'').toLowerCase();
    if(n && q.includes(n) && n.length>bestLen){ best=p; bestLen=n.length; }
  }
  if(best) return best;
  const words=q.replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=4 && !TI_STOPWORDS.includes(w));
  for(const p of pool){
    const n=String(p.name||'').toLowerCase();
    if(words.some(w=>n.includes(w))) return p;
  }
  return null;
}

function ti_renderState(place, state){
  // Premium Travel Intelligence card when advanced fields are present
  if (state.visitScore != null || state.explanation) {
    return ti_renderIntelligenceCard(place, state);
  }
  const closeStr = state.minutesToClose!=null ? (state.minutesToClose>=60?`${Math.floor(state.minutesToClose/60)}h ${state.minutesToClose%60}m`:`${state.minutesToClose}m`) : null;
  const parts=[
    `⏰ <strong>${place.name}</strong> — ${state.statusLabel}`,
    state.badges.join(' '),
    state.isOpenNow && closeStr ? `Open now · closes in ${closeStr} (${place.ct||'--'})` : (!state.isOpenNow ? `Opens at ${place.ot||'--'}` : null),
    `👥 Crowd right now: <strong>${state.crowdLevel}</strong>`,
    `🌅 Sunrise ${state.sunrise} · 🌇 Sunset ${state.sunset}`,
    state.seasonalNote || null,
    (state.recommendations||[]).map(r=>`• ${r}`).join('<br>') || null,
    (state.weatherWarnings||[]).map(w=>`⚠️ ${w}`).join('<br>') || null,
    (state.notifications||[]).map(n=>`🔔 ${n}`).join('<br>') || null,
  ];
  return parts.filter(Boolean).join('<br>');
}

/** Batch-enrich places with backend Travel Intelligence into place._ti (non-blocking). */
async function enrichPlacesWithTravelIntel(places, limit = 30) {
  try {
    if (!places || !places.length || !window.API || !API.timeIntelligenceStatus) return;
    const slice = places.slice(0, limit);
    const weather = { tempC: typeof realTemp === 'number' ? realTemp : null, condition: realWeatherMain || null, windKph: window.realWind };
    const { places: states } = await API.timeIntelligenceStatus(slice.map(ti_placePayload), weather);
    if (!Array.isArray(states)) return;
    const byName = Object.fromEntries(states.map(s => [s.name, s]));
    places.forEach(p => { if (byName[p.name]) p._ti = byName[p.name]; });
  } catch (e) {
    browserLogger.warn('[TI enrich]', e.message || e);
  }
}

/** Premium multi-factor Travel Intelligence card (mobile-first). */
function ti_renderIntelligenceCard(place, state){
  const score = state.visitScore != null ? state.visitScore : '—';
  const label = state.visitLabel || '';
  const conf = state.confidence ? `${state.confidence.level || ''} — ${state.confidence.confidence ?? ''}%` : '';
  const crowd = state.crowd?.level || state.crowdLevel || '—';
  const wx = state.weather?.suitability || '—';
  const traffic = state.traffic?.trafficLevel || state.traffic?.level || '—';
  const scenic = state.scenic?.suitability || '—';
  const why = (state.explanation?.bullets || []).slice(0, 6).map(b => {
    const icon = b.type === 'positive' ? '✓' : b.type === 'caution' ? '!' : '·';
    return `${icon} ${b.text}`;
  }).join('<br>') || (state.explanation?.summary || '');
  const depart = state.arrival?.recommendedDeparture || '';
  const window = state.scenic?.bestScenicWindow
    ? `${state.scenic.bestScenicWindow.start || ''} – ${state.scenic.bestScenicWindow.end || ''}`
    : (state.arrival?.experienceWindow ? `${state.arrival.experienceWindow.start} – ${state.arrival.experienceWindow.end}` : '');
  const sourceNote = state.crowd?.source ? `Crowd source: ${state.crowd.source}` : '';
  return `
<div style="border:1px solid var(--border-subtle,#333);border-radius:14px;padding:14px 16px;background:var(--bg-layer2,#1a1a1a);max-width:420px;font-size:13px;line-height:1.45;">
  <div style="font-size:11px;letter-spacing:.04em;opacity:.7;margin-bottom:4px;">BEST TIME TO VISIT</div>
  <div style="font-weight:700;font-size:16px;margin-bottom:2px;">${escapeHtml(place.name)}</div>
  <div style="opacity:.9;margin-bottom:8px;">${escapeHtml(state.statusLabel || '')}</div>
  ${window ? `<div style="margin-bottom:6px;">🕐 ${escapeHtml(window)}</div>` : ''}
  <div style="font-size:18px;font-weight:700;margin:8px 0;">⭐ ${score}/100 ${escapeHtml(label)}</div>
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;font-size:12px;">
    <span>👥 Crowd ${escapeHtml(String(crowd))}</span>
    <span>🌦 Weather ${escapeHtml(String(wx))}</span>
    <span>🚗 Traffic ${escapeHtml(String(traffic))}</span>
    <span>🌅 Scenic ${escapeHtml(String(scenic))}</span>
  </div>
  ${why ? `<div style="margin-top:8px;"><div style="font-size:11px;opacity:.7;margin-bottom:4px;">WHY?</div>${why}</div>` : ''}
  ${depart ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border-subtle,#333);">Recommended departure <strong>${escapeHtml(depart)}</strong></div>` : ''}
  ${conf ? `<div style="margin-top:6px;font-size:11px;opacity:.75;">Confidence: ${escapeHtml(conf)}</div>` : ''}
  ${sourceNote ? `<div style="margin-top:4px;font-size:10px;opacity:.6;">${escapeHtml(sourceNote)}</div>` : ''}
</div>`.trim();
}

async function bestTimeToVisit(query){
  const place=ti_findPlace(query);
  const weather={tempC:realTemp, condition:realWeatherMain};
  if(place){
    try{
      const profile=await API.timeIntelligenceTemporalProfile(ti_placePayload(place), { weather, at:new Date().toISOString(), stepMin:30, horizonHours:24, personas:Array.from(document.querySelectorAll('.pref:checked')).map(c=>c.value), tripMode:window.selectedTripMode||null });
      const top=(profile.windows||[]).slice(0,3).map(w=>`<strong>${w.start}–${w.end}</strong> (${w.score}/100, ${w.confidence}% confidence)`).join('<br>');
      const base=`⏰ <strong>${place.name}</strong><br>Best future windows:<br>${top||'No strong window available from current data.'}`;
      return base + (profile.bestWindow?.reasons?.length ? `<br><small>Why: ${escapeHtml(profile.bestWindow.reasons.join(' · '))}</small>` : '');
    }catch(_e){
      try{ const {places}=await API.timeIntelligenceStatus([ti_placePayload(place)], weather); return ti_renderState(place, places[0]); }catch(_e2){ return `⏰ <strong>${escapeHtml(place.name)}</strong> — future timing data unavailable right now.`; }
    }
  }
  const pool=(LOCS.length?LOCS:itin).slice(0,8);
  if(!pool.length) return '';
  try{
    const {places}=await API.timeIntelligenceStatus(pool.map(ti_placePayload), weather);
    const openBest=places.filter(s=>s.isOpenNow && s.isBestTimeNow);
    const openNow=places.filter(s=>s.isOpenNow);
    const header=`⏰ <strong>Best time to explore ${currentCityName} right now</strong>`;
    const wxLine=`🌤️ ${realTemp}°C, ${realWeatherMain}${realTemp>=35?' — save outdoor spots for early morning or evening.':''}`;
    const body = openBest.length
      ? `✨ Perfect timing right now for: <strong>${openBest.slice(0,4).map(s=>s.name).join(', ')}</strong>`
      : openNow.length
        ? `🟢 Open now: <strong>${openNow.slice(0,4).map(s=>s.name).join(', ')}</strong>`
        : `Most spots are closed right now — best window is early morning (6–9 AM) or evening around sunset.`;
    return [header, wxLine, body].join('<br>');
  }catch(_e){ return ''; }
}

async function handleChat(){
  const inp=document.getElementById('chat-in');const val=inp.value.trim();if(!val)return;
  addMsg(escapeHtml(val),false);inp.value='';const lq=val.toLowerCase();const typing=addTypingIndicator();
  if(lq.match(/\b(best|good|right|ideal|perfect)\s+time\b|\bwhen\s+(should|to|can|is)\b.*\b(visit|go|see|explore)\b|\bwhen('s| is)?\s+the\s+best\b/)){
    const rep=await bestTimeToVisit(val);
    typing.remove();
    addMsg(rep || localChatReply(val) || nextStopFriendlyFallback());
    return;
  }
  if(lq.match(/\b(cab|fare|auto|uber|ola|rickshaw)\b/)){
    const n=itin[0];if(n){const km=cLat?hvKm(cLat,cLon,n.coords[0],n.coords[1]):3;typing.remove();addMsg(`🚕 <strong>Fare to ${n.name}</strong><br>~${km.toFixed(1)} km · Uber ₹${Math.round(km*12)}–₹${Math.round(km*18)} · Auto ₹${Math.round(km*10)}–₹${Math.round(km*14)}<br><small>💡 Ask "meter pe chaloge?" to avoid markup!</small>`);}
    else{typing.remove();addMsg(`Generate a plan first and I'll estimate your fare in ${currentCityName}! 🚕`);}return;
  }
  if(lq.match(/\b(weather|hot|cold|rain|temp)\b/)){typing.remove();addMsg(`🌤️ ${currentCityName} is ~<strong>${realTemp}°C</strong> right now.<br>${realTemp>32?'☀️ Hot! Carry water & SPF50.':realTemp>25?'🌥️ Pleasant — great for sightseeing!':'😎 Cool and comfortable!'}`);return;}
  if(lq.match(/\b(time|schedule|when|open|close)\b/)&&itin.length){typing.remove();addMsg(`🕒 <strong>Today's Schedule</strong><br>${itin.slice(0,4).map((x,i)=>`${i+1}. <strong>${x.name}</strong> ${x.sts||'--'}–${x.ets||'--'}`).join('<br>')}${itin.length>4?`<br><small>+${itin.length-4} more</small>`:''}`);return;}
  try{const text=await API.aiChat(val,currentCityName,itin.map(i=>i.name), m2t(getCurrentLocalMin()));typing.remove();addMsg(text?formatAiText(text):` Ask me about cab fares or food in ${currentCityName}! 📍`);}
  catch{
    typing.remove();
    addMsg(localChatReply(val) || nextStopFriendlyFallback());
  }
}

function nextStopFriendlyFallback(){
  const nextStop=itin[0];
  if(nextStop){
    return `AI chat is unavailable right now, but your next stop is <strong>${nextStop.name}</strong>${nextStop.sts?` at ${nextStop.sts}`:''}. Ask me about fare, weather, food, or timings and I’ll answer from your local trip data.`;
  }
  return `AI chat is unavailable right now, but I can still help with local trip info like fare, weather, timings, and food in ${currentCityName}.`;
}

function toggleVoice(){voiceOn=!voiceOn;const b=document.getElementById('btn-voice');b.textContent=voiceOn?'🔊 Voice':'🔇 Voice';b.style.color=voiceOn?'var(--purple)':'var(--text-muted)';}
function speak(t){if(!voiceOn||!window.speechSynthesis)return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t.replace(/<[^>]+>/g,''));const vs=window.speechSynthesis.getVoices();const pv=vs.find(v=>v.lang.includes('hi-IN'))||null;if(pv)u.voice=pv;u.rate=0.9;window.speechSynthesis.speak(u);}

// ── AI Tools ──────────────────────────────────────────────────────────────────
function toolFallbackPrep(){const items=['water bottle','sunscreen','walking shoes','phone charger','small cash'];if(realTemp>=32) items.push('cap or sunglasses');if(itin.some(s=>s.cat==='temple')) items.push('modest clothing for temple visits');if(itin.some(s=>s.cat==='beach')) items.push('light towel or spare clothes');return `🎒 <strong>Prep Guide</strong><br>${items.map(i=>`• ${i}`).join('<br>')}`;}
function toolFallbackTripTribe(userName,prefs,travelStyle,dates){return `👥 <strong>Your Trip Tribe Profile</strong><br><br><strong>${userName}</strong> — ${travelStyle}<br>City: ${currentCityName}<br>Date: ${dates}<br>Interests: ${(prefs||[]).join(', ') || 'sightseeing, food, culture'}<br><br><em>Looking for easy-going travel buddies for food, sightseeing, and local exploration.</em><br><br><div style="background:var(--gold-glow);border:1px solid var(--gold-border);border-radius:12px;padding:10px 12px;margin-top:8px;font-size:11px;color:var(--gold)">🚧 <strong>Coming Soon:</strong> Live matchmaking with other travellers visiting ${currentCityName} on the same dates! Share your profile via WhatsApp to find travel buddies now.</div>`;}
async function prepGuide(){if(!itin.length){addMsg('Generate a plan first!');return;}switchToView('chat-view',2);addMsg(`<span style="color:var(--jade)">🎒 Generating prep guide…</span>`);const typing=addTypingIndicator();try{const t=await API.aiPrep(currentCityName,itin.slice(0,2).map(i=>i.name));typing.remove();addMsg(t?formatAiText(t).replace(/^- /gm,'• '):toolFallbackPrep());}catch{typing.remove();addMsg(toolFallbackPrep());}}
function postcard(){if(!itin.length){addMsg('Generate a plan first!');return;}switchToView('chat-view',2);addMsg(`📸 <strong>${currentCityName} Postcard!</strong><br><img src="https://images.unsplash.com/photo-1506461883276-594a12b11ac3?w=320&h=160&fit=crop" style="width:100%;border-radius:10px;margin-top:6px">`);}
async function handleAiLens(event){const file=event.target.files[0];if(!file)return;const r=new FileReader();r.onload=async ev=>{switchToView('chat-view',2);const src=ev.target.result;addMsg(`📸 <strong>Photo received!</strong><br><img src="${src}" style="width:100%;max-height:160px;object-fit:contain;border-radius:8px;margin-top:6px">`);const[,meta,b64]=src.match(/^data:([^;]+);base64,(.+)$/);const typing=addTypingIndicator();try{const t=await API.aiLens(b64,meta,currentCityName);typing.remove();if(t)addMsg(formatAiText(t));}catch{typing.remove();addMsg('🔍 Could not identify. Try a clearer photo.');}};r.readAsDataURL(file);}
async function getInstaSpots(){if(!itin.length){addMsg('Generate a plan first!');switchToView('chat-view',2);return;}switchToView('chat-view',2);addMsg(`<span style="color:var(--ocean)">📸 Scouting best photo spots…</span>`);const typing=addTypingIndicator();try{const t=await API.aiInstaSpots(currentCityName,itin.slice(0,2).map(i=>i.name));typing.remove();addMsg(t?formatAiText(t):'📸 Sunrise is always the best light!');}catch{typing.remove();addMsg('📸 Sunrise is always the best light!');}}
async function getSouvenirGuide(){switchToView('chat-view',2);addMsg(`<span style="color:var(--sand)">🛍️ Finding best souvenirs in ${currentCityName}…</span>`);const typing=addTypingIndicator();try{const t=await API.aiSouvenirGuide(currentCityName);typing.remove();addMsg(t?formatAiText(t):'🛍️ Local handicrafts are always a great choice!');}catch{typing.remove();addMsg('🛍️ Local handicrafts are always a great choice!');}}
async function aiSuggestAlternative(){if(!itin.length){addMsg('Generate a plan first!');return;}addMsg(`<span style="color:var(--purple)">✨ Finding alternative to ${itin[0].name}…</span>`);const typing=addTypingIndicator();try{const t=await API.aiAlternative(currentCityName,itin[0].name);typing.remove();addMsg(t?formatAiText(t):'Try asking locals for a hidden gem!');}catch{typing.remove();addMsg('Try asking locals for a hidden gem!');}}

// ── Weather Alerts ────────────────────────────────────────────────────────────
async function showWeatherAlerts(){
  if(!itin.length){addMsg('Generate a plan first!');return;}
  const lat=cLat||CITIES[currentCityId]?.lat;const lon=cLon||CITIES[currentCityId]?.lon;
  if(!lat){addMsg('⚠️ Location not available.');return;}
  switchToView('plan-view',1);addMsg('🌦️ Fetching weather for each stop...');
  try{
    const data=await API.fetchWeatherAlerts(lat,lon,itin.map(l=>({name:l.name,cat:l.cat,ot:l.ot,ct:l.ct})));
    data.stops.forEach((s,i)=>{const el=document.getElementById(`wx-${itin[i]?.id}`);if(!el)return;el.style.display='block';el.className=`wx-alert ${s.alertLevel}`;el.innerHTML=`<span>${s.emoji}</span><div><div>${s.advice}</div><div class="wx-best-time">⏰ ${s.bestTime}</div></div>`;});
    switchToView('chat-view',2);
    addMsg(`🌦️ <strong>Weather Alerts</strong><br><br>${data.stops.map(s=>`${s.emoji} <strong>${s.name}</strong> — ${s.temp}°C, ${s.desc}${s.rainProb>40?` 🌧️ ${s.rainProb}% rain`:''}`).join('<br>')}`);
    const danger=data.stops.filter(s=>s.alertLevel==='danger');if(danger.length)addMsg(`⚠️ Severe weather at: ${danger.map(s=>s.name).join(', ')}!`);
  }catch(_e){addMsg('⚠️ Could not fetch weather alerts.');}
}

// ── PDF Generator ─────────────────────────────────────────────────────────────
async function generateTripPDF(){
  if(!mdPlan.length){addMsg('Generate a plan first!');return;}
  if(!window.jspdf){addMsg('📄 Loading PDF generator...');await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
  const{jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const W=210,margin=16;let y=20;
  const addLine=(text,size=10,bold=false,color=[30,30,30])=>{doc.setFontSize(size);doc.setFont('helvetica',bold?'bold':'normal');doc.setTextColor(...color);const lines=doc.splitTextToSize(text,W-margin*2);lines.forEach(line=>{if(y>270){doc.addPage();y=20;}doc.text(line,margin,y);y+=size*.45+1;});y+=1;};
  doc.setFillColor(0,100,150);doc.rect(0,0,W,28,'F');doc.setTextColor(255,255,255);doc.setFontSize(20);doc.setFont('helvetica','bold');doc.text('India In-Time',margin,12);doc.setFontSize(11);doc.setFont('helvetica','normal');doc.text(`Trip Summary — ${currentCityName}`,margin,20);doc.setFontSize(9);doc.text(`Generated: ${new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}`,margin,26);y=36;
  doc.setFillColor(240,248,255);doc.roundedRect(margin-4,y-6,W-margin*2+8,10,2,2,'F');doc.setTextColor(0,80,150);doc.setFontSize(10);doc.setFont('helvetica','bold');doc.text(`${mdPlan.length} Day${mdPlan.length>1?'s':''} • ${mdPlan.flat().length} Stops • ${realTemp}°C Today`,margin,y);y+=10;
  mdPlan.forEach((day,di)=>{y+=3;addLine(`Day ${di+1}`,13,true,[0,100,150]);doc.setDrawColor(0,180,220);doc.setLineWidth(.4);doc.line(margin,y,W-margin,y);y+=4;
    day.forEach((loc,li)=>{if(y>265){doc.addPage();y=20;}addLine(`${li+1}. ${loc.name}`,10,true,[20,20,20]);addLine(`   Type: ${loc.cat} • Visit: ${fmtM(loc.vt)} • Open: ${loc.ot}–${loc.ct} • Arrive: ${loc.sts||'--'} Leave: ${loc.ets||'--'}`,8,false,[80,80,80]);if(li<day.length-1)addLine(`   → Drive ~${fmtM(day[li+1].tt||15)} to next stop`,8,false,[120,120,120]);y+=1;});
    doc.setFillColor(245,255,245);doc.roundedRect(margin-4,y-6,W-margin*2+8,10,2,2,'F');doc.setTextColor(0,120,80);doc.setFontSize(8);doc.setFont('helvetica','bold');doc.text(`Day ${di+1}: ${day.length} stops • Finish: ${day[day.length-1]?.ets||'--'}`,margin,y);y+=8;});
  y+=4;addLine('Emergency Numbers',11,true,[180,0,0]);doc.setDrawColor(220,50,50);doc.line(margin,y,W-margin,y);y+=4;[['Police','100'],['Ambulance','108'],['Fire','101'],['National Emergency','112'],['Women Helpline','1091']].forEach(([n,num])=>addLine(`${n}: ${num}`,9,false,[60,60,60]));
  doc.setFontSize(8);doc.setTextColor(150,150,150);doc.text('Generated by India In-Time • Your AI Travel Companion',margin,290);
  doc.save(`India-In-Time-${currentCityName}-Trip.pdf`);
  addMsg(`✅ <strong>PDF downloaded!</strong> Check your Downloads folder 📄`);
}

// ── Notifications ─────────────────────────────────────────────────────────────
function showToast(icon,title,msg,duration=5000){ return _showToastMod(icon,title,msg,duration); }
async function setupNotifications(){
  if(!itin.length){addMsg('Generate a plan first!');return;}
  let permGranted=false;if('Notification' in window){const p=await Notification.requestPermission();permGranted=p==='granted';}
  notifTimers.forEach(clearTimeout);notifTimers=[];const now=new Date();let scheduled=0;
  const waterEvery=getWaterReminderMinutes();
  const breakDuration=getBreakDurationMinutes();
  itin.forEach(loc=>{
    if(loc.isBreak){
      const breakStart=loc.std instanceof Date ? loc.std : null;
      if(breakStart && breakStart > now){
        const msUntilBreak=breakStart-now;
        const tid=setTimeout(()=>{
          const msg=`Time to take a ${fmtM(breakDuration || loc.vt || 10)} break. Stretch, sit down, and reset before the next stop.`;
          showToast('☕','Break Time',msg,7000);
          if(permGranted)new Notification('India In-Time ☕',{body:msg});
        },msUntilBreak);
        notifTimers.push(tid);
        scheduled++;
      }
      return;
    }
    if(!loc.ct)return;
    const[ch,cm]=loc.ct.split(':').map(Number);const closeTime=new Date();closeTime.setHours(ch,cm,0,0);
    const alertTime=new Date(closeTime.getTime()-30*60*1000);const msUntil=alertTime-now;
    if(msUntil>0){const tid=setTimeout(()=>{const msg=`${loc.name} closes at ${loc.ct}. You have 30 minutes left!`;showToast('⏰','Closing Soon!',msg,8000);if(permGranted)new Notification('India In-Time ⏰',{body:msg});},msUntil);notifTimers.push(tid);scheduled++;}
    const urgentTime=new Date(closeTime.getTime()-5*60*1000);const msUrgent=urgentTime-now;
    if(msUrgent>0){const tid2=setTimeout(()=>{showToast('🚨','Last Call!',`⚠️ Only 5 minutes left at ${loc.name}!`,8000);if(permGranted)new Notification('India In-Time 🚨',{body:`5 min left at ${loc.name}!`});},msUrgent);notifTimers.push(tid2);}
  });
  if(waterEvery>0){
    let waterAt=new Date(now.getTime() + waterEvery*60*1000);
    const finalStop=itin[itin.length-1]?.etd instanceof Date ? itin[itin.length-1].etd : new Date(now.getTime() + getTripMinutes()*60*1000);
    while(waterAt < finalStop){
      const msUntilWater=waterAt-now;
      const tid=setTimeout(()=>{
        const msg=`Drink some water now so you stay fresh for the rest of your ${currentCityName} trip.`;
        showToast('💧','Hydration Reminder',msg,7000);
        if(permGranted)new Notification('India In-Time 💧',{body:msg});
      },msUntilWater);
      notifTimers.push(tid);
      scheduled++;
      waterAt=new Date(waterAt.getTime() + waterEvery*60*1000);
    }
  }
  if(scheduled>0){addMsg(`🔔 <strong>Notifications set!</strong> You'll get stop closing alerts, planned break reminders, and drink-water nudges.<br><small style="color:var(--text-muted)">${scheduled} reminders scheduled.</small>`);showToast('🔔','Alerts Enabled!',`${scheduled} reminders scheduled for today.`,4000);}
  else addMsg('⚠️ No upcoming closing times found for today.');
}

// ── Budget ────────────────────────────────────────────────────────────────────
function addExpense(){const ni=document.getElementById('exp-name'),ci=document.getElementById('exp-cost');if(!ni||!ci)return;const n=ni.value.trim(),c=parseFloat(ci.value);if(!n||isNaN(c)||c<=0)return;expenses.push({id:Date.now(),n,c});ni.value='';ci.value='';updateBudget();if(currentUser)saveUserData();}
function delExp(id){expenses=expenses.filter(e=>e.id!==id);updateBudget();}
function updateBudget(){const lim=parseFloat(document.getElementById('bud-limit')?.value)||0;const grp=Math.max(1,parseInt(document.getElementById('grp-sz')?.value)||1);const sp=expenses.reduce((s,e)=>s+e.c,0),rem=lim-sp;const re=document.getElementById('bud-rem');if(re){re.textContent=`₹${rem}`;re.style.color=rem<0?'#f87171':rem<lim*.2?'#fcd34d':'var(--jade)';}const ts=document.getElementById('bud-spent');if(ts)ts.textContent=`₹${sp}`;const pp=document.getElementById('bud-pp');if(pp)pp.textContent=`₹${(sp/grp).toFixed(2)}`;const pct=lim>0?Math.min(100,(sp/lim)*100):0;const pr=document.getElementById('bud-bar');if(pr){pr.style.width=`${pct}%`;pr.style.background=pct>90?'#ef4444':pct>75?'#f59e0b':'var(--jade)';}const el=document.getElementById('exp-list');if(!el)return;el.innerHTML=expenses.length?expenses.map(e=>`<div class="exp-item"><span>${escapeHtml(e.n)}</span><div class="exp-item-right"><span style="font-weight:700">₹${e.c}</span><button class="exp-del" data-action="delExp" data-id="${e.id}">×</button></div></div>`).join(''):'<p style="text-align:center;color:var(--text-muted);font-size:11px;padding:12px;font-style:italic">No expenses yet.</p>';}
async function analyzeBudget(){if(!expenses.length){alert('Add expenses first!');return;}const total=expenses.reduce((s,e)=>s+e.c,0);const limit=document.getElementById('bud-limit')?.value||5000;renderToolsHome();switchToView('chat-view',2);addMsg(`<span style="color:var(--jade)">💰 Analyzing your budget…</span>`);const typing=addTypingIndicator();try{const t=await API.aiBudgetAnalysis(currentCityName,limit,total,expenses);typing.remove();addMsg(t?formatAiText(t):'💡 Autos are 30% cheaper than app cabs!');}catch{typing.remove();addMsg('💡 Autos are 30% cheaper than app cabs!');}}

// ── Tools Renderers ───────────────────────────────────────────────────────────
function renderToolsHome(){
  const s = stamps.size;
  const c = currentCityName;
  const totalStops = mdPlan.length ? mdPlan.reduce((sum, day) => sum + day.length, 0) : 0;
  const el = document.getElementById('tools-content');
  if(!el) return;

  el.innerHTML = [
    '<div class="budget-card" style="margin-bottom:18px;background:linear-gradient(135deg,rgba(0,212,255,.08),rgba(0,212,184,.08));border-color:rgba(0,212,255,.15)">',
      '<div class="budget-row">',
        `<div><div class="inp-lbl">Trip snapshot</div><div class="tools-section-title" style="margin:4px 0 0;font-size:18px;letter-spacing:0;color:var(--text-primary);text-transform:none">${escapeHtml(c)}</div></div>`,
        `<div class="bud-rem" style="font-size:18px">${totalStops || LOCS.length || 0}</div>`,
      '</div>',
      `<div class="bud-meta" style="margin-top:10px"><span>${mdPlan.length ? 'Generated itinerary ready to explore' : 'Planner ready for your next route build'}</span><span>${s} passport stamps</span></div>`,
    '</div>',

    // UTILITIES
    '<div class="tools-section-title">Utilities</div>',
    '<div class="tool-cards">',
      '<div class="tool-card" data-action="renderLingo"><div class="tool-icon">🗣️</div><div class="tool-name">Lingo</div><div class="tool-desc">Local phrases</div></div>',
      '<div class="tool-card" data-action="renderSafety"><div class="tool-icon">🚨</div><div class="tool-name">Safety</div><div class="tool-desc">Emergency contacts</div></div>',
      '<div class="tool-card" data-action="renderBudget"><div class="tool-icon">💸</div><div class="tool-name">Budget</div><div class="tool-desc">Expense splitter</div></div>',
      '<div class="tool-card" data-action="renderPassport"><div class="tool-icon">🛂</div><div class="tool-name">Passport</div><div class="tool-desc">'+s+' stamps</div></div>',
    '</div>',

    // SHARE & SAVE
    '<div class="tools-section-title">Share & Save</div>',
    '<div class="tool-cards">',
      '<div class="tool-card" data-action="saveIt"><div class="tool-icon">💾</div><div class="tool-name">Save Plan</div><div class="tool-desc">Sync to cloud ☁️</div></div>',
      '<div class="tool-card" data-action="shareIt"><div class="tool-icon">📤</div><div class="tool-name">Share Trip</div><div class="tool-desc">Copy & share</div></div>',
      '<div class="tool-card" data-action="waShare"><div class="tool-icon">💬</div><div class="tool-name">WhatsApp</div><div class="tool-desc">Share to WhatsApp</div></div>',
      '<div class="tool-card" data-action="toggleLoadPanel"><div class="tool-icon">📂</div><div class="tool-name">My Plans</div><div class="tool-desc">Cloud + local ☁️</div></div>',
    '</div>',

    // EXCLUSIVE — 8 NEW FEATURES
    '<div class="tools-section-title">🚀 Exclusive — Not on Google Maps</div>',
    '<div class="tool-cards">',
      '<div class="tool-card" data-action="showFestivalRadar"><div class="tool-icon">🎪</div><div class="tool-name">Festival Radar</div><div class="tool-desc">Events today</div></div>',
      '<div class="tool-card" data-action="showHiddenGems"><div class="tool-icon">💎</div><div class="tool-name">Hidden Gems</div><div class="tool-desc">Secret spots</div></div>',
      '<div class="tool-card" data-action="showHartaalAlert"><div class="tool-icon">⚡</div><div class="tool-name">Strike Alert</div><div class="tool-desc">Bandh warning</div></div>',
      '<div class="tool-card" data-action="showCrowdPredictor"><div class="tool-icon">🧠</div><div class="tool-name">Crowd Predictor</div><div class="tool-desc">Best time to visit</div></div>',
      '<div class="tool-card" data-action="showFareNegotiator"><div class="tool-icon">💸</div><div class="tool-name">Fare Negotiator</div><div class="tool-desc">Exact price + script</div></div>',
      '<div class="tool-card" data-action="showTripTribe"><div class="tool-icon">👥</div><div class="tool-name">Trip Tribe</div><div class="tool-desc">Find travel buddies</div></div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="ar-in2">',
        '<div class="tool-icon">🔮</div><div><div class="tool-name">AR Overlay</div><div class="tool-desc">Point at any building for history & tips</div></div>',
        '<input type="file" id="ar-in2" accept="image/*" style="display:none" data-file-action="handleArOverlay">',
      '</div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="food-safety-in2">',
        '<div class="tool-icon">🍡</div><div><div class="tool-name">Food Safety Scanner</div><div class="tool-desc">Is it safe to eat?</div></div>',
        '<input type="file" id="food-safety-in2" accept="image/*" style="display:none" data-file-action="handleFoodSafety">',
      '</div>',
    '</div>',

    // AI TOOLS
    '<div class="tools-section-title">AI Tools for '+c+'</div>',
    '<div class="tool-cards">',
      '<div class="tool-card" data-action="prepGuide"><div class="tool-icon">🎒</div><div class="tool-name">Prep Guide</div><div class="tool-desc">What to pack</div></div>',
      '<div class="tool-card" data-action="getInstaSpots"><div class="tool-icon">📸</div><div class="tool-name">Insta-Spots</div><div class="tool-desc">Best photo angles</div></div>',
      '<div class="tool-card" data-action="getSouvenirGuide"><div class="tool-icon">🛍️</div><div class="tool-name">Souvenirs</div><div class="tool-desc">What to buy</div></div>',
      '<div class="tool-card" data-action="showTripRating"><div class="tool-icon">⭐</div><div class="tool-name">Rate My Trip</div><div class="tool-desc">AI trip report</div></div>',
      '<div class="tool-card" data-action="showReplanner"><div class="tool-icon">🧭</div><div class="tool-name">Replanner</div><div class="tool-desc">Running late?</div></div>',
      '<div class="tool-card" data-action="startVoiceInput"><div class="tool-icon">🎤</div><div class="tool-name">Voice AI</div><div class="tool-desc">Talk to assistant</div></div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="caption-in2">',
        '<div class="tool-icon">📸</div><div><div class="tool-name">AI Photo Captions</div><div class="tool-desc">Instagram captions</div></div>',
        '<input type="file" id="caption-in2" accept="image/*" style="display:none" data-file-action="handleCaption">',
      '</div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="translate-in2">',
        '<div class="tool-icon">🌐</div><div><div class="tool-name">Translate Sign / Menu</div><div class="tool-desc">Any language</div></div>',
        '<input type="file" id="translate-in2" accept="image/*" style="display:none" data-file-action="handleTranslate">',
      '</div>',
      '<div class="tool-card" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:12px" data-action="clickFileInput" data-input-id="lens-in2">',
        '<div class="tool-icon">🔍</div><div><div class="tool-name">AI Lens</div><div class="tool-desc">Identify landmarks</div></div>',
        '<input type="file" id="lens-in2" accept="image/*" style="display:none" data-file-action="handleAiLens">',
      '</div>',
    '</div>'
  ].join('');
}
function renderLingo(){
  switchToView('tools-view', 3, true);
  const phrases=[{en:'How much is this?',te:'Bhaiya, kitne ka hai?'},{en:'Where is the washroom?',te:'Washroom kahan hai?'},{en:'Stop the auto here',te:'Yahan rok do'},{en:'No spicy please',te:'Mirchi kam daalna'},{en:'Yes / No',te:'Haan / Nahi'},{en:'Too expensive!',te:'Bahut mehenga hai!'}];
  const tc=document.getElementById('tools-content');
  if(tc) tc.innerHTML=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">🗣️ Local Lingo</div></div><div class="lingo-list">${phrases.map(p=>`<div class="lingo-card"><div><div class="lingo-en">${p.en}</div><div class="lingo-te">${p.te}</div></div><button class="lingo-speak" data-action="speak" data-text="${escapeHtml(p.te || '')}">🔊</button></div>`).join('')}</div>`;
}
function renderSafety(){
  switchToView('tools-view', 3, true);
  const cityQuery=encodeURIComponent(`${currentCityName} hospitals`);
  const nearbyQuery=encodeURIComponent(cLat&&cLon?`${cLat},${cLon} hospitals`:`hospitals near ${currentCityName}`);
  const tc=document.getElementById('tools-content');
  if(tc) tc.innerHTML=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">🚨 Emergency Safety</div></div><div class="emergency-block"><div class="emergency-block-title">Urgent Help</div><div class="emergency-list"><a href="tel:112" class="emer-card"><div class="emer-left"><span class="emer-ico">🚓</span><span class="emer-name">National Emergency</span></div><span class="emer-num">112</span></a><a href="tel:100" class="emer-card"><div class="emer-left"><span class="emer-ico">🚓</span><span class="emer-name">Police</span></div><span class="emer-num">100</span></a><a href="tel:108" class="emer-card"><div class="emer-left"><span class="emer-ico">🚑</span><span class="emer-name">Ambulance</span></div><span class="emer-num">108</span></a><a href="tel:101" class="emer-card"><div class="emer-left"><span class="emer-ico">🚒</span><span class="emer-name">Fire</span></div><span class="emer-num">101</span></a><a href="tel:1091" class="emer-card"><div class="emer-left"><span class="emer-ico">👩</span><span class="emer-name">Women Helpline</span></div><span class="emer-num">1091</span></a></div></div><div class="emergency-block"><div class="emergency-block-title">Hospitals</div><div class="emergency-list"><a href="https://www.google.com/maps/search/?api=1&query=${nearbyQuery}" target="_blank" class="emer-card"><div class="emer-left"><span class="emer-ico">🏥</span><span class="emer-name">Nearby Hospitals</span></div><span class="emer-num">Open</span></a><a href="https://www.google.com/maps/search/?api=1&query=${cityQuery}" target="_blank" class="emer-card"><div class="emer-left"><span class="emer-ico">🩺</span><span class="emer-name">${escapeHtml(currentCityName)} Hospitals</span></div><span class="emer-num">Maps</span></a></div></div><button class="emer-share-btn" data-action="shareEmergency">📍 Share My Live Location</button>`;
}
function renderBudget(){
  switchToView('tools-view', 3, true);
  const tc=document.getElementById('tools-content');
  if(tc) tc.innerHTML=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">💸 Budget Splitter</div></div><div class="budget-card"><div class="budget-row"><div class="bud-field-wrap"><div class="inp-lbl">Total Budget</div><div class="bud-currency"><span class="bud-sym">₹</span><input type="number" class="bud-inp" id="bud-limit" value="5000" data-input-action="updateBudget"></div></div><div class="bud-field-wrap"><div class="inp-lbl">Group Size</div><div class="bud-currency"><span style="font-size:18px">👥</span><input type="number" class="bud-inp" id="grp-sz" value="1" min="1" style="width:50px" data-input-action="updateBudget"></div></div><div class="bud-field-wrap" style="text-align:right"><div class="inp-lbl">Remaining</div><div class="bud-rem" id="bud-rem">₹5000</div></div></div><div class="prog-bar"><div class="prog-fill" id="bud-bar" style="width:0%"></div></div><div class="bud-meta"><span>Spent: <strong id="bud-spent">₹0</strong></span><span style="color:var(--purple);font-weight:700">Per person: <strong id="bud-pp">₹0.00</strong></span></div></div><div class="exp-add-row"><input type="text" id="exp-name" class="inp-field" placeholder="What did you buy?"><input type="number" id="exp-cost" class="inp-field small" placeholder="₹"><button class="btn-add-exp" data-action="addExpense">+</button></div><div class="exp-list" id="exp-list"><p style="text-align:center;color:var(--text-muted);font-size:11px;padding:12px;font-style:italic">No expenses yet.</p></div><button class="btn-ai-budget" data-action="analyzeBudget">✨ AI Budget Analyzer</button>`;
  updateBudget();
}
function renderPassport(){
  switchToView('tools-view', 3, true);
  const catIcon={beach:'🏖️',temple:'🛕',food:'🍛',scenic:'⛰️'};
  const tc=document.getElementById('tools-content');
  if(tc) tc.innerHTML=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button data-action="renderToolsHome" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:5px 10px;color:var(--text-secondary);font-size:12px;cursor:pointer">← Back</button><div class="tools-section-title" style="margin:0">🛂 Passport — ${stamps.size} Stamps</div></div><p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;text-align:center">Visit places to collect stamps!</p><div class="passport-grid">${LOCS.map(loc=>{const u=stamps.has(loc.id);return`<div class="passport-stamp${u?' unlocked':''}" data-action="${u?'chatAbout':''}" data-name="${escapeHtml(loc.name)}" role="button" tabindex="${u?0:-1}" style="${!u?'opacity:0.55;filter:grayscale(1)':''}"><div class="stamp-icon">${u?catIcon[loc.cat]||'📍':'🔒'}</div><div class="stamp-name${u?' unlocked':''}">${escapeHtml(loc.name)}</div>${u?'<div class="stamp-badge">✓</div>':''}</div>`;}).join('')}</div>`;
}

// ── View switching ────────────────────────────────────────────────────────────
const viewIds=['map-view','plan-view','chat-view','tools-view'];
function switchToView(viewId,idx,skipRenderHome=false){
  viewIds.forEach(v=>{const el=document.getElementById(v);if(el){el.classList.remove('active');el.style.display='none';}});
  const target=document.getElementById(viewId);
  if(target){
    target.classList.add('active');
    target.style.display=viewId==='tools-view'?'block':'flex';
  }
  document.querySelectorAll('.nav-item').forEach((n,i)=>{const on=i===idx||i===3&&idx>=3;n.classList.toggle('active',on);if(on)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  if(viewId==='map-view'&&map){map.invalidateSize();setTimeout(()=>map.invalidateSize(),50);setTimeout(()=>map.invalidateSize(),300);}
  // Track history & render tools if needed (safe to call even before _trackNavHistory is defined)
  if(typeof _trackNavHistory==='function') _trackNavHistory(viewId);
  else if(!skipRenderHome && (idx===3||viewId==='tools-view')) renderToolsHome();
}

// ── Route rendering ───────────────────────────────────────────────────────────
let allPlacesMkrs = [];
function renderMapMarkers() {
  if (tripActive || (window.itin && window.itin.length > 0)) {
    allPlacesMkrs.forEach(mk => map.removeLayer(mk));
    allPlacesMkrs = [];
    return;
  }
  
  allPlacesMkrs.forEach(mk => map.removeLayer(mk));
  allPlacesMkrs = [];
  
  if (!window.LOCS || !window.LOCS.length) return;
  
  window.LOCS.forEach(l => {
    if (!hasValidCoords(l.coords)) return;

    if (l.isHiddenGem) {
      const ic = L.divIcon({
        className:'iit-marker',
        html:`<div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#a855f7,#6d28d9);border-radius:50% 50% 50% 0;transform:rotate(45deg);border:2px solid #fff;animation:gempulse 1.8s ease-in-out infinite;"><span style="transform:rotate(-45deg);font-size:12px;">💎</span></div>`,
        iconSize:[26,26], iconAnchor:[13,20]
      });
      const gemPopup = `
        <div style="min-width:200px;">
          <b>💎 ${l.name}</b> <span style="background:#a855f7;color:#fff;font-size:9px;padding:1px 6px;border-radius:4px;">HIDDEN GEM</span>
          <hr style="margin:8px 0;border-color:rgba(255,255,255,0.1)">
          <div style="font-size:11px;line-height:1.4;margin-bottom:6px;">${l.why||''}</div>
          <div style="font-size:10px;color:var(--text-muted);font-style:italic;">${l.reviewGap||''}</div>
        </div>`;
      allPlacesMkrs.push(L.marker(l.coords,{icon:ic}).addTo(map).bindPopup(gemPopup));
      return;
    }

    const exp = calculateExperienceScore(l, window.globalSimulationTime);
    let expCol = '#6b7280';
    if(exp.score > 79) expCol = '#10b981';
    else if(exp.score > 59) expCol = '#f59e0b';
    else if(exp.score > 39) expCol = '#f97316';
    else if(exp.score > 0) expCol = '#ef4444';
    
    const size = 14;
    const shadow = 'rgba(0,0,0,0.3)';
    const ic=L.divIcon({className:'iit-marker',html:`<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${expCol};border:2px solid #fff;box-shadow:0 0 8px ${shadow};"></div>`,iconSize:[size,size],iconAnchor:[size/2,size/2]});
    
    const popupHtml = `
      <div style="min-width:180px;">
        <b>${l.name}</b><br>
        <small>${(l.cat||'').toUpperCase()}</small>
        <hr style="margin:8px 0;border-color:rgba(255,255,255,0.1)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="color:${expCol};font-size:16px;">Score: ${exp.score}/100</strong>
          <span style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-size:10px;">${exp.state}</span>
        </div>
        <ul style="padding-left:16px;margin:0;font-size:11px;color:var(--text-muted);line-height:1.4;">
          ${exp.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
        ${typeof getTimeBadgesHtml==='function' ? getTimeBadgesHtml(l) : ''}
        ${typeof getTravelIntelPanelHtml==='function' ? getTravelIntelPanelHtml(l) : ''}
      </div>
    `;
    const mkr = L.marker(l.coords,{icon:ic}).addTo(map).bindPopup(popupHtml);
    allPlacesMkrs.push(mkr);
  });
  // Enrich LOCS with backend Travel Intelligence (async; next redraw shows panel)
  if (typeof enrichPlacesWithTravelIntel === 'function' && window.LOCS?.length) {
    enrichPlacesWithTravelIntel(window.LOCS);
  }
}

// …
const ROAD_ROUTE_MIRRORS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
  'https://router.project-osrm.org/route/v1/driving/'
];
async function fetchRoadRoute(raw, {accent, tripActive, routeStops}){
  const coords=raw.map(p=>`${p[1]},${p[0]}`).join(';');
  for(let mirrorIdx=0; mirrorIdx<ROAD_ROUTE_MIRRORS.length; mirrorIdx++){
    const attemptsForThisMirror = mirrorIdx===0 ? 2 : 1;
    for(let attempt=0; attempt<attemptsForThisMirror; attempt++){
      try{
        const res=await fetch(`${ROAD_ROUTE_MIRRORS[mirrorIdx]}${coords}?overview=full&geometries=geojson&steps=true`,{signal:AbortSignal.timeout(5000)});
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const d=await res.json();
        if(!d.routes?.[0]?.geometry?.coordinates) throw new Error('No route geometry');
        const lc=d.routes[0].geometry.coordinates.map(c=>[c[1],c[0]]);
        map.removeLayer(rLine);
        rLine=L.polyline(lc,{color:accent,weight:tripActive?7:4,opacity:tripActive?0.98:0.9,lineCap:'round',lineJoin:'round'}).addTo(map);
        // NOTE: deliberately no fitBounds() here while tripActive. This used
// …
        if(d.routes[0].legs){
          const activeLeg=d.routes[0].legs[0];
          if(activeLeg){routeStops[0].tt=Math.ceil(activeLeg.duration/60);nsDist=((activeLeg.distance||0)/1000).toFixed(1)+'km';nsEta=fmtM(routeStops[0].tt);}
        }
        const ns=d.routes[0].legs[0]?.steps?.find(step=>step?.name||step?.maneuver?.modifier||step?.maneuver?.type);
        if(ns){
          const road=ns.name?` via ${ns.name}`:'';
          const action=(ns.maneuver?.modifier||ns.maneuver?.type||'continue').replace(/_/g,' ');
          const navText=`Next: ${action}${road}`.trim();
          document.getElementById('nav-turn').textContent=navText;
          maybeSpeakNavInstruction(navText);
        }
        document.getElementById('nav-dist').textContent=nsDist;
        document.getElementById('nav-eta').textContent=nsEta;
        applyMapHeadingRotation();
        return true;
      }catch(e){
        browserLogger.warn(`Road routing failed (mirror ${mirrorIdx}, attempt ${attempt+1}):`,e);
      }
    }
  }
  return false;
}

async function renderRoute(){
  mkrs.forEach(mk=>map.removeLayer(mk));if(rLine)map.removeLayer(rLine);mkrs=[];
  let routeStops=getRouteStopsForDay(itin);
  if(!routeStops.length){document.getElementById('nav-next').textContent=tripActive?'Trip Complete! 🎉':'Generate a plan above';document.getElementById('nav-turn').textContent=tripActive?'All stops reached!':'Select preferences to start.';document.getElementById('nav-dist').textContent='--';document.getElementById('nav-eta').textContent='--';updateItinUI();return;}
  const routeStart=getPreviewRouteStart();
  routeStops.forEach((s,i)=>{const prev=i===0?routeStart:routeStops[i-1].coords;s.tt=prev?Math.max(5,Math.round(hvKm(prev[0],prev[1],s.coords[0],s.coords[1])/0.45)):10;});
  if(recalcTimes({trimToWindow:true})>0){
    sync();
    routeStops=getRouteStopsForDay(itin);
    if(!routeStops.length){document.getElementById('nav-next').textContent=tripActive?'Trip Complete! 🎉':'No stops fit this time window';document.getElementById('nav-turn').textContent=tripActive?'All stops reached!':'Increase the end time or duration.';document.getElementById('nav-dist').textContent='--';document.getElementById('nav-eta').textContent='--';updateItinUI();return;}
  }
  routeStops = routeStops.filter(stop => hasValidCoords(stop.coords));
  if(!routeStops.length){document.getElementById('nav-next').textContent=tripActive?'Trip Complete! 🎉':'Generate a plan above';document.getElementById('nav-turn').textContent=tripActive?'All stops reached!':'Select preferences to start.';document.getElementById('nav-dist').textContent='--';document.getElementById('nav-eta').textContent='--';updateItinUI();return;}
  const visibleStops = tripActive
    ? routeStops.filter((stop, i) => i === 0 || (i <= 2 && (!cLat || hvKm(cLat,cLon,stop.coords[0],stop.coords[1]) <= 8)))
    : routeStops;
  const activeStop = routeStops[0];
  const raw=[];
  if(tripActive && cLat&&cLon) raw.push([cLat,cLon]);
  if(tripActive && activeStop) raw.push(activeStop.coords);
  else raw.push(...visibleStops.map(l=>l.coords));
  if(routeStart&&routeStops.length){nsDist=hvKm(routeStart[0],routeStart[1],routeStops[0].coords[0],routeStops[0].coords[1]).toFixed(1)+'km';nsEta=fmtM(routeStops[0].tt);}
  const accent='#00c8f0';
  visibleStops.forEach((l)=>{
    const i = routeStops.findIndex(stop => stop.id === l.id);
    const isCurrent = i===0;
    
    // EXPERIENCE SCORE COLORS
    const exp = calculateExperienceScore(l, window.globalSimulationTime);
    let expCol = '#6b7280'; // Gray (Closed)
    if(exp.score > 79) expCol = '#10b981'; // Green
    else if(exp.score > 59) expCol = '#f59e0b'; // Yellow
    else if(exp.score > 39) expCol = '#f97316'; // Orange
    else if(exp.score > 0) expCol = '#ef4444'; // Red

    const col = tripActive && isCurrent ? '#00e5a0' : expCol;
    const size = isCurrent ? 18 : (tripActive ? 12 : 16);
    const shadow = isCurrent ? `${col}88` : 'rgba(255,255,255,0.18)';
    const label = tripActive && !isCurrent ? `<div style="position:absolute;top:-10px;right:-8px;min-width:16px;height:16px;border-radius:999px;background:rgba(8,14,26,.92);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 4px">${i+1}</div>` : '';
    const ic=L.divIcon({className:'iit-marker',html:`<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${col};border:2.5px solid #fff;box-shadow:0 0 10px ${shadow};opacity:${tripActive && !isCurrent ? 0.75 : 1}">${label}</div>`,iconSize:[size,size],iconAnchor:[size/2,size/2]});
    
    const popupHtml = `
      <div style="min-width:180px;">
        <b>${l.name}</b><br>
        <small>${isCurrent && tripActive ? 'Next stop' : `Visit: ${fmtM(l.vt)}`}</small>
        <hr style="margin:8px 0;border-color:rgba(255,255,255,0.1)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="color:${expCol};font-size:16px;">Score: ${exp.score}/100</strong>
          <span style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-size:10px;">${exp.state}</span>
        </div>
        <ul style="padding-left:16px;margin:0;font-size:11px;color:var(--text-muted);line-height:1.4;">
          ${exp.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
        ${typeof getTimeBadgesHtml==='function' ? getTimeBadgesHtml(l) : ''}
        ${typeof getTravelIntelPanelHtml==='function' ? getTravelIntelPanelHtml(l) : ''}
      </div>
    `;
    mkrs.push(L.marker(l.coords,{icon:ic}).addTo(map).bindPopup(popupHtml));
  });
  if(raw.length>=2){
    rLine=L.polyline(raw,{color:accent,weight:tripActive?6:4,opacity:tripActive?0.95:0.85,lineCap:'round',lineJoin:'round'}).addTo(map);
    if(!tripActive) map.fitBounds(rLine.getBounds(),{padding:[60,100]});
  }
  document.getElementById('nav-next').textContent=routeStops[0].name;const defaultNavText=`Head towards ${routeStops[0].name} (~${nsDist})`;document.getElementById('nav-turn').textContent=defaultNavText;document.getElementById('nav-turn-icon').textContent=turnArrowForInstruction(defaultNavText);document.getElementById('nav-dist').textContent=nsDist;document.getElementById('nav-eta').textContent=nsEta;
  const roadRouteApplied = raw.length >= 2 ? await fetchRoadRoute(raw, {accent, tripActive, routeStops}) : false;
  if(!roadRouteApplied && tripActive){
    // The public OSRM demo mirror(s) are rate-limited/shared and this
// …
    clearTimeout(window._roadRouteRetryTimer);
    window._roadRouteRetryTimer = setTimeout(()=>{ if(tripActive) renderRoute(); }, 4000);
  }
  if(recalcTimes({trimToWindow:true})>0){sync();return renderRoute();}
  updateItinUI();
  if(streetQuestActive) setupStreetQuest();
}

function fmt12(d){const h=d.getHours(),m=d.getMinutes(),ap=h>=12?'PM':'AM',hh=h%12||12,mm=String(m).padStart(2,'0');return `${hh}:${mm} ${ap}`;}
function getScheduleStart(){const startMin=t2m(document.getElementById('s-time')?.value||'09:00',9*60);const t=new Date();t.setHours(Math.floor(startMin/60),startMin%60,0,0);return t;}
function getScheduleEnd(){return new Date(getScheduleStart().getTime()+getTripMinutes()*60000);}
// Tracks the signature of the last "stops didn't fit" notice we showed the
// user, so a plan that keeps re-rendering (e.g. live GPS ticks) doesn't spam
// the same warning every few seconds. Reset whenever a fresh plan is built.
let _lastTrimNoticeSignature = '';
function resetTrimNotice(){ _lastTrimNoticeSignature=''; }
function recalcTimes(opts={}){
  const trimToWindow=!!opts.trimToWindow;
  const windowEnd=getScheduleEnd();
  let t=getCurTime();
  const kept=[];
  let dropped=0;
  let droppedNames=[];
  const startBase=getScheduleStart();
  const dayStartMin=startBase.getHours()*60+startBase.getMinutes();
  for(const loc of itin){
    const fixedAt=loc.arriveAt && /^\d{1,2}:\d{2}$/.test(String(loc.arriveAt).trim());
    if(!tripActive && (loc.geoOptimized || loc.scheduleLocked) && (fixedAt || loc.arriveMin!=null)){
      const arriveMin = loc.arriveMin!=null ? loc.arriveMin : t2m(loc.arriveAt, dayStartMin);
      const leaveMin = (loc.leaveAt && /^\d{1,2}:\d{2}$/.test(String(loc.leaveAt).trim()))
        ? t2m(loc.leaveAt, arriveMin+Math.max(1,parseInt(loc.vt,10)||45))
        : arriveMin+Math.max(1,parseInt(loc.vt,10)||45);
      const arrive=new Date(startBase); arrive.setHours(Math.floor(arriveMin/60),arriveMin%60,0,0);
      const depart=new Date(startBase); depart.setHours(Math.floor(leaveMin/60),leaveMin%60,0,0);
      loc.sts=fmt12(arrive); loc.std=arrive; loc.ets=fmt12(depart); loc.etd=depart;
      loc.arriveMin=arriveMin; loc.arriveAt=m2t(arriveMin); loc.leaveAt=m2t(leaveMin);
      kept.push(loc); t=depart; continue;
    }
    const travel=Math.max(0,parseInt(loc.tt,10)||0);
    const visit=Math.max(0,parseInt(loc.vt,10)||0);
    const arrive=new Date(t.getTime()+travel*60000);
    const depart=new Date(arrive.getTime()+visit*60000);
    if(trimToWindow && depart>windowEnd){
      dropped=itin.length-kept.length;
      droppedNames=itin.slice(kept.length).filter(l=>!l.isBreak).map(l=>l.name);
      break;
    }
    const am=arrive.getHours()*60+arrive.getMinutes();
    loc.sts=fmt12(arrive);loc.std=new Date(arrive);loc.ets=fmt12(depart);loc.etd=new Date(depart);
    loc.arriveMin=am; loc.arriveAt=m2t(am); loc.leaveAt=m2t(depart.getHours()*60+depart.getMinutes());
    kept.push(loc);
    t=depart;
  }
  if(trimToWindow&&dropped>0){
    itin=kept;
    if(droppedNames.length && typeof addMsg==='function'){
      const sig=(opts.dayLabel||'')+'|'+droppedNames.join('|');
      if(sig!==_lastTrimNoticeSignature){
        _lastTrimNoticeSignature=sig;
        const n=droppedNames.length;
        const planRef=opts.dayLabel?`${opts.dayLabel}'s plan`:`today's plan`;
        addMsg(`⚠️ <strong>${n} nearby stop${n>1?'s':''} didn't fit ${opts.dayLabel?`${opts.dayLabel}'s`:'your'} time window</strong> and ${n>1?'were':'was'} dropped from ${planRef}: <strong>${droppedNames.join('</strong>, <strong>')}</strong>. Extend your end time / trip duration, or tap <strong>+ Add Nearby</strong> to bring ${n>1?'them':'it'} back in.`);
      }
    }
  }
  return dropped;
}
function getCurTime(){let t=getScheduleStart();if(tripActive&&tripStart)t=new Date(t.getTime()+(Date.now()-tripStart));return t;}

function updateItinUI(){
  // Always show stops in chronological order
  try {
    itin = (itin||[]).slice().sort((a,b)=>{
      const am = a.arriveMin != null ? a.arriveMin : (a.std instanceof Date ? a.std.getHours()*60+a.std.getMinutes() : t2m(a.arriveAt||a.sts||'09:00'));
      const bm = b.arriveMin != null ? b.arriveMin : (b.std instanceof Date ? b.std.getHours()*60+b.std.getMinutes() : t2m(b.arriveAt||b.sts||'09:00'));
      return am - bm;
    });
    if (mdPlan[dayIdx]) mdPlan[dayIdx] = itin;
  } catch (_e) {}

  const list=document.getElementById('plan-list');list.innerHTML='';
  if(!itin.length){list.innerHTML='<div class="empty-state"><div class="empty-icon">🏁</div><p class="empty-txt">All done for today!</p><p class="empty-sub">The current day has no remaining stops.</p></div>';document.getElementById('st-finish').textContent='--:--';updatePlannerShowcase();return;}

  // Mission Control Pro Analytics calculations
  const expMins = itin.filter(s => !s.isBreak).reduce((acc, s) => acc + (s.vt || 45), 0);
  const transitMins = itin.reduce((acc, s) => acc + (s.tt || 15), 0);
  const ritualMins = itin.filter(s => s.cultural || s.signatureDish || s.cat === 'food' || s.cat === 'temple').reduce((acc, s) => acc + Math.min(s.vt || 30, 30), 0);
  const totalM = Math.max(1, expMins + transitMins);
  const expPct = Math.round((expMins / totalM) * 100);
  const transitPct = Math.round((transitMins / totalM) * 100);
  const spatialScore = (98.6 - (itin.length > 5 ? 1.4 : 0)).toFixed(1);

  const opsBanner = document.createElement('div');
  opsBanner.className = 'pro-analytics-banner fade-in';
  opsBanner.innerHTML = `
    <div class="pab-top">
      <div class="pab-title"><span class="pab-pulse"></span> MISSION CONTROL · OPS HUD</div>
      <div class="pab-score"><span class="pab-val">${spatialScore}%</span> <span class="pab-lbl">Spatial Fit</span></div>
    </div>
    <div class="itin-analytics-bar">
      <div class="analytics-segment seg-explore" style="width:${expPct}%" title="Sightseeing & Exploration (${expMins}m)"></div>
      <div class="analytics-segment seg-transit" style="width:${transitPct}%" title="Optimized Transit (${transitMins}m)"></div>
      <div class="analytics-segment seg-ritual" style="width:${Math.min(100, Math.max(10, Math.round((ritualMins / totalM) * 100)))}%" title="Cultural & Food (${ritualMins}m)"></div>
    </div>
    <div class="pab-legend">
      <span class="pab-leg-item"><span class="dot dot-exp"></span> Explore ${expPct}%</span>
      <span class="pab-leg-item"><span class="dot dot-tra"></span> Transit ${transitPct}%</span>
      <span class="pab-leg-item"><span class="dot dot-rit"></span> Culture/Food</span>
    </div>
  `;
  list.appendChild(opsBanner);

  let tv=0,tt=0,dayBudgetTotal=0;
  let ft='--:--';
  try{
    const timed=itin.filter(s=>!s.isBreak && (s.etd||s.ets||s.leaveAt));
    if(timed.length){
      timed.sort((a,b)=>{
        const ta=a.etd instanceof Date ? a.etd.getTime() : t2m(a.leaveAt||a.ets||'00:00');
        const tb=b.etd instanceof Date ? b.etd.getTime() : t2m(b.leaveAt||b.ets||'00:00');
        return ta-tb;
      });
      const last=timed[timed.length-1];
      ft=last.ets||last.leaveAt||'--:--';
    }
  }catch(_e){ ft=itin[itin.length-1]?.ets||'--:--'; }
  const imgs={beach:'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=96&h=96&fit=crop',temple:'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=96&h=96&fit=crop',food:'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=96&h=96&fit=crop',scenic:'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=96&h=96&fit=crop'};
  const startMin = t2m(document.getElementById('s-time')?.value || '09:00');
  const dow = new Date().getDay();
  itin.forEach((loc,i)=>{
    tv+=loc.vt;tt+=loc.tt;const isN=i===0&&tripActive;
    if(loc.isBreak){
      const breakCard=document.createElement('div');
      breakCard.className='break-card fade-in';
      breakCard.innerHTML=`<div class="break-card-top"><div class="break-card-title">☕ ${escapeHtml(loc.name)}</div><div class="dur-badge">${fmtM(loc.vt)}</div></div><div class="break-card-copy">Pause at ${loc.sts||'--'} and give yourself a short reset before the next stretch of the day.</div><div class="break-card-tags"><span class="break-tag">🕒 ${loc.sts||'--'} to ${loc.ets||'--'}</span><span class="break-tag">💧 Water reset</span><span class="break-tag">🧘 ${loc.climateNote||'Slow down for a moment'}</span></div>`;
      list.appendChild(breakCard);
      const nextStop=itin[i+1];
      if(nextStop && !nextStop.isBreak){const c=document.createElement('div');c.className='drive-connector';c.innerHTML=`↓ 🚗 ${fmtM(nextStop.tt)} drive`;list.appendChild(c);}
      return;
    }
    // Smart calculations
    const prevCoords = i>0 ? itin[i-1].coords : (getCityCenter() || loc.coords);
    const arriveMin = loc.std ? (loc.std.getHours()*60 + loc.std.getMinutes()) : (startMin + tt);
    const transport = getTransportOptions(prevCoords, loc.coords, currentCityId, arriveMin);
    const trafficMult = transport.trafficMult;
    const trafficInfo = getTrafficLevel(trafficMult);
    const crowdMult = getCrowdMultiplier(loc, dow, arriveMin);
    const crowdInfo = getCrowdLevel(crowdMult);
    const stopBudget = calculateStopBudget(loc, prevCoords, currentCityId);
    dayBudgetTotal += stopBudget.total;
    const km = transport.km;
    const sv=`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.coords[0]},${loc.coords[1]}`;
    const zomato=`https://www.zomato.com/search?q=${encodeURIComponent(loc.name)}`;
    const swiggy=`https://www.swiggy.com/search?query=${encodeURIComponent(loc.name)}`;
    const gmFood=`https://www.google.com/maps/search/restaurants+near+${encodeURIComponent(loc.name)}`;
    const foodLinksHTML=loc.cat==='food'?`<div class="food-links"><a href="${zomato}" target="_blank" class="food-link fl-zomato">🍽️ Zomato</a><a href="${swiggy}" target="_blank" class="food-link fl-swiggy">🛵 Swiggy</a><a href="${gmFood}" target="_blank" class="food-link fl-maps">📍 Nearby</a></div>`:`<div class="food-links"><a href="${gmFood}" target="_blank" class="food-link fl-maps" style="flex:none;padding:5px 10px">🍴 Food Nearby</a></div>`;
    const wxBadgeHTML=`<div class="wx-alert good" id="wx-${loc.id}" style="display:none"></div>`;
    const planMeta=[loc.slotLabel,loc.climateNote].filter(Boolean).join(' • ');

    // Transport options grid HTML
    const transportHTML = km > 0.1 ? `<div class="transport-grid">${transport.options.map(opt => {
      let badge = '';
      if(opt.isFastest) badge = '<span class="transport-badge fastest">⚡Fast</span>';
      else if(opt.isCheapest) badge = '<span class="transport-badge cheapest">💰Best</span>';
      return `<a href="${opt.link}" target="_blank" class="transport-card">${badge}<div class="t-icon">${opt.icon}</div><div class="t-mode">${opt.label}</div><div class="t-fare">${opt.fareStr}</div><div class="t-time">~${fmtM(opt.time)}</div></a>`;
    }).join('')}</div>` : '';

    // Traffic + Crowd + Weather + Scenic badges
    const weatherBadge = loc.weatherComfortBadge || loc.weather?.comfortBadge || '';
    const scenicBadge = loc.scenicBadge || (loc.is_sunset_spot ? '🌅 Sunset View' : '');
    const crowdBadgeStr = loc.crowdBadge || `${crowdInfo.emoji} ${crowdInfo.label}`;
    const smartBadgesHTML = `<div class="smart-time-row" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
      <span class="traffic-badge ${trafficInfo.level}">${trafficInfo.emoji} ${trafficInfo.label}</span>
      <span class="crowd-badge ${crowdInfo.level}">${crowdBadgeStr}</span>
      ${weatherBadge ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.25);font-weight:600;">${weatherBadge}</span>` : ''}
      ${scenicBadge ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(251,146,60,0.15);color:#fb923c;border:1px solid rgba(251,146,60,0.25);font-weight:600;">${scenicBadge}</span>` : ''}
    </div>`;

    const div=document.createElement('div');div.className='stop-card'+(isN?' is-next':'')+' fade-in';
    
    // Nearby places chips
    let nearbyHTML = '';
    if (Array.isArray(loc.nearbySpots) && loc.nearbySpots.length > 0) {
      nearbyHTML = `<div class="nearby-spots-box" style="margin-top:8px;padding:6px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;font-size:11px;">
        <div style="font-weight:600;color:var(--text-muted);margin-bottom:4px;display:flex;align-items:center;gap:4px;">
          <span>📍 Nearby to explore (${loc.nearbySpots.length})</span>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${loc.nearbySpots.map(n => `<span class="nearby-spot-chip" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:2px 8px;font-size:10.5px;color:var(--text-main);">${escapeHtml(n.name)} <small style="color:var(--text-muted)">(${n.distanceM ? (n.distanceM < 1000 ? n.distanceM + 'm' : (n.distanceM/1000).toFixed(1) + 'km') : ''})</small></span>`).join('')}
        </div>
      </div>`;
    } else {
      let nearestSpot = null;
      let minD = Infinity;
      if (typeof LOCS !== 'undefined' && LOCS.length) {
        for(const spot of LOCS) {
          if(spot.id === loc.id || spot.name === loc.name) continue;
          if(spot.cat === 'food' || spot.cat === 'break' || spot.isBreak) continue;
          const d = hvKm(loc.coords[0], loc.coords[1], spot.coords[0], spot.coords[1]);
          if(d < minD) { minD = d; nearestSpot = spot; }
        }
      }
      if (nearestSpot && minD <= 3.0) {
        nearbyHTML = `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;">📍 Nearest spot: <strong>${escapeHtml(nearestSpot.name)}</strong> (~${minD.toFixed(1)} km)</div>`;
      }
    }

    // Cultural Ritual / Aarti Alert
    const ritual = loc.cultural;
    const ritualHTML = ritual?.culturalBadge
      ? `<div class="cultural-ritual-chip" style="font-size:11px;color:#fbbf24;margin-top:5px;display:flex;align-items:center;gap:4px;"><span>${escapeHtml(ritual.culturalBadge)}</span> ${ritual.recommendation ? `<span style="font-size:10px;opacity:0.85;">(${escapeHtml(ritual.recommendation)})</span>` : ''}</div>`
      : '';

    // Signature Dish Companion
    const dish = loc.signatureDish;
    const dishHTML = dish?.dishName
      ? `<div class="signature-dish-chip" style="margin-top:6px;padding:4px 8px;background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.22);border-radius:6px;font-size:11px;color:#fde047;display:flex;align-items:center;gap:6px;"><span>🍛 <strong>Must-Try:</strong> ${escapeHtml(dish.dishName)} <small style="opacity:0.85;">(${escapeHtml(dish.iconicSpot)})</small></span></div>`
      : '';

    // Smart Entry Checklist & Travel Armor
    const proto = loc.entryProtocol;
    let armorHTML = '';
    if (proto) {
      const tags = [];
      if (proto.footwear?.requiredOff) tags.push(`<span style="background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);border-radius:4px;padding:1px 5px;font-size:10px;">👟 ${escapeHtml(proto.footwear.tokenStand || 'Shoes off')}</span>`);
      if (proto.dressCode?.strict) tags.push(`<span style="background:rgba(168,85,247,0.15);color:#d8b4fe;border:1px solid rgba(168,85,247,0.3);border-radius:4px;padding:1px 5px;font-size:10px;">👕 Modest / Traditional Dress</span>`);
      if (proto.security?.cloakroomRequired) tags.push(`<span style="background:rgba(249,115,22,0.15);color:#fdba74;border:1px solid rgba(249,115,22,0.3);border-radius:4px;padding:1px 5px;font-size:10px;">📱 Locker for phones</span>`);
      if (proto.tickets?.onlineQr) tags.push(`<span style="background:rgba(56,189,248,0.15);color:#7dd3fc;border:1px solid rgba(56,189,248,0.3);border-radius:4px;padding:1px 5px;font-size:10px;">🎟️ ASI QR Ticket</span>`);
      if (tags.length > 0) {
        armorHTML = `<div class="entry-armor-row" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">${tags.join('')}</div>`;
      }
    }

    const whyTimeNote = Array.isArray(loc.whyThisTime) && loc.whyThisTime.length
      ? `<div style="font-size:10.5px;color:var(--brand, #38bdf8);margin-top:4px;display:flex;align-items:center;gap:4px;">✨ <em>${escapeHtml(loc.whyThisTime[0])}</em></div>`
      : '';

    const advancedMeta = loc.bestWindow ? `⏱ Best experience ${loc.bestWindow.start || ''}–${loc.bestWindow.end || ''} · ${loc.timingFit != null ? Math.round(loc.timingFit) : '—'}% timing fit` : '';
    div.innerHTML=`<div class="dur-badge">${fmtM(loc.vt)}</div><div class="sc-row"><img src="${imgs[loc.cat]||imgs.scenic}" class="sc-img" alt="${escapeHtml(loc.name)}"><div class="sc-body"><div class="sc-name">${escapeHtml(loc.name)}</div><div class="sc-sub">${planMeta?`${planMeta}<br>`:''}🕒 ${loc.ot||'--'} – ${loc.ct||'--'}${advancedMeta?`<br>${advancedMeta}`:''}</div><div class="sc-times"><span class="time-tag">${loc.sts||loc.arriveAt||'--'}</span><span style="color:var(--text-muted);font-size:10px">→</span><span class="time-tag">${loc.ets||loc.leaveAt||'--'}</span></div>${smartBadgesHTML}${ritualHTML}${dishHTML}${armorHTML}${whyTimeNote}<div style="margin-top:4px;">${getTimeBadgesHtml(loc, loc.arriveMin)}</div>${typeof getTravelIntelPanelHtml==='function'?getTravelIntelPanelHtml(loc):''}${nearbyHTML}</div></div>${wxBadgeHTML}${transportHTML}${foodLinksHTML}<div class="sc-actions"><a href="${sv}" target="_blank" class="sc-action" title="Street View"><span>👀 360° View</span></a><button data-action="aiFoodCard" data-name="${escapeHtml(loc.name)}" data-cat="${escapeHtml(loc.cat || '')}" class="sc-action" title="AI Food Guide" style="cursor:pointer"><span>🍽️ Food Guide</span></button><button data-action="chatAbout" data-name="${escapeHtml(loc.name)}" class="sc-action" title="Ask AI Concierge" style="cursor:pointer"><span>✨ Ask AI</span></button></div>`;
    list.appendChild(div);
    const failedImg = div.querySelector('.sc-img');
    if (failedImg) failedImg.addEventListener('error', () => { failedImg.style.display = 'none'; }, { once: true });
    const nextStop=itin[i+1];
    if(nextStop && !nextStop.isBreak){const c=document.createElement('div');c.className='drive-connector';c.innerHTML=`↓ 🚗 ${fmtM(nextStop.tt)} drive`;list.appendChild(c);}
  });
  document.getElementById('st-travel').textContent=fmtM(tt);document.getElementById('st-visit').textContent=fmtM(tv);document.getElementById('st-finish').textContent=ft;
  
  // Update trip-wide budget data
  const startCoords = getCityCenter() || itin[0]?.coords;
  if (mdPlan.length > 0) tripBudgetData = calculateTripBudget(mdPlan, currentCityId, startCoords);
  renderBudgetBreakdown();
  
  // Update budget footer
  const budgetEl=document.getElementById('st-budget');
  if(budgetEl){
    const dayBud = tripBudgetData?.days?.[dayIdx];
    budgetEl.textContent = dayBud ? `₹${dayBud.total.toLocaleString('en-IN')}` : `₹${dayBudgetTotal.toLocaleString('en-IN')}`;
  }
  
  // Update plan summary budget chip
  const budChip = document.getElementById('plan-summary-chip-budget');
  if (budChip && tripBudgetData) {
    budChip.style.display = 'inline-flex';
    budChip.textContent = `💰 Est. ₹${tripBudgetData.grandTotal.total.toLocaleString('en-IN')}`;
  }
  
  updatePlannerShowcase();
}

// ── Trip Controls ─────────────────────────────────────────────────────────────
function startTrip(){if(!cLat){addMsg('📍 Waiting for GPS...');return;}if(tripActive||!itin.length)return;tripActive=true;tripStart=Date.now();lastSpokenNavInstruction='';autoFollowLive=true;navVoiceEnabled=true;updateFollowButton();const btn=document.getElementById('btn-start');btn.textContent='✅ Navigating Live';btn.disabled=true;document.getElementById('trip-st').textContent='LIVE';document.getElementById('phase1-section').style.display='none';addMsg('🟢 <strong>Navigation started!</strong> The map will now follow you live towards '+itin[0].name);updatePlannerShowcase();switchToView('map-view',0);followLivePosition(true);renderRoute();if(cLat&&cLon){lastRouteRenderPos=[cLat,cLon];lastRouteRenderAt=Date.now();}setTimeout(()=>maybeSpeakNavInstruction(`Navigation started. Head towards ${itin[0]?.name || 'your destination'}.`,true),400);}
function skipStop(){const routeStops=getRouteStopsForDay(itin);if(!routeStops.length)return;const sk=routeStops[0];itin=applyBreakPlanToCurrentItinerary(routeStops.slice(1));sync();addMsg(`⏭️ Skipped <strong>${sk.name}</strong>`);renderRoute();}
async function optimizeRoute(silent=false){
  if(!itin.length){await renderRoute();return;}
  const base=getRouteStopsForDay(itin).map(s=>({...s,scheduleLocked:false,geoOptimized:false,arriveAt:undefined,leaveAt:undefined,arriveMin:undefined}));
  itin=applyBreakPlanToCurrentItinerary(optimizeStopOrder(base,getPreviewRouteStart()));
  recalcTimes({trimToWindow:true});
  itin.forEach(s=>{
    if(s.isBreak) return;
    s.scheduleLocked=true;
    if(s.std instanceof Date){ s.arriveAt=m2t(s.std.getHours()*60+s.std.getMinutes()); s.arriveMin=s.std.getHours()*60+s.std.getMinutes(); }
    if(s.etd instanceof Date) s.leaveAt=m2t(s.etd.getHours()*60+s.etd.getMinutes());
  });
  sync(); if(!silent)addMsg('⚡ Route optimized for an easier tourist flow.');
  await renderRoute();
}
function smartExtend(){setTripMinutes(getTripMinutes()+60);syncPlannerTimeFields('duration');const ids=new Set(mdPlan.flat().filter(stop=>!stop?.isBreak).map(stop=>stop.id));const c=LOCS.filter(l=>!ids.has(l.id));if(c.length){const base=getRouteStopsForDay(itin);base.push({...c[0],tt:0});itin=applyBreakPlanToCurrentItinerary(base);sync();addMsg(`✨ Added <strong>${c[0].name}</strong>!`);renderRoute();}else addMsg('No more places available.');}
function addNearby(){const ids=new Set(mdPlan.flat().filter(stop=>!stop?.isBreak).map(stop=>stop.id));const c=LOCS.filter(l=>!ids.has(l.id));if(cLat)c.sort((a,b)=>hvKm(cLat,cLon,a.coords[0],a.coords[1])-hvKm(cLat,cLon,b.coords[0],b.coords[1]));if(c.length){const p={...c[0],tt:0};const base=getRouteStopsForDay(itin);base.splice(tripActive&&base.length>0?1:0,0,p);itin=applyBreakPlanToCurrentItinerary(base);sync();addMsg(`📍 Added detour: <strong>${p.name}</strong>`);renderRoute();}else addMsg('No more places!');}

// ── Save / Share ──────────────────────────────────────────────────────────────

// ── Save / Load plans (localStorage + optional cloud via /api/trips) ─────────
function _readLocalPlans() { return _readLocalPlansMod(); }
function _writeLocalPlans(list) { return _writeLocalPlansMod(list); }

function saveIt() {
  return _savePlanMod({
    mdPlan, currentCityName, currentCityId, cLat, cLon,
    getTripMinutes, currentUser, API, addMsg
  });
}

function delPlan(id) {
  return _deletePlanMod(id, {
    currentUser, API, renderSavedPlansList, addMsg
  });
}

function renderSavedPlansList() {
  return _renderSavedPlansListUIMod({
    currentUser, API, escapeHtml
  });
}

async function loadCloudPlan(btn) {
  const id = btn?.dataset?.id;
  if (!id || !window.API?.loadTrip) return;
  try {
    addMsg('☁️ Loading cloud trip…');
    const trip = await window.API.loadTrip(id);
    const stops = typeof trip.stopsJson === 'string' ? JSON.parse(trip.stopsJson) : (trip.stops || []);
    const config = typeof trip.configJson === 'string' ? JSON.parse(trip.configJson) : (trip.config || {});
    const multi = config.multiDay || (Array.isArray(stops?.[0]) ? stops : [stops]);
    const encoded = encodeURIComponent(JSON.stringify({
      data: JSON.stringify(multi),
      st: config.startTime || '09:00',
      et: config.endTime || '',
      tm: config.tripMinutes || 0,
    }));
    loadPlan(encoded);
  } catch (err) {
    console.warn('[loadCloudPlan]', err);
    addMsg('⚠️ Could not load cloud trip. Are you signed in?');
  }
}

function toggleLoadPanel() {
  const list = document.getElementById('plan-list');
  if (!list) return;
  if (list.dataset.mode === 'saved') {
    list.dataset.mode = '';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗺️</div><p class="empty-txt">Ready! Shape the experience and generate a polished plan.</p></div>`;
    return;
  }
  renderSavedPlansList();
  list.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

function loadPlan(sd){try{const d=JSON.parse(decodeURIComponent(sd));const l=JSON.parse(d.data);mdPlan=(l.length&&Array.isArray(l[0]))?l:[l];mdPlan=mdPlan.map(day=>Array.isArray(day)?day.map(s=>({...s,coords:normalizeLatLon(s.coords)})):day);document.getElementById('s-time').value=d.st||'09:00';if(d.tm)setTripMinutes(d.tm);if(d.et)document.getElementById('e-time').value=d.et;syncPlannerTimeFields(d.et?'end':'duration');document.getElementById('phase2-section').style.display='block';document.getElementById('aitools-section').style.display='block';renderAiToolsGrid();['btn-save','btn-share','btn-pass','btn-wa','btn-replay','btn-ls'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display='inline-flex'; });const pb=document.getElementById('weather-pivot-bar');if(pb)pb.style.display='flex';renderTabs();switchDay(0);updatePlannerShowcase();switchToView('map-view',0);addMsg('📂 Loaded! Tap Start to navigate.');}catch(_e){addMsg('⚠️ Load failed.');}}
function shareIt(){ return _shareTripTextMod(mdPlan, currentCityName, { addMsg }); }
function waShare(){
  const text = _genWhatsAppText(mdPlan, currentCityName, dayIdx);
  if (text) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  } else {
    _shareTripWhatsAppMod(mdPlan, currentCityName, { addMsg });
  }
}
function shareEmergency(){ return _shareTripEmergencyMod(cLat, cLon); }

function openOfflinePass() {
  if (!mdPlan || !mdPlan.length || !itin.length) {
    addMsg('⚠️ Generate or load an itinerary first to open the Offline Travel Pass.');
    return;
  }
  let container = document.getElementById('offline-pass-modal-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'offline-pass-modal-container';
    document.body.appendChild(container);
  }
  const modalHtml = _buildOfflinePassHtml(mdPlan, currentCityName, dayIdx, currentCityId);
  container.innerHTML = `
    <div class="custom-modal-backdrop fade-in" style="display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10900;backdrop-filter:blur(8px);padding:16px;">
      <div class="custom-modal-content" style="background:var(--bg-layer1,#10091d);border:1px solid rgba(255,255,255,0.18);border-radius:16px;max-width:560px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.7);position:relative;">
        <button data-action="closeOfflinePassModal" aria-label="Close" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.12);border:none;color:#fff;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;z-index:2;">✕</button>
        ${modalHtml}
      </div>
    </div>
  `;
}

function closeOfflinePassModal() {
  const container = document.getElementById('offline-pass-modal-container');
  if (container) container.innerHTML = '';
}

function shareWhatsAppPass() {
  const text = _genWhatsAppText(mdPlan, currentCityName, dayIdx);
  if (!text) { addMsg('⚠️ Generate a plan first!'); return; }
  _showMicroToast('Opening WhatsApp with Itinerary Pass...', { icon: '💬' });
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function pivotMonsoonMode() {
  if (!itin || !itin.length) { addMsg('⚠️ Generate a plan first to apply Monsoon Pivot.'); return; }
  const indoorPool = (LOCS || []).filter(l => ['museum', 'food', 'shopping', 'temple', 'scenic'].includes(l.cat) && l.indoor_outdoor !== 'outdoor');
  if (!indoorPool.length) { addMsg('ℹ️ No indoor alternatives found in current city catalog.'); return; }
  const baseStops = getRouteStopsForDay(itin);
  let swappedCount = 0;
  const filtered = baseStops.map(s => {
    if (['beach', 'park', 'waterfall', 'hill'].includes(s.cat)) {
      const alt = indoorPool.find(p => !baseStops.some(b => b.id === p.id && b.name === p.name)) || s;
      if (alt !== s) swappedCount++;
      return { ...alt, tt: s.tt, vt: alt.vt || 45 };
    }
    return s;
  });
  itin = applyBreakPlanToCurrentItinerary(filtered);
  mdPlan[dayIdx] = itin;
  sync();
  recalcTimes({ trimToWindow: true });
  renderRoute();
  _showMicroToast(`🌧️ Monsoon Pivot: ${swappedCount} outdoor stops swapped for covered spots!`, { icon: '🌧️' });
  addMsg(`🌧️ <strong>Monsoon Weather Pivot Applied!</strong> ${swappedCount > 0 ? `${swappedCount} outdoor stops swapped for covered museums & cozy cafes.` : 'Route protected against rainfall.'}`);
}

function pivotHeatEscapeMode() {
  if (!itin || !itin.length) { addMsg('⚠️ Generate a plan first to apply Heat Escape Pivot.'); return; }
  const indoorPool = (LOCS || []).filter(l => ['museum', 'food', 'shopping'].includes(l.cat) || l.indoor_outdoor === 'indoor');
  if (!indoorPool.length) { addMsg('ℹ️ No indoor alternatives found in current city catalog.'); return; }
  const baseStops = getRouteStopsForDay(itin);
  let swappedCount = 0;
  const adjusted = baseStops.map(s => {
    const arr = s.arriveMin || 720;
    if (arr >= 11.5 * 60 && arr <= 15.5 * 60 && ['beach', 'fort', 'park', 'hill'].includes(s.cat)) {
      const alt = indoorPool.find(p => !baseStops.some(b => b.id === p.id && b.name === p.name)) || s;
      if (alt !== s) swappedCount++;
      return { ...alt, tt: s.tt, vt: alt.vt || 50 };
    }
    return s;
  });
  itin = applyBreakPlanToCurrentItinerary(adjusted);
  mdPlan[dayIdx] = itin;
  sync();
  recalcTimes({ trimToWindow: true });
  renderRoute();
  _showMicroToast(`☀️ Heat Escape: ${swappedCount} midday stops shifted indoors!`, { icon: '☀️' });
  addMsg(`☀️ <strong>Heat Escape Pivot Applied!</strong> ${swappedCount > 0 ? `${swappedCount} midday stops shifted to AC indoor venues.` : 'Midday route optimized for heat safety.'}`);
}

// ── GPS ───────────────────────────────────────────────────────────────────────
// ── Compass button ───────────────────────────────────────────────────────────
// Shows the live heading (same lastHeading value the marker icon rotates
// …
const COMPASS_DIRS = ['North','North-East','East','South-East','South','South-West','West','North-West'];
function degToCompassLabel(deg){
  return COMPASS_DIRS[Math.round(((deg%360)+360)%360/45)%8];
}
function compassTap(){
  if(lastHeading==null){
    showToast('🧭','Direction','Start moving, or begin live navigation, to detect your heading.');
    return;
  }
  const deg=Math.round(((lastHeading%360)+360)%360);
  showToast('🧭','Heading',`${degToCompassLabel(lastHeading)} (${deg}°)`);
}

function resetGPS(){cLat=null;document.getElementById('gps-txt').textContent='GPS';initGPS();}

// ── "Locate me" map button ──────────────────────────────────────────────────
// Recenters the map on the user's live position — the same blue-dot-style
// …
let isLocating = false;
async function locateMe(){
  if (isLocating) return; // ignore rapid repeat taps while a request is in flight
  isLocating = true;
  const btn = document.getElementById('locate-me-btn');
  if (btn) { btn.disabled = true; btn.classList.add('locating'); }
  try {
    const { lat, lon } = await waitForFirstGpsFix(10000);
    map.stop();
    map.flyTo([lat, lon], Math.max(map.getZoom(), 16), { animate: true, duration: 0.8 });
  } catch (e) {
    browserLogger.warn('[locateMe] GPS fix unavailable:', e);
    alert('Could not get your location. Please check that location access is allowed for this site and try again.');
  } finally {
    isLocating = false;
    if (btn) { btn.disabled = false; btn.classList.remove('locating'); }
  }
}

function initGPS(){
  if(!('geolocation' in navigator))return;if(wid!==null)navigator.geolocation.clearWatch(wid);
  wid=navigator.geolocation.watchPosition(pos=>{
    if(!Number.isFinite(pos.coords.latitude) || !Number.isFinite(pos.coords.longitude)) return; // reject a malformed fix instead of corrupting cLat/cLon with NaN
    if(!isPlausibleGpsFix(pos)) return; // reject noisy/teleporting fixes — see isPlausibleGpsFix()
    const isF=cLat===null;cLat=pos.coords.latitude;cLon=pos.coords.longitude;
    lastAcceptedFix=[cLat,cLon];lastAcceptedFixAt=pos.timestamp;
    if(isF) notifyGpsFix(cLat,cLon); // wakes up detectAndLoadCity() if it's waiting on the first fix
    lastHeading=deriveHeading(pos);
    lastHeadingSample=[cLat,cLon];
    // Snap the *drawn* marker onto the route road for a Google-Maps-style
    // on-road position; cLat/cLon (used for ETA/arrival math elsewhere)
    // stay as the raw, unsnapped fix. See snapToRoute()/animateLiveMarkerTo().
    const [mLat,mLon]=tripActive?snapToRoute(cLat,cLon):[cLat,cLon];
    if(!liveMkr)liveMkr=L.marker([mLat,mLon],{icon:L.divIcon({className:'iit-marker',html:'<div style="width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:20px solid #2563eb;filter:drop-shadow(0 0 8px rgba(37,99,235,.8));transform-origin:50% 70%"></div>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);
    animateLiveMarkerTo(mLat,mLon);
    updateLiveMarkerHeading();
    document.getElementById('gps-txt').textContent=cLat.toFixed(3);
    if(tripActive) followLivePosition(isF);
    if(streetQuestActive) updateStreetQuestProgress();
    applyMapHeadingRotation();
    if(isF&&itin.length){renderRoute();lastRouteRenderPos=[cLat,cLon];lastRouteRenderAt=Date.now();}
    else if(tripActive){
      chkArrival();
      // The route polyline used to only be drawn from the very first GPS fix
// …
      if(itin.length){
        const movedMeters=lastRouteRenderPos?hvKm(lastRouteRenderPos[0],lastRouteRenderPos[1],cLat,cLon)*1000:Infinity;
        const staleMs=Date.now()-lastRouteRenderAt;
        if(movedMeters>25||staleMs>15000){
          lastRouteRenderPos=[cLat,cLon];lastRouteRenderAt=Date.now();
          renderRoute();
        }
      }
    }
  },err=>{document.getElementById('gps-txt').textContent='No GPS';notifyGpsError(err);},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
async function chkArrival(){
  if(!itin.length||!cLat)return;const n=getRouteStopsForDay(itin)[0];
  if(!n)return;
  if(map.distance([cLat,cLon],n.coords)<100){
    if(!stamps.has(n.id)){stamps.add(n.id);addMsg(`🏆 Passport stamp: <strong>${n.name}</strong>!`);
      if(currentUser){try{await setDoc(doc(db,'users',currentUser.uid,'data','stamps'),{stamps:[...stamps],updatedAt:serverTimestamp()});}catch(_e){}}}
    if(streetQuestActive){streetQuestScore+=25;setStreetQuestMessage(`Checkpoint reached: ${n.name}. New target loading...`);updateStreetQuestUI();}
    maybeSpeakNavInstruction(`Arrived at ${n.name}.`,true);
    addMsg(`🎉 Arrived at <strong>${n.name}</strong>!`);
    promptStopFeedback(n);
    const idx=itin.findIndex(stop=>stop.id===n.id);if(idx!==-1) itin.splice(idx,1);sync();renderRoute();
    if(!itin.length) setTimeout(()=>{ addMsg(`🏁 That's your trip complete! One last thing — got a minute to rate the overall app experience?`); showAppFeedback(); }, 1400);
  }
}

// ── Install PWA ───────────────────────────────────────────────────────────────
let dPr;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  dPr = e;
  const btn = document.getElementById('install-app-btn');
  if (btn) btn.style.display = 'block';
});

function installPWA() {
  if (dPr) {
    dPr.prompt();
    dPr.userChoice.then(() => {
      dPr = null;
      document.getElementById('install-app-btn').style.display = 'none';
      if (typeof toggleUserMenu === 'function') toggleUserMenu();
    });
  } else {
    alert("Use 'Add to Home Screen' in your browser menu!");
  }
}

window.addEventListener('offline',()=>{const t=document.getElementById('off-toast');t.style.display='block';setTimeout(()=>t.style.display='none',4000);});
window.addEventListener('online',()=>addMsg('📶 Back online!'));

// ═══════════════════════════════════════
// VOICE ASSISTANT & MEDIA TOOLS
// ═══════════════════════════════════════
function startVoiceInput() {
  return _startVoiceInputMod({
    currentCityName, itin, voiceOn, API, switchToView,
    addMsg, addTypingIndicator, formatAiText, escapeHtml, showToast, speak
  });
}

function handleCaption(event) {
  return _handleCaptionMod(event, {
    currentCityName, itin, API, switchToView, addMsg, addTypingIndicator, formatAiText
  });
}

function handleTranslate(event) {
  return _handleTranslateMod(event, {
    currentCityName, API, switchToView, addMsg, addTypingIndicator, formatAiText
  });
}

// ═══════════════════════════════════════
// FEEDBACK & RATINGS
// ═══════════════════════════════════════
function promptStopFeedback(place) {
  return _promptStopFeedbackMod(place, { escapeHtml, addMsg });
}

function rateStopClick(btn) {
  const row = btn.closest('[data-role="place-fb"]');
  if (!row) return;
  const placeId = row.dataset.placeId;
  const placeName = row.dataset.placeName;
  const rating = parseInt(btn.dataset.n, 10);
  rateStop(placeId, placeName, rating, row);
}

function rateStop(placeId, placeName, rating, row) {
  return _rateStopMod(placeId, placeName, rating, row, {
    escapeHtml, API, currentCityName, showToast, browserLogger
  });
}

function showAppFeedback() {
  return _showAppFeedbackMod({
    switchToView, registerChatActions, addMsg
  });
}

function fbSetStar(btn) { return _fbSetStarMod(btn); }
function fbSetCat(btn) { return _fbSetCatMod(btn); }
function updateFbCounter(el) { return _updateFbCounterMod(el); }
function fbSkip(btn) { return _fbSkipMod(btn); }
function fbSubmit(btn) {
  return _fbSubmitMod(btn, {
    API, currentCityId, showToast, addMsg, viewIds
  });
}

async function showTripRating() {
  if (!mdPlan.length && stamps.size === 0) { addMsg('Complete some stops first to get your trip rated! 🗺️'); return; }
  switchToView('chat-view', 2);
  addMsg('⭐ <strong>Analyzing your trip...</strong> Generating your personalized trip report!');
  const typing = addTypingIndicator();

  const allStops   = mdPlan.flat().map(s => s.name);
  const visitedStops = [...stamps].map(id => {
    const loc = LOCS.find(l => l.id === id);
    return loc ? loc.name : null;
  }).filter(Boolean);

  const totalMin = mdPlan.flat().reduce((s, l) => s + l.vt + (l.tt || 0), 0);
  const duration = fmtM(totalMin);

  try {
    const text = await API.aiTripRating(currentCityName, visitedStops.length ? visitedStops : allStops, duration, expenses, [...stamps]);
    typing.remove();
    if (text) addMsg(`⭐ <strong>Your ${currentCityName} Trip Report</strong><br><br>${formatAiText(text)}`);
  } catch { typing.remove(); addMsg('⚠️ Could not generate trip rating. Try again!'); }
}

// ═══════════════════════════════════════
// NEW FEATURE 5 — SMART DAY REPLANNER
// ═══════════════════════════════════════
async function showReplanner() {
  if (!itin.length) { addMsg('Generate a plan first to use the replanner! 🧭'); return; }
  switchToView('chat-view', 2);

  // Ask how late they are
  addMsg('🧭 <strong>Smart Replanner</strong> — How many minutes are you running late?<br><br><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
    ['15 min', '30 min', '45 min', '1 hour', '2 hours'].map(t =>
      `<button type="button" data-action="runReplannerClick" data-arg="${t}" style="background:var(--ocean-glow);border:1px solid var(--border-mid);border-radius:8px;padding:6px 12px;font-size:11px;font-weight:600;color:var(--ocean);cursor:pointer">${t}</button>`
    ).join('') + '</div>'
  );
}

function runReplannerClick(btn){ runReplanner(btn.dataset.arg); }

async function runReplanner(lateStr) {
  const minutesLate = parseInt(lateStr) || 30;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const typing = addTypingIndicator();
  addMsg(`⏰ Running ${minutesLate} minutes late at ${now}. Calculating best reroute...`);

  // Completed stops = stops that have already passed based on current time
  const completed = mdPlan.flat().filter(s => s.etd && new Date(s.etd) < new Date());
  const remaining = itin.map(s => ({ name: s.name, vt: s.vt }));

  // Actually recompute the schedule (not just advisory text): treat "now" as
  // pushed forward by the delay, so closed/no-longer-feasible stops get
  // dropped and the rest reflow automatically.
  const delayedNowMin = getCurrentLocalMin() + minutesLate;
  reoptimizeRemainingPlan(`you're running ${minutesLate} minutes late`, delayedNowMin);

  try {
    const candidates = (typeof LOCS !== 'undefined' ? LOCS : []).filter(p => !completed.some(c => c.name === p.name));
    const wx = { tempC: typeof realTemp === 'number' ? realTemp : null, condition: realWeatherMain || null, windKph: window.realWind };
    const geo = await API.timeIntelligenceReplan(candidates.length ? candidates : itin, {
      weather: wx, at: new Date().toISOString(),
      fromCoords: (Number.isFinite(cLat) && Number.isFinite(cLon)) ? [cLat, cLon] : getCityCenter(),
      startMin: delayedNowMin, endMin: 23 * 60, maxStops: Math.min(8, Math.max(3, remaining.length || 5)),
      personas: Array.from(document.querySelectorAll('.pref:checked')).map(c => c.value),
      tripMode: window.selectedTripMode || null, trigger: 'delay',
      reason: `User is running ${minutesLate} minutes late`, region: currentCityName || null,
    });
    if (geo?.stops?.length) {
      mdPlan[dayIdx] = geo.stops.map(stop => ({ ...stop, id: stop.id || stop.name, cat: stop.category || 'default', vt: stop.stayMinutes || 45, tt: stop.travelMinutes || 0, slotLabel: _dayPartForMinutes(t2m(stop.arriveAt)), temporalScore: stop.timingFit }));
      itin = mdPlan[dayIdx];
      renderTabs();
      switchDay(dayIdx, true);
      typing.remove();
      addMsg(`🧭 <strong>GeoAI itinerary updated</strong><br>Replanned from your current position using projected arrival time, weather, crowd, traffic, scenic windows and opening constraints.`);
    } else {
      const text = await API.aiReplanner(currentCityName, completed.map(s => s.name), remaining, minutesLate, now);
      typing.remove();
      if (text) addMsg(`🧭 <strong>Updated Plan</strong><br><br>${formatAiText(text)}`);
    }
  } catch { typing.remove(); addMsg('⚠️ Could not generate reroute. Try again!'); }
}

// ═══════════════════════════════════════
// NEW FEATURE 6 — AI FOOD RECOMMENDER
// ═══════════════════════════════════════
async function aiFoodCard(stopName, cat) {
  switchToView('chat-view', 2);
  const hour = new Date().getHours();
  const timeOfDay = hour < 11 ? 'morning' : hour < 15 ? 'lunch time' : hour < 18 ? 'afternoon' : 'dinner time';
  addMsg(`🍽️ <strong>Finding best food near ${stopName}...</strong>`);
  const typing = addTypingIndicator();
  try {
    const text = await API.aiFoodRecommend(currentCityName, stopName, cat, timeOfDay);
    typing.remove();
    if (text) addMsg(`🍽️ <strong>Food Guide: ${stopName}</strong><br><br>${formatAiText(text)}`);
  } catch { typing.remove(); addMsg('⚠️ Could not fetch food recommendations. Try again!'); }
}

// ═══════════════════════════════════════
// AI TOOLS SIDE DRAWER
// ═══════════════════════════════════════

function openAiDrawer() {
  document.getElementById('ai-drawer-overlay').style.display='block';
  const drawer = document.getElementById('ai-drawer');
  drawer.style.display='block';
  setTimeout(()=>drawer.style.transform='translateY(0)',10);
  renderDrawerContent();
}

function closeAiDrawer() {
  const drawer = document.getElementById('ai-drawer');
  drawer.style.transform='translateY(110%)';
  setTimeout(()=>{
    drawer.style.display='none';
    document.getElementById('ai-drawer-overlay').style.display='none';
  },320);
}

function drawerBtn(icon, name, desc, action, accentColor='') {
  const border = accentColor ? `border-color:${accentColor};` : '';
  // action is a function name string (e.g. "prepGuide") — dispatched via data-action
  // after closing the drawer. No inline onclick= (CSP script-src-attr safe).
  const actionName = String(action || '').replace(/\(\)$/, '');
  return `<div class="drawer-item" style="${border}" role="button" tabindex="0" data-action="drawerRun" data-run="${actionName}">
    <div class="drawer-item-icon">${icon}</div>
    <div class="drawer-item-body">
      <div class="drawer-item-name">${name}</div>
      <div class="drawer-item-desc">${desc}</div>
    </div>
    <span style="color:var(--text-muted);font-size:14px;">›</span>
  </div>`;
}

function drawerFileBtn(icon, name, desc, inputId, accentColor='') {
  const border = accentColor ? `border-color:${accentColor};` : '';
  return `<div class="drawer-item" style="${border}" role="button" tabindex="0" data-action="drawerFile" data-input-id="${inputId}">
    <div class="drawer-item-icon">${icon}</div>
    <div class="drawer-item-body">
      <div class="drawer-item-name">${name}</div>
      <div class="drawer-item-desc">${desc}</div>
    </div>
    <span style="color:var(--text-muted);font-size:14px;">📁</span>
  </div>`;
}

function renderDrawerContent() {
  const el = document.getElementById('ai-drawer-content');
  if(!el) return;

  el.innerHTML = [
    // ── TRIP TOOLS ──
    '<div class="drawer-sec">Trip Tools</div>',
    drawerBtn('🎒','Prep Guide','What to pack for this trip','prepGuide'),
    drawerBtn('📸','Postcard','Generate a trip postcard','postcard'),
    drawerBtn('📷','Insta-Spots','Best photo angles at each stop','getInstaSpots'),
    drawerBtn('🛍️','Souvenir Guide','What to buy locally','getSouvenirGuide'),
    drawerBtn('⭐','Rate My Trip','AI trip report & score','showTripRating'),
    drawerBtn('💬','App Feedback','Tell us what to improve','showAppFeedback'),
    drawerBtn('🧭','Smart Replanner','Running late? Reschedule now','showReplanner'),
    drawerBtn('🌦️','Weather Alerts','Per-stop weather forecast','showWeatherAlerts'),
    drawerBtn('📄','Download PDF','Full trip summary PDF','generateTripPDF'),
    drawerBtn('🔔','Closing Alerts','Get notified before stops close','setupNotifications'),
    drawerBtn('🎤','Voice AI','Talk to assistant hands-free','startVoiceInput'),

    // ── EXCLUSIVE ──
    '<div class="drawer-sec">🚀 Exclusive — Not on Google Maps</div>',
    drawerBtn('⏰','Time Intelligence Engine','When should I visit — for the best experience?','showCrowdPredictor','rgba(0,180,255,.5)'),
    drawerBtn('🎪','Festival Radar','Events & festivals happening TODAY','showFestivalRadar','rgba(255,165,0,.4)'),
    drawerBtn('💎','Hidden Gems','Verified spots Google Maps buries','showHiddenGems','rgba(168,85,247,.4)'),
    drawerBtn('⚡','Strike Alert','Power cuts & bandh warnings','showHartaalAlert','rgba(255,80,80,.4)'),
    drawerBtn('💸','Fare Negotiator','Exact auto price + Hindi script','showFareNegotiator','rgba(50,200,150,.4)'),
    drawerBtn('👥','Trip Tribe','Find travel buddies nearby','showTripTribe','rgba(200,100,255,.4)'),

    // ── CAMERA AI ──
    '<div class="drawer-sec">📸 Camera AI</div>',
    drawerFileBtn('🔍','AI Lens','Identify any landmark','lens-in','rgba(0,200,240,.3)'),
    drawerFileBtn('🔮','AR Overlay','History & tips for any building','ar-in','rgba(150,100,255,.3)'),
    drawerFileBtn('🍡','Food Safety Scanner','Is this street food safe?','food-safety-in','rgba(255,200,50,.3)'),
    drawerFileBtn('📸','Photo Captions','Instagram captions for your photos','caption-in','rgba(0,229,160,.3)'),
    drawerFileBtn('🌐','Translate Sign/Menu','Translate any text in a photo','translate-in','rgba(255,107,138,.3)'),

    '<div style="height:20px;"></div>',
  ].join('');
}

function renderAiToolsGrid() {
  // No-op — drawer replaces the grid
}

/*
  grid.innerHTML = [
    // Row 1 — compact 3-col
    '<div class="ai-card ai-accent-gold" data-action="prepGuide"><div class="ai-card-icon">🎒</div><div class="ai-card-label">Prep Guide</div></div>',
    '<div class="ai-card ai-accent-teal" data-action="postcard"><div class="ai-card-icon">📸</div><div class="ai-card-label">Postcard</div></div>',
    '<label class="ai-card ai-accent-ocean"><div class="ai-card-icon">🔍</div><div class="ai-card-label">AI Lens</div><input type="file" id="lens-in" accept="image/*" style="display:none" data-file-action="handleAiLens"></label>',
    // Row 2
    '<div class="ai-card ai-accent-purple" data-action="getInstaSpots"><div class="ai-card-icon">📷</div><div class="ai-card-label">Insta Spots</div></div>',
    '<div class="ai-card ai-accent-jade" data-action="showTripRating"><div class="ai-card-icon">⭐</div><div class="ai-card-label">Rate Trip</div></div>',
    '<div class="ai-card ai-accent-rose" data-action="showReplanner"><div class="ai-card-icon">🧭</div><div class="ai-card-label">Replanner</div></div>',
    // Wide — existing
    '<div class="ai-card ai-card-wide ai-accent-gold" data-action="getSouvenirGuide"><div class="ai-card-icon">🛍️</div><div class="ai-card-label">Souvenir Guide — What to buy locally</div></div>',
    '<div class="ai-card ai-card-wide ai-accent-teal" data-action="showWeatherAlerts"><div class="ai-card-icon">🌦️</div><div class="ai-card-label">Weather Alerts — Per stop forecast</div></div>',
    '<div class="ai-card ai-card-wide ai-accent-ocean" data-action="generateTripPDF"><div class="ai-card-icon">📄</div><div class="ai-card-label">Download Trip PDF — Full summary</div></div>',
    '<div class="ai-card ai-card-wide ai-accent-purple" data-action="setupNotifications"><div class="ai-card-icon">🔔</div><div class="ai-card-label">Closing Time Alerts — Get reminders</div></div>',
    '<label class="ai-card ai-card-wide ai-accent-jade"><div class="ai-card-icon">📸</div><div class="ai-card-label">AI Photo Captions — Instagram ready</div><input type="file" id="caption-in" accept="image/*" style="display:none" data-file-action="handleCaption"></label>',
    '<label class="ai-card ai-card-wide ai-accent-rose"><div class="ai-card-icon">🌐</div><div class="ai-card-label">Translate Sign / Menu — Any language</div><input type="file" id="translate-in" accept="image/*" style="display:none" data-file-action="handleTranslate"></label>',
    // ── 8 NEW EXCLUSIVE FEATURES ──
    '<div class="ai-card ai-card-wide" style="border-color:rgba(255,165,0,.3);background:rgba(255,165,0,.05)" data-action="showFestivalRadar"><div class="ai-card-icon">🎪</div><div class="ai-card-label" style="color:var(--text-primary)">Festival & Event Radar — What\'s happening TODAY</div></div>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(100,220,100,.3);background:rgba(100,220,100,.05)" data-action="showHiddenGems"><div class="ai-card-icon">💎</div><div class="ai-card-label" style="color:var(--text-primary)">Hidden Gem Detector — Secret local spots</div></div>',
    '<label class="ai-card ai-card-wide" style="border-color:rgba(150,100,255,.3);background:rgba(150,100,255,.05)"><div class="ai-card-icon">🔮</div><div class="ai-card-label" style="color:var(--text-primary)">AR Overlay — Point at any building</div><input type="file" id="ar-in" accept="image/*" style="display:none" data-file-action="handleArOverlay"></label>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(255,80,80,.3);background:rgba(255,80,80,.05)" data-action="showHartaalAlert"><div class="ai-card-icon">⚡</div><div class="ai-card-label" style="color:var(--text-primary)">Power & Strike Alert — Safe to travel today?</div></div>',
    '<label class="ai-card ai-card-wide" style="border-color:rgba(255,200,50,.3);background:rgba(255,200,50,.05)"><div class="ai-card-icon">🍡</div><div class="ai-card-label" style="color:var(--text-primary)">Street Food Safety Scanner — Is it safe to eat?</div><input type="file" id="food-safety-in" accept="image/*" style="display:none" data-file-action="handleFoodSafety"></label>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(0,180,255,.3);background:rgba(0,180,255,.05)" data-action="showCrowdPredictor"><div class="ai-card-icon">🧠</div><div class="ai-card-label" style="color:var(--text-primary)">Crowd Predictor — Best time to visit</div></div>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(50,200,150,.3);background:rgba(50,200,150,.05)" data-action="showFareNegotiator"><div class="ai-card-icon">💸</div><div class="ai-card-label" style="color:var(--text-primary)">Auto Fare Negotiator — Exact price + script</div></div>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(200,100,255,.3);background:rgba(200,100,255,.05)" data-action="showTripTribe"><div class="ai-card-icon">👥</div><div class="ai-card-label" style="color:var(--text-primary)">Trip Tribe — Find travel buddies</div></div>',
  ].join('');
}

// ═══════════════════════════════════════
*/
// ═══════════════════════════════════════
// 8 UNIQUE FEATURES — NOT ON GOOGLE MAPS
// ═══════════════════════════════════════

// 1 — FESTIVAL & EVENT RADAR
function toolFallbackFestival(city){return `🎪 <strong>Festival Radar</strong><br>No live AI feed right now, but in ${city} you should check temple notice boards, beachfront event areas, local malls, and city Instagram/WhatsApp pages for today’s events. Evening waterfront areas are usually the best first place to look.`;}
function toolFallbackHiddenGems(city){const picks=LOCS.filter(s=>s.cat!=='food').slice(0,4).map(s=>s.name);return `💎 <strong>Hidden Gems</strong><br>${picks.length?`Try these quieter local picks: <strong>${picks.join('</strong>, <strong>')}</strong>.`:`Try less-crowded viewpoints, parks, or temple lanes in ${city}.`} Early morning and sunset usually reveal the best hidden-gem experience.`;}
function toolFallbackSafety(city){return `⚡ <strong>Safety Alert</strong><br>No live disruption feed right now. In ${city}, keep backup cash, avoid tight late-evening transfers, and quickly confirm bandh or power-cut status with nearby shopkeepers, hotel staff, or auto drivers before long rides.`;}
function toolFallbackCrowd(stop){const name=stop?.name||'your next stop';return `🧠 <strong>${name}</strong><br>Best window: early morning or after 4:30 pm.<br>Most crowded: late morning to mid-afternoon.<br>Tip: arrive earlier in hot weather and keep sunset slots for scenic places.`;}
function toolFallbackFare(nextStop){const name=nextStop?.name||'your next stop';const km=nextStop?.coords&&cLat?hvKm(cLat,cLon,nextStop.coords[0],nextStop.coords[1]):3;const autoMin=Math.round(km*10),autoMax=Math.round(km*14);const cabMin=Math.round(km*12),cabMax=Math.round(km*18);return `💸 <strong>Fare Negotiator</strong><br>To <strong>${name}</strong> (~${km.toFixed(1)} km):<br>Auto: ₹${autoMin}–₹${autoMax}<br>Cab: ₹${cabMin}–₹${cabMax}<br><small>Try: “Bhaiya, ₹${autoMin} mein chalo?” and settle near the midpoint if needed.</small>`;}
async function showFestivalRadar() {
  switchToView('chat-view', 2);
  const month = new Date().toLocaleString('en-IN', { month:'long' });
  const date  = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
  addMsg(`🎪 <strong>Festival Radar</strong> — Scanning events in ${currentCityName} today...`);
  const typing = addTypingIndicator();
  try {
    const text = await API.aiFestivalRadar(currentCityName, month, date);
    typing.remove();
    addMsg(text ? formatAiText(text) : '🎪 No major events found today — check local notice boards!');
  } catch { typing.remove(); addMsg(toolFallbackFestival(currentCityName)); }
}

// 2 — HIDDEN GEM DETECTOR
async function showHiddenGems() {
  switchToView('chat-view', 2);
  const gems = getHiddenGems(currentCityId);
  if (!gems.length) {
    // No curated gems for this city yet — fall back to the AI for now.
    addMsg(`💎 <strong>Hidden Gem Detector</strong> — Finding secret spots in ${currentCityName} that locals love...`);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiHiddenGem(currentCityName, Array.from(document.querySelectorAll('.pref:checked')).map(c => c.value));
      typing.remove();
      addMsg(text ? formatAiText(text) : '💎 Ask a local chai wala — they know the best spots!');
    } catch { typing.remove(); addMsg(toolFallbackHiddenGems(currentCityName)); }
    return;
  }
  // Merge into LOCS (dedup by name) so gems are addable to the itinerary and plotted on the map.
  const existingNames = new Set(LOCS.map(l => String(l.name||'').toLowerCase()));
  const newGems = gems.filter(g => !existingNames.has(g.name.toLowerCase()));
  if (newGems.length) { LOCS = [...LOCS, ...newGems]; updatePlannerShowcase(); }
  if (typeof renderMapMarkers === 'function') renderMapMarkers();
  showToast('💎','Hidden gems unlocked',`${gems.length} verified off-the-radar spot${gems.length>1?'s':''} added to your map.`,4000);
  addMsg(`💎 <strong>Hidden Gem Detector — ${currentCityName}</strong><br>Real places, verified against Google's own review counts — not algorithm guesses. Here's what the big travel apps bury:`);
  gems.forEach(g => {
    addMsg(`💎 <strong>${g.name}</strong><br>${g.why}<br><em>${g.reviewGap}</em><br>✨ Best for: ${g.bestFor}`);
  });
  addMsg(`📍 All ${gems.length} pinned on your map with a diamond marker — they're now in your places pool too, so the next plan you generate can include them alongside the classics.`);
}

// 3 — AR OVERLAY
async function handleArOverlay(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    switchToView('chat-view', 2);
    const src = ev.target.result;
    addMsg(`🔮 <strong>AR Overlay</strong> — Analyzing building...<br><img src="${src}" style="width:100%;max-height:180px;object-fit:contain;border-radius:10px;margin-top:6px">`);
    const [, meta, b64] = src.match(/^data:([^;]+);base64,(.+)$/);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiArOverlay(b64, meta, currentCityName);
      typing.remove();
      addMsg(text ? formatAiText(text) : '🔮 Could not identify this building. Try a clearer photo!');
    } catch { typing.remove(); addMsg('⚠️ AR analysis failed. Try again with a clearer photo!'); }
  };
  reader.readAsDataURL(file);
}

// 4 — POWER & HARTAAL ALERT
async function showHartaalAlert() {
  switchToView('chat-view', 2);
  const date = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  addMsg(`⚡ <strong>Safety Alert</strong> — Checking power & strike situation in ${currentCityName}...`);
  const typing = addTypingIndicator();
  try {
    const text = await API.aiHartaalAlert(currentCityName, date);
    typing.remove();
    addMsg(text ? formatAiText(text) : '⚡ No major disruptions reported. Travel safely!');
  } catch { typing.remove(); addMsg(toolFallbackSafety(currentCityName)); }
}

// 5 — STREET FOOD SAFETY SCANNER
async function handleFoodSafety(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    switchToView('chat-view', 2);
    const src = ev.target.result;
    addMsg(`🍡 <strong>Food Safety Scanner</strong> — Analyzing...<br><img src="${src}" style="width:100%;max-height:180px;object-fit:contain;border-radius:10px;margin-top:6px">`);
    const [, meta, b64] = src.match(/^data:([^;]+);base64,(.+)$/);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiFoodSafety(b64, meta, currentCityName);
      typing.remove();
      addMsg(text ? formatAiText(text) : '🍡 Looks okay! When in doubt, eat where locals eat!');
    } catch { typing.remove(); addMsg('⚠️ Could not analyze food. Try again!'); }
  };
  reader.readAsDataURL(file);
}

// 6 — CROWD PREDICTOR
async function showCrowdPredictor() {
  const stops = itin.length ? itin.slice(0,3) : LOCS.slice(0,3);
  if (!stops.length) { addMsg('Select a city first so I can read live timing data! 🧠'); switchToView('chat-view',2); return; }
  switchToView('chat-view', 2);
  addMsg(`🧠⏰ <strong>Time Intelligence Engine</strong> — reading live status for your top spots...`);
  const typing = addTypingIndicator();
  try {
    const weather = { tempC: realTemp, condition: realWeatherMain };
    const { places } = await API.timeIntelligenceStatus(stops.map(ti_placePayload), weather);
    typing.remove();
    stops.forEach((stop, i) => addMsg(ti_renderState(stop, places[i])));
  } catch {
    typing.remove();
    for (const stop of stops) addMsg(toolFallbackCrowd(stop));
  }
  // Bonus: qualitative local-insider tips from Gemini for the top stop, if available.
  if (stops[0]) {
    try {
      const day = new Date().toLocaleDateString('en-IN', { weekday:'long' });
      const text = await API.aiCrowdPredict(currentCityName, stops[0].name, stops[0].cat, day, new Date().getHours());
      if (text) addMsg(`💡 <strong>Insider tip for ${stops[0].name}</strong><br>${formatAiText(text)}`);
    } catch {}
  }
}

// 7 — FARE NEGOTIATOR
async function showFareNegotiator() {
  switchToView('chat-view', 2);
  if (!itin.length) {
    addMsg('🚕 <strong>Auto Fare Negotiator</strong><br>Generate a plan first and I\'ll calculate the exact fare + negotiation script for each stop!');
    return;
  }
  const nextStop = itin[0];
  const km = cLat ? hvKm(cLat, cLon, nextStop.coords[0], nextStop.coords[1]).toFixed(1) : '?';
  addMsg(`💸 <strong>Fare Negotiator</strong> — Getting exact fare to ${nextStop.name}...`);
  const typing = addTypingIndicator();
  try {
    const fromPlace = cLat ? 'your current location' : 'city center';
    const text = await API.aiFareNegotiator(currentCityName, fromPlace, nextStop.name, km, 'auto rickshaw');
    typing.remove();
    addMsg(text ? formatAiText(text) : `🚕 Fair auto fare to ${nextStop.name}: ₹${Math.round(km*10)}–₹${Math.round(km*14)}`);
  } catch { typing.remove(); addMsg(toolFallbackFare(nextStop)); }
}

// 8 — TRIP TRIBE
async function showTripTribe() {
  switchToView('chat-view', 2);
  if (!currentUser) { addMsg('👥 Please sign in with Google to use Trip Tribe!'); return; }
  const userName  = currentUser.displayName?.split(' ')[0] || 'Traveller';
  const prefs     = Array.from(document.querySelectorAll('.pref:checked')).map(c => c.value);
  const travelStyle = prefs.includes('food') ? 'foodie explorer' : prefs.includes('beach') ? 'beach lover' : 'adventure seeker';
  const dates     = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
  addMsg(`👥 <strong>Trip Tribe</strong> — Creating your traveller profile for ${currentCityName}...`);
  const typing = addTypingIndicator();
  try {
    const text = await API.aiTripTribe(currentCityName, userName, prefs, travelStyle, dates);
    typing.remove();
    addMsg(`👥 <strong>Your Trip Tribe Profile</strong><br><br>${text ? formatAiText(text) : ''}<br><br><div style="background:var(--gold-glow);border:1px solid var(--gold-border);border-radius:12px;padding:10px 12px;margin-top:8px;font-size:11px;color:var(--gold)">🚧 <strong>Coming Soon:</strong> Live matchmaking with other travellers visiting ${currentCityName} on the same dates! Share your profile via WhatsApp to find travel buddies now.</div>`);
  } catch { typing.remove(); addMsg(toolFallbackTripTribe(userName,prefs,travelStyle,dates)); }
}

// ── Back Navigation (minimal) ────────────────────────────────────────────────
const navHistory = [];

function goBack() {
  if (navHistory.length === 0) { switchToView('plan-view',1); return; }
  const prev = navHistory.pop();
  switchToView(prev.viewId, prev.idx);
}

function updateBackButton(viewId) {
  const btn = document.getElementById('global-back');
  if(!btn) return;
  if (navHistory.length > 0 && viewId !== 'map-view') {
    btn.classList.add('visible');
  } else {
    btn.classList.remove('visible');
  }
}

function updateToolsTitle(title) {
  const el = document.getElementById('tools-view-title');
  if (el) el.textContent = title;
}

let _currentToolsPage = 'home';
function _trackNavHistory(viewId) {
  const currentActive = document.querySelector('.view.active')?.id;
  if (currentActive && currentActive !== viewId) {
    navHistory.push({ viewId: currentActive, idx: ['map-view','plan-view','chat-view','tools-view'].indexOf(currentActive) });
    if (navHistory.length > 10) navHistory.shift();
  }
  if(viewId==='tools-view') { renderToolsHome(); _currentToolsPage='home'; updateToolsTitle('Tools'); }
  updateBackButton(viewId);
}

window.addEventListener('popstate', (e) => { e.preventDefault(); goBack(); });
window.history.pushState({ page: 'home' }, '', window.location.href);

// ── Init ──────────────────────────────────────────────────────────────────────// ── Customize Places Feature ──────────────────────────────────────────────────
window.customSelectedPlaces = null;

async function openCustomizeModal() {
  const trigger = document.activeElement;
  const cityId = document.getElementById('city-select')?.value || currentCityId;
  const city = CITIES[cityId];
  if (!city) {
    addMsg('⚠️ Please select a city first before customizing places.');
    return;
  }
  
  if (LOCS.length < 30) {
    addMsg(`🤖 Fetching comprehensive places list for ${city.name} to customize...`);
    const loadTyping = addTypingIndicator();
    try {
      await ensureCityPlaces(city, 35);
    } catch (e) {
      browserLogger.error('Failed to load places for customize modal:', e);
    }
    loadTyping.remove();
  }

  if (!LOCS.length) {
    addMsg('⚠️ Could not load places to customize. Please try again.');
    return;
  }

  const listEl = document.getElementById('customize-places-list');
  listEl.innerHTML = '';

  const availableToSelect = LOCS; // ALL PLACES, completely bypassing the 'prefs' experience filters

  availableToSelect.forEach(loc => {
    const isSelected = window.customSelectedPlaces ? window.customSelectedPlaces.includes(loc.id) : true;
    const catIcons = { scenic: '⛰️', beach: '🏖️', temple: '🛕', food: '🍛' };
    const icon = catIcons[loc.cat] || '📍';
    const badgesHtml = getTimeBadgesHtml(loc);
    
    const item = document.createElement('label');
    item.style.cssText = 'display:flex;align-items:center;padding:12px;background:var(--bg-layer2);border:1px solid var(--border-subtle);border-radius:12px;cursor:pointer;gap:12px;transition:all 0.2s;';
    item.innerHTML = `
      <input type="checkbox" class="custom-place-cb" value="${loc.id}" ${isSelected ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--gold);">
      <div style="flex:1;display:flex;flex-direction:column;">
        <span style="font-weight:600;font-size:15px;color:var(--text-primary);">${escapeHtml(loc.name)}</span>
        <span style="font-size:12px;color:var(--text-muted);">${icon} ${loc.cat.charAt(0).toUpperCase() + loc.cat.slice(1)} • ${loc.vt} mins</span>
        <div style="margin-top:4px;">${badgesHtml}</div>
      </div>
    `;
    listEl.appendChild(item);
  });

  openModal('customize-modal', trigger);
}

function closeCustomizeModal() {
  closeModal('customize-modal');
}

function selectAllCustomPlaces(state) {
  document.querySelectorAll('.custom-place-cb').forEach(cb => cb.checked = state);
}

function applyCustomPlaces() {
  const checkboxes = document.querySelectorAll('.custom-place-cb:checked');
  window.customSelectedPlaces = Array.from(checkboxes).map(cb => cb.value);
  
  if (window.customSelectedPlaces.length === 0) {
    addMsg('⚠️ You must select at least one place! Selecting all as fallback.');
    window.customSelectedPlaces = null;
  } else {
    addMsg(`✅ Saved ${window.customSelectedPlaces.length} customized places! Generating plan...`);
  }
  
  closeCustomizeModal();
  generatePlan();
}

Object.assign(window, { openCustomizeModal, closeCustomizeModal, selectAllCustomPlaces, applyCustomPlaces });

// ── Init ──────────────────────────────────────────────────────────────────────
window.onload=()=>{
  applyTheme();
  // Wait for the real auth check (not a blind timer) before revealing
// …
  Promise.race([authCheckedPromise, new Promise(res=>setTimeout(res,4000))])
    .then(()=>new Promise(res=>setTimeout(res,500)))
    .then(()=>{const s=document.getElementById('splash');s.style.opacity='0';setTimeout(()=>s.style.display='none',300);});
  const crCnt = document.getElementById('cr-cnt');
  if(crCnt) crCnt.textContent=credits;
  try {
    map=L.map('map',{zoomControl:false,zoomSnap:1,zoomDelta:1,wheelPxPerZoomLevel:120}).setView([20.5937,78.9629],5);
    L.control.zoom({position:'topleft'}).addTo(map);
    // The app chrome is always dark, but the map itself always uses the
// …
    const TILE_SOURCES = [
      {
        url:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        opts:{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',maxZoom:19,subdomains:'abcd',keepBuffer:4}
      },
      {
        url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        opts:{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19,subdomains:'abc',keepBuffer:4}
      }
    ];
    let tileSourceIdx = 0;
    let tileErrorCount = 0;
    let tileErrorWindowStart = Date.now();
    // A typical viewport only has ~10-15 tiles visible at once. The old
// …
    const TILE_ERROR_THRESHOLD = 6;
    const TILE_ERROR_WINDOW_MS = 10000;

    function buildTileLayer(idx){
      const src = TILE_SOURCES[idx];
      return L.tileLayer(src.url, src.opts);
    }

    function switchTileLayer(idx){
      tileSourceIdx = idx;
      // Reset the error counter/window on every switch so the freshly
      // activated source is judged on its own errors, not ones left over
      // from whatever source we just abandoned.
      tileErrorCount = 0;
      tileErrorWindowStart = Date.now();
      const newLayer = buildTileLayer(tileSourceIdx);
      attachTileErrorHandling(newLayer);
      newLayer.addTo(map);
      if(window._tileLayer) map.removeLayer(window._tileLayer);
      window._tileLayer = newLayer;
    }

    function attachTileErrorHandling(layer){
      layer.on('tileerror', (e)=>{
        // Retry the same tile with backoff instead of hiding it forever —
        // most failures are transient (momentary throttling), not permanent.
        const tile = e.tile;
        const originalSrc = e.tile.src;
        const attempts = tile._iitRetryCount || 0;
        if(attempts < 3){
          tile._iitRetryCount = attempts + 1;
          setTimeout(()=>{ try{ tile.src = originalSrc; }catch(_e){} }, 800 * (attempts + 1));
        } else {
          try{ tile.style.visibility='hidden'; }catch(_e){}
        }

        // Track error rate; if the current source is failing hard within
        // a short window, switch the whole layer to the next fallback
        // source rather than leaving the map broken.
        const now = Date.now();
        if(now - tileErrorWindowStart > TILE_ERROR_WINDOW_MS){ tileErrorCount = 0; tileErrorWindowStart = now; }
        tileErrorCount++;
        if(tileErrorCount > TILE_ERROR_THRESHOLD && tileSourceIdx < TILE_SOURCES.length - 1){
          switchTileLayer(tileSourceIdx + 1);
          browserLogger.warn('[map] Primary tile source struggling, switched to fallback basemap.');
        }
      });
    }

    // Probe a MapTiler key with a single cheap tile request before ever
// …
    async function pickWorkingMaptilerKeys(keys){
      const probe = k => fetch(`https://api.maptiler.com/maps/streets-v2/0/0/0.png?key=${k}`, { method:'GET', cache:'no-store' })
        .then(r => r.ok ? k : null)
        .catch(() => null);
      const results = await Promise.all(keys.map(probe));
      return results.filter(Boolean);
    }

    window._tileLayer = buildTileLayer(tileSourceIdx);
    attachTileErrorHandling(window._tileLayer);
    window._tileLayer.addTo(map);

    // If MapTiler key(s) are configured server-side (MAPTILER_KEY,
// …
    fetch('/api/config').then(r=>r.json()).then(async cfg=>{
      const keys = cfg && Array.isArray(cfg.maptilerKeys) ? cfg.maptilerKeys : [];
      if(keys.length && tileSourceIdx===0){
        // Skip any key that's already dead (quota exhausted, revoked,
// …
        const working = await pickWorkingMaptilerKeys(keys);
        const usableKeys = working.length ? working : keys;
        // Visible in the browser console so a misconfigured deployment
        // (e.g. only MAPTILER_KEY set, not _2/_3/_4) is obvious at a glance
        // instead of looking like a broken failover.
        browserLogger.info(`[map] MapTiler: ${keys.length} key(s) configured server-side, ${working.length} passed the pre-flight probe. Using ${usableKeys.length} in fallback chain.`);
        // Unshift in reverse so the final TILE_SOURCES order is
        // key1, key2, key3, key4, then the existing CARTO/OSM fallbacks.
        for(let i = usableKeys.length - 1; i >= 0; i--){
          TILE_SOURCES.unshift({
            url:`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${usableKeys[i]}`,
            opts:{attribution:'&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',maxZoom:19,keepBuffer:4}
          });
        }
        if(tileSourceIdx===0) switchTileLayer(0);
      }
    }).catch(e=>browserLogger.warn('[map] /api/config fetch failed, staying on fallback tiles:', e));
    // Leaflet computes its tile grid from the container's size at creation
// …
    [0,150,400,900].forEach(delay=>setTimeout(()=>{ if(map) map.invalidateSize(false); }, delay));
    const mapEl = document.getElementById('map');
    if(mapEl && 'ResizeObserver' in window){
      new ResizeObserver(()=>{ if(map) map.invalidateSize(false); }).observe(mapEl);
    }
    window.addEventListener('resize', () => { if(map) map.invalidateSize(); });
    map.on('dragstart',()=>{if(tripActive&&autoFollowLive){autoFollowLive=false;updateFollowButton();}});
    map.on('move',()=>{if(tripActive&&lastHeading!=null) applyMapHeadingRotation();});
  } catch(mapInitErr) {
    // Leaflet (or a dependency of it) failed to load or initialize — most
// …
    browserLogger.error('[map] Failed to initialize — map will be unavailable this session:', mapInitErr);
    map = null;
    const mapEl = document.getElementById('map');
    if(mapEl){
      mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:var(--text-secondary);font-size:14px;">⚠️ The map couldn\'t load. Please refresh the page — if this keeps happening, check your connection.</div>';
    }
  }

  document.getElementById('chat-in').addEventListener('keypress',e=>{if(e.key==='Enter')handleChat();});
  document.getElementById('city-input').addEventListener('keypress',e=>{if(e.key==='Enter')searchCity();});
  ['n-days','t-time','t-hours','t-minutes','break-every','break-duration','water-every','vibe'].forEach(id=>{
    document.getElementById(id)?.addEventListener('input', updatePlannerShowcase);
    document.getElementById(id)?.addEventListener('change', updatePlannerShowcase);
  });
  document.getElementById('city-select')?.addEventListener('change', (e) => {
    if (e.target.value) switchCity(e.target.value);
    updatePlannerShowcase();
  });
  document.getElementById('s-time')?.addEventListener('input', ()=>{syncPlannerTimeFields('start');updatePlannerShowcase();});
  document.getElementById('s-time')?.addEventListener('change', ()=>{syncPlannerTimeFields('start');updatePlannerShowcase();});
  document.getElementById('e-time')?.addEventListener('input', ()=>{syncPlannerTimeFields('end');updatePlannerShowcase();});
  document.getElementById('e-time')?.addEventListener('change', ()=>{syncPlannerTimeFields('end');updatePlannerShowcase();});
  document.getElementById('t-hours')?.addEventListener('input', ()=>{syncPlannerTimeFields('duration');updatePlannerShowcase();});
  document.getElementById('t-hours')?.addEventListener('change', ()=>{syncPlannerTimeFields('duration');updatePlannerShowcase();});
  document.getElementById('t-minutes')?.addEventListener('input', ()=>{syncPlannerTimeFields('duration');updatePlannerShowcase();});
  document.getElementById('t-minutes')?.addEventListener('change', ()=>{syncPlannerTimeFields('duration');updatePlannerShowcase();});
  document.querySelectorAll('.pref').forEach(el=>el.addEventListener('change', updatePlannerShowcase));
  function syncSelectedPersonas(){
    window.selectedPersonas = Array.from(document.querySelectorAll('.persona-pref:checked')).map(c=>c.value);
  }
  document.querySelectorAll('.persona-pref').forEach(el=>el.addEventListener('change', syncSelectedPersonas));
  syncSelectedPersonas();
  function syncSelectedTripMode(){
    const checked = document.querySelector('.trip-mode-pref:checked');
    window.selectedTripMode = checked ? checked.value : null;
  }
  document.querySelectorAll('.trip-mode-pref').forEach(el=>el.addEventListener('change', syncSelectedTripMode));
  syncSelectedTripMode();
  updateFollowButton();
  restoreNavCardCollapsed();
  // ── Auto-detect nearest city from GPS, fallback to Hyderabad ──────────────
  initGPS(); // start the live-location watch FIRST — detectAndLoadCity() below waits on its first fix
  (function detectAndLoadCity() {
    function nearestCityTo(lat, lon) {
      return _pickNearestCityId(lat, lon, CITIES, (a,b,c,d) => {
        // squared euclidean is fine for relative nearest among Indian cities
        return (c - a) ** 2 + (d - b) ** 2;
      }) || 'hyderabad';
    }
    function load(id) {
      // Never let a background/auto city load stomp on a city the user
      // already picked themselves, or on a trip that's already in progress —
      // that was silently re-centering the map to Hyderabad mid-navigation,
      // which showed up as the "live pointer jumping to Hyderabad" glitch.
      if (userPickedCity || tripActive) return;
      switchCity(id, true);
      loadCityPlaces(CITIES[id].lat, CITIES[id].lon, CITIES[id].name, { silent: true }).catch(() => {});
    }
    if (!('geolocation' in navigator)) { load('hyderabad'); return; }
    // Reuses the exact fix initGPS()'s watchPosition() produces (see the
// …
    waitForFirstGpsFix(14000).then(({ lat, lon }) => {
      load(nearestCityTo(lat, lon));
    }).catch(() => {
      load('hyderabad'); // no fix in time, permission denied, or geolocation error → Hyderabad
      // Keep listening even after falling back: a slow cold GPS fix (or a
// …
      waitForFirstGpsFix(60000).then(({ lat, lon }) => {
        const realId = nearestCityTo(lat, lon);
        if (realId !== 'hyderabad') load(realId);
      }).catch(() => {});
    });
  })();
  if(window.speechSynthesis)window.speechSynthesis.getVoices();
  updatePlannerShowcase();
};

// Ensure chat widget actions are bound after all handler declarations.
try { registerChatActions(); } catch (_e) { browserLogger.warn('[feedback] registerChatActions failed', _e); }
