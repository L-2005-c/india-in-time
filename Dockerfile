# syntax=docker/dockerfile:1

# ── Build stage ───────────────────────────────────────────────────────────
# package.json pins "engines": { "node": "20.x" } — match it exactly rather
# than floating on "node:20" so a future 20.x patch bump doesn't silently
# change behavior between local dev and this image.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
# Production-only deps here; nodemon (devDependency) never ships in the image.
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as a non-root user rather than the image's default root.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/node_modules ./node_modules
COPY . .

# frontend/public is served as static files by server.js (config.publicDir) —
# no separate build step exists for it (plain JS/CSS/HTML, no bundler), so
# there's nothing to compile here beyond installing backend deps above.

USER appuser

# config/index.js defaults PORT to 3000 if unset; server.js binds 0.0.0.0.
EXPOSE 3000

# Reuses the app's own /api/health endpoint (server.js) rather than a
# separate healthcheck script — one source of truth for "is this healthy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
