# ─────────────────────────────────────────────────────────────────────────────
# Aura Design AI — single-service production image
#
# Builds the React frontend and serves it from the Express backend, so the
# whole app runs on ONE URL: no CORS, first-party login cookies (works in
# Safari/iOS), and no proxy timeouts on streaming chat.
#
#   docker build -t aura-design .
#   docker run -p 3002:3002 --env-file backend/.env aura-design
#
# Railway / Render / Fly.io detect this Dockerfile automatically.
# ─────────────────────────────────────────────────────────────────────────────

# ── 1. Build the frontend ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Public build-time values (safe to expose). Leave VITE_API_URL empty: the
# backend serves this build on the same origin.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_API_URL="" \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

# ── 2. Runtime: Node + Chromium for the screenshot scraper ─────────────────
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      ca-certificates \
      dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3002 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    FRONTEND_DIST=/app/frontend/dist

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# Run as the unprivileged "node" user that ships with the base image.
RUN mkdir -p /app/backend/uploads && chown -R node:node /app/backend/uploads
USER node

EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# dumb-init forwards SIGTERM (graceful shutdown) and reaps Chromium zombies.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]
