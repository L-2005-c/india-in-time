/**
 * frontend/app-src/src/controllers/weatherController.js
 * Weather lifecycle, live weather polling, and adaptive weather re-optimization.
 */

import { shouldRetryWeather, weatherRetryDelayMs, detectWeatherChange } from '../utils/weather-ui.js';

export function createWeatherController({ API, showToast, buildTimeAwareDay, t2m, m2t, fmtM, getCurrentLocalMin, getTripMinutes, getBreakEveryMinutes, getBreakDurationMinutes, getWaterReminderMinutes }) {
  window.realWind = window.realWind || 0;
  window._lastWeatherSnapshot = window._lastWeatherSnapshot || null;

  async function fetchWeatherUI(lat, lon, attempt = 0) {
    try {
      window._lastKnownLatLon = [lat, lon];
      const d = await API.fetchWeather(lat, lon);
      window._weatherFailToastShown = false;
      window.realTemp = d.temp;
      window.realWeatherMain = d.main || (d.weathercode >= 51 ? 'Rain' : 'Clear');
      window.realWind = d.windKph || 0;
      const displayEl = document.getElementById('wx-display');
      if (displayEl) displayEl.textContent = d.display;
      updatePlannerShowcase();
      detectWeatherChangeAndReoptimize({ temp: window.realTemp, main: window.realWeatherMain, wind: window.realWind });
    } catch (e) {
      const status = parseInt(String(e.message).match(/(\d{3})$/)?.[1] || '0', 10);
      if (shouldRetryWeather(status, attempt, 3)) {
        setTimeout(() => fetchWeatherUI(lat, lon, attempt + 1), weatherRetryDelayMs(attempt));
        return;
      }
      const el = document.getElementById('wx-display');
      if (el && (!el.textContent || el.textContent.includes('--'))) el.textContent = '⚠️ Weather unavailable';
      if (!window._weatherFailToastShown) {
        window._weatherFailToastShown = true;
        if (typeof showToast === 'function') {
          showToast('⚠️', 'Weather offline', 'Couldn\'t reach the weather service — everything else still works fine.', 4000);
        }
      }
    }
  }

  function detectWeatherChangeAndReoptimize(snap) {
    const prev = window._lastWeatherSnapshot;
    window._lastWeatherSnapshot = snap;
    const { changed, reason } = detectWeatherChange(prev, snap);
    if (changed) reoptimizeRemainingPlan(reason);
  }

  function reoptimizeRemainingPlan(reason, nowOverride) {
    try {
      if (!window.itin || !window.itin.length) return;
      const now = typeof nowOverride === 'number' ? nowOverride : getCurrentLocalMin();
      const upcoming = window.itin.filter(s => !s.isBreak && t2m(s.ct || '23:00') > now && !s._visited);
      if (upcoming.length < 2) return;
      const startCoords = upcoming[0].coords;
      const dayEndMin = t2m(document.getElementById('e-time')?.value || '19:00');
      const budget = Math.max(30, dayEndMin - now);
      const _rp = buildTimeAwareDay(upcoming, now, budget, startCoords, window.realTemp || 28, 0, 0);
      const replanned = Array.isArray(_rp) ? _rp : (_rp?.day || []);
      if (replanned && replanned.length) {
        const visitedPrefix = window.itin.filter(s => s.isBreak || t2m(s.ct || '23:00') <= now || s._visited);
        window.itin = [...visitedPrefix, ...replanned];
        if (typeof window.updateItinUI === 'function') window.updateItinUI();
        if (typeof window.addMsg === 'function') window.addMsg(`🔄 <strong>Plan updated</strong> — ${reason}, so I reordered your remaining stops for better conditions.`);
      }
    } catch (_e) {}
  }

  function getSelectedPrefs() {
    return Array.from(document.querySelectorAll('.pref:checked')).map(el => el.value);
  }

  function formatTripWindow(days, minutesPerDay) {
    return `${days} day${days === 1 ? '' : 's'} / ${fmtM(minutesPerDay)}`;
  }

  function updatePlannerShowcase() {
    const days = parseInt(document.getElementById('n-days')?.value, 10) || 1;
    const minutes = getTripMinutes();
    const startTime = document.getElementById('s-time')?.value || '09:00';
    const endTime = document.getElementById('e-time')?.value || m2t(t2m(startTime) + minutes);
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
    const mdPlan = window.mdPlan || [];
    const itin = window.itin || [];
    const totalStops = mdPlan.length ? mdPlan.reduce((sum, day) => sum + day.length, 0) : itin.length;
    const focusLabel = prefs.length ? prefs.slice(0, 2).map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(' + ') : 'Balanced';
    const modeLabel = mdPlan.length ? 'Route ready' : vibe ? 'Mood-based' : prefs.length >= 3 ? 'Discovery-rich' : 'Balanced';

    if (cityEl) cityEl.textContent = window.currentCityName || 'Select city';
    if (weatherEl) weatherEl.textContent = Number.isFinite(window.realTemp) ? `${window.realTemp} C` : '--';
    if (placesEl) placesEl.textContent = window.LOCS?.length ? `${window.LOCS.length} loaded` : 'AI curating';
    if (modeEl) modeEl.textContent = modeLabel;

    if (styleEl) styleEl.textContent = vibe ? 'Tailored itinerary' : 'Balanced luxury';
    if (styleCopyEl) styleCopyEl.textContent = vibe ? `The plan is tuned around "${vibe.slice(0, 48)}${vibe.length > 48 ? '...' : ''}" for a more intentional story.` : 'Designed to feel premium while staying approachable for first-time users.';
    if (timeEl) timeEl.textContent = formatTripWindow(days, minutes);
    if (timeCopyEl) timeCopyEl.textContent = `${fmtM(minutes)} per day from ${startTime} to ${endTime}, with ${breakEvery > 0 && breakDuration > 0 ? `${fmtM(breakDuration)} breaks every ${fmtM(breakEvery)}` : 'nonstop pacing'} and ${waterEvery > 0 ? `water nudges every ${fmtM(waterEvery)}` : 'no water reminders'}.`;
    if (focusEl) focusEl.textContent = focusLabel;
    if (focusCopyEl) focusCopyEl.textContent = prefs.length ? `Current experience mix favors ${prefs.join(', ')}.` : 'Select experience filters to steer recommendations, routing, and stop density.';

    if (!banner) return;
    if (!mdPlan.length) {
      banner.style.display = 'none';
      return;
    }

    const summaryTitle = document.getElementById('plan-summary-title');
    const summaryCopy = document.getElementById('plan-summary-copy');
    const chipDays = document.getElementById('plan-summary-chip-days');
    const chipStops = document.getElementById('plan-summary-chip-stops');
    const chipDuration = document.getElementById('plan-summary-chip-duration');

    banner.style.display = 'block';
    if (summaryTitle) summaryTitle.textContent = `${window.currentCityName} is now staged as a polished ${days}-day experience.`;
    if (summaryCopy) summaryCopy.textContent = `This route balances discovery, practicality, and visual polish with ${totalStops} curated stops, smart pacing, clear start/end timing, and live utilities for a smooth travel experience.`;
    if (chipDays) chipDays.textContent = `${days} day${days === 1 ? '' : 's'}`;
    if (chipStops) chipStops.textContent = `${totalStops} curated stops`;
    if (chipDuration) chipDuration.textContent = `${fmtM(minutes)} planned coverage`;
  }

  return {
    fetchWeatherUI,
    detectWeatherChangeAndReoptimize,
    reoptimizeRemainingPlan,
    getSelectedPrefs,
    formatTripWindow,
    updatePlannerShowcase,
  };
}
