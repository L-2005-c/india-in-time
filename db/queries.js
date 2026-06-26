// db/queries.js — Prepared statement wrappers for all database operations
// All DB access goes through these functions.

const { getDb } = require('./init');

// ─────────────────────────────────────────────────────────────────────────────
//  TRIPS
// ─────────────────────────────────────────────────────────────────────────────

function saveTrip({ id, userId, city, cityLat, cityLon, configJson, stopsJson }) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO trips (id, user_id, city, city_lat, city_lon, config_json, stops_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId || null, city, cityLat, cityLon, configJson, stopsJson);
}

function getUserTrips(userId, limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT id, city, city_lat, city_lon, config_json, stops_json, status, share_token, created_at, updated_at
    FROM trips
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

function getTripById(tripId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM trips WHERE id = ?`).get(tripId);
}

function getTripByShareToken(token) {
  const db = getDb();
  return db.prepare(`SELECT * FROM trips WHERE share_token = ?`).get(token);
}

function updateTripShareToken(tripId, token) {
  const db = getDb();
  return db.prepare(`UPDATE trips SET share_token = ?, updated_at = datetime('now') WHERE id = ?`).run(token, tripId);
}

function deleteTrip(tripId, userId) {
  const db = getDb();
  return db.prepare(`DELETE FROM trips WHERE id = ? AND user_id = ?`).run(tripId, userId);
}

// ─────────────────────────────────────────────────────────────────────────────
//  FAVORITES
// ─────────────────────────────────────────────────────────────────────────────

function addFavorite({ userId, placeName, city, lat, lon, category, notes }) {
  const db = getDb();
  return db.prepare(`
    INSERT OR IGNORE INTO favorites (user_id, place_name, city, lat, lon, category, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, placeName, city, lat || null, lon || null, category || null, notes || null);
}

function getUserFavorites(userId, city = null) {
  const db = getDb();
  if (city) {
    return db.prepare(`
      SELECT * FROM favorites WHERE user_id = ? AND city = ? ORDER BY added_at DESC
    `).all(userId, city);
  }
  return db.prepare(`
    SELECT * FROM favorites WHERE user_id = ? ORDER BY added_at DESC
  `).all(userId);
}

function removeFavorite(favoriteId, userId) {
  const db = getDb();
  return db.prepare(`DELETE FROM favorites WHERE id = ? AND user_id = ?`).run(favoriteId, userId);
}

function isFavorite(userId, placeName, city) {
  const db = getDb();
  return !!db.prepare(`
    SELECT 1 FROM favorites WHERE user_id = ? AND place_name = ? AND city = ? LIMIT 1
  `).get(userId, placeName, city);
}

// ─────────────────────────────────────────────────────────────────────────────
//  API USAGE ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

let analyticsBuffer = [];
let analyticsFlushTimer = null;

function flushAnalyticsBuffer() {
  if (analyticsBuffer.length === 0) return;
  const batch = [...analyticsBuffer];
  analyticsBuffer = [];
  
  try {
    const db = getDb();
    const insert = db.prepare(`
      INSERT INTO api_usage (endpoint, method, ip, user_agent, status_code, response_ms, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = db.transaction((rows) => {
      for (const row of rows) {
        insert.run(row.endpoint, row.method, row.ip, row.userAgent, row.statusCode, row.responseMs, row.requestId);
      }
    });
    transaction(batch);
  } catch (err) {
    console.warn('[analytics] Failed to batch log:', err.message);
  }
}

function logApiUsage({ endpoint, method, ip, userAgent, statusCode, responseMs, requestId }) {
  analyticsBuffer.push({
    endpoint, method, 
    ip: ip || null, 
    userAgent: (userAgent || '').slice(0, 200), 
    statusCode, responseMs, 
    requestId: requestId || null
  });

  if (!analyticsFlushTimer) {
    analyticsFlushTimer = setInterval(flushAnalyticsBuffer, 2000);
  }
  
  if (analyticsBuffer.length >= 200) {
    flushAnalyticsBuffer(); // emergency flush if buffer gets too big
  }
}

function getApiUsageSummary(hours = 24) {
  const db = getDb();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const byEndpoint = db.prepare(`
    SELECT endpoint, 
           COUNT(*) as total_requests,
           AVG(response_ms) as avg_ms,
           MAX(response_ms) as max_ms,
           SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as errors
    FROM api_usage
    WHERE created_at >= ?
    GROUP BY endpoint
    ORDER BY total_requests DESC
  `).all(since);

  const totals = db.prepare(`
    SELECT COUNT(*) as total,
           AVG(response_ms) as avg_ms,
           SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as errors,
           SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END) as rate_limited
    FROM api_usage
    WHERE created_at >= ?
  `).get(since);

  return { period: `${hours}h`, since, byEndpoint, totals };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PLACE CACHE (persistent)
// ─────────────────────────────────────────────────────────────────────────────

function getCachedPlaces(cacheKey) {
  const db = getDb();
  const row = db.prepare(`
    SELECT payload_json FROM place_cache
    WHERE cache_key = ? AND expires_at > datetime('now')
  `).get(cacheKey);
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch {
    return null;
  }
}

function setCachedPlaces(cacheKey, payload, ttlMs) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO place_cache (cache_key, payload_json, created_at, expires_at)
    VALUES (?, ?, datetime('now'), ?)
  `).run(cacheKey, JSON.stringify(payload), expiresAt);
}

function deleteCachedPlaces(cacheKey) {
  const db = getDb();
  db.prepare(`DELETE FROM place_cache WHERE cache_key = ?`).run(cacheKey);
}

function purgeExpiredCache() {
  const db = getDb();
  const result = db.prepare(`DELETE FROM place_cache WHERE expires_at <= datetime('now')`).run();
  return result.changes;
}

// ─────────────────────────────────────────────────────────────────────────────
//  AI CACHE (persistent)
// ─────────────────────────────────────────────────────────────────────────────

function getCachedAiResponse(promptHash) {
  const db = getDb();
  const row = db.prepare(`
    SELECT response_txt FROM ai_cache WHERE prompt_hash = ?
  `).get(promptHash);
  return row ? row.response_txt : null;
}

function setCachedAiResponse(promptHash, responseTxt) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO ai_cache (prompt_hash, response_txt, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(promptHash, responseTxt);
}

module.exports = {
  // Trips
  saveTrip, getUserTrips, getTripById, getTripByShareToken, updateTripShareToken, deleteTrip,
  // Favorites
  addFavorite, getUserFavorites, removeFavorite, isFavorite,
  // Analytics
  logApiUsage, getApiUsageSummary,
  // Place cache
  getCachedPlaces, setCachedPlaces, deleteCachedPlaces, purgeExpiredCache,
  // AI cache
  getCachedAiResponse, setCachedAiResponse,
};
