// client-api.js — All backend communication lives here.
// ✅ Fixed: No ES module exports — uses window.API global (Vercel-compatible)

(function () {
  const BASE = ''; // empty = same origin

  // ── Auth helper ──────────────────────────────────────────────────────────────
  // Fetches a fresh Firebase ID token for the signed-in user (Firebase caches
  // and auto-refreshes this, so this is cheap to call every request). Routes
  // that touch a specific user's data (trips, favorites) require this.
  async function authHeader() {
    if (!window.currentUser) return {};
    try {
      const token = await window.currentUser.getIdToken();
      return { Authorization: `Bearer ${token}` };
    } catch (_e) {
      return {};
    }
  }

  // ── Low-level helpers ──────────────────────────────────────────────────────

  async function get(path, params = {}, { auth = false } = {}) {
    const url = new URL(BASE + path, window.location.href);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v);
    });
    const headers = auth ? await authHeader() : {};
    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  }

  async function post(path, body = {}, timeoutMs = 20000, { auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json', ...(auth ? await authHeader() : {}) };
    const res = await fetch(BASE + path, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
    return res.json();
  }

  // ── Geocoding ────────────────────────────────────────────────────────────────

  async function geocode(query) {
    return get('/api/geocode', { q: query });
  }

  // ── Places ───────────────────────────────────────────────────────────────────

  async function fetchPlaces(lat, lon, cityName = '', totalMinutes = 600, opts = {}) {
    const { refresh = false, prefs = [] } = opts;
    // Cold Render + Gemini + sequential Nominatim can exceed 90s; client retries once in loadCityPlaces.
    return post('/api/places', { lat, lon, cityName, totalMinutes, refresh, prefs }, 90000);
  }

  // ── Weather ──────────────────────────────────────────────────────────────────

  async function fetchWeather(lat, lon) {
    return get('/api/weather', { lat, lon });
  }

  async function fetchWeatherAlerts(lat, lon, stops = []) {
    return post('/api/weather-alerts', { lat, lon, stops }, 15000);
  }

  // ── GeoAI Time Intelligence Engine ──────────────────────────────────────────
  // Deterministic "when should I visit this place for the best possible
  // experience?" engine — open/closed, best-time badges, crowd level,
  // sunrise/sunset, seasonal notes. Grounded in real rules, not an LLM guess.

  async function timeIntelligenceStatus(places = [], weather = null, at = null) {
    return post('/api/time-intelligence/status', { places, weather, at }, 12000);
  }

  /** Full multi-factor Travel Intelligence ranking (visitScore, explanation, confidence). */
  async function timeIntelligenceRecommend(places = [], opts = {}) {
    const { weather = null, at = null, fromCoords = null, personas = null, tripMode = null } = opts;
    return post('/api/time-intelligence/recommend', {
      places, weather, at, fromCoords, personas, tripMode,
    }, 15000);
  }

  async function timeIntelligenceDayPlan(places = [], opts = {}) {
    return post('/api/time-intelligence/day-plan', { places, ...opts }, 20000);
  }
  async function timeIntelligenceTemporalProfile(place, opts = {}) {
    return post('/api/time-intelligence/temporal-profile', { place, ...opts }, 20000);
  }

  async function timeIntelligenceOptimize(places = [], opts = {}) {
    return post('/api/time-intelligence/optimize', { places, ...opts }, 60000);
  }

  async function timeIntelligenceReplan(places = [], opts = {}) {
    return post('/api/time-intelligence/replan', { places, ...opts }, 60000);
  }


  async function timeIntelligenceAdvice(place, opts = {}) {
    return post('/api/time-intelligence/advice', { place, ...opts }, 12000);
  }

  async function timeIntelligenceMultiDayAdvice(places = [], opts = {}) {
    return post('/api/time-intelligence/multi-day-advice', { places, ...opts }, 15000);
  }

  async function timeIntelligenceMultiDayPlan(places = [], opts = {}) {
    return post('/api/time-intelligence/multi-day-plan', { places, ...opts }, 60000);
  }

  async function timeIntelligenceCircuitPlan(places = [], opts = {}) {
    return post('/api/time-intelligence/circuit-plan', { places, ...opts }, 60000);
  }

  // ── Feedback ─────────────────────────────────────────────────────────────────
  async function submitPlaceFeedback(placeName, city, rating, accurate, comment) {
    return post('/api/feedback/place', { userId: (window.currentUser && window.currentUser.uid) || null, placeName, city, rating, accurate, comment });
  }
  async function submitAppFeedback(rating, category, message, context) {
    return post('/api/feedback/app', { userId: (window.currentUser && window.currentUser.uid) || null, rating, category, message, context });
  }

  // ── AI endpoints ─────────────────────────────────────────────────────────────

  async function aiChat(message, city, plan = [], currentTime = null) {
    const { text } = await post('/api/ai/chat', { message, city, plan, currentTime, tripMode: window.selectedTripMode || null });
    return text;
  }

  async function aiVibe(vibe, city, locations = []) {
    const { text } = await post('/api/ai/vibe', { vibe, city, locations });
    return text;
  }

  async function aiLens(imageBase64, imageType, city) {
    const { text } = await post('/api/ai/lens', { imageBase64, imageType, city });
    return text;
  }

  async function aiPrep(city, stops = []) {
    const { text } = await post('/api/ai/prep', { city, stops });
    return text;
  }

  async function aiInstaSpots(city, stops = []) {
    const { text } = await post('/api/ai/insta', { city, stops });
    return text;
  }

  async function aiSouvenirGuide(city) {
    const { text } = await post('/api/ai/souvenir', { city });
    return text;
  }

  async function aiBudgetAnalysis(city, limit, spent, expenses = []) {
    const { text } = await post('/api/ai/budget', { city, limit, spent, expenses, tripMode: window.selectedTripMode || null });
    return text;
  }

  async function aiAlternative(city, currentStop) {
    const { text } = await post('/api/ai/alternative', { city, currentStop });
    return text;
  }

  async function aiCaption(imageBase64, imageType, city, stopName) {
    const { text } = await post('/api/ai/caption', { imageBase64, imageType, city, stopName });
    return text;
  }

  async function aiTranslate(imageBase64, imageType, city) {
    const { text } = await post('/api/ai/translate', { imageBase64, imageType, city });
    return text;
  }

  async function aiTripRating(city, stops, duration, expenses, stamps) {
    const { text } = await post('/api/ai/triprating', { city, stops, duration, expenses, stamps });
    return text;
  }

  async function aiReplanner(city, completedStops, remainingStops, minutesLate, currentTime) {
    const { text } = await post('/api/ai/replanner', { city, completedStops, remainingStops, minutesLate, currentTime });
    return text;
  }

  async function aiFoodRecommend(city, stopName, cat, timeOfDay) {
    const { text } = await post('/api/ai/foodrecommend', { city, stopName, cat, timeOfDay, tripMode: window.selectedTripMode || null });
    return text;
  }

  async function aiVoiceChat(message, city, plan, context) {
    const { text } = await post('/api/ai/voicechat', { message, city, plan, context });
    return text;
  }

  // ── 8 Unique Features ────────────────────────────────────────────────────────

  async function aiFestivalRadar(city, month, date) {
    const { text } = await post('/api/ai/festival', { city, month, date });
    return text;
  }
  async function aiHiddenGem(city, prefs) {
    const { text } = await post('/api/ai/hiddenGem', { city, prefs, tripMode: window.selectedTripMode || null });
    return text;
  }
  async function aiArOverlay(imageBase64, imageType, city) {
    const { text } = await post('/api/ai/arOverlay', { imageBase64, imageType, city });
    return text;
  }
  async function aiHartaalAlert(city, date) {
    const { text } = await post('/api/ai/hartaalAlert', { city, date });
    return text;
  }
  async function aiFoodSafety(imageBase64, imageType, city) {
    const { text } = await post('/api/ai/foodSafety', { imageBase64, imageType, city });
    return text;
  }
  async function aiCrowdPredict(city, stopName, cat, dayOfWeek, currentHour) {
    const { text } = await post('/api/ai/crowdPredict', { city, stopName, cat, dayOfWeek, currentHour });
    return text;
  }
  async function aiFareNegotiator(city, fromPlace, toPlace, distanceKm, vehicleType) {
    const { text } = await post('/api/ai/fareNegotiator', { city, fromPlace, toPlace, distanceKm, vehicleType });
    return text;
  }
  async function aiTripTribe(city, userName, interests, travelStyle, dates) {
    const { text } = await post('/api/ai/tripTribe', { city, userName, interests, travelStyle, dates });
    return text;
  }

  // ── Trips API (save/load/share) ─────────────────────────────────────────────

  // Note: these now require the user to be signed in (window.currentUser set
  // by the Firebase onAuthStateChanged handler). The server derives the user
  // from the verified ID token — it no longer trusts a client-supplied userId.
  async function saveTrip(city, cityLat, cityLon, tripConfig, stops) {
    return post('/api/trips', { city, cityLat, cityLon, config: tripConfig, stops }, 20000, { auth: true });
  }

  async function listTrips() {
    return get('/api/trips', {}, { auth: true });
  }

  async function loadTrip(tripId) {
    return get(`/api/trips/${tripId}`, {}, { auth: true });
  }

  async function deleteTrip(tripId) {
    const headers = await authHeader();
    const res = await fetch(BASE + `/api/trips/${tripId}`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`DELETE /api/trips/${tripId} → ${res.status}`);
    return res.json();
  }

  async function shareTrip(tripId) {
    return post(`/api/trips/${tripId}/share`, {}, 20000, { auth: true });
  }

  async function loadSharedTrip(shareToken) {
    return get(`/api/trips/shared/${shareToken}`);
  }

  // ── Favorites API (bookmarks) ───────────────────────────────────────────────

  async function addFavorite(placeName, city, lat, lon, category) {
    return post('/api/favorites', { placeName, city, lat, lon, category }, 20000, { auth: true });
  }

  async function listFavorites(city) {
    const params = city ? { city } : {};
    return get('/api/favorites', params, { auth: true });
  }

  async function removeFavorite(favoriteId) {
    const headers = await authHeader();
    const res = await fetch(BASE + `/api/favorites/${favoriteId}`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`DELETE /api/favorites/${favoriteId} → ${res.status}`);
    return res.json();
  }

  // ── Analytics API ───────────────────────────────────────────────────────────

  async function getAnalytics(hours = 24) {
    return get('/api/analytics/summary', { hours });
  }

  // ── Health Check ────────────────────────────────────────────────────────────

  async function healthCheck() {
    return get('/api/health/ready');
  }

  // ── Expose as window.API ─────────────────────────────────────────────────────
  window.API = {
    geocode, fetchPlaces, fetchWeather, fetchWeatherAlerts, timeIntelligenceStatus, timeIntelligenceRecommend, timeIntelligenceDayPlan, timeIntelligenceTemporalProfile, timeIntelligenceOptimize, timeIntelligenceReplan, timeIntelligenceAdvice, timeIntelligenceMultiDayAdvice, timeIntelligenceMultiDayPlan, timeIntelligenceCircuitPlan,
    submitPlaceFeedback, submitAppFeedback,
    aiChat, aiVibe, aiLens, aiPrep, aiInstaSpots, aiSouvenirGuide,
    aiBudgetAnalysis, aiAlternative, aiCaption, aiTranslate,
    aiTripRating, aiReplanner, aiFoodRecommend, aiVoiceChat,
    aiFestivalRadar, aiHiddenGem, aiArOverlay, aiHartaalAlert,
    aiFoodSafety, aiCrowdPredict, aiFareNegotiator, aiTripTribe,
    // v2.0 — New APIs
    saveTrip, listTrips, loadTrip, deleteTrip, shareTrip, loadSharedTrip,
    addFavorite, listFavorites, removeFavorite,
    getAnalytics, healthCheck,
  };
})();

