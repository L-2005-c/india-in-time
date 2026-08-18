import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  // Root base so absolute paths in index.html stay at site root:
  //   /logo-mark.png, /client-api.js, /manifest.json, /favicon-32.png
  // Vite emits hashed bundles at /assets/* which Express serves from
  // frontend/public/dist/assets (see server.js app.use('/assets', ...)).
  // Previous base '/dist/' rewrote those public assets to /dist/logo-mark.png
  // etc., which 404'd in production and left window.API undefined.
  base: '/',
  publicDir: path.resolve(__dirname, '../public'),
  build: {
    outDir: path.resolve(__dirname, '../public/dist'),
    emptyOutDir: true,
    // Do not copy entire public/ into dist/ (would nest dist/dist and
    // duplicate files Express already serves from public/).
    copyPublicDir: false,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
