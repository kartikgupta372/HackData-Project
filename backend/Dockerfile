# Aura Design AI — Backend Dockerfile
# Supports Puppeteer (headless Chrome) on Railway / Render / any container host
#
# Deploy: push this repo to Railway → it auto-detects Dockerfile → done.
# Set all env vars from .env.example in Railway's Variables tab.

FROM node:20-slim

# ── Install Chromium + dependencies for Puppeteer ──────────────────────────────
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    wget \
    --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Ensure uploads dir exists (screenshots saved here at runtime)
RUN mkdir -p uploads

EXPOSE 3002

CMD ["node", "src/app.js"]
