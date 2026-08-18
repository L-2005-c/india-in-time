// openingHoursEngine.js
const { t2m, m2t, getISTParts } = require('./timeEngine');
const rules = require('../../data/time-intelligence-rules.json');
function categoryRules(cat) { return rules.categories[cat] || rules.categories.default; }
function getOpeningStatus(place, now = new Date(), sun = null) {
  const cat = place.cat || 'default';
  const catRule = categoryRules(cat);
  const ist = getISTParts(now);
  const nowMin = ist.minutesOfDay;
  const dayName = ist.dayName;
  const hasOt = place.ot != null && String(place.ot).includes(':');
  const hasCt = place.ct != null && String(place.ct).includes(':');
  if (!hasOt && !hasCt) {
    return { status: 'UNKNOWN', label: 'Hours unknown', isOpenNow: null, minutesToClose: null, minutesToOpen: null, openTime: null, closeTime: null, weeklyHoliday: place.weeklyHoliday ?? catRule.weeklyHoliday ?? null, nightAvailable: place.night_availability !== undefined ? place.night_availability : catRule.nightAvailable, dataQuality: 'unavailable', reason: 'Authoritative opening hours not provided for this place.' };
  }
  const openMin = t2m(place.ot, 6 * 60);
  const closeMin = t2m(place.ct, 20 * 60);
  const weeklyHoliday = place.weeklyHoliday !== undefined ? place.weeklyHoliday : catRule.weeklyHoliday;
  const nightAvailable = place.night_availability !== undefined ? place.night_availability : catRule.nightAvailable;
  const sunsetMin = sun?.sunsetMin ?? t2m('18:30');
  const isHolidayToday = weeklyHoliday && weeklyHoliday === dayName;
  const overnight = closeMin <= openMin;
  const isWithinHours = overnight ? (nowMin >= openMin || nowMin < closeMin) : (nowMin >= openMin && nowMin < closeMin);
  const isOpenNow = !isHolidayToday && (isWithinHours || (nightAvailable && (nowMin >= sunsetMin || nowMin < openMin)));
  let minutesToClose = null, minutesToOpen = null;
  if (isOpenNow) {
    minutesToClose = overnight ? (nowMin < closeMin ? closeMin - nowMin : 1440 - nowMin + closeMin) : (closeMin >= nowMin ? closeMin - nowMin : 1440 - nowMin + closeMin);
  } else if (!isHolidayToday) {
    minutesToOpen = openMin >= nowMin ? openMin - nowMin : 1440 - nowMin + openMin;
  }
  let status = 'CLOSED', label = isHolidayToday ? `Closed today (weekly holiday: ${weeklyHoliday})` : 'Currently Closed';
  if (isOpenNow) {
    if (minutesToClose != null && minutesToClose <= 45) { status = 'CLOSING_SOON'; label = `Closing soon (${minutesToClose} min)`; }
    else { status = 'OPEN'; label = 'Open now'; }
  } else if (minutesToOpen != null && minutesToOpen <= 60) { status = 'OPENS_SOON'; label = `Opens in ${minutesToOpen} min`; }
  return { status, label, isOpenNow, minutesToClose, minutesToOpen, openTime: place.ot || m2t(openMin), closeTime: place.ct || m2t(closeMin), weeklyHoliday, nightAvailable, dataQuality: 'provided', reason: isHolidayToday ? `Weekly holiday (${weeklyHoliday})` : isOpenNow ? `Within opening hours ${place.ot || m2t(openMin)}–${place.ct || m2t(closeMin)}` : 'Outside opening hours' };
}
module.exports = { getOpeningStatus, categoryRules };
