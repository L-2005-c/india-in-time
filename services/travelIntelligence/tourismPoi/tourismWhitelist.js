'use strict';

/**
 * tourismWhitelist.js
 * Explicitly verified landmark exceptions that might otherwise trigger generic word filters
 * (e.g. historical railway stations with UNESCO heritage status, iconic bridges, heritage promenades).
 */

const VERIFIED_TOURISM_EXCEPTIONS = new Set([
  // Heritage Railway Stations / Architectural Monuments
  'chhatrapati shivaji maharaj terminus',
  'chhatrapati shivaji terminus',
  'victoria terminus',
  'howrah railway station',
  'old delhi railway station heritage',

  // Iconic Bridges / Engineering Landmarks
  'howrah bridge',
  'vidyasagar setu',
  'bandra-worli sea link',
  'pamban bridge',
  'godavari arch bridge',

  // Historic Promenades & Landmark Squares
  'marine drive',
  'connaught place',
  'chandni chowk',
  'park street',
  'brigade road',
  'mg road gangtok',
  'mall road shimla',
  'mall road manali',
  'mall road mussoorie',

  // Notable Complex Attractions
  'ramoji film city',
  'innovative film city',
  'kingdom of dreams',
]);

/**
 * Checks if a candidate is in the explicit tourism whitelist exception list.
 * @param {string} name - Candidate name
 * @returns {boolean}
 */
function isWhitelistedLandmark(name) {
  const clean = String(name || '').trim().toLowerCase();
  if (VERIFIED_TOURISM_EXCEPTIONS.has(clean)) return true;
  for (const item of VERIFIED_TOURISM_EXCEPTIONS) {
    if (clean.includes(item)) return true;
  }
  return false;
}

module.exports = {
  isWhitelistedLandmark,
  VERIFIED_TOURISM_EXCEPTIONS,
};
