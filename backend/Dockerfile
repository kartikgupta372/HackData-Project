# Backend-only image (use when the frontend is hosted separately, e.g. on Vercel).
# For the recommended single-service deploy use the Dockerfile in the repo root.
FROM node:22-bookworm-slim

# Chromium + fonts for the Puppeteer screenshot scraper.
# (The previous image listed libappindicator3-1, which no longer exists in
#  Debian bookworm, so the build failed at apt-get.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-noto-color-emoji ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3002 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .
RUN mkdir -p uploads && chown -R node:node uploads
USER node

EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]
