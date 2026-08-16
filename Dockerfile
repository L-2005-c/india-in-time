# syntax=docker/dockerfile:1

# ── Dependencies stage (production-only, ships into the runtime image) ────
# package.json pins "engines": { "node": "20.x" } — match it exactly rather
# than floating on "node:20" so a future 20.x patch bump doesn't silently
# change behavior between local dev and this image.
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
# Production-only deps here; nodemon/esbuild/clean-css-cli (devDependencies)
# never ship in the runtime image.
RUN npm ci --omit=dev

# ── Frontend build stage (needs devDependencies: esbuild, clean-css-cli) ──
# config.resolveIndexHtmlPath() already knows how to serve
# frontend/public/dist/ automatically in production when it exists (see
# config/index.js) — the only piece that was missing was actually running
# `npm run build:frontend` as part of the deploy itself, rather than relying
# on someone to remember to run it by hand. This stage does that: full
# `npm ci` (devDependencies included, needed for esbuild/clean-css-cli),
# then the build script, and only its *output* (frontend/public/dist/) is
# copied into the runtime stage below — the devDependencies used to produce
# it never reach the final image.
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build:frontend

# ── Runtime stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as a non-root user rather than the image's default root.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Minified, content-hashed frontend bundle — overwrites the empty/absent
# frontend/public/dist/ from the plain `COPY . .` above with the real build
# output. The source frontend under frontend/app-src is never modified by the
# build (see scripts/build-frontend.js), so this is purely additive.
COPY --from=frontend-build /app/frontend/public/dist ./frontend/public/dist

USER appuser

# config/index.js defaults PORT to 3000 if unset; server.js binds 0.0.0.0.
EXPOSE 3000

# Reuses the app's own /api/health endpoint (server.js) rather than a
# separate healthcheck script — one source of truth for "is this healthy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
