import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  // Static assets (icons, manifest.json, sw.js, admin-feedback.html, ...) stay in
  // frontend/public/ and are served by Express directly (see server.js) — both in
  // dev (Vite serves this same dir at "/") and in prod (Express's fallback static
  // handler). copyPublicDir:false keeps `vite build` from also copying them into
  // dist/, which would just duplicate files Express already serves from the source
  // location.
  publicDir: path.resolve(__dirname, '../public'),
  build: {
    outDir: path.resolve(__dirname, '../public/dist'),
    emptyOutDir: true,
    copyPublicDir: false,
  },
  server: {
    port: 5173,
    proxy: {
      // Local dev: `vite dev` serves the frontend on :5173, the Express API
      // server runs separately (npm run dev) on :3000 — proxy /api so the
      // frontend can call relative paths exactly like it does in prod.
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
