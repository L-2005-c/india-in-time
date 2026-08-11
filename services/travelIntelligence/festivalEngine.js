// festivalEngine.js — Event/festival crowd impact (static calendar + region/type match)
const festivalData = require('../../data/india-festivals.json');

function ymd(date) {
  const d = date instanceof Date ? date : new Date(date);
  // Use UTC parts to avoid TZ drift for calendar dates stored as YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  // Prefer IST calendar date
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(d); // YYYY-MM-DD
  } catch (_e) {
    return `${y}-${m}-${day}`;
  }
}

function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  return Math.round((db - da) / 86400000);
}

function regionMatch(festival, regionHint) {
  if (!regionHint) return true; // national default applies lightly
  const regions = (festival.regions || []).map((r) => String(r).toLowerCase());
  if (regions.includes('national')) return true;
  const hint = String(regionHint).toLowerCase();
  return regions.some((r) => hint.includes(r) || r.includes(hint));
}

function typeMatch(festival, placeCat) {
  if (!placeCat) return true;
  const types = festival.placeTypes || [];
  if (!types.length) return true;
  return types.includes(placeCat);
}

/**
 * Find festivals active on a date that may affect a place.
 */
function getActiveFestivals(date = new Date(), opts = {}) {
  const day = ymd(date);
  const month = parseInt(day.slice(5, 7), 10);
  const { region = null, placeCat = null } = opts;
  const active = [];

  for (const f of festivalData.festivals || []) {
    let matched = false;
    let dayOffset = 0;
    if (Array.isArray(f.dates)) {
      for (const start of f.dates) {
        const dur = f.durationDays || 1;
        const offset = daysBetween(start, day);
        if (offset >= 0 && offset < dur) {
          matched = true;
          dayOffset = offset;
          break;
        }
        // also match day-before for travel influx
        if (offset === -1) {
          matched = true;
          dayOffset = -1;
          break;
        }
      }
    }
    if (!matched && Array.isArray(f.monthHints) && f.monthHints.includes(month)) {
      // Weak match by month only — lower impact
      matched = true;
      dayOffset = 0;
      f._weak = true;
    }
    if (!matched) continue;
    if (!regionMatch(f, region)) continue;
    if (!typeMatch(f, placeCat)) continue;

    const impact = f._weak ? Math.min(1.15, (f.crowdImpact || 1.2) * 0.7) : (f.crowdImpact || 1.3);
    active.push({
      id: f.id,
      name: f.name,
      crowdImpact: impact,
      dayOffset,
      source: 'calendar',
      weak: !!f._weak,
    });
  }
  return active;
}

/**
 * Aggregate festival multiplier for crowd scoring.
 */
function festivalCrowdMultiplier(date, opts = {}) {
  const active = getActiveFestivals(date, opts);
  if (!active.length) {
    return { multiplier: 1.0, festivals: [], reason: null };
  }
  // Take max impact among matches (don't multiply stacked festivals unboundedly)
  const maxImpact = Math.max(...active.map((a) => a.crowdImpact));
  const names = active.map((a) => a.name);
  return {
    multiplier: maxImpact,
    festivals: active,
    reason: `Festival/event influence: ${names.join(', ')} (crowd impact ×${maxImpact.toFixed(2)})`,
  };
}

module.exports = {
  getActiveFestivals,
  festivalCrowdMultiplier,
};
