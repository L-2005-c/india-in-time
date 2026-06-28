// db/queries.js — PostgreSQL queries for all database operations
// All DB access goes through these functions.

const { getDb } = require('./init');

// ─────────────────────────────────────────────────────────────────────────────
//  TRIPS
// ─────────────────────────────────────────────────────────────────────────────

async function saveTrip({ id, userId, city, cityLat, cityLon, configJson, stopsJson }) {
  const pool = getDb();
  await pool.query(`
    INSERT INTO trips (id, user_id, city, city_lat, city_lon, config_json, stops_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [id, userId || null, city, cityLat, cityLon, configJson, stopsJson]);
}

async function getUserTrips(userId, limit = 50) {
  const pool = getDb();
  const { rows } = await pool.query(`
    SELECT id, city, city_lat, city_lon, config_json, stops_json, status, share_token, created_at, updated_at
    FROM trips
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, limit]);
  return rows;
}

async function getTripById(tripId) {
  const pool = getDb();
  const { rows } = await pool.query(`SELECT * FROM trips WHERE id = $1`, [tripId]);
  return rows[0] || null;
}

async function getTripByShareToken(token) {
  const pool = getDb();
  const { rows } = await pool.query(`SELECT * FROM trips WHERE share_token = $1`, [token]);
  return rows[0] || null;
}

async function updateTripShareToken(tripId, token) {
  const pool = getDb();
  await pool.query(`UPDATE trips SET share_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [token, tripId]);
}

async function deleteTrip(tripId, userId) {
  const pool = getDb();
  await pool.query(`DELETE FROM trips WHERE id = $1 AND user_id = $2`, [tripId, userId]);
}

// ─────────────────────────────────────────────────────────────────────────────
//  FAVORITES
// ─────────────────────────────────────────────────────────────────────────────

async function addFavorite({ userId, placeName, city, lat, lon, category, notes }) {
  const pool = getDb();
  await pool.query(`
    INSERT INTO favorites (user_id, place_name, city, lat, lon, category, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id, place_name, city) DO NOTHING
  `, [userId, placeName, city, lat || null, lon || null, category || null, notes || null]);
}

async function getUserFavorites(userId, city = null) {
  const pool = getDb();
  if (city) {
    const { rows } = await pool.query(`
      SELECT * FROM favorites WHERE user_id = $1 AND city = $2 ORDER BY added_at DESC
    `, [userId, city]);
    return rows;
  }
  const { rows } = await pool.query(`
    SELECT * FROM favorites WHERE user_id = $1 ORDER BY added_at DESC
  `, [userId]);
  return rows;
}

async function removeFavorite(favoriteId, userId) {
  const pool = getDb();
  await pool.query(`DELETE FROM favorites WHERE id = $1 AND user_id = $2`, [favoriteId, userId]);
}

async function isFavorite(userId, placeName, city) {
  const pool = getDb();
  const { rows } = await pool.query(`
    SELECT 1 FROM favorites WHERE user_id = $1 AND place_name = $2 AND city = $3 LIMIT 1
  `, [userId, placeName, city]);
  return rows.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  API USAGE ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

let analyticsBuffer = [];
let analyticsFlushTimer = null;

async function flushAnalyticsBuffer() {
  if (analyticsBuffer.length === 0) return;
  const batch = [...analyticsBuffer];
  analyticsBuffer = [];
  
  try {
    const pool = getDb();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const text = `
        INSERT INTO api_usage (endpoint, method, ip, user_agent, status_code, response_ms, request_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      for (const row of batch) {
        await client.query(text, [row.endpoint, row.method, row.ip, row.userAgent, row.statusCode, row.responseMs, row.requestId]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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

async function getApiUsageSummary(hours = 24) {
  const pool = getDb();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const byEndpointRes = await pool.query(`
    SELECT endpoint, 
           COUNT(*) as total_requests,
           AVG(response_ms) as avg_ms,
           MAX(response_ms) as max_ms,
           SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as errors
    FROM api_usage
    WHERE created_at >= $1
    GROUP BY endpoint
    ORDER BY total_requests DESC
  `, [since]);

  const totalsRes = await pool.query(`
    SELECT COUNT(*) as total,
           AVG(response_ms) as avg_ms,
           SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as errors,
           SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END) as rate_limited
    FROM api_usage
    WHERE created_at >= $1
  `, [since]);

  return { period: \`\${hours}h\`, since, byEndpoint: byEndpointRes.rows, totals: totalsRes.rows[0] };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PLACE CACHE (persistent)
// ─────────────────────────────────────────────────────────────────────────────

async function getCachedPlaces(cacheKey) {
  const pool = getDb();
  const { rows } = await pool.query(`
    SELECT payload_json FROM place_cache
    WHERE cache_key = $1 AND expires_at > CURRENT_TIMESTAMP
  `, [cacheKey]);
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].payload_json);
  } catch {
    return null;
  }
}

async function setCachedPlaces(cacheKey, payload, ttlMs) {
  const pool = getDb();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await pool.query(`
    INSERT INTO place_cache (cache_key, payload_json, created_at, expires_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
    ON CONFLICT (cache_key) DO UPDATE SET 
      payload_json = EXCLUDED.payload_json,
      created_at = CURRENT_TIMESTAMP,
      expires_at = EXCLUDED.expires_at
  `, [cacheKey, JSON.stringify(payload), expiresAt]);
}

async function deleteCachedPlaces(cacheKey) {
  const pool = getDb();
  await pool.query(`DELETE FROM place_cache WHERE cache_key = $1`, [cacheKey]);
}

async function purgeExpiredCache() {
  const pool = getDb();
  const result = await pool.query(`DELETE FROM place_cache WHERE expires_at <= CURRENT_TIMESTAMP`);
  return result.rowCount;
}

// ─────────────────────────────────────────────────────────────────────────────
//  AI CACHE (persistent)
// ─────────────────────────────────────────────────────────────────────────────

async function getCachedAiResponse(promptHash) {
  const pool = getDb();
  const { rows } = await pool.query(`
    SELECT response_txt FROM ai_cache WHERE prompt_hash = $1
  `, [promptHash]);
  return rows.length > 0 ? rows[0].response_txt : null;
}

async function setCachedAiResponse(promptHash, responseTxt) {
  const pool = getDb();
  await pool.query(`
    INSERT INTO ai_cache (prompt_hash, response_txt, created_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (prompt_hash) DO UPDATE SET 
      response_txt = EXCLUDED.response_txt,
      created_at = CURRENT_TIMESTAMP
  `, [promptHash, responseTxt]);
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
