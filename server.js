// ─────────────────────────────────────────────
//  India In-Time — Backend Server  (server.js)
//  ✅ Ready for Render deployment
// ─────────────────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express  = require('express');
const cors     = require('cors');
const path     = require('path');

const geocodeRoutes      = require('./routes/geocode');
const placesRoutes       = require('./routes/places');
const weatherRoutes      = require('./routes/weather');
const weatherAlertRoutes = require('./routes/weather-alerts');
const aiRoutes           = require('./routes/ai');

const app  = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'frontend', 'public');

// ── Middleware ──────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' })); // needed for base64 image uploads (AI Lens)

// ── API Routes ──────────────────────────────
app.use('/api/geocode',        geocodeRoutes);
app.use('/api/places',         placesRoutes);
app.use('/api/weather',        weatherRoutes);
app.use('/api/weather-alerts', weatherAlertRoutes);
app.use('/api/ai',             aiRoutes);

// ── Health Check ────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// ── Serve Frontend (static files) ───────────
app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    // Prevent caching for critical app shell files
    if (
      filePath.endsWith('sw.js') ||
      filePath.endsWith('client-api.js') ||
      filePath.endsWith('api.js') ||
      filePath.endsWith('manifest.json') ||
      filePath.endsWith('index.html') ||
      filePath.endsWith('logo-mark.png') ||
      filePath.endsWith('favicon-32.png') ||
      filePath.endsWith('apple-touch-icon.png') ||
      filePath.endsWith('icon-192.png') ||
      filePath.endsWith('icon-512.png')
    ) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ── SPA fallback ─────────────────────────────
// Only send index.html for navigation requests, not missing assets
app.get('*', (_req, res) => {
  const accept = _req.headers.accept || '';
  if (accept.includes('text/html')) {
    res.sendFile(path.join(publicDir, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Start Server ─────────────────────────────
// Render sets PORT automatically. Locally defaults to 3000.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀  India In-Time API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
