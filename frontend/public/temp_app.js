import { state } from './js/core/state.js';
import { initEventDelegation, dispatchAction, registerAction } from './js/core/events.js';
import { escapeHtml, escapeAttr, sanitizeChatHtml, formatAiText } from './js/core/dom.js';
import { fmtM, t2m, hvKm, normalizeLatLon, dedupePlacesByProximity, getCurrentLocalMin } from './js/core/utils.js';
import { CITIES } from './js/data/cities.js';
import { LOCAL_PLACE_SEEDS } from './js/data/localPlaceSeeds.js';
import { getHiddenGems } from './js/data/hiddenGems.js';
import { getTransportConfig, ENTRY_FEE_ESTIMATES } from './js/data/transportConfig.js';
import { getTrafficMultiplier, getTrafficLevel, getCrowdMultiplier, getCrowdLevel, getTransportOptions, calculateStopBudget, calculateDayBudget, calculateTripBudget, renderBudgetBreakdown } from './js/engine/routing.js';
import { getSunTimesClient, placeSunTimes, getPlaceDynamicStatus, getDaypartClient, getCrowdPrediction, calculateExperienceScore, getTimeBadgesHtml } from './js/engine/timeIntelligence.js';
import { updateItinUI, registerItineraryActions } from './js/views/itinerary.js';
import { renderToolsHome, registerToolsHomeActions } from './js/views/toolsHome.js';
import { renderLingo, registerLingoActions } from './js/views/lingo.js';
import { renderSafety, registerSafetyActions } from './js/views/safety.js';
import { renderBudgetView, updateBudgetUI, registerBudgetViewActions } from './js/views/budget.js';
import { renderPassport, registerPassportActions } from './js/views/passport.js';
import { renderLoadPanel, registerLoadPanelActions } from './js/views/loadPanel.js';

// Setup legacy global bindings (many internal app.js functions still expect globals)
window.state = state;
window.escapeHtml = escapeHtml;
window.escapeAttr = escapeAttr;
window.sanitizeChatHtml = sanitizeChatHtml;
window.formatAiText = formatAiText;
window.fmtM = fmtM;
window.t2m = t2m;
window.normalizeLatLon = normalizeLatLon;
window.dedupePlacesByProximity = dedupePlacesByProximity;
window.getCurrentLocalMin = getCurrentLocalMin;
window.getHiddenGems = getHiddenGems;
window.getTransportConfig = getTransportConfig;
window.getTrafficLevel = getTrafficLevel;
window.getCrowdMultiplier = getCrowdMultiplier;
window.getCrowdLevel = getCrowdLevel;
window.getTransportOptions = getTransportOptions;
window.calculateStopBudget = calculateStopBudget;
window.calculateDayBudget = calculateDayBudget;
window.calculateTripBudget = calculateTripBudget;
window.renderBudgetBreakdown = renderBudgetBreakdown;
window.placeSunTimes = placeSunTimes;
window.getPlaceDynamicStatus = getPlaceDynamicStatus;
window.getCrowdPrediction = getCrowdPrediction;
window.calculateExperienceScore = calculateExperienceScore;
window.getTimeBadgesHtml = getTimeBadgesHtml;
window.CITIES = CITIES;
window.LOCAL_PLACE_SEEDS = LOCAL_PLACE_SEEDS;
window.ENTRY_FEE_ESTIMATES = ENTRY_FEE_ESTIMATES;


const API = window.API; // ✅ loaded by <script> above

// ══════════════════════════════════════════════════
// FIREBASE CONFIG — PASTE YOUR VALUES BELOW
// ══════════════════════════════════════════════════
import { initializeApp }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut as fbSignOut }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyDdFpaAOXT2DcniMoh2jJGlReMYLZy8DDM",
  authDomain:        "india-in-time.firebaseapp.com",
  projectId:         "india-in-time",
  storageBucket:     "india-in-time.firebasestorage.app",
  messagingSenderId: "954365212663",
  appId:             "1:954365212663:web:f2ad8db463026fad5920f2",
};
// ══════════════════════════════════════════════════

const fbApp     = initializeApp(firebaseConfig);
const auth      = getAuth(fbApp);
const db        = getFirestore(fbApp);
const gProvider = new GoogleAuthProvider();
let currentUser = null;

// Resolves once Firebase's first onAuthStateChanged callback has fired —
// i.e. once we actually know whether the visitor is logged in or not.
// The splash screen (see window.onload below) waits on this instead of a
// fixed timer, so a logged-in user never sees the login screen flash while
// that check is still in flight.
let resolveAuthChecked;
const authCheckedPromise = new Promise(res => { resolveAuthChecked = res; });

// ── Expose functions to HTML onclick ─────────────────────────────────────────
Object.assign(window, {
  switchCity, searchCity, generatePlan, startTrip, skipStop, optimizeRoute,
  smartExtend, addNearby, aiSuggestAlternative, prepGuide, postcard,
  handleAiLens, getInstaSpots, getSouvenirGuide, switchToView, toggleTheme,
  installPWA, resetGPS, locateMe, compassTap, toggleVoice, handleChat, saveIt, shareIt, waShare,
  toggleLoadPanel, loadPlan, delPlan, addExpense, delExp, updateBudget,
  analyzeBudget, renderToolsHome, renderLingo, renderSafety, renderBudget,
  renderPassport, switchDay, chatAbout, shareEmergency, speak,
  showWeatherAlerts, generateTripPDF, setupNotifications, showToast,
  signInWithGoogle, doSignOut, toggleUserMenu, toggleLiveFollow, toggleStreetQuest,
  onTimeSliderChange,
  // 6 new AI features
  showReplanner, showTripRating, handleCaption, handleTranslate,
  startVoiceInput, aiFoodCard, runReplanner,
  // Navigation
  goBack, loadCityPlaces,
  // 8 Unique Features
  showFestivalRadar, showHiddenGems, handleArOverlay, showHartaalAlert,
  handleFoodSafety, showCrowdPredictor, showFareNegotiator, showTripTribe,
  // AI Tools Drawer
  openAiDrawer, closeAiDrawer, renderAiToolsGrid,
  // Feedback system — showAppFeedback is still invoked via the drawer's
  // onclick=; the rating/tag/submit buttons inside the feedback card itself
  // use delegated data-action handlers (see initChatActionDelegation) so
  // they don't need to be on window.
  showAppFeedback,
});

// ══════════════════════════════════════════════════
// CURATED CITIES DATABASE
// ══════════════════════════════════════════════════

// ══════════════════════════════════════════════════
// HIDDEN GEMS — genuinely off-the-radar spots, verified real
// (not LLM guesses). Each one is picked because it has a tiny
// review count on Google compared to the city's famous spots —
// that gap IS the product: "found by locals, not by algorithms."
// reviewGap = approx Google review count, for the pitch narrative.
// ══════════════════════════════════════════════════



// ── App State ─────────────────────────────────────────────────────────────────
let currentCityName='India',currentCityId='india',LOCS=[];
let credits=50,mdPlan=[],dayIdx=0,itin=[];
let map,rLine,mkrs=[],liveMkr=null;

// Guards every map.setView()/flyTo() call against NaN/undefined coordinates
// reaching Leaflet, which throws an uncaught "Invalid LatLng object" error
// that crashes that interaction (confirmed live in production — city-switch
// and geocoded-search flows could both feed bad coordinates straight into
// Leaflet with no validation). followLivePosition() already had this exact
// guard inline; this centralizes it so every call site gets the same
// protection instead of relying on each one remembering to add it.
function isFiniteLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

let cLat=null,cLon=null,tripActive=false,tripStart=null;
// Set once the user manually picks a city (search box or dropdown), so the
// background auto-detect/fallback logic below never overwrites their choice.
let userPickedCity=false;

// ── Shared GPS-fix coordination ──────────────────────────────────────────────
// Previously, detectAndLoadCity() (below) issued its own independent
// getCurrentPosition() call — with a 5-minute maximumAge, so it could
// legitimately return a stale/cached/lower-accuracy fix — separately from
// initGPS()'s watchPosition() (maximumAge:0, always fresh), which drives the
// live location marker. Two independent geolocation requests with different
// freshness rules could disagree, which is exactly what produced live
// reports of the city/header defaulting to the wrong city while the live
// marker separately settled on the user's real location moments later.
// This makes city-detection wait for and reuse the *same* fix the live
// marker uses, so the two can never disagree.
let _gpsFixWaiters = [];
function notifyGpsFix(lat, lon) {
  const waiters = _gpsFixWaiters; _gpsFixWaiters = [];
  waiters.forEach(w => w.resolve({ lat, lon }));
}
function notifyGpsError(err) {
  const waiters = _gpsFixWaiters; _gpsFixWaiters = [];
  waiters.forEach(w => w.reject(err));
}
function waitForFirstGpsFix(timeoutMs) {
  if (Number.isFinite(cLat) && Number.isFinite(cLon)) return Promise.resolve({ lat: cLat, lon: cLon });
  return new Promise((resolve, reject) => {
    const entry = {
      resolve: (pos) => { clearTimeout(timer); resolve(pos); },
      reject:  (err) => { clearTimeout(timer); reject(err); },
    };
    const timer = setTimeout(() => {
      _gpsFixWaiters = _gpsFixWaiters.filter(w => w !== entry);
      reject(new Error('GPS fix timed out'));
    }, timeoutMs);
    _gpsFixWaiters.push(entry);
  });
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
let streetQuestShield=0;
let streetQuestBoostUntil=0;
let streetQuestItems=[];
let streetQuestHazards=[];
let streetQuestDestinationReached=false;
let streetQuestLayers=[];
let navVoiceEnabled=true;
let lastSpokenNavInstruction='';
let lastSpokenAt=0;
let lastHeading=null;
let lastHeadingSample=null;
const placeCache=new Map();
const placeLoadPromises=new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
const sync=()=>{if(mdPlan.length>0)mdPlan[dayIdx]=itin;};
// Shared guard against NaN/undefined/malformed coordinate pairs. Any place
// with bad coords (missing geocode, failed AI hydration, etc.) must never
// reach a Leaflet L.marker()/L.polyline() call — Leaflet throws "Invalid
// LatLng object" and that throw was reaching production because several
// call sites only checked `coords.length`, which [NaN, NaN] still passes.
const hasValidCoords = c => Array.isArray(c) && c.length === 2 && c.every(n => Number.isFinite(n));

// ── Global Leaflet safety net ───────────────────────────────────────────────
// hasValidCoords() above fixed the call sites we could find (renderMapMarkers,
// renderRoute, the place-merge functions) — but Leaflet throws synchronously
// and uncaught the instant ANY invalid [lat,lon] pair reaches L.marker()/
// L.polyline(), which silently aborts whatever loop or function called it.
// That makes this bug effectively impossible to fully stamp out call-site by
// call-site — any function we didn't audit (or any future one) can still
// crash the same way. This patches Leaflet's own factories once, globally,
// so an invalid pair is skipped (with a console.warn identifying it) instead
// of throwing. It's a last line of defense, not a fix for the bad data
// itself — the warnings it logs point at exactly which place/coords are bad.
(function installLeafletCoordGuard(){
  if (typeof L === 'undefined' || L.__coordGuardInstalled) return;
  L.__coordGuardInstalled = true;
  const isFiniteLatLngPair = v => {
    if (Array.isArray(v)) return v.length >= 2 && Number.isFinite(+v[0]) && Number.isFinite(+v[1]);
    if (v && typeof v === 'object') return Number.isFinite(+v.lat) && Number.isFinite(+(v.lng ?? v.lon));
    return false;
  };
  const noopLayer = () => {
    const stub = {};
    ['addTo','bindPopup','bindTooltip','setLatLng','setStyle','setIcon','setLatLngs','on','off','remove','removeFrom']
      .forEach(m => { stub[m] = () => stub; });
    stub.getBounds = () => L.latLngBounds([[20.5937,78.9629],[20.5937,78.9629]]);
    stub.getLatLngs = () => [];
    stub.getElement = () => null;
    return stub;
  };
  const origMarker = L.marker;
  L.marker = function(coords, opts){
    if (!isFiniteLatLngPair(coords)) { console.warn('[map guard] skipped L.marker — invalid coords:', coords, opts?.icon?.options?.className || ''); return noopLayer(); }
    return origMarker.call(L, coords, opts);
  };
  const origPolyline = L.polyline;
  L.polyline = function(latlngs, opts){
    const clean = (Array.isArray(latlngs) ? latlngs : []).filter(isFiniteLatLngPair);
    if (clean.length < 2) { console.warn('[map guard] skipped L.polyline — fewer than 2 valid points out of', (latlngs||[]).length); return noopLayer(); }
    if (clean.length !== latlngs.length) console.warn('[map guard] dropped', latlngs.length - clean.length, 'invalid point(s) from a polyline');
    return origPolyline.call(L, clean, opts);
  };
})();
// ── Global Leaflet view-movement safety net ─────────────────────────────────
// Companion to installLeafletCoordGuard() above. flyTo()/setView() being
// interrupted by another flyTo()/setView() before their animation finishes
// corrupts Leaflet's internal easing state and can throw a NaN LatLng error
// asynchronously, from inside Leaflet's own requestAnimationFrame callback —
// after the call that triggered it has already returned, so a try/catch
// around the call site can't catch it. map.stop() before each call (added at
// every known flyTo/setView call site) prevents the corruption in the first
// place; this patches flyTo/setView/panTo themselves to call it automatically
// too, so this can't regress at a call site someone adds later without
// remembering the pattern.
(function installLeafletMoveGuard(){
  if (typeof L === 'undefined' || !L.Map || L.Map.prototype.__moveGuardInstalled) return;
  L.Map.prototype.__moveGuardInstalled = true;
  const origSetView = L.Map.prototype.setView; // captured once, used as the shared fallback below
  // Only flyTo/panTo run multi-frame animations that can be left mid-flight
  // and need a pre-emptive stop(). setView must NOT call stop() itself:
  // Leaflet's own stop() calls setZoom(), and setZoom() calls setView() —
  // if setView() also called stop() first, that's mutual recursion
  // (setView -> stop -> setZoom -> setView -> stop -> ...) that overflows
  // the stack. setView already cancels any in-flight animation internally
  // via its own private _stop(), so it doesn't need this anyway.
  ['flyTo','panTo','setView'].forEach(fnName => {
    const orig = L.Map.prototype[fnName];
    if (typeof orig !== 'function') return;
    const needsStop = fnName !== 'setView';
    L.Map.prototype[fnName] = function(target, ...rest){
      const lat = Array.isArray(target) ? target[0] : target?.lat;
      const lng = Array.isArray(target) ? target[1] : (target?.lng ?? target?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.warn(`[map guard] skipped ${fnName} — invalid target:`, target);
        return this;
      }
      // flyTo()'s internal easing-path math divides by Math.max(size.x,
      // size.y) (the container's current pixel size). On a hidden container
      // (display:none — e.g. the map tab isn't the active one) that's 0,
      // producing NaN/Infinity that throws synchronously inside flyTo()
      // itself. setView has no such size-dependent math, so use it directly
      // instead of even attempting the animation — this still correctly
      // updates the stored center/zoom for whenever the map becomes visible
      // and invalidateSize() runs, just without the animation.
      if (fnName === 'flyTo') {
        const sz = this.getSize ? this.getSize() : null;
        if (!sz || !(sz.x > 0) || !(sz.y > 0)) {
          console.warn('[map guard] flyTo on a hidden/zero-size map — using instant setView instead');
          return origSetView.call(this, target, rest[0]);
        }
      }
      if (needsStop) this.stop(); // cancel any in-flight animation so this one starts clean
      try {
        return orig.call(this, target, ...rest);
      } catch (e) {
        console.warn(`[map guard] ${fnName} threw, falling back to instant setView`, e);
        try { return origSetView.call(this, target, rest[0]); }
        catch (e2) { console.warn('[map guard] fallback setView also threw', e2); return this; }
      }
    };
  });
})();
const m2t=m=>{const safe=((m%(24*60))+(24*60))%(24*60);const hh=String(Math.floor(safe/60)).padStart(2,'0');const mm=String(safe%60).padStart(2,'0');return `${hh}:${mm}`;};

// --- TIME BASED BEHAVIOUR HELPERS ---


// Real sunrise/sunset for a place's coordinates + date, so "best at
// sunrise/sunset" badges/scoring track the actual sun rather than a fixed
// 5–7 AM / 5–7 PM clock window (which drifts by well over an hour across
// India's geography and through the year). Same approximation as the
// backend's services/timeIntelligence.js computeSunTimes(), ported client-
// side so the route optimizer can call it synchronously per candidate stop
// order without a network round trip. Results are cached per
// coords+day since they don't change within a session.

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
function getRouteStopsForDay(dayStops){return (dayStops||[]).filter(stop=>!stop?.isBreak);}
function applyBreakPlanToCurrentItinerary(baseStops){
  const routeStops=(baseStops||getRouteStopsForDay(itin)).map(stop=>({ ...stop }));
  const breakEvery=getBreakEveryMinutes();
  const breakDuration=getBreakDurationMinutes();
  if(!breakEvery || !breakDuration) return routeStops;
  const rebuilt=[];
  let activeSinceBreak=0;
  routeStops.forEach(stop=>{
    const travel=stop.tt||0;
    const visit=stop.vt||60;
    if(rebuilt.length && activeSinceBreak>0 && activeSinceBreak + travel + visit > breakEvery){
      rebuilt.push(createBreakStop(rebuilt[rebuilt.length-1], rebuilt.length, breakDuration));
      activeSinceBreak=0;
    }
    rebuilt.push(stop);
    activeSinceBreak += travel + visit;
  });
  return rebuilt;
}
function estimateStopLoadMinutes(stops){
  return (stops||[]).reduce((sum, stop) => sum + (stop?.vt || 60) + 20, 0);
}


function getCityCenter(){
  const city=CITIES[currentCityId];
  if(city?.lat&&city?.lon) return [city.lat,city.lon];
  return null;
}

function getPreviewRouteStart(){
  // Only trust live GPS as the route start once a trip is actually live —
  // otherwise always anchor to the destination city, matching the same
  // city-first logic generatePlan() uses when it builds mdPlan. Preferring
  // GPS unconditionally here (regardless of tripActive) caused renderRoute()
  // to recompute stop-1 travel time from the user's real location instead of
  // the planned city whenever those two differ (e.g. planning a Goa trip
  // while physically in Hyderabad) — inflating that travel time enough that
  // recalcTimes({trimToWindow:true}) dropped the entire day to 0 stops.
  if (tripActive && cLat && cLon) return [cLat, cLon];
  return getCityCenter() || ((cLat && cLon) ? [cLat, cLon] : null);
}

function getLocalPlaces(cityId, cityName){
  const key=String(cityId||'').toLowerCase();
  const byName=Object.entries(CITIES).find(([,city])=>String(city.name||'').toLowerCase()===String(cityName||'').toLowerCase())?.[0];
  const seeds=LOCAL_PLACE_SEEDS[key] || LOCAL_PLACE_SEEDS[byName] || [];
  return seeds.map((seed,i)=>{
    const [name,cat,lat,lon,vt,ot,ct]=seed;
    return {
      id:`local_${key||byName||'city'}_${i}`,
      name,cat,coords:[lat,lon],vt,ot,ct,
      fallbackSource:'local_seed',
      importance:cat==='food'?'famous':i<6?'must_see':i<8?'famous':'local',
      importanceScore:cat==='food'?70:Math.max(35,100-i*6),
    };
  });
}



// Folds a city's verified Hidden Gems into the place pool automatically, so
// they're part of every itinerary's candidate list by default — not only
// when someone manually opens the Hidden Gems tool in chat.
function withHiddenGems(cityId, list){
  const gems = getHiddenGems(cityId);
  return dedupePlacesByProximity(gems.length ? [...list, ...gems] : list);
}

function mergePlacePools(...pools){
  const byName=new Map();
  for(const place of pools.flat()){
    if(!hasValidCoords(place?.coords)) continue;
    const key=String(place.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!key) continue;
    place.id = place.id || key;
    const existing=byName.get(key);
    if(!existing){
      byName.set(key,place);
      continue;
    }
    byName.set(key,{
      ...place,
      ...existing,
      id: existing.id || place.id || key,
      importanceScore:Math.max(existing.importanceScore||0,place.importanceScore||0),
      importance:(existing.importanceScore||0)>=(place.importanceScore||0)?existing.importance:place.importance,
    });
  }
  return dedupePlacesByProximity([...byName.values()]);
}

function sortNearestNeighbor(arr,sLat,sLon){
  if(arr.length<=1)return arr;
  let sorted=[],unsorted=[...arr],firstIdx=0;
  if(sLat&&sLon){let minD=Infinity;for(let i=0;i<unsorted.length;i++){const d=hvKm(sLat,sLon,unsorted[i].coords[0],unsorted[i].coords[1]);if(d<minD){minD=d;firstIdx=i;}}}
  sorted.push(unsorted.splice(firstIdx,1)[0]);
  while(unsorted.length>0){const last=sorted[sorted.length-1];let ci=0,minD=Infinity;for(let i=0;i<unsorted.length;i++){const d=hvKm(last.coords[0],last.coords[1],unsorted[i].coords[0],unsorted[i].coords[1]);if(d<minD){minD=d;ci=i;}}sorted.push(unsorted.splice(ci,1)[0]);}
  return sorted;
}

function getRouteStart(){
  if(cLat&&cLon) return [cLat,cLon];
  return getCityCenter();
}

function routeDistanceKm(stops,start){
  if(!Array.isArray(stops)||stops.length===0) return 0;
  let total=0;
  let prev=start;
  for(const stop of stops){
    if(prev) total+=hvKm(prev[0],prev[1],stop.coords[0],stop.coords[1]);
    prev=stop.coords;
  }
  return total;
}

function centroidOfStops(stops){
  if(!Array.isArray(stops)||stops.length===0) return null;
  const sum=stops.reduce((acc,stop)=>{
    acc.lat+=stop.coords[0];
    acc.lon+=stop.coords[1];
    return acc;
  },{lat:0,lon:0});
  return [sum.lat/stops.length,sum.lon/stops.length];
}

function clusterStopsByArea(stops){
  if(!Array.isArray(stops)||stops.length===0) return [];

  const CLUSTER_RADIUS_KM = 3.2;
  const clusters = [];

  for(const stop of stops){
    let bestCluster = null;
    let bestDist = Infinity;

    for(const cluster of clusters){
      const d = hvKm(cluster.center[0], cluster.center[1], stop.coords[0], stop.coords[1]);
      if(d < CLUSTER_RADIUS_KM && d < bestDist){
        bestCluster = cluster;
        bestDist = d;
      }
    }

    if(!bestCluster){
      clusters.push({ stops:[stop], center:[stop.coords[0], stop.coords[1]] });
      continue;
    }

    bestCluster.stops.push(stop);
    bestCluster.center = centroidOfStops(bestCluster.stops);
  }

  return clusters;
}

function orderStopsAreaWise(stops,start){
  if(!Array.isArray(stops)||stops.length<=2) return [...(stops||[])];

  const clusters = clusterStopsByArea(stops);
  const clusterOrder = sortNearestNeighbor(
    clusters.map((cluster, index)=>({
      id:`cluster_${index}`,
      coords:cluster.center,
      cluster,
    })),
    start?.[0],
    start?.[1]
  );

  const ordered = [];
  let currentStart = start;

  for(const item of clusterOrder){
    const local = sortNearestNeighbor(item.cluster.stops, currentStart?.[0], currentStart?.[1]);
    ordered.push(...local);
    currentStart = local[local.length - 1]?.coords || currentStart;
  }

  return ordered;
}

// How much one "unit" of bad time-fit (a stop landing at a rough time —
// closed, peak crowd, missed golden hour, heat/rain) counts against, in
// the same km units as travel distance, when the optimizer below weighs
// order changes. Tuned so time-fit meaningfully influences order without
// completely overriding geography (e.g. never route someone 20km out of
// the way just to shave a few crowd-score points).
const TIME_FIT_KM_WEIGHT = 2.2;
// Simulates a candidate stop order's projected arrival time at each stop
// (same 0.45 km/min travel estimate used later to compute the real
// schedule — see the s.tt assignment in the sync/recalc block) and scores
// each arrival via calculateExperienceScore — the same function driving
// map-marker colors and place badges — so open/closed, crowd, sunrise/
// sunset, and weather all factor into which order is "better", not just
// distance.
function estimateTimeFitPenaltyKm(stops, start) {
  if (!Array.isArray(stops) || !stops.length) return 0;
  let clock = t2m(document.getElementById('s-time')?.value || '09:00', 9 * 60);
  let prev = start;
  let penalty = 0;
  for (const stop of stops) {
    if (prev) clock += Math.max(5, Math.round(hvKm(prev[0], prev[1], stop.coords[0], stop.coords[1]) / 0.45));
    const { score } = calculateExperienceScore(stop, clock % 1440);
    penalty += (1 - score / 100) * TIME_FIT_KM_WEIGHT; // 0 = perfect fit, full weight = worst
    clock += stop.vt || 60;
    prev = stop.coords;
  }
  return penalty;
}

function optimizeStopOrder(stops,start){
  if(!Array.isArray(stops)||stops.length<=2) return [...(stops||[])];

  // Combined cost = travel distance + time-of-day fitness penalty, so the
  // 2-opt search below can trade a slightly longer drive for a much better-
  // timed visit (e.g. hitting a sunset spot near sunset, or dodging a
  // stop's peak-crowd window) instead of purely chasing the shortest route.
  const routeCost=(candidate)=>routeDistanceKm(candidate,start)+estimateTimeFitPenaltyKm(candidate,start);

  let ordered=orderStopsAreaWise(stops,start);
  let improved=true;
  let guard=0;

  while(improved&&guard<8){
    improved=false;
    guard+=1;
    for(let i=0;i<ordered.length-2;i++){
      for(let j=i+1;j<ordered.length-1;j++){
        const candidate=[
          ...ordered.slice(0,i),
          ...ordered.slice(i,j+1).reverse(),
          ...ordered.slice(j+1),
        ];
        if(routeCost(candidate)+0.05<routeCost(ordered)){
          ordered=candidate;
          improved=true;
        }
      }
    }
  }

  return ordered;
}

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
window.toggleNavCardCollapsed=function(forceState){
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
};
function restoreNavCardCollapsed(){
  let wasCollapsed=false;
  try{ wasCollapsed=localStorage.getItem(NAV_CARD_COLLAPSED_KEY)==='1'; }catch(_e){}
  if(wasCollapsed) toggleNavCardCollapsed(true);
}

function followLivePosition(force=false){
  if(!map||cLat==null||cLon==null) return;
  if(!force && (!tripActive || !autoFollowLive)) return;
  const zoom=Math.max(map.getZoom()||14,15);
  let target=[cLat,cLon];
  if(tripActive){
    const pt=map.project(target,zoom);
    const shifted=L.point(pt.x,pt.y+110);
    target=map.unproject(shifted,zoom);
  }
  const tLat=Array.isArray(target)?target[0]:target.lat;
  const tLon=Array.isArray(target)?target[1]:target.lng;
  if(!isFiniteLatLon(tLat,tLon)) return;
  // Leaflet's flyTo() runs its own internal fly-path easing math over a
  // sequence of requestAnimationFrame ticks (separate from the target we
  // pass in). If a new flyTo()/setView() call interrupts an animation
  // that's still in flight — e.g. this function firing again for the next
  // GPS fix before the previous 0.8s flight has finished, which is the
  // normal case during live tracking — Leaflet's internal easing state gets
  // corrupted and later animation frames independently compute a NaN LatLng
  // and throw. That throw happens asynchronously, inside Leaflet's own rAF
  // callback, well after this function (and its try/catch below) has
  // already returned, so the try/catch alone can never catch it. The fix is
  // map.stop() immediately before starting a new flight: it cleanly cancels
  // any in-progress animation so the next flyTo() always starts from a
  // clean, uncorrupted state instead of interrupting one mid-flight.
  const curCenter=map.getCenter();
  const alreadyThere = curCenter && isFiniteLatLon(curCenter.lat,curCenter.lng)
    && map.distance(curCenter,[tLat,tLon])<3 && Math.abs((map.getZoom()||zoom)-zoom)<0.01;
  if(alreadyThere) return;
  map.stop();
  try{
    map.flyTo([tLat,tLon],zoom,{
      animate:true,
      duration:0.8,
      easeLinearity:0.25,
    });
  }catch(e){
    console.warn('[followLivePosition] flyTo threw, falling back to setView', e);
    map.stop();
    map.setView([tLat,tLon],zoom);
  }
}

function toggleLiveFollow(forceState){
  autoFollowLive=typeof forceState==='boolean' ? forceState : !autoFollowLive;
  updateFollowButton();
  if(autoFollowLive) followLivePosition(true);
}

function bearingBetween(from,to){
  const toRad=v=>v*Math.PI/180;
  const toDeg=v=>(v*180/Math.PI+360)%360;
  const lat1=toRad(from[0]), lat2=toRad(to[0]);
  const dLon=toRad(to[1]-from[1]);
  const y=Math.sin(dLon)*Math.cos(lat2);
  const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
  return toDeg(Math.atan2(y,x));
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

function maybeSpeakNavInstruction(text, force=false){
  if(!tripActive || !navVoiceEnabled || !text || !window.speechSynthesis) return;
  const normalized=String(text).replace(/\s+/g,' ').trim();
  const now=Date.now();
  if(!force && (normalized===lastSpokenNavInstruction || now-lastSpokenAt<5000)) return;
  lastSpokenNavInstruction=normalized;
  lastSpokenAt=now;
  speak(normalized);
}

function updateQuestLevel(){
  streetQuestLevel=1+Math.floor(streetQuestScore/50);
}

function turnArrowForInstruction(text){
  const t=String(text||'').toLowerCase();
  if(t.includes('left')) return '⬅️';
  if(t.includes('right')) return '➡️';
  if(t.includes('u-turn')) return '↩️';
  if(t.includes('arrive')) return '🏁';
  if(t.includes('straight') || t.includes('continue') || t.includes('depart')) return '⬆️';
  return '🧭';
}

function keepNearbyCluster(stops,start,maxRadiusKm=6){
  if(!Array.isArray(stops)||stops.length<=1||!start) return [...(stops||[])];
  const sorted=sortNearestNeighbor(stops,start[0],start[1]);
  const anchor=sorted[0]?.coords || start;
  const nearby=sorted.filter(stop=>hvKm(anchor[0],anchor[1],stop.coords[0],stop.coords[1])<=maxRadiusKm);
  return nearby.length>=2 ? nearby : sorted.slice(0, Math.min(4, sorted.length));
}

function famousPlaceScore(stop,start){
  if(!stop?.coords) return -999;
  const dist = start ? hvKm(start[0], start[1], stop.coords[0], stop.coords[1]) : 0;
  const name = String(stop.name||'').toLowerCase();
  let fame = 0;
  fame += Number(stop.importanceScore||0);
  if(stop.importance==='must_see') fame += 25;
  else if(stop.importance==='famous') fame += 10;
  if(stop.aiRanked) fame += 8;
  if(String(stop.id||'').startsWith('wiki_')) fame += 5;
  if(stop.cat==='beach' || stop.cat==='temple') fame += 2;
  if(/\b(park|beach|temple|fort|palace|museum|zoo|aquarium|caves|cave|hill|peak|viewpoint|view point|ghat|falls|lake|garden|island|monument|statue)\b/.test(name)) fame += 3;
  if(/\b(famous|iconic|heritage|central|main|old|grand)\b/.test(name)) fame += 2;
  if(stop.wikiMatched) fame += 2;
  return fame * 4 - dist;
}

function prioritizePlanStops(stops,start,prefs=[]){
  if(!Array.isArray(stops)||!stops.length) return [];
  const wantsFood = prefs.includes('food');
  let foodStops = stops.filter(s=>s.cat==='food');
  let attractionStops = stops.filter(s=>s.cat!=='food');

  if(attractionStops.length){
    attractionStops = [...attractionStops]
      .sort((a,b)=>famousPlaceScore(b,start)-famousPlaceScore(a,start))
      .slice(0, Math.min(attractionStops.length, 50)); // enough for multi-day trips
    attractionStops = sortNearestNeighbor(attractionStops, start?.[0], start?.[1]);
  }

  if(foodStops.length){
    foodStops = keepNearbyCluster(foodStops,start,wantsFood && prefs.length===1 ? 4 : 3.5)
      .sort((a,b)=>{
        const da = start ? hvKm(start[0],start[1],a.coords[0],a.coords[1]) : 0;
        const db = start ? hvKm(start[0],start[1],b.coords[0],b.coords[1]) : 0;
        return da-db;
      });
  }

  if(!wantsFood) return attractionStops;
  if(!attractionStops.length) return foodStops;
  return [...attractionStops, ...foodStops];
}

function dayPartForMinutes(mins){
  if(mins < 11*60) return 'Morning';
  if(mins < 15*60) return 'Afternoon';
  if(mins < 19*60) return 'Evening';
  return 'Night';
}

function climateMode(temp){
  if(temp >= 33) return 'hot';
  if(temp <= 23) return 'cool';
  return 'pleasant';
}

function estimateTravelMinutes(prevCoords, stop, isFirstStop=false){
  if(!prevCoords || !stop?.coords) return isFirstStop ? 10 : 20;
  const km = hvKm(prevCoords[0], prevCoords[1], stop.coords[0], stop.coords[1]);
  return Math.max(isFirstStop ? 10 : 12, Math.min(35, Math.round(km / 0.42)));
}

// Persona weighting for itinerary personalization (mirrors data/time-intelligence-rules.json
// on the backend — kept here too so client-side scoring doesn't need a network round trip).
const PERSONA_WEIGHTS = {
  photographer: { sunrise: 14, sunset: 14, scenic: 8, monument: 5 },
  family:       { safety: 10, park: 8, garden: 8, museum: 6 },
  adventure:    { hill: 10, waterfall: 9, fort: 7 },
  food_lover:   { food: 12, market: 9 },
  history:      { monument: 11, fort: 10, museum: 10, temple: 5 },
  nature:       { park: 9, garden: 8, beach: 6, waterfall: 7 },
};
window.selectedPersonas = window.selectedPersonas || [];

// Trip-mode weighting (who's traveling: solo/duo/trio/family/group) — mirrors
// the "tripModes" section of data/time-intelligence-rules.json on the
// backend. Backend uses multiplicative weights against a 0-100ish score;
// here we use additive bonuses on the same additive scale as PERSONA_WEIGHTS
// above, since stopTimeScore's scoring system throughout this file is
// additive, not multiplicative. A trip has exactly one mode (not a list),
// unlike personas.
const TRIP_MODE_WEIGHTS = {
  solo:   { cafe: 8, museum: 8, market: 6, sunrise: 8, sunset: 8, nightlife: -6 },
  duo:    { sunset: 14, sunrise: 8, beach: 8, scenic: 10, garden: 6, food: 6 },
  trio:   { food: 10, market: 8, nightlife: 6, scenic: 6 },
  family: { park: 10, garden: 10, museum: 8, temple: 4, nightlife: -15 },
  group:  { market: 8, food: 10, nightlife: 8, monument: 4 },
};
window.selectedTripMode = window.selectedTripMode || null;

function tripModeBonus(stop, tripMode){
  const weights = tripMode && TRIP_MODE_WEIGHTS[tripMode];
  if(!weights) return 0;
  let bonus = 0;
  if(weights.sunrise && stop.is_sunrise_spot) bonus += weights.sunrise;
  if(weights.sunset && stop.is_sunset_spot) bonus += weights.sunset;
  if(weights.nightlife && stop.has_nightlife) bonus += weights.nightlife;
  if(weights[stop.cat]) bonus += weights[stop.cat];
  return bonus;
}

function personaBonus(stop, personas){
  if(!personas || !personas.length) return 0;
  let bonus = 0;
  personas.forEach(p=>{
    const weights = PERSONA_WEIGHTS[p];
    if(!weights) return;
    if(weights.sunrise && stop.is_sunrise_spot) bonus += weights.sunrise;
    if(weights.sunset && stop.is_sunset_spot) bonus += weights.sunset;
    if(weights.safety && stop.family_friendly) bonus += weights.safety;
    if(weights[stop.cat]) bonus += weights[stop.cat];
  });
  return bonus;
}

function stopTimeScore(stop, arriveMin, temp, priorityIndex=0, wind=0, personas=null, tripMode=null){
  const part = dayPartForMinutes(arriveMin);
  const climate = climateMode(temp);
  let score = Math.max(0, 12 - priorityIndex) + Math.min(20, Number(stop.importanceScore||0) / 5);

  // Extreme heat: push outdoor stops out of the 12-16h window instead of
  // just favoring indoor ones — a real reroute signal, not just a note.
  if (stop.indoor_outdoor === 'outdoor' && temp >= 38 && arriveMin >= 12*60 && arriveMin <= 16*60) {
    score -= 25;
  }
  // Strong wind: warn beaches / viewpoints / sunset spots away from that slot.
  if (wind >= 30 && (stop.cat === 'beach' || stop.cat === 'scenic' || stop.is_sunset_spot)) {
    score -= 15;
  }
  score += personaBonus(stop, personas || window.selectedPersonas);
  score += tripModeBonus(stop, tripMode || window.selectedTripMode);

  if (stop.is_sunrise_spot && arriveMin >= 5.5*60 && arriveMin <= 7.5*60) score += 15;
  if (stop.is_sunset_spot && arriveMin >= 17*60 && arriveMin <= 18.5*60) score += 15;
  if (stop.has_nightlife && arriveMin >= 19*60) score += 8;
  if (stop.indoor_outdoor === 'indoor' && climate === 'hot' && arriveMin >= 12*60 && arriveMin <= 16*60) score += 5;
  if (stop.best_visiting_hours) {
    const parts = stop.best_visiting_hours.split('-');
    if (parts.length === 2) {
      const sMin = t2m(parts[0].trim());
      const eMin = t2m(parts[1].trim());
      if (arriveMin >= sMin && arriveMin <= eMin) score += 10;
    }
  }

  if(stop.cat === 'food'){
    if(arriveMin >= 12*60 && arriveMin <= 15*60) score += 14;
    else if(arriveMin >= 18*60 && arriveMin <= 22*60) score += 16;
    else if(arriveMin >= 9*60 && arriveMin < 11*60) score += 6;
    else score -= 6;
    if(/\b(cafe|coffee|breakfast|bakery)\b/i.test(stop.name || '') && part === 'Morning') score += 4;
    if(/\b(seafood|biryani|restaurant|mess|eatery|hotel)\b/i.test(stop.name || '') && part !== 'Morning') score += 3;
    return score;
  }
  if(stop.cat === 'temple'){
    if(part === 'Morning') score += 12;
    else if(part === 'Evening') score += 8;
    else if(part === 'Afternoon') score += 1;
    else score -= 5;
    return score;
  }
  if(stop.cat === 'beach'){
    if(climate === 'hot'){
      if(part === 'Morning' || part === 'Evening') score += 12;
      else score -= 8;
    } else {
      if(part === 'Morning' || part === 'Evening') score += 9;
      else if(part === 'Afternoon') score += 3;
      else score -= 4;
    }
    return score;
  }
  if(climate === 'hot'){
    if(part === 'Morning' || part === 'Evening') score += 8;
    else if(part === 'Afternoon') score -= 2;
  } else {
    if(part === 'Morning' || part === 'Afternoon' || part === 'Evening') score += 6;
    else score -= 3;
  }
  return score;
}

function stopClimateNote(stop, arriveMin, temp){
  const part = dayPartForMinutes(arriveMin);
  const climate = climateMode(temp);
  
  if (stop.is_sunrise_spot && arriveMin >= 5.5*60 && arriveMin <= 7.5*60) return '🌅 Sunrise View';
  if (stop.is_sunset_spot && arriveMin >= 17*60 && arriveMin <= 18.5*60) return '🌇 Sunset View';
  if (stop.has_nightlife && arriveMin >= 19*60) return '🍹 Nightlife';
  if (stop.indoor_outdoor === 'indoor' && climate === 'hot' && part === 'Afternoon') return '🏛️ Indoor Heat Escape';

  if(stop.cat === 'food'){
    if(part === 'Afternoon') return 'Lunch Stop';
    if(part === 'Evening') return 'Sunset Snack';
    if(part === 'Night') return 'Dinner Stop';
    return 'Food Break';
  }
  if(stop.cat === 'beach' && climate === 'hot') return part === 'Morning' ? 'Cool Morning Window' : 'Best Near Sunset';
  if(stop.cat === 'temple') return part === 'Morning' ? 'Peaceful Morning Visit' : 'Calmer Evening Slot';
  if(climate === 'hot' && part === 'Afternoon') return 'Short Climate-Friendly Visit';
  return `${part} Highlight`;
}

function buildTimeAwareDay(stops, startMin, maxT, startCoords, temp, breakEvery=0, breakDuration=0){
  let currentMin = startMin;
  let used = 0;
  let activeSinceBreak = 0;
  let prevCoords = startCoords;
  let hasLunch = false;
  let hasDinner = false;
  const remaining = [...(stops || [])];
  const day = [];

  // Places available for this trip but not in the user's category filter —
  // used as a fallback pool so the day doesn't end early just because the
  // preferred categories closed for the day (e.g. temples/forts closing
  // 17:00-17:30). Night-friendly categories are prioritized once the sun
  // sets. This directly implements "recommend night attractions after
  // sunset" / "skip closed places" from the Time Intelligence spec.
  const usedIds = new Set();
  const supplementalPool = (typeof LOCS !== 'undefined' ? LOCS : [])
    .filter(l => !(stops || []).some(s => s.id === l.id));

  function tryFillFromPool(pool){
    let best = null;
    for(let i=0;i<pool.length;i++){
      const loc = pool[i];
      if(usedIds.has(loc.id) || day.some(d=>d.id===loc.id)) continue;
      const travel = getSmartTravelTime(prevCoords, loc.coords, currentCityId, currentMin, day.length===0);
      const visit = getSmartVisitTime(loc, currentMin + travel, new Date().getDay());
      const arrive = currentMin + travel;
      let actualVisit = visit;
      if(used + travel + actualVisit > maxT) actualVisit = maxT - (used + travel);
      if(actualVisit < 15) continue;
      const depart = arrive + actualVisit;
      const openMin = t2m(loc.ot || '06:00');
      const closeMin = t2m(loc.ct || '23:00');
      const nightFriendly = loc.cat==='food' || loc.cat==='market' || loc.night_availability || loc.is_sunset_spot;
      const isOpen = arrive >= openMin && arrive < closeMin;
      if(!isOpen && !(nightFriendly && arrive >= closeMin && arrive < 23*60)) continue; // truly closed
      const km = hvKm(prevCoords[0], prevCoords[1], loc.coords[0], loc.coords[1]);
      let score = -(km * 10000) + stopTimeScore(loc, arrive, temp, 6, window.realWind || 0, window.selectedPersonas)
        + (nightFriendly && arrive >= 18*60 ? 40 : 0);
      if(!best || score > best.score) best = { loc, travel, visit: actualVisit, arrive, depart, score };
    }
    return best;
  }

  while(remaining.length){
    let best = null;
    for(let i=0;i<remaining.length;i++){
      const loc = remaining[i];
      const travel = getSmartTravelTime(prevCoords, loc.coords, currentCityId, currentMin, day.length===0);
      const visit = getSmartVisitTime(loc, currentMin + travel, new Date().getDay());
      const shouldBreak = day.length>0 && breakEvery>0 && breakDuration>0 && activeSinceBreak>0 && (activeSinceBreak + travel + visit > breakEvery);
      const breakLead = shouldBreak ? breakDuration : 0;
      const arrive = currentMin + breakLead + travel;
      let actualVisit = visit;
      if(used + breakLead + travel + actualVisit > maxT) {
        actualVisit = maxT - (used + breakLead + travel);
      }
      if(actualVisit < 15) continue;
      
      const depart = arrive + actualVisit;
      const openMin = t2m(loc.ot || '06:00');
      const closeMin = t2m(loc.ct || '23:00'); // respect the place's real closing time — no fake floor
      if(arrive < openMin || arrive >= closeMin) continue; // Hard reject if closed
      
      // Nearest Neighbor Base Score
      const km = hvKm(prevCoords[0], prevCoords[1], loc.coords[0], loc.coords[1]);
      let score = -(km * 10000) + stopTimeScore(loc, arrive, temp, i, window.realWind || 0, window.selectedPersonas);

      // --- STRICT TIME-BASED FOOD SCHEDULING ---
      if (loc.cat === 'food') {
         let isLunchTime = arrive >= 12.5*60 && arrive <= 15*60 && !hasLunch;
         let isDinnerTime = arrive >= 19.5*60 && arrive <= 22*60 && !hasDinner;
         
         if (isLunchTime || isDinnerTime) {
            score += 1000000; // Force selecting food
         } else {
            score -= 1000000; // Force avoiding food outside meal times
         }
      } else {
         // If we are deep into meal time and haven't eaten, strictly penalize non-food
         if (!hasLunch && arrive >= 13.5*60 && arrive <= 15*60) score -= 1000000;
         if (!hasDinner && arrive >= 20.5*60 && arrive <= 22*60) score -= 1000000;
      }
      
      // --- HEAT AVOIDANCE ---
      if (temp && temp > 35 && loc.indoor_outdoor === 'outdoor' && arrive >= 12*60 && arrive <= 16*60) {
        score -= 500000;
      }
      
      // --- SUNRISE / SUNSET BOOSTS ---
      if (loc.is_sunrise_spot && arrive >= 5*60 && arrive <= 7*60) score += 500000;
      if (loc.is_sunset_spot && arrive >= 17.5*60 && arrive <= 18.5*60) score += 500000;

      if(!best || score > best.score || (score === best.score && travel < best.travel)){
        best = { index:i, loc, travel, visit: actualVisit, arrive, depart, score, breakLead };
      }
    }

    if(!best){
      let nextOpen = Infinity;
      for(const loc of remaining){
        const openMin = t2m(loc.ot || '06:00');
        const candidate = Math.max(currentMin + 20, openMin);
        if(candidate < nextOpen) nextOpen = candidate;
      }
      if(!Number.isFinite(nextOpen) || nextOpen <= currentMin || used + (nextOpen - currentMin) > maxT) break;
      used += nextOpen - currentMin;
      currentMin = nextOpen;
      continue;
    }

    const picked = {
      ...best.loc,
      tt: best.travel,
      vt: best.visit,
      slotLabel: dayPartForMinutes(best.arrive),
      climateNote: stopClimateNote(best.loc, best.arrive, temp),
    };
    if(best.breakLead){
      const breakStop=createBreakStop(day[day.length-1] || picked, day.length, best.breakLead);
      day.push(breakStop);
      used += best.breakLead;
      currentMin += best.breakLead;
      activeSinceBreak = 0;
    }
    day.push(picked);
    
    // Update Meal Flags
    if (picked.cat === 'food') {
      if (best.arrive >= 12*60 && best.arrive <= 15.5*60) hasLunch = true;
      if (best.arrive >= 18*60 && best.arrive <= 22.5*60) hasDinner = true;
    }

    remaining.splice(best.index, 1);
    used += best.travel + (picked.vt || 60);
    currentMin = best.depart;
    prevCoords = picked.coords;
    activeSinceBreak += best.travel + (picked.vt || 60);
  }

  // ── Backfill: if the preferred-category places ran out or closed but the
  //    user's requested end time hasn't been reached yet, pull in open /
  //    night-friendly places from the wider city pool instead of ending the
  //    day early. Repeats until the time budget is used up or nothing else
  //    is open.
  let backfillGuard = 0;
  while(used < maxT - 15 && backfillGuard < 12){
    const fill = tryFillFromPool(supplementalPool);
    if(!fill) break;
    const picked = {
      ...fill.loc,
      tt: fill.travel,
      vt: fill.visit,
      slotLabel: dayPartForMinutes(fill.arrive),
      climateNote: stopClimateNote(fill.loc, fill.arrive, temp),
    };
    day.push(picked);
    usedIds.add(fill.loc.id);
    used += fill.travel + (picked.vt || 30);
    currentMin = fill.depart;
    prevCoords = picked.coords;
    backfillGuard++;
  }

  return { day, remaining };
}

function clearStreetQuestLayers(){
  streetQuestLayers.forEach(layer=>{ try{ map?.removeLayer(layer); }catch(_e){} });
  streetQuestLayers=[];
  streetQuestItems=[];
  streetQuestHazards=[];
}

function setStreetQuestMessage(msg){
  const el=document.getElementById('sq-msg');
  if(el) el.textContent=msg;
}

function updateStreetQuestUI(){
  document.getElementById('street-quest').style.display=streetQuestActive?'block':'none';
  document.getElementById('sq-score').textContent=streetQuestScore;
  document.getElementById('sq-level').textContent=streetQuestLevel;
  document.getElementById('sq-health').textContent=streetQuestHealth;
  document.getElementById('sq-coins').textContent=streetQuestCoins;
}

function getPlayableRoutePoints(){
  if(rLine?.getLatLngs){
    const latlngs=rLine.getLatLngs().flat ? rLine.getLatLngs().flat(Infinity) : rLine.getLatLngs();
    const cleaned=latlngs.filter(p=>p&&typeof p.lat==='number'&&typeof p.lng==='number').map(p=>[p.lat,p.lng]);
    if(cleaned.length>=2) return cleaned;
  }
  const fallback=[];
  if(tripActive&&cLat&&cLon) fallback.push([cLat,cLon]);
  fallback.push(...itin.map(stop=>stop.coords));
  return fallback;
}

function interpolatePathPoint(path, ratio){
  if(path.length===0) return null;
  if(path.length===1) return path[0];
  const segments=[];
  let total=0;
  for(let i=1;i<path.length;i++){
    const len=hvKm(path[i-1][0],path[i-1][1],path[i][0],path[i][1]);
    segments.push(len);
    total+=len;
  }
  if(total<=0) return path[Math.min(path.length-1,1)];
  let target=total*Math.min(Math.max(ratio,0),1);
  for(let i=1;i<path.length;i++){
    const seg=segments[i-1];
    if(target<=seg){
      const t=seg===0?0:target/seg;
      return [
        path[i-1][0]+(path[i][0]-path[i-1][0])*t,
        path[i-1][1]+(path[i][1]-path[i-1][1])*t,
      ];
    }
    target-=seg;
  }
  return path[path.length-1];
}

function createQuestMarker(coords, emoji, color){
  return L.marker(coords,{
    icon:L.divIcon({
      className:'iit-marker',
      html:`<div style="width:26px;height:26px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 12px ${color}88;font-size:14px">${emoji}</div>`,
      iconSize:[26,26],
      iconAnchor:[13,13],
    })
  }).addTo(map);
}

function setupStreetQuest(){
  clearStreetQuestLayers();
  streetQuestDestinationReached=false;
  const path=getPlayableRoutePoints();
  if(path.length<2 || !itin.length){
    setStreetQuestMessage('Generate a route and start live tracking to play Street Quest.');
    updateStreetQuestUI();
    return;
  }

  const itemCount=Math.min(6, Math.max(4, itin.length + 2));
  const hazardCount=Math.min(3, Math.max(1, itin.length));

  for(let i=0;i<itemCount;i++){
    const point=interpolatePathPoint(path,(i+1)/(itemCount+1));
    if(!point) continue;
    let type='coin', emoji='🪙', color='#f0c074';
    if(i===itemCount-1){ type='shield'; emoji='🛡️'; color='#00d4b8'; }
    else if(i===Math.floor(itemCount/2)){ type='boost'; emoji='⚡'; color='#a78bfa'; }
    else if(i%3===0){ type='gem'; emoji='💎'; color='#00c8f0'; }
    const marker=createQuestMarker(point,emoji,color);
    marker.bindPopup(type.charAt(0).toUpperCase()+type.slice(1));
    streetQuestItems.push({ coords:point, collected:false, marker, type });
    streetQuestLayers.push(marker);
  }

  for(let i=0;i<hazardCount;i++){
    const point=interpolatePathPoint(path,(i+1)/(hazardCount+1)-0.08);
    if(!point) continue;
    const marker=createQuestMarker(point,'👻','#ff6b8a');
    marker.bindPopup('Hazard');
    streetQuestHazards.push({ coords:point, hit:false, marker });
    streetQuestLayers.push(marker);
  }

  const destination=createQuestMarker(itin[0].coords,'🏁','#f0c074');
  destination.bindPopup(`Destination: ${itin[0].name}`);
  streetQuestLayers.push(destination);
  setStreetQuestMessage(`Collect items, avoid ghosts, and reach ${itin[0].name}.`);
  updateStreetQuestUI();
}

function toggleStreetQuest(forceState){
  const next=typeof forceState==='boolean' ? forceState : !streetQuestActive;
  if(next){
    if(!tripActive){ addMsg('🕹️ Start live navigation first, then begin Street Quest.'); return; }
    if(!itin.length){ addMsg('🕹️ Generate a plan first to play Street Quest.'); return; }
    streetQuestActive=true;
    streetQuestScore=0;
    streetQuestHealth=3;
    streetQuestCoins=0;
    streetQuestLevel=1;
    streetQuestShield=0;
    streetQuestBoostUntil=0;
    setupStreetQuest();
    addMsg('🕹️ <strong>Street Quest started!</strong> Follow the roads, collect the glowing items, avoid ghosts, and reach the destination.');
  }else{
    streetQuestActive=false;
    clearStreetQuestLayers();
    updateStreetQuestUI();
    addMsg('🕹️ Street Quest ended.');
  }
}

function updateStreetQuestProgress(){
  if(!streetQuestActive || cLat==null || cLon==null) return;

  for(const item of streetQuestItems){
    if(item.collected) continue;
    if(map.distance([cLat,cLon],item.coords) < 45){
      item.collected=true;
      if(item.type==='coin'){
        streetQuestCoins+=5;
        streetQuestScore+=streetQuestBoostUntil>Date.now()?10:5;
        setStreetQuestMessage(`Coin collected. Plan ahead and keep moving.`);
      }else if(item.type==='gem'){
        streetQuestScore+=streetQuestBoostUntil>Date.now()?30:15;
        setStreetQuestMessage('Gem secured. Efficient routing earns bigger rewards.');
      }else if(item.type==='shield'){
        streetQuestShield+=1;
        streetQuestScore+=10;
        setStreetQuestMessage('Shield ready. Your next ghost hit will be blocked.');
      }else if(item.type==='boost'){
        streetQuestBoostUntil=Date.now()+60000;
        streetQuestScore+=10;
        setStreetQuestMessage('Speed boost active for 60 seconds. Coins are now doubled.');
      }
      try{ map.removeLayer(item.marker); }catch(_e){}
    }
  }

  for(const hazard of streetQuestHazards){
    if(hazard.hit) continue;
    if(map.distance([cLat,cLon],hazard.coords) < 35){
      hazard.hit=true;
      if(streetQuestShield>0){
        streetQuestShield-=1;
        setStreetQuestMessage('Shield absorbed the ghost hit. Keep following the streets.');
      }else{
        streetQuestHealth=Math.max(0, streetQuestHealth-1);
        setStreetQuestMessage('Ghost nearby. You lost 1 health, so plan a cleaner route.');
      }
      try{ hazard.marker.setOpacity(0.35); }catch(_e){}
      if(streetQuestHealth===0){
        addMsg('👻 <strong>Street Quest over.</strong> You ran out of health. Tap Street Quest to try again.');
        toggleStreetQuest(false);
        return;
      }
    }
  }

  if(!streetQuestDestinationReached && itin[0] && map.distance([cLat,cLon], itin[0].coords) < 90){
    streetQuestDestinationReached=true;
    streetQuestScore+=25;
    setStreetQuestMessage(`Destination reached: ${itin[0].name}. Great route planning.`);
  }

  updateQuestLevel();
  updateStreetQuestUI();
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(){document.documentElement.setAttribute('data-theme','dark');localStorage.setItem('tt_theme','dark');}
function toggleTheme(){isDark=!isDark;applyTheme();}

// ── Firebase Auth ─────────────────────────────────────────────────────────────
onAuthStateChanged(auth,async user=>{
  resolveAuthChecked();
  if(user){
    currentUser=user;
    window.currentUser=user; // client-api.js reads this to attach auth headers — was missing before, so it was always undefined
    document.getElementById('login-screen').style.display='none';
    const av=document.getElementById('user-avatar');
    if(user.photoURL){av.src=user.photoURL;av.style.display='block';}
    document.getElementById('um-name').textContent=user.displayName||'Traveller';
    document.getElementById('um-email').textContent=user.email||'';
    // Load user cloud data silently in background — no chat message spam
    loadUserData().catch(()=>{});
    const firstName = user.displayName?.split(' ')[0] || 'Traveller';
    addMsg(`👋 Welcome, <strong>${firstName}</strong>! Your data is synced ☁️ — pick a city and tap Generate to start!`);
  } else {
    currentUser=null;
    window.currentUser=null;
    document.getElementById('login-screen').style.display='flex';
    document.getElementById('user-avatar').style.display='none';
  }
});

// Module-level guard — lives outside signInWithGoogle() so it persists
// across calls. This is what actually stops auth/cancelled-popup-request:
// that error fires when a second signInWithPopup() call cancels the first
// one still in flight, so the fix is to never make that second call at all.
let isSigningIn = false;

async function signInWithGoogle(event){
  // Ignore any click that arrives while a sign-in is already in progress —
  // this must be the very first thing that runs, before any DOM changes or
  // Firebase calls, so a rapid second click is a true no-op.
  if (isSigningIn) return;
  isSigningIn = true;

  // Locate the actual button so it can be disabled, not just the loading
  // indicator. event.currentTarget is the <button> itself (see the
  // onclick="signInWithGoogle(event)" wiring in index.html); fall back to
  // a selector in case this is ever invoked without an event.
  const btn = event?.currentTarget || document.querySelector('.btn-google');
  const loadingEl = document.getElementById('login-loading');

  if (btn) btn.disabled = true;
  if (loadingEl) loadingEl.style.display = 'block';

  try {
    // Unchanged — same call, same provider, same auth instance as before.
    await signInWithPopup(auth, gProvider);
    // No success-path UI here by design: onAuthStateChanged (registered
    // elsewhere in this file) already handles the post-login UI update,
    // so this stays untouched to avoid duplicating that flow.
  } catch (e) {
    // These two codes are expected, user-driven outcomes, not real
    // failures — a double-click racing two popups, or the user closing
    // the Google popup themselves. Don't alert for either.
    const expected = e?.code === 'auth/cancelled-popup-request'
                   || e?.code === 'auth/popup-closed-by-user';
    if (!expected) {
      console.error('[signInWithGoogle] Unexpected auth error:', e);
      alert('Sign-in failed: ' + e.message);
    } else {
      console.warn('[signInWithGoogle] Expected popup race, ignored:', e.code);
    }
  } finally {
    // Guaranteed to run on success, expected-error, or unexpected-error
    // (including network failures, which surface here as a caught
    // exception too) — so the button and loading state can never get
    // stuck, and the guard flag always releases for the next click.
    isSigningIn = false;
    if (btn) btn.disabled = false;
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

async function doSignOut(){
  await saveUserData();
  await fbSignOut(auth);
  document.getElementById('user-menu').classList.remove('open');
  mdPlan=[];itin=[];expenses=[];stamps=new Set();
  document.getElementById('plan-list').innerHTML='<div class="empty-state"><div class="empty-icon">🗺️</div><p class="empty-txt">Sign in to access your saved trips</p></div>';
}

function toggleUserMenu(){document.getElementById('user-menu').classList.toggle('open');}
document.addEventListener('click',e=>{const m=document.getElementById('user-menu');const av=document.getElementById('user-avatar');if(!m.contains(e.target)&&e.target!==av)m.classList.remove('open');});

// ── Firestore sync ────────────────────────────────────────────────────────────
async function saveUserData(){
  if(!currentUser)return;
  const uid=currentUser.uid;
  try{
    await setDoc(doc(db,'users',uid,'data','stamps'),{stamps:[...stamps],updatedAt:serverTimestamp()});
    await setDoc(doc(db,'users',uid,'data','expenses'),{expenses,updatedAt:serverTimestamp()});
  }catch(e){console.warn('[fb save]',e.message);}
}

async function loadUserData(){
  if(!currentUser)return;
  const uid=currentUser.uid;
  // Each read is independent and wrapped separately — previously all three
  // shared one try/catch, so a permission denial on the *first* read
  // (stamps) silently prevented expenses/plans from ever being attempted,
  // and the shared catch gave no way to tell which of the three actually
  // failed (seen live as an unspecific "[fb load] Missing or insufficient
  // permissions" warning with no indication of which document).
  try{
    const sd=await getDoc(doc(db,'users',uid,'data','stamps'));
    if(sd.exists())stamps=new Set(sd.data().stamps||[]);
  }catch(e){console.warn('[fb load] stamps:',e.message);}
  try{
    const ed=await getDoc(doc(db,'users',uid,'data','expenses'));
    if(ed.exists())expenses=ed.data().expenses||[];
  }catch(e){console.warn('[fb load] expenses:',e.message);}
  try{
    const ps=await getDocs(collection(db,'users',uid,'plans'));
    if(!ps.empty)window._fbPlans=ps.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){console.warn('[fb load] plans:',e.message);}
}

async function saveIt(){
  if(!mdPlan.length)return;
  const planId=Date.now().toString();
  const planData={
    name:`${currentCityName} ${new Date().toLocaleDateString()}`,
    ts:Date.now(),
    data:JSON.stringify(mdPlan),
    st:document.getElementById('s-time').value,
    et:document.getElementById('e-time').value,
    tm:getTripMinutes(),
    city:currentCityName
  };
  if(currentUser){
    try{
      await setDoc(doc(db,'users',currentUser.uid,'plans',planId),planData);
      if(!window._fbPlans)window._fbPlans=[];
      window._fbPlans.push({id:planId,...planData});
      addMsg('☁️ <strong>Plan saved to your account!</strong> Access it from any device.');
    }catch(e){_saveLocally(planData,planId);}
  }else{_saveLocally(planData,planId);}
}

function _saveLocally(d,id){
  try{let s=JSON.parse(localStorage.getItem('tt_plans')||'[]');s.push({id,...d});localStorage.setItem('tt_plans',JSON.stringify(s));addMsg('💾 Plan saved locally!');}
  catch(e){addMsg('⚠️ Save failed.');}
}

async function delPlan(id){
  if(currentUser){try{await deleteDoc(doc(db,'users',currentUser.uid,'plans',id));}catch(e){}if(window._fbPlans)window._fbPlans=window._fbPlans.filter(p=>p.id!==id);}
  let s=JSON.parse(localStorage.getItem('tt_plans')||'[]');localStorage.setItem('tt_plans',JSON.stringify(s.filter(p=>p.id!==id)));
  renderLoadPanel();
}



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
    const looksLikeColdStart = status===502||status===503||status===0;
    if(looksLikeColdStart && attempt<3){
      setTimeout(()=>fetchWeatherUI(lat,lon,attempt+1), 5000*(attempt+1));
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
  if(!prev) return; // first reading of the session — nothing to compare against
  const rainStarted = !/rain|storm|drizzle/i.test(prev.main||'') && /rain|storm|drizzle/i.test(snap.main||'');
  const heatSpike = (snap.temp - prev.temp) >= 5 && snap.temp >= 36;
  const windPickedUp = snap.wind >= 30 && prev.wind < 30;
  if(rainStarted || heatSpike || windPickedUp){
    const reason = rainStarted ? 'rain has started' : heatSpike ? 'temperature has spiked' : 'winds have picked up';
    reoptimizeRemainingPlan(reason);
  }
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
    const { day: replanned } = buildTimeAwareDay(upcoming, now, budget, startCoords, realTemp || 28, 0, 0);
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
      console.warn('[switchCity] skipped flyTo — invalid coordinates for city:', cityId, city.lat, city.lon);
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
async function loadCityPlaces(lat, lon, cityName, opts = {}) {
  const { silent = false, force = false } = opts;
  const tTime  = parseInt(document.getElementById('t-time')?.value)  || 600;
  const nDaysL = parseInt(document.getElementById('n-days')?.value)  || 1;
  const totalTripMinutesL = tTime * nDaysL;
  const cacheKey = `${String(cityName||'').toLowerCase()}|${totalTripMinutesL}`;

  if(!force && placeCache.has(cacheKey)){
    const cachedPlaces = (placeCache.get(cacheKey) || []).map(p => ({ ...p, coords: normalizeLatLon(p.coords) }));
    if(cachedPlaces.length){
      LOCS = cachedPlaces;
      return { places: LOCS, source: 'cache' };
    }
    placeCache.delete(cacheKey);
  }

  if(!force && placeLoadPromises.has(cacheKey)){
    const pending = await placeLoadPromises.get(cacheKey);
    LOCS = withHiddenGems(currentCityId, (pending.places || []).map(p => ({ ...p, coords: normalizeLatLon(p.coords), id: p.id || String(p.name||'').toLowerCase().replace(/[^a-z0-9]/g,'') })));
    return pending;
  }

  const localPlaces=getLocalPlaces(currentCityId, cityName);
  if(localPlaces.length && !LOCS.length){
    LOCS=localPlaces;
    updatePlannerShowcase();
  }
  if(!silent && !localPlaces.length) addMsg(`🤖 <strong>Finding the best places in ${cityName}...</strong> This usually takes a few seconds.`);
  try {
    const request = API.fetchPlaces(lat, lon, cityName, totalTripMinutesL, { refresh: force });
    placeLoadPromises.set(cacheKey, request);
    const result = await request;
    placeLoadPromises.delete(cacheKey);
    const fetchedPlaces=(result.places || []).map(p => ({ ...p, coords: normalizeLatLon(p.coords) }));
    LOCS = withHiddenGems(currentCityId, mergePlacePools(localPlaces,fetchedPlaces));
    if(LOCS.length){
      placeCache.set(cacheKey, LOCS.map(p => ({ ...p, coords: [...p.coords] })));
    } else {
      placeCache.delete(cacheKey);
    }
    if(LOCS.length >= 3){
      updatePlannerShowcase();
      if(!silent){
        addMsg(`✅ Refreshed <strong>${LOCS.length} places</strong> in ${cityName}. Generate when ready ✨`);
        switchToView('plan-view', 1);
      }
    } else {
      if(!silent) addMsg(`⚠️ AI couldn't find enough places for ${cityName} right now. Please try again in a moment.`);
    }
    return result;
  } catch(e) {
    placeLoadPromises.delete(cacheKey);
    console.error('loadCityPlaces error:', e);
    if(!silent){
      addMsg(`⚠️ We couldn't load places for ${cityName} right now. Please try again in a moment.`);
      showToast('⚠️','Couldn\'t refresh places',`Showing what we have for ${cityName} — will retry automatically.`,4500);
    }
    throw e;
  }
}

async function ensureCityPlaces(city, minCount=1){
  if(!city) return false;
  // Cache key must match loadCityPlaces exactly (uses totalTripMinutes = tTime × nDays)
  const tTime  = parseInt(document.getElementById('t-time')?.value)  || 600;
  const nDaysV = parseInt(document.getElementById('n-days')?.value)  || 1;
  const totalMins = tTime * nDaysV;
  const cacheKey = `${String(city.name||'').toLowerCase()}|${totalMins}`;
  // If a load is already in progress, await it instead of launching a new one
  if(placeLoadPromises.has(cacheKey)){
    try{
      const pending = await placeLoadPromises.get(cacheKey);
      LOCS = withHiddenGems(currentCityId, (pending?.places || []).map(p => ({ ...p, coords: normalizeLatLon(p.coords), id: p.id || String(p.name||'').toLowerCase().replace(/[^a-z0-9]/g,'') })));
    }catch(_e){}
  }
  if(LOCS.length>=minCount) return true;
  // First try — silent load (uses cache if available)
  try{ await loadCityPlaces(city.lat, city.lon, city.name, { silent:true }); }catch(_e){}
  if(LOCS.length>=minCount) return true;
  // Second try — force refresh (clears server cache and retries Gemini + Nominatim)
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
      console.warn('[searchCity] geocode result had invalid coordinates for query:', q, nd[0]);
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
    LOCS=withHiddenGems(currentCityId, (result.places||[]).map(p => ({ ...p, coords: normalizeLatLon(p.coords) })));
    typing2.remove();
    if(LOCS.length>=3){
      updatePlannerShowcase();
      addMsg(`✅ Found <strong>${LOCS.length} places</strong> in ${currentCityName}! Go to Plan tab → tap Generate ✨`);
      resetPlanUI();switchToView('plan-view',1);
    } else {
      addMsg(`⚠️ Could not find enough tourist spots in ${currentCityName}. Try again or search a nearby larger city.`);
    }
  }catch(e){
    console.error('searchCity error:',e);
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
  const minPlacePool = Math.min(45, Math.max(8, _nDays0 * 6));
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
          console.warn('generatePlan: ensureCityPlaces returned false for', city.name);
        }
      }catch(_e){ console.error('generatePlan load error:', _e); }
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
        const foodPlaces=(result.places||[]).map(p => ({ ...p, coords: normalizeLatLon(p.coords) }));
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
  for(let d=0;d<nDays;d++){
    const remainingDays = nDays - d;
    const adaptiveTarget = d === nDays - 1
      ? maxT
      : Math.max(180, Math.min(maxT, Math.ceil(estimateStopLoadMinutes(rem) / Math.max(1, remainingDays))));
    const dayStart = d===0 ? routeStart : (CITIES[currentCityId]?.lat&&CITIES[currentCityId]?.lon ? [CITIES[currentCityId].lat,CITIES[currentCityId].lon] : routeStart);
    const planned = buildTimeAwareDay(rem, startMin, adaptiveTarget, dayStart, realTemp || 28, breakEvery, breakDuration);
    if(planned.day.length) mdPlan.push(planned.day);
    rem = planned.remaining;
  }
  if(!mdPlan.length){
    mdPlan=[];rem=[...avail];
    for(let d=0;d<nDays;d++){let day=[],cur=startMin,used=0,unv=[];
      rem.forEach(loc=>{const tr=day.length?20:0,arr=cur+tr,dep=arr+loc.vt;if(used+loc.vt+tr<=maxT&&arr>=t2m(loc.ot)&&dep<=t2m(loc.ct)){day.push({...loc,tt:tr,slotLabel:dayPartForMinutes(arr),climateNote:stopClimateNote(loc,arr,realTemp||28)});used+=loc.vt+tr;cur=dep;}else unv.push(loc);});
      if(day.length)mdPlan.push(day);rem=unv;
    }
  }
  if(!mdPlan.length){addMsg('No locations fit your time limit. Try different preferences.');return;}
  document.getElementById('phase2-section').style.display='block';
  document.getElementById('aitools-section').style.display='block';
  renderAiToolsGrid();
  ['btn-save','btn-share','btn-replay','btn-ls','btn-wa'].forEach(id=>document.getElementById(id).style.display='inline-flex');
  renderTabs();switchDay(0,true);
  addMsg(`✅ Built a <strong>${mdPlan.length}-day</strong> climate-aware plan with <strong>${mdPlan.flat().length} stops</strong>!<br><small style="color:var(--text-muted)">${mdPlan.length===nDays?'The route has been spread across your requested trip length.':'The available stops and opening windows could only support fewer full day plans this time.'}</small>`);
  updatePlannerShowcase();
  switchToView('plan-view',1);
}

function renderTabs(){const c=document.getElementById('day-tabs');if(mdPlan.length<=1){c.style.display='none';return;}c.style.display='flex';c.innerHTML='';mdPlan.forEach((_,i)=>{const b=document.createElement('div');b.textContent=`Day ${i+1}`;b.className='day-tab'+(i===0?' active':'');b.onclick=()=>switchDay(i);c.appendChild(b);});}
function switchDay(idx,init=false){dayIdx=idx;itin=mdPlan[dayIdx]||[];document.querySelectorAll('.day-tab').forEach((b,i)=>b.classList.toggle('active',i===idx));document.getElementById('btn-start').textContent='🚀 Start Live Tracking';document.getElementById('btn-start').disabled=false;tripActive=false;tripStart=null;lastHeading=null;lastSpokenNavInstruction='';autoFollowLive=true;streetQuestActive=false;clearStreetQuestLayers();applyMapHeadingRotation();updateStreetQuestUI();updateFollowButton();document.getElementById('trip-st').textContent=`DAY ${idx+1}`;optimizeRoute(true);}

// ── Chat ──────────────────────────────────────────────────────────────────────
function chatAbout(name){switchToView('chat-view',2);setTimeout(()=>{document.getElementById('chat-in').value=`Tell me about ${name}`;handleChat();},200);}
// ── HTML-escaping helpers ────────────────────────────────────────────────────
// addMsg() renders its argument via innerHTML (see below) so it can support
// app-authored markup like "<strong>...</strong>" badges. That's fine when
// *we* wrote the string. It's an XSS hole when the string is the user's own
// typed chat text, a voice transcript, or raw AI (Gemini) output — all three
// used to be passed to addMsg() with little or no escaping, so e.g. an AI

function addMsg(html,isBot=true){const box=document.getElementById('chat-messages');const row=document.createElement('div');row.className='msg-row'+(isBot?'':' from-user')+' fade-in';const safe=sanitizeChatHtml(html);row.innerHTML=isBot?`<div class="msg-avatar av-ai">AI</div><div class="bubble">${safe}</div>`:`<div class="bubble user-b">${safe}</div><div class="msg-avatar av-me">ME</div>`;box.appendChild(row);box.scrollTop=box.scrollHeight;return row;}

// ── Delegated action handling for in-chat widget buttons ────────────────────
// Buttons rendered through addMsg() go through sanitizeChatHtml(), which
// strips onclick= (see comment above CHAT_ALLOWED_TAGS). So instead of
// onclick="fn(...)", these buttons carry data-action="fn" (+ data-n/data-cat
// as needed) and get picked up here via one delegated listener, attached
// once at module load — this works for buttons added to the DOM at any
// point later, no per-button wiring needed.
const CHAT_ACTIONS = {
  fbSetStar, fbSetCat, fbSubmit, fbSkip,
  rateStopClick, runReplannerClick,
};
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const fn = CHAT_ACTIONS[btn.dataset.action];
  if (fn) fn(btn);
});
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-role="fb-comment"]')) updateFbCounter(e.target);
});

// ── Delegated action handling for index.html's static onclick= buttons ──────
// Converts index.html's inline onclick="fn(args)" attributes to the same
// data-action delegation pattern used above for in-chat widget buttons —
// one listener, attached once, works for every button carrying data-action
// regardless of when it entered the DOM. Arguments that used to be literal
// values inside the onclick string now live in data-* attributes on the
// button itself (e.g. onclick="switchToView('map-view',0)" became
// data-action="switchToView" data-view="map-view" data-idx="0"), read here
// rather than parsed out of an arbitrary string — this stays a fixed lookup
// table of real function references, never eval()/new Function() on
// attribute content, so it doesn't need (and doesn't get) 'unsafe-eval'.
//
// A few onclick= values chained multiple calls together with `;`
// (e.g. "toggleLoadPanel();toggleUserMenu()") — those got small named
// wrapper functions below instead of trying to encode a call sequence in
// a data attribute.
function openLoadPanelFromMenu(){ toggleLoadPanel(); toggleUserMenu(); }
function openBudgetFromMenu(){ switchToView('tools-view',3); renderBudget(); toggleUserMenu(); }
function openPassportFromMenu(){ switchToView('tools-view',3); renderPassport(); toggleUserMenu(); }
// These two replace onclick="document.getElementById(...).____" inline DOM
// expressions — trivial, but still had to move out of an attribute like
// everything else here.
function closeNotifToast(){ const el=document.getElementById('notif-toast'); if(el) el.style.display='none'; }
function focusCitySelect(){ const el=document.getElementById('city-select'); if(el) el.focus(); }

const STATIC_ACTIONS = {
  addNearby, aiSuggestAlternative, applyCustomPlaces, closeAiDrawer, closeCustomizeModal,
  closeNotifToast, compassTap, doSignOut, focusCitySelect, generatePlan, goBack, handleChat,
  installPWA, locateMe, openAiDrawer, openBudgetFromMenu, openCustomizeModal,
  openLoadPanelFromMenu, openPassportFromMenu, optimizeRoute, resetGPS, saveIt, searchCity,
  shareIt, showAppFeedback, skipStop, smartExtend, startTrip, startVoiceInput,
  toggleLiveFollow, toggleLoadPanel, toggleNavCardCollapsed, toggleStreetQuest,
  toggleTimeSliderCollapsed, toggleUserMenu, toggleVoice, waShare,
  // These read extra args off the button's own dataset rather than taking
  // none — kept in the same table since dispatch below doesn't care.
  selectAllCustomPlaces: (btn) => selectAllCustomPlaces(btn.dataset.arg === 'true'),
  switchToView: (btn) => switchToView(btn.dataset.view, Number(btn.dataset.idx)),
  // event.currentTarget is what signInWithGoogle uses to find+disable the
  // clicked button — under delegation the real DOM event's currentTarget
  // would be `document` (whatever the listener is attached to), not the
  // button, so this passes a minimal shim carrying just the property the
  // function actually reads instead of the raw event.
  signInWithGoogle: (btn) => signInWithGoogle({ currentTarget: btn }),
};
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  // Buttons handled by CHAT_ACTIONS above (in-chat widgets) use the exact
  // same data-action attribute name — check that table first so a name
  // that exists in both isn't silently shadowed one way or the other; in
  // practice the two tables' key sets are disjoint (verified in
  // __tests__/frontend.staticActions.test.js), so this is a safety net,
  // not something that fires in normal operation.
  const fn = CHAT_ACTIONS[btn.dataset.action] || STATIC_ACTIONS[btn.dataset.action];
  if (fn) fn(btn);
});

// Keyboard activation (Enter/Space) for role="button" elements that carry
// data-action — e.g. the bottom-nav items, which are <div role="button">,
// not real <button> elements, so they don't get free Enter/Space handling
// from the browser. Reuses whatever data-action (and data-view/data-idx
// etc.) the element already has for click; nothing new to attach per
// element, same table, same dispatch.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('[role="button"][data-action]');
  if (!el) return;
  e.preventDefault();
  const fn = CHAT_ACTIONS[el.dataset.action] || STATIC_ACTIONS[el.dataset.action];
  if (fn) fn(el);
});

// The city <select> and the trip time <input type="range"> read the
// element's own current value (this.value under the old onchange=/oninput=
// attributes), so those two go through 'change'/'input' delegation rather
// than 'click'.
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action="switchCity"]');
  if (el && el.value) switchCity(el.value);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action="onTimeSliderChange"]');
  if (el) onTimeSliderChange(el.value);
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

// ══════════════════════════════════════════════════
// GeoAI TIME INTELLIGENCE ENGINE — chat integration
// "When should I visit this place for the best possible experience?"
// Grounded in the deterministic /api/time-intelligence/status engine
// (open/closed, best-hours, live crowd, sunrise/sunset, season, weather)
// rather than an LLM guess.
// ══════════════════════════════════════════════════
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

async function bestTimeToVisit(query){
  const place=ti_findPlace(query);
  const weather={tempC:realTemp, condition:realWeatherMain};
  if(place){
    try{
      const {places}=await API.timeIntelligenceStatus([ti_placePayload(place)], weather);
      return ti_renderState(place, places[0]);
    }catch(e){
      return `⏰ <strong>${place.name}</strong> is usually best early morning or just before sunset, avoiding the midday heat. (Live reading unavailable right now — try again in a moment.)`;
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
  }catch(e){ return ''; }
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
async function prepGuide(){if(!itin.length){addMsg('Generate a plan first!');return;}switchToView('chat-view',2);addMsg(`<span style="color:var(--jade)">🎒 Generating prep guide…</span>`);try{const t=await API.aiPrep(currentCityName,itin.slice(0,2).map(i=>i.name));addMsg(t?formatAiText(t).replace(/^- /gm,'• '):toolFallbackPrep());}catch{addMsg(toolFallbackPrep());}}
function postcard(){if(!itin.length){addMsg('Generate a plan first!');return;}switchToView('chat-view',2);addMsg(`📸 <strong>${currentCityName} Postcard!</strong><br><img src="https://images.unsplash.com/photo-1506461883276-594a12b11ac3?w=320&h=160&fit=crop" style="width:100%;border-radius:10px;margin-top:6px">`);}
async function handleAiLens(event){const file=event.target.files[0];if(!file)return;const r=new FileReader();r.onload=async ev=>{switchToView('chat-view',2);const src=ev.target.result;addMsg(`📸 <strong>Photo received!</strong><br><img src="${src}" style="width:100%;max-height:160px;object-fit:contain;border-radius:8px;margin-top:6px">`);const[,meta,b64]=src.match(/^data:([^;]+);base64,(.+)$/);try{const t=await API.aiLens(b64,meta,currentCityName);if(t)addMsg(formatAiText(t));}catch{addMsg('🔍 Could not identify. Try a clearer photo.');}};r.readAsDataURL(file);}
async function getInstaSpots(){if(!itin.length){addMsg('Generate a plan first!');switchToView('chat-view',2);return;}switchToView('chat-view',2);addMsg(`<span style="color:var(--ocean)">📸 Scouting best photo spots…</span>`);try{const t=await API.aiInstaSpots(currentCityName,itin.slice(0,2).map(i=>i.name));addMsg(t?formatAiText(t):'📸 Sunrise is always the best light!');}catch{addMsg('📸 Sunrise is always the best light!');}}
async function getSouvenirGuide(){switchToView('chat-view',2);addMsg(`<span style="color:var(--sand)">🛍️ Finding best souvenirs in ${currentCityName}…</span>`);try{const t=await API.aiSouvenirGuide(currentCityName);addMsg(t?formatAiText(t):'🛍️ Local handicrafts are always a great choice!');}catch{addMsg('🛍️ Local handicrafts are always a great choice!');}}
async function aiSuggestAlternative(){if(!itin.length){addMsg('Generate a plan first!');return;}addMsg(`<span style="color:var(--purple)">✨ Finding alternative to ${itin[0].name}…</span>`);try{const t=await API.aiAlternative(currentCityName,itin[0].name);addMsg(t?formatAiText(t):'Try asking locals for a hidden gem!');}catch{addMsg('Try asking locals for a hidden gem!');}}

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
  }catch(e){addMsg('⚠️ Could not fetch weather alerts.');}
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
function showToast(icon,title,msg,duration=5000){document.getElementById('notif-icon').textContent=icon;document.getElementById('notif-title').textContent=title;document.getElementById('notif-msg').innerHTML=sanitizeChatHtml(msg);const t=document.getElementById('notif-toast');t.style.display='block';requestAnimationFrame(()=>t.classList.add('show'));clearTimeout(window._toastHideTid);window._toastHideTid=setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.style.display='none',280);},duration);}
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


// ── View switching ────────────────────────────────────────────────────────────
const viewIds=['map-view','plan-view','chat-view','tools-view'];
function switchToView(viewId,idx){
  viewIds.forEach(v=>{const el=document.getElementById(v);el.classList.remove('active');el.style.display='none';});
  const target=document.getElementById(viewId);target.classList.add('active');target.style.display=viewId==='tools-view'?'block':'flex';
  document.querySelectorAll('.nav-item').forEach((n,i)=>n.classList.toggle('active',i===idx||i===3&&idx>=3));
  if(viewId==='map-view'&&map){map.invalidateSize();setTimeout(()=>map.invalidateSize(),50);setTimeout(()=>map.invalidateSize(),300);}
  // Track history & render tools if needed (safe to call even before _trackNavHistory is defined)
  if(typeof _trackNavHistory==='function') _trackNavHistory(viewId);
  else if(idx===3||viewId==='tools-view') renderToolsHome();
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
      </div>
    `;
    const mkr = L.marker(l.coords,{icon:ic}).addTo(map).bindPopup(popupHtml);
    allPlacesMkrs.push(mkr);
  });
}

// Public OSRM demo mirrors used for turn-by-turn road routing during live
// navigation. Neither requires an API key, which is fine at low volume but
// means both are shared, rate-limited infrastructure — under real user load
// (or a flaky connection) a request can fail or time out. Try the primary
// twice (quick retry), then fall back to a second mirror, before giving up
// and leaving the straight-line polyline in place for this render pass.
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
        if(tripActive) map.fitBounds(rLine.getBounds(),{paddingTopLeft:[40,40],paddingBottomRight:[40,230]});
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
        console.warn(`Road routing failed (mirror ${mirrorIdx}, attempt ${attempt+1}):`,e);
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
  visibleStops.forEach((l,visibleIndex)=>{
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
      </div>
    `;
    mkrs.push(L.marker(l.coords,{icon:ic}).addTo(map).bindPopup(popupHtml));
  });
  if(raw.length>=2){
    rLine=L.polyline(raw,{color:accent,weight:tripActive?6:4,opacity:tripActive?0.95:0.85,lineCap:'round',lineJoin:'round'}).addTo(map);
    if(!tripActive) map.fitBounds(rLine.getBounds(),{padding:[60,100]});
  }
  document.getElementById('nav-next').textContent=routeStops[0].name;const defaultNavText=`Head towards ${routeStops[0].name} (~${nsDist})`;document.getElementById('nav-turn').textContent=defaultNavText;document.getElementById('nav-turn-icon').textContent=turnArrowForInstruction(defaultNavText);document.getElementById('nav-dist').textContent=nsDist;document.getElementById('nav-eta').textContent=nsEta;
  const roadRouteApplied = await fetchRoadRoute(raw, {accent, tripActive, routeStops});
  if(!roadRouteApplied && tripActive){
    // The public OSRM demo mirror(s) are rate-limited/shared and this
    // call runs on every GPS-driven renderRoute() during live tracking
    // (every ~15s or 25m of movement — see initGPS()'s watchPosition
    // callback). A single failed/timed-out request used to leave the
    // straight-line fallback on screen until that next natural trigger,
    // which on a flaky connection or a busy shared mirror could be a
    // while — this is the "route goes straight, then fixes itself
    // later" behavior. Schedule one quick extra retry instead of
    // waiting out the full interval.
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
function recalcTimes(opts={}){
  const trimToWindow=!!opts.trimToWindow;
  const windowEnd=getScheduleEnd();
  let t=getCurTime();
  const kept=[];
  let dropped=0;
  for(const loc of itin){
    const travel=Math.max(0,parseInt(loc.tt,10)||0);
    const visit=Math.max(0,parseInt(loc.vt,10)||0);
    const arrive=new Date(t.getTime()+travel*60000);
    const depart=new Date(arrive.getTime()+visit*60000);
    if(trimToWindow && depart>windowEnd){
      dropped=itin.length-kept.length;
      break;
    }
    loc.sts=fmt12(arrive);loc.std=new Date(arrive);loc.ets=fmt12(depart);loc.etd=new Date(depart);
    kept.push(loc);
    t=depart;
  }
  if(trimToWindow&&dropped>0){
    itin=kept;
  }
  return dropped;
}
function getCurTime(){let t=getScheduleStart();if(tripActive&&tripStart)t=new Date(t.getTime()+(Date.now()-tripStart));return t;}

function startTrip(){if(!cLat){addMsg('📍 Waiting for GPS...');return;}if(tripActive||!itin.length)return;tripActive=true;tripStart=Date.now();lastSpokenNavInstruction='';autoFollowLive=true;navVoiceEnabled=true;updateFollowButton();const btn=document.getElementById('btn-start');btn.textContent='✅ Navigating Live';btn.disabled=true;document.getElementById('trip-st').textContent='LIVE';document.getElementById('phase1-section').style.display='none';addMsg('🟢 <strong>Navigation started!</strong> The map will now follow you live towards '+itin[0].name);updatePlannerShowcase();switchToView('map-view',0);followLivePosition(true);optimizeRoute(true);if(cLat&&cLon){lastRouteRenderPos=[cLat,cLon];lastRouteRenderAt=Date.now();}setTimeout(()=>maybeSpeakNavInstruction(`Navigation started. Head towards ${itin[0]?.name || 'your destination'}.`,true),400);}
function skipStop(){const routeStops=getRouteStopsForDay(itin);if(!routeStops.length)return;const sk=routeStops[0];itin=applyBreakPlanToCurrentItinerary(routeStops.slice(1));sync();addMsg(`⏭️ Skipped <strong>${sk.name}</strong>`);renderRoute();}
function optimizeRoute(silent=false){
  if(!itin.length){renderRoute();return;}
  itin=applyBreakPlanToCurrentItinerary(optimizeStopOrder(getRouteStopsForDay(itin),getPreviewRouteStart()));
  sync();
  if(!silent)addMsg('⚡ Route optimized for an easier tourist flow.');
  renderRoute();
}
function smartExtend(){setTripMinutes(getTripMinutes()+60);syncPlannerTimeFields('duration');const ids=new Set(mdPlan.flat().filter(stop=>!stop?.isBreak).map(stop=>stop.id));const c=LOCS.filter(l=>!ids.has(l.id));if(c.length){const base=getRouteStopsForDay(itin);base.push({...c[0],tt:0});itin=applyBreakPlanToCurrentItinerary(base);sync();addMsg(`✨ Added <strong>${c[0].name}</strong>!`);renderRoute();}else addMsg('No more places available.');}
function addNearby(){const ids=new Set(mdPlan.flat().filter(stop=>!stop?.isBreak).map(stop=>stop.id));let c=LOCS.filter(l=>!ids.has(l.id));if(cLat)c.sort((a,b)=>hvKm(cLat,cLon,a.coords[0],a.coords[1])-hvKm(cLat,cLon,b.coords[0],b.coords[1]));if(c.length){const p={...c[0],tt:0};const base=getRouteStopsForDay(itin);base.splice(tripActive&&base.length>0?1:0,0,p);itin=applyBreakPlanToCurrentItinerary(base);sync();addMsg(`📍 Added detour: <strong>${p.name}</strong>`);renderRoute();}else addMsg('No more places!');}

// ── Save / Share ──────────────────────────────────────────────────────────────
function loadPlan(sd){try{const d=JSON.parse(decodeURIComponent(sd));let l=JSON.parse(d.data);mdPlan=(l.length&&Array.isArray(l[0]))?l:[l];mdPlan=mdPlan.map(day=>Array.isArray(day)?day.map(s=>({...s,coords:normalizeLatLon(s.coords)})):day);document.getElementById('s-time').value=d.st||'09:00';if(d.tm)setTripMinutes(d.tm);if(d.et)document.getElementById('e-time').value=d.et;syncPlannerTimeFields(d.et?'end':'duration');document.getElementById('phase2-section').style.display='block';document.getElementById('aitools-section').style.display='block';renderAiToolsGrid();['btn-save','btn-share','btn-replay','btn-ls','btn-wa'].forEach(id=>document.getElementById(id).style.display='inline-flex');renderTabs();switchDay(0);updatePlannerShowcase();switchToView('map-view',0);addMsg('📂 Loaded! Tap Start to navigate.');}catch(e){addMsg('⚠️ Load failed.');}}
function shareIt(){if(!mdPlan.length)return;let t=`🇮🇳 My ${currentCityName} Trip:\n\n`;mdPlan.forEach((d,i)=>{t+=`Day ${i+1}:\n`;d.forEach((l,j)=>t+=`${j+1}. ${l.name} (${l.sts||'--'}–${l.ets||'--'})\n`);});t+='\nIndia In-Time 🚀';if(navigator.share)navigator.share({title:`${currentCityName} Trip`,text:t}).catch(()=>{});else navigator.clipboard?.writeText(t).then(()=>addMsg('📋 Copied!'));}
function waShare(){if(!mdPlan.length){addMsg('Generate a plan first!');return;}let t=`🇮🇳 *My ${currentCityName} Trip*\n\n`;const icons={beach:'🏖️',temple:'🛕',food:'🍛',scenic:'⛰️'};mdPlan.forEach((d,i)=>{if(mdPlan.length>1)t+=`*Day ${i+1}*\n`;d.forEach(l=>t+=`${icons[l.cat]||'📍'} *${l.name}* — ${l.sts||'--'}–${l.ets||'--'}\n`);t+='\n';});window.open(`https://wa.me/?text=${encodeURIComponent(t)}`,'_blank');}
function shareEmergency(){if(!cLat||!cLon){alert('GPS not available.');return;}const t=`🚨 EMERGENCY: https://maps.google.com/?q=${cLat},${cLon}`;if(navigator.share)navigator.share({title:'Emergency',text:t}).catch(()=>navigator.clipboard?.writeText(t));else navigator.clipboard?.writeText(t);}

// ── GPS ───────────────────────────────────────────────────────────────────────
// ── Compass button ───────────────────────────────────────────────────────────
// Shows the live heading (same lastHeading value the marker icon rotates
// with, computed continuously by initGPS()'s watchPosition — see
// deriveHeading()). This intentionally does not rotate the map itself:
// applyMapHeadingRotation() above documents why that breaks Leaflet's tile
// positioning, so this stays a read-only indicator + info action instead.
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
// button Google Maps has bottom-right. Reuses waitForFirstGpsFix() (the
// same shared fix that already drives the live marker/city-detect, see the
// comment above it) instead of firing an independent getCurrentPosition()
// call, so this can never disagree with what the live marker is showing.
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
    console.warn('[locateMe] GPS fix unavailable:', e);
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
    const isF=cLat===null;cLat=pos.coords.latitude;cLon=pos.coords.longitude;
    if(isF) notifyGpsFix(cLat,cLon); // wakes up detectAndLoadCity() if it's waiting on the first fix
    lastHeading=deriveHeading(pos);
    lastHeadingSample=[cLat,cLon];
    if(liveMkr)liveMkr.setLatLng([cLat,cLon]);
    else liveMkr=L.marker([cLat,cLon],{icon:L.divIcon({className:'iit-marker',html:'<div style="width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:20px solid #2563eb;filter:drop-shadow(0 0 8px rgba(37,99,235,.8));transform-origin:50% 70%"></div>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);
    updateLiveMarkerHeading();
    document.getElementById('gps-txt').textContent=cLat.toFixed(3);
    if(tripActive) followLivePosition(isF);
    if(streetQuestActive) updateStreetQuestProgress();
    applyMapHeadingRotation();
    if(isF&&itin.length){optimizeRoute(true);lastRouteRenderPos=[cLat,cLon];lastRouteRenderAt=Date.now();}
    else if(tripActive){
      chkArrival();
      // The route polyline used to only be drawn from the very first GPS fix
      // of the trip, so as the user actually moved, the live marker kept
      // updating (above) but the line stayed put — producing a route that
      // visibly no longer started at the live location. Redraw it as the
      // user moves (or periodically), so it keeps anchoring to cLat/cLon.
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
      if(currentUser){try{await setDoc(doc(db,'users',currentUser.uid,'data','stamps'),{stamps:[...stamps],updatedAt:serverTimestamp()});}catch(e){}}}
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
    dPr.userChoice.then((choiceResult) => {
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
// NEW FEATURE 1 — VOICE ASSISTANT
// ═══════════════════════════════════════
let isListening = false;
let recognition = null;

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { addMsg('⚠️ Voice input not supported in this browser. Try Chrome!'); return; }

  if (isListening) { recognition?.stop(); return; }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;

  const btn = document.getElementById('btn-voice-input');

  recognition.onstart = () => {
    isListening = true;
    btn.textContent = '🔴 Listening...';
    btn.style.color = '#fca5a5';
    btn.style.borderColor = 'rgba(239,68,68,.4)';
    showToast('🎤', 'Listening...', 'Speak your question now!', 3000);
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    switchToView('chat-view', 2);
    addMsg(escapeHtml(transcript), false);
    const typing = addTypingIndicator();

    try {
      // Use voice-optimised endpoint for shorter spoken responses
      const text = await API.aiVoiceChat(transcript, currentCityName, itin.map(i => i.name), '');
      typing.remove();
      const cleaned = text ? escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*/g, '').replace(/\n/g, ' ') : null;
      if (cleaned) {
        addMsg(cleaned);
        // Auto speak the response if voice output is on
        if (voiceOn) speak(cleaned);
      }
    } catch { typing.remove(); addMsg('Sorry, I could not process that. Please try again!'); }
  };

  recognition.onerror = (e) => { addMsg(`🎤 Voice error: ${e.error}. Try again!`); };

  recognition.onend = () => {
    isListening = false;
    btn.textContent = '🎤 Speak';
    btn.style.color = 'var(--purple)';
    btn.style.borderColor = 'rgba(167,139,250,.25)';
  };

  recognition.start();
}

// ═══════════════════════════════════════
// NEW FEATURE 2 — AI PHOTO CAPTIONS
// ═══════════════════════════════════════
async function handleCaption(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    switchToView('chat-view', 2);
    const src = ev.target.result;
    addMsg(`📸 <strong>Generating captions for your photo...</strong><br><img src="${src}" style="width:100%;max-height:200px;object-fit:contain;border-radius:10px;margin-top:6px">`);
    const [, meta, b64] = src.match(/^data:([^;]+);base64,(.+)$/);
    const stopName = itin[0]?.name || currentCityName;
    const typing = addTypingIndicator();
    try {
      const text = await API.aiCaption(b64, meta, currentCityName, stopName);
      typing.remove();
      if (text) {
        addMsg(`✨ <strong>Instagram Captions for ${stopName}</strong><br><br>${formatAiText(text)}`);
      }
    } catch { typing.remove(); addMsg('⚠️ Could not generate captions. Try again!'); }
  };
  reader.readAsDataURL(file);
}

// ═══════════════════════════════════════
// NEW FEATURE 3 — TRANSLATE SIGN / MENU
// ═══════════════════════════════════════
async function handleTranslate(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    switchToView('chat-view', 2);
    const src = ev.target.result;
    addMsg(`🌐 <strong>Translating...</strong><br><img src="${src}" style="width:100%;max-height:180px;object-fit:contain;border-radius:10px;margin-top:6px">`);
    const [, meta, b64] = src.match(/^data:([^;]+);base64,(.+)$/);
    const typing = addTypingIndicator();
    try {
      const text = await API.aiTranslate(b64, meta, currentCityName);
      typing.remove();
      if (text) addMsg(formatAiText(text));
    } catch { typing.remove(); addMsg('⚠️ Could not translate. Try a clearer photo with visible text!'); }
  };
  reader.readAsDataURL(file);
}

// ═══════════════════════════════════════
// NEW FEATURE 4 — AI TRIP RATING
// ═══════════════════════════════════════
// ═══════════════════════════════════════
// FEEDBACK SYSTEM — per-place ratings + overall app experience
// The actual data flywheel: real user opinions, not just AI guesses,
// feeding back into what the app recommends.
// ═══════════════════════════════════════

function promptStopFeedback(place){
  if(!place?.id || !place?.name) return;
  addMsg(`⭐ How was <strong>${escapeHtml(place.name)}</strong>?<br><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap" data-role="place-fb" data-place-id="${escapeHtml(String(place.id))}" data-place-name="${escapeHtml(place.name)}">` +
    [1,2,3,4,5].map(n=>`<button type="button" data-action="rateStopClick" data-n="${n}" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:7px 11px;font-size:14px;cursor:pointer">${'⭐'.repeat(n)}</button>`).join('') +
    `</div>`);
}

function rateStopClick(btn){
  const row = btn.closest('[data-role="place-fb"]');
  if(!row) return;
  const placeId = row.dataset.placeId;
  const placeName = row.dataset.placeName;
  const rating = parseInt(btn.dataset.n, 10);
  rateStop(placeId, placeName, rating, row);
}

async function rateStop(placeId, placeName, rating, row){
  row = row || document.querySelector(`[data-role="place-fb"][data-place-id="${CSS.escape(String(placeId))}"]`);
  if(row) row.outerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Thanks for rating ${escapeHtml(placeName)} — ${'⭐'.repeat(rating)}</div>`;
  try{
    await API.submitPlaceFeedback(placeName, currentCityName, rating);
    showToast('⭐','Thanks for rating it!','Real feedback like this shapes future recommendations.',3000);
  }catch(e){ console.error('rateStop error', e); }
}

const APP_FEEDBACK_CATS = [['love_it','Loving it 😍'],['bug','Found a bug 🐛'],['feature_request','Missing something 💡'],['confusing','Confusing 🤔'],['general','Just general 💭']];

function showAppFeedback(){
  switchToView('chat-view', 2);
  addMsg(`💬 <strong>How's India In-Time working for you?</strong><br>Your honest take — good or bad — genuinely shapes what we build next.` +
    `<div class="fb-card" data-role="fb-card" data-rating="0" data-cat="" style="margin-top:10px">` +
      `<div data-role="fb-stars" style="display:flex;gap:6px;flex-wrap:wrap">` +
        [1,2,3,4,5].map(n=>`<button type="button" data-action="fbSetStar" data-n="${n}" aria-label="Rate ${n} star${n>1?'s':''}" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:8px 12px;font-size:16px;cursor:pointer;line-height:1">☆</button>`).join('') +
      `</div>` +
      `<div data-role="fb-tags" style="display:none;gap:6px;flex-wrap:wrap;margin-top:10px">` +
        APP_FEEDBACK_CATS.map(([v,l])=>`<button type="button" data-action="fbSetCat" data-cat="${v}" style="background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer">${l}</button>`).join('') +
      `</div>` +
      `<div data-role="fb-comment-wrap" style="display:none;margin-top:10px">` +
        `<textarea data-role="fb-comment" maxlength="2000" rows="2" placeholder="Anything specific? Totally optional." style="width:100%;box-sizing:border-box;background:var(--bg-glass);border:1px solid var(--border-default);border-radius:8px;padding:8px;font:inherit;color:inherit;resize:vertical"></textarea>` +
        `<div data-role="fb-counter" style="font-size:10px;color:var(--text-muted);text-align:right;margin-top:2px">0/2000</div>` +
      `</div>` +
      `<div data-role="fb-actions" style="display:none;gap:8px;margin-top:8px">` +
        `<button type="button" data-action="fbSubmit" style="background:var(--ocean-glow);border:1px solid var(--border-mid);border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;color:var(--ocean);cursor:pointer">Send feedback</button>` +
        `<button type="button" data-action="fbSkip" style="background:transparent;border:1px solid var(--border-default);border-radius:8px;padding:7px 14px;font-size:12px;color:var(--text-muted);cursor:pointer">Not now</button>` +
      `</div>` +
    `</div>`);
}

function fbSetStar(btn){
  const card = btn.closest('[data-role="fb-card"]');
  if(!card) return;
  const n = parseInt(btn.dataset.n, 10);
  card.dataset.rating = String(n);
  card.querySelectorAll('[data-action="fbSetStar"]').forEach(s=>{
    const sn = parseInt(s.dataset.n, 10);
    s.textContent = sn <= n ? '★' : '☆';
  });
  const tags = card.querySelector('[data-role="fb-tags"]');
  const commentWrap = card.querySelector('[data-role="fb-comment-wrap"]');
  const actions = card.querySelector('[data-role="fb-actions"]');
  if(tags) tags.style.display = 'flex';
  if(commentWrap) commentWrap.style.display = 'block';
  if(actions) actions.style.display = 'flex';
}

function fbSetCat(btn){
  const card = btn.closest('[data-role="fb-card"]');
  if(!card) return;
  const cat = btn.dataset.cat;
  const already = card.dataset.cat === cat;
  card.dataset.cat = already ? '' : cat;
  card.querySelectorAll('[data-action="fbSetCat"]').forEach(t=>{
    const on = !already && t.dataset.cat === cat;
    t.style.background = on ? 'var(--ocean-glow)' : 'var(--bg-glass)';
    t.style.borderColor = on ? 'var(--ocean)' : 'var(--border-default)';
  });
}

function updateFbCounter(el){
  const card = el.closest('[data-role="fb-card"]');
  if(!card) return;
  const counter = card.querySelector('[data-role="fb-counter"]');
  if(counter) counter.textContent = `${el.value.length}/2000`;
}

function fbSkip(btn){
  const card = btn.closest('[data-role="fb-card"]');
  if(!card) return;
  card.outerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-top:8px">No worries — you can always tap "App Feedback" again later 👋</div>`;
}

async function fbSubmit(btn){
  const card = btn.closest('[data-role="fb-card"]');
  if(!card) return;
  const rating = parseInt(card.dataset.rating, 10) || 0;
  if(!rating) return;
  const cat = card.dataset.cat || 'general';
  const commentEl = card.querySelector('[data-role="fb-comment"]');
  const message = commentEl ? commentEl.value.trim() : '';
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try{
    const activeViewId = viewIds && viewIds.find(v => document.getElementById(v)?.classList.contains('active'));
    await API.submitAppFeedback(rating, cat, message || null, activeViewId || currentCityId || null);
    card.outerHTML = `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">🙏 <strong>Thank you</strong> — feedback like this is exactly what helps us build the right things next.</div>`;
    showToast('💬','Feedback sent','Thanks for helping us improve India In-Time!',3500);
  }catch(e){
    btn.disabled = false;
    btn.textContent = 'Send feedback';
    addMsg('⚠️ Could not send feedback right now — please try again in a moment.');
  }
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
  const expTotal = expenses.reduce((s, e) => s + e.c, 0);

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
    const text = await API.aiReplanner(currentCityName, completed.map(s => s.name), remaining, minutesLate, now);
    typing.remove();
    if (text) addMsg(`🧭 <strong>Updated Plan</strong><br><br>${formatAiText(text)}`);
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
  return `<div class="drawer-item" style="${border}" onclick="closeAiDrawer();${action}">
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
  return `<div class="drawer-item" style="${border}" onclick="closeAiDrawer();setTimeout(()=>document.getElementById('${inputId}').click(),350)">
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
    drawerBtn('🎒','Prep Guide','What to pack for this trip','prepGuide()'),
    drawerBtn('📸','Postcard','Generate a trip postcard','postcard()'),
    drawerBtn('📷','Insta-Spots','Best photo angles at each stop','getInstaSpots()'),
    drawerBtn('🛍️','Souvenir Guide','What to buy locally','getSouvenirGuide()'),
    drawerBtn('⭐','Rate My Trip','AI trip report & score','showTripRating()'),
    drawerBtn('💬','App Feedback','Tell us what to improve','showAppFeedback()'),
    drawerBtn('🧭','Smart Replanner','Running late? Reschedule now','showReplanner()'),
    drawerBtn('🌦️','Weather Alerts','Per-stop weather forecast','showWeatherAlerts()'),
    drawerBtn('📄','Download PDF','Full trip summary PDF','generateTripPDF()'),
    drawerBtn('🔔','Closing Alerts','Get notified before stops close','setupNotifications()'),
    drawerBtn('🎤','Voice AI','Talk to assistant hands-free','startVoiceInput()'),

    // ── EXCLUSIVE ──
    '<div class="drawer-sec">🚀 Exclusive — Not on Google Maps</div>',
    drawerBtn('⏰','Time Intelligence Engine','When should I visit — for the best experience?','showCrowdPredictor()','rgba(0,180,255,.5)'),
    drawerBtn('🎪','Festival Radar','Events & festivals happening TODAY','showFestivalRadar()','rgba(255,165,0,.4)'),
    drawerBtn('💎','Hidden Gems','Verified spots Google Maps buries','showHiddenGems()','rgba(168,85,247,.4)'),
    drawerBtn('⚡','Strike Alert','Power cuts & bandh warnings','showHartaalAlert()','rgba(255,80,80,.4)'),
    drawerBtn('💸','Fare Negotiator','Exact auto price + Hindi script','showFareNegotiator()','rgba(50,200,150,.4)'),
    drawerBtn('👥','Trip Tribe','Find travel buddies nearby','showTripTribe()','rgba(200,100,255,.4)'),

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
    '<div class="ai-card ai-accent-gold" onclick="prepGuide()"><div class="ai-card-icon">🎒</div><div class="ai-card-label">Prep Guide</div></div>',
    '<div class="ai-card ai-accent-teal" onclick="postcard()"><div class="ai-card-icon">📸</div><div class="ai-card-label">Postcard</div></div>',
    '<label class="ai-card ai-accent-ocean"><div class="ai-card-icon">🔍</div><div class="ai-card-label">AI Lens</div><input type="file" id="lens-in" accept="image/*" style="display:none" onchange="handleAiLens(event)"></label>',
    // Row 2
    '<div class="ai-card ai-accent-purple" onclick="getInstaSpots()"><div class="ai-card-icon">📷</div><div class="ai-card-label">Insta Spots</div></div>',
    '<div class="ai-card ai-accent-jade" onclick="showTripRating()"><div class="ai-card-icon">⭐</div><div class="ai-card-label">Rate Trip</div></div>',
    '<div class="ai-card ai-accent-rose" onclick="showReplanner()"><div class="ai-card-icon">🧭</div><div class="ai-card-label">Replanner</div></div>',
    // Wide — existing
    '<div class="ai-card ai-card-wide ai-accent-gold" onclick="getSouvenirGuide()"><div class="ai-card-icon">🛍️</div><div class="ai-card-label">Souvenir Guide — What to buy locally</div></div>',
    '<div class="ai-card ai-card-wide ai-accent-teal" onclick="showWeatherAlerts()"><div class="ai-card-icon">🌦️</div><div class="ai-card-label">Weather Alerts — Per stop forecast</div></div>',
    '<div class="ai-card ai-card-wide ai-accent-ocean" onclick="generateTripPDF()"><div class="ai-card-icon">📄</div><div class="ai-card-label">Download Trip PDF — Full summary</div></div>',
    '<div class="ai-card ai-card-wide ai-accent-purple" onclick="setupNotifications()"><div class="ai-card-icon">🔔</div><div class="ai-card-label">Closing Time Alerts — Get reminders</div></div>',
    '<label class="ai-card ai-card-wide ai-accent-jade"><div class="ai-card-icon">📸</div><div class="ai-card-label">AI Photo Captions — Instagram ready</div><input type="file" id="caption-in" accept="image/*" style="display:none" onchange="handleCaption(event)"></label>',
    '<label class="ai-card ai-card-wide ai-accent-rose"><div class="ai-card-icon">🌐</div><div class="ai-card-label">Translate Sign / Menu — Any language</div><input type="file" id="translate-in" accept="image/*" style="display:none" onchange="handleTranslate(event)"></label>',
    // ── 8 NEW EXCLUSIVE FEATURES ──
    '<div class="ai-card ai-card-wide" style="border-color:rgba(255,165,0,.3);background:rgba(255,165,0,.05)" onclick="showFestivalRadar()"><div class="ai-card-icon">🎪</div><div class="ai-card-label" style="color:var(--text-primary)">Festival & Event Radar — What\'s happening TODAY</div></div>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(100,220,100,.3);background:rgba(100,220,100,.05)" onclick="showHiddenGems()"><div class="ai-card-icon">💎</div><div class="ai-card-label" style="color:var(--text-primary)">Hidden Gem Detector — Secret local spots</div></div>',
    '<label class="ai-card ai-card-wide" style="border-color:rgba(150,100,255,.3);background:rgba(150,100,255,.05)"><div class="ai-card-icon">🔮</div><div class="ai-card-label" style="color:var(--text-primary)">AR Overlay — Point at any building</div><input type="file" id="ar-in" accept="image/*" style="display:none" onchange="handleArOverlay(event)"></label>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(255,80,80,.3);background:rgba(255,80,80,.05)" onclick="showHartaalAlert()"><div class="ai-card-icon">⚡</div><div class="ai-card-label" style="color:var(--text-primary)">Power & Strike Alert — Safe to travel today?</div></div>',
    '<label class="ai-card ai-card-wide" style="border-color:rgba(255,200,50,.3);background:rgba(255,200,50,.05)"><div class="ai-card-icon">🍡</div><div class="ai-card-label" style="color:var(--text-primary)">Street Food Safety Scanner — Is it safe to eat?</div><input type="file" id="food-safety-in" accept="image/*" style="display:none" onchange="handleFoodSafety(event)"></label>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(0,180,255,.3);background:rgba(0,180,255,.05)" onclick="showCrowdPredictor()"><div class="ai-card-icon">🧠</div><div class="ai-card-label" style="color:var(--text-primary)">Crowd Predictor — Best time to visit</div></div>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(50,200,150,.3);background:rgba(50,200,150,.05)" onclick="showFareNegotiator()"><div class="ai-card-icon">💸</div><div class="ai-card-label" style="color:var(--text-primary)">Auto Fare Negotiator — Exact price + script</div></div>',
    '<div class="ai-card ai-card-wide" style="border-color:rgba(200,100,255,.3);background:rgba(200,100,255,.05)" onclick="showTripTribe()"><div class="ai-card-icon">👥</div><div class="ai-card-label" style="color:var(--text-primary)">Trip Tribe — Find travel buddies</div></div>',
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
let navHistory = [];
let currentToolsPage = 'home';

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

function _trackNavHistory(viewId) {
  const currentActive = document.querySelector('.view.active')?.id;
  if (currentActive && currentActive !== viewId) {
    navHistory.push({ viewId: currentActive, idx: ['map-view','plan-view','chat-view','tools-view'].indexOf(currentActive) });
    if (navHistory.length > 10) navHistory.shift();
  }
  if(viewId==='tools-view') { renderToolsHome(); currentToolsPage='home'; updateToolsTitle('Tools'); }
  updateBackButton(viewId);
}

window.addEventListener('popstate', (e) => { e.preventDefault(); goBack(); });
window.history.pushState({ page: 'home' }, '', window.location.href);

// ── Init ──────────────────────────────────────────────────────────────────────// ── Customize Places Feature ──────────────────────────────────────────────────
window.customSelectedPlaces = null;

async function openCustomizeModal() {
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
      console.error('Failed to load places for customize modal:', e);
    }
    loadTyping.remove();
  }

  if (!LOCS.length) {
    addMsg('⚠️ Could not load places to customize. Please try again.');
    return;
  }

  const listEl = document.getElementById('customize-places-list');
  listEl.innerHTML = '';

  let availableToSelect = LOCS; // ALL PLACES, completely bypassing the 'prefs' experience filters

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

  document.getElementById('customize-modal').style.display = 'flex';
}

function closeCustomizeModal() {
  document.getElementById('customize-modal').style.display = 'none';
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
  const deps = Object.assign({ state }, window);
  // Initialize XSS-free event delegation
  initEventDelegation();
  registerToolsHomeActions(deps);
  registerLingoActions(deps);
  registerSafetyActions(deps);
  registerBudgetViewActions(deps);
  registerPassportActions(deps);
  registerLoadPanelActions(deps);
  registerItineraryActions(deps);
  // Re-export the new views to the window so old code can call them if needed
  Object.assign(window, {
    renderToolsHome: () => renderToolsHome(deps),
    renderLingo: () => renderLingo(deps),
    renderSafety: () => renderSafety(deps),
    renderBudget: () => renderBudgetView(deps),
    updateBudget: () => updateBudgetUI(deps),
    renderPassport: () => renderPassport(deps),
    renderLoadPanel: () => renderLoadPanel(deps),
    updateItinUI: () => updateItinUI(deps),
  });

  applyTheme();
  // Wait for the real auth check (not a blind timer) before revealing
  // whatever's underneath the splash — this is what stops the login card
  // from flashing on screen for users who are actually already logged in.
  // Capped at 4s so a stalled network can't leave the splash up forever;
  // the extra 500ms after that mirrors the original fixed delay so the
  // splash doesn't feel like it vanishes instantly when auth resolves fast.
  Promise.race([authCheckedPromise, new Promise(res=>setTimeout(res,4000))])
    .then(()=>new Promise(res=>setTimeout(res,500)))
    .then(()=>{const s=document.getElementById('splash');s.style.opacity='0';setTimeout(()=>s.style.display='none',300);});
  const crCnt = document.getElementById('cr-cnt');
  if(crCnt) crCnt.textContent=credits;
  try {
    map=L.map('map',{zoomControl:false,zoomSnap:1,zoomDelta:1,wheelPxPerZoomLevel:120}).setView([20.5937,78.9629],5);
    L.control.zoom({position:'topleft'}).addTo(map);
    // The app chrome is always dark, but the map itself always uses the
    // warm, legible CARTO Voyager basemap (cream land, labeled roads,
    // blue water) regardless of the UI theme toggle.
    // Primary + fallback basemap sources. The CARTO Voyager rastertiles
    // endpoint used here has no API key — it's CARTO's free public/demo
    // tile server, which is fine at low volume but starts throttling
    // (403/429) once enough concurrent users push total tile requests up.
    // Under the old code a throttled tile was hidden forever (see the
    // tileerror handler below, previously `display:none` with no retry),
    // so a brief rate-limit window left permanent grey holes in the map —
    // that's the "crash" users were seeing. We now retry failed tiles
    // with backoff, and if the primary source keeps failing we swap the
    // whole layer to a fallback source instead of leaving it broken.
    // For real production traffic, get a free-tier API key from a
    // provider meant for that (MapTiler, Stadia Maps, Thunderforest, or
    // a CARTO account) — anonymous demo endpoints will always eventually
    // throttle as usage grows; retry/fallback only masks that, it doesn't
    // remove the underlying limit.
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

    function buildTileLayer(idx){
      const src = TILE_SOURCES[idx];
      return L.tileLayer(src.url, src.opts);
    }

    function switchTileLayer(idx){
      tileSourceIdx = idx;
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
        let attempts = tile._iitRetryCount || 0;
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
        if(now - tileErrorWindowStart > 15000){ tileErrorCount = 0; tileErrorWindowStart = now; }
        tileErrorCount++;
        if(tileErrorCount > 20 && tileSourceIdx < TILE_SOURCES.length - 1){
          tileErrorCount = 0;
          switchTileLayer(tileSourceIdx + 1);
          console.warn('[map] Primary tile source struggling, switched to fallback basemap.');
        }
      });
    }

    window._tileLayer = buildTileLayer(tileSourceIdx);
    attachTileErrorHandling(window._tileLayer);
    window._tileLayer.addTo(map);

    // If MapTiler key(s) are configured server-side (MAPTILER_KEY,
    // MAPTILER_KEY_2, MAPTILER_KEY_3, MAPTILER_KEY_4 env vars), chain them
    // in order as the primary sources: key 1 is tried first, and if it
    // starts failing hard (monthly quota exhausted, invalid, etc.) the
    // tileerror handling above (tileErrorCount > 20 within a 15s window)
    // automatically calls switchTileLayer() to move on to key 2, then key 3,
    // then key 4 — and only falls through to the CARTO/OSM anonymous
    // endpoints once every configured key has been exhausted. This fetch is
    // fire-and-forget so the map isn't blocked from rendering while it
    // resolves.
    fetch('/api/config').then(r=>r.json()).then(cfg=>{
      const keys = cfg && Array.isArray(cfg.maptilerKeys) ? cfg.maptilerKeys : [];
      if(keys.length && tileSourceIdx===0){
        // Unshift in reverse so the final TILE_SOURCES order is
        // key1, key2, key3, key4, then the existing CARTO/OSM fallbacks.
        for(let i = keys.length - 1; i >= 0; i--){
          TILE_SOURCES.unshift({
            url:`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${keys[i]}`,
            opts:{attribution:'&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',maxZoom:19,keepBuffer:4}
          });
        }
        switchTileLayer(0);
      }
    }).catch(e=>console.warn('[map] /api/config fetch failed, staying on fallback tiles:', e));
    // Leaflet computes its tile grid from the container's size at creation
    // time. If #map-view is still display:none (its default state on load),
    // the container has zero width/height and the map renders as gray/blank
    // tiles until something forces a resize — this is the "map is glitching"
    // bug. Force several invalidateSize() passes and watch the container with
    // a ResizeObserver so the map always repaints correctly once it becomes
    // visible, on any screen size, without relying on a specific view switch.
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
    // likely `L` was undefined because the CDN request for leaflet.js
    // failed (CSP block, network issue, CDN outage). Contain the damage
    // here instead of letting it kill the rest of startup: GPS, city
    // detection, chat, and the planner below all still need to run.
    console.error('[map] Failed to initialize — map will be unavailable this session:', mapInitErr);
    map = null;
    const mapEl = document.getElementById('map');
    if(mapEl){
      mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:var(--text-secondary);font-size:14px;">⚠️ The map couldn\'t load. Please refresh the page — if this keeps happening, check your connection.</div>';
    }
  }

  document.getElementById('chat-in').addEventListener('keypress',e=>{if(e.key==='Enter')handleChat();});
  document.getElementById('city-input').addEventListener('keypress',e=>{if(e.key==='Enter')searchCity();});
  syncPlannerTimeFields('duration');
  ['n-days','t-time','t-hours','t-minutes','break-every','break-duration','water-every','vibe','city-select'].forEach(id=>{
    document.getElementById(id)?.addEventListener('input', updatePlannerShowcase);
    document.getElementById(id)?.addEventListener('change', updatePlannerShowcase);
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
      let nearestId = 'hyderabad', minDist = Infinity;
      for (const [id, c] of Object.entries(CITIES)) {
        const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
        if (d < minDist) { minDist = d; nearestId = id; }
      }
      return nearestId;
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
    // "Shared GPS-fix coordination" block near the cLat/cLon globals)
    // instead of issuing a second, independent getCurrentPosition() call —
    // that used to run with a 5-minute maximumAge while the live marker's
    // watch used maximumAge:0, so the two could legitimately disagree.
    // 14s (not the old 6s) gives a real cold GPS fix a fair chance — it
    // roughly matches initGPS()'s own 15s watchPosition timeout, so the
    // fallback to Hyderabad shouldn't normally fire ahead of a genuine fix.
    waitForFirstGpsFix(14000).then(({ lat, lon }) => {
      load(nearestCityTo(lat, lon));
    }).catch(() => {
      load('hyderabad'); // no fix in time, permission denied, or geolocation error → Hyderabad
      // Keep listening even after falling back: a slow cold GPS fix (or a
      // late permission grant) can still land afterwards. If it does, and
      // the user hasn't picked a city or started a trip in the meantime,
      // silently correct away from the Hyderabad default to their real
      // nearest city instead of leaving the app stuck showing Hyderabad.
      waitForFirstGpsFix(60000).then(({ lat, lon }) => {
        const realId = nearestCityTo(lat, lon);
        if (realId !== 'hyderabad') load(realId);
      }).catch(() => {});
    });
  })();
  if(window.speechSynthesis)window.speechSynthesis.getVoices();
  updatePlannerShowcase();
};
