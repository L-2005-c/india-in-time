/**
 * Weather UI helpers — pure decisions extracted from core/app.js.
 */

export function isColdStartStatus(statusCode) {
  return statusCode === 502 || statusCode === 503 || statusCode === 0;
}

export function shouldRetryWeather(statusCode, attempt, maxAttempts = 3) {
  return isColdStartStatus(statusCode) && attempt < maxAttempts;
}

export function weatherRetryDelayMs(attempt) {
  return 5000 * (attempt + 1);
}

/**
 * Detect meaningful weather changes that should trigger re-optimization.
 * @returns {{ changed:boolean, reason:string|null }}
 */
export function detectWeatherChange(prev, snap) {
  if (!prev || !snap) return { changed: false, reason: null };
  const rainStarted =
    !/rain|storm|drizzle/i.test(prev.main || '') &&
    /rain|storm|drizzle/i.test(snap.main || '');
  const heatSpike = (snap.temp - prev.temp) >= 5 && snap.temp >= 36;
  const windPickedUp = snap.wind >= 30 && prev.wind < 30;
  if (rainStarted) return { changed: true, reason: 'rain has started' };
  if (heatSpike) return { changed: true, reason: 'temperature has spiked' };
  if (windPickedUp) return { changed: true, reason: 'winds have picked up' };
  return { changed: false, reason: null };
}

export function formatWeatherDisplay(d) {
  if (!d) return '⚠️ Weather unavailable';
  return d.display || `${d.temp}°C ${d.main || ''}`.trim();
}
