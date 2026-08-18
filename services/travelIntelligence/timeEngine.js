// timeEngine.js — Sunrise, sunset, golden hour, daypart, season
const rules = require('../../data/time-intelligence-rules.json');
function t2m(t, fallback = 0) {
  if (!t || typeof t !== 'string' || !t.includes(':')) return fallback;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}
function m2t(m) {
  m = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const IST_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
});
function getISTParts(date) {
  const parts = IST_FORMATTER.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { minutesOfDay: hour * 60 + minute, dayIndex: weekdayIndex, month: parseInt(get('month'), 10), dayName: DAY_NAMES[weekdayIndex] || 'Unknown' };
}
function getSeason(month) {
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([3, 4, 5].includes(month)) return 'summer';
  if ([6, 7, 8, 9].includes(month)) return 'monsoon';
  return 'autumn';
}
function computeSunTimes(lat, lon, date) {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { sunrise: '06:00', sunset: '18:30', sunriseMin: 360, sunsetMin: 1110 };
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return { sunrise: '06:00', sunset: '18:30', sunriseMin: 360, sunsetMin: 1110 };
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    const lngHour = lon / 15, zenith = 90.833;
    function calc(isRise) {
      const t = dayOfYear + ((isRise ? 6 : 18) - lngHour) / 24;
      const M = 0.9856 * t - 3.289;
      let L = M + 1.916 * Math.sin((M * Math.PI) / 180) + 0.020 * Math.sin((2 * M * Math.PI) / 180) + 282.634;
      L = ((L % 360) + 360) % 360;
      let RA = (180 / Math.PI) * Math.atan(0.91764 * Math.tan((L * Math.PI) / 180));
      RA = ((RA % 360) + 360) % 360;
      const Lq = Math.floor(L / 90) * 90, RAq = Math.floor(RA / 90) * 90;
      RA = (RA + (Lq - RAq)) / 15;
      const sinDec = 0.39782 * Math.sin((L * Math.PI) / 180);
      const cosDec = Math.cos(Math.asin(sinDec));
      const cosH = (Math.cos((zenith * Math.PI) / 180) - sinDec * Math.sin((lat * Math.PI) / 180)) / (cosDec * Math.cos((lat * Math.PI) / 180));
      if (cosH > 1 || cosH < -1) return null;
      let H = isRise ? 360 - (180 / Math.PI) * Math.acos(cosH) : (180 / Math.PI) * Math.acos(cosH);
      H /= 15;
      const UT = ((H + RA - 0.06571 * t - 6.622 - lngHour) % 24 + 24) % 24;
      const localT = ((UT + 5.5) % 24 + 24) % 24;
      return Math.floor(localT) * 60 + Math.round((localT - Math.floor(localT)) * 60);
    }
    const sunriseMin = calc(true) ?? 360, sunsetMin = calc(false) ?? 1110;
    return { sunrise: m2t(sunriseMin), sunset: m2t(sunsetMin), sunriseMin, sunsetMin };
  } catch (_e) { return { sunrise: '06:00', sunset: '18:30', sunriseMin: 360, sunsetMin: 1110 }; }
}
function getDaypart(nowMin, sunsetMin) {
  if (nowMin >= 300 && nowMin < 540) return 'earlyMorning';
  if (nowMin >= 540 && nowMin < 720) return 'lateMorning';
  if (nowMin >= 720 && nowMin < 960) return 'afternoon';
  if (nowMin >= 960 && nowMin < sunsetMin) return 'evening';
  if (nowMin >= sunsetMin || nowMin < 300) return 'night';
  return 'morning';
}
function computeGoldenHours(sunriseMin, sunsetMin) {
  const gh = rules.goldenHour || { morningOffsetMin: 60, eveningOffsetMin: 45, blueHourOffsetMin: 20 };
  const blue = gh.blueHourOffsetMin || 20;
  return {
    morningGolden: { start: m2t(Math.max(0, sunriseMin - 15)), end: m2t(sunriseMin + (gh.morningOffsetMin || 60)), startMin: Math.max(0, sunriseMin - 15), endMin: sunriseMin + (gh.morningOffsetMin || 60) },
    eveningGolden: { start: m2t(Math.max(0, sunsetMin - (gh.eveningOffsetMin || 45))), end: m2t(Math.min(1439, sunsetMin + 15)), startMin: Math.max(0, sunsetMin - (gh.eveningOffsetMin || 45)), endMin: Math.min(1439, sunsetMin + 15) },
    morningBlue: { start: m2t(Math.max(0, sunriseMin - blue - 10)), end: m2t(Math.max(0, sunriseMin - 5)), startMin: Math.max(0, sunriseMin - blue - 10), endMin: Math.max(0, sunriseMin - 5) },
    eveningBlue: { start: m2t(Math.min(1439, sunsetMin + 5)), end: m2t(Math.min(1439, sunsetMin + blue + 5)), startMin: Math.min(1439, sunsetMin + 5), endMin: Math.min(1439, sunsetMin + blue + 5) },
  };
}
function inWindow(min, windows) {
  if (!Array.isArray(windows)) {
    if (typeof windows === 'string' && windows.includes('-')) {
      const parts = windows.split('-').map((s) => s.trim());
      if (parts.length === 2) windows = [parts];
      else return false;
    } else return false;
  }
  return windows.some((w) => Array.isArray(w) && w.length >= 2 && min >= t2m(w[0]) && min <= t2m(w[1]));
}
function isInGoldenHour(nowMin, golden) {
  if (!golden) return { morning: false, evening: false, blue: false, any: false };
  const morning = nowMin >= golden.morningGolden.startMin && nowMin <= golden.morningGolden.endMin;
  const evening = nowMin >= golden.eveningGolden.startMin && nowMin <= golden.eveningGolden.endMin;
  const blueM = golden.morningBlue && nowMin >= golden.morningBlue.startMin && nowMin <= golden.morningBlue.endMin;
  const blueE = golden.eveningBlue && nowMin >= golden.eveningBlue.startMin && nowMin <= golden.eveningBlue.endMin;
  return { morning, evening, blue: !!(blueM || blueE), any: morning || evening || blueM || blueE };
}
module.exports = { t2m, m2t, DAY_NAMES, getISTParts, getSeason, computeSunTimes, getDaypart, computeGoldenHours, inWindow, isInGoldenHour };
