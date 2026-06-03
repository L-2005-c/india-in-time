// client-api.js — All backend communication lives here.
// ✅ Fixed: No ES module exports — uses window.API global (Vercel-compatible)

(function () {
  const BASE = ''; // empty = same origin

  // ── Low-level helpers ──────────────────────────────────────────────────────

  async function get(path, params = {}) {
    const url = new URL(BASE + path, window.location.href);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  }

  async function post(path, body = {}, timeoutMs = 20000) {
    const res = await fetch(BASE + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
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
    return post('/api/places', { lat, lon, cityName, totalMinutes, refresh, prefs }, 90000);
  }

  // ── Weather ──────────────────────────────────────────────────────────────────

  async function fetchWeather(lat, lon) {
    return get('/api/weather', { lat, lon });
  }

  async function fetchWeatherAlerts(lat, lon, stops = []) {
    return post('/api/weather-alerts', { lat, lon, stops }, 15000);
  }

  // ── AI endpoints ─────────────────────────────────────────────────────────────

  async function aiChat(message, city, plan = []) {
    const { text } = await post('/api/ai/chat', { message, city, plan });
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
    const { text } = await post('/api/ai/budget', { city, limit, spent, expenses });
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
    const { text } = await post('/api/ai/foodrecommend', { city, stopName, cat, timeOfDay });
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
    const { text } = await post('/api/ai/hiddenGem', { city, prefs });
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

  // ── Expose as window.API ─────────────────────────────────────────────────────
  window.API = {
    geocode, fetchPlaces, fetchWeather, fetchWeatherAlerts,
    aiChat, aiVibe, aiLens, aiPrep, aiInstaSpots, aiSouvenirGuide,
    aiBudgetAnalysis, aiAlternative, aiCaption, aiTranslate,
    aiTripRating, aiReplanner, aiFoodRecommend, aiVoiceChat,
    aiFestivalRadar, aiHiddenGem, aiArOverlay, aiHartaalAlert,
    aiFoodSafety, aiCrowdPredict, aiFareNegotiator, aiTripTribe,
  };
})();
