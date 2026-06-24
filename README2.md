# AuraDesign.AI — Production Changes & Deployment Guide

> All changes made to make this project deployable. Written in plain English.

---

## What Was Broken (and Fixed)

### 1. Login cookies didn't work cross-domain
**Problem:** The auth cookie (`aura_token`) was set with `sameSite: 'lax'`. This works when frontend and backend are on the same domain (localhost), but fails in production when frontend is on Vercel and backend is on Railway — two different domains.

**Fix:** Changed `sameSite` to `'none'` in production mode. When `NODE_ENV=production`, cookies now use `sameSite: 'none'` which allows cross-domain. In dev mode it stays `'lax'` so nothing breaks locally. Fixed in both `login` and `logout` routes.

**File changed:** `backend/src/routes/auth.routes.js`

---

### 2. Rate limiting was using the wrong IP
**Problem:** Railway and other cloud hosts sit behind a reverse proxy. Without `trust proxy`, Express sees `req.ip = '::ffff:127.0.0.1'` for every user — meaning everyone shares one rate limit bucket and gets blocked together.

**Fix:** Added `app.set('trust proxy', 1)` so Express reads the real IP from the `X-Forwarded-For` header.

**File changed:** `backend/src/app.js`

---

### 3. Puppeteer (screenshot scraper) crashed on cloud servers
**Problem:** Puppeteer downloads its own Chrome binary during `npm install`. This doesn't work on Railway/Docker because (a) the binary is missing system dependencies, and (b) it's slow and wasteful.

**Fix:**
- Added a `Dockerfile` that installs system Chromium and all its dependencies
- Set `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` so Puppeteer doesn't download Chrome
- Set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` so Puppeteer uses system Chrome
- Updated `scraper.tool.js` to read `PUPPETEER_EXECUTABLE_PATH` from environment

**Files created/changed:** `backend/Dockerfile`, `backend/src/tools/scraper.tool.js`

---

### 4. `vercel.json` was using an experimental format that doesn't work
**Problem:** The old `vercel.json` used `"experimentalServices"` — a format that Vercel removed. Trying to deploy would fail silently or error.

Also: the backend uses Puppeteer/Chrome which **cannot run on Vercel** (serverless, no long-lived processes, no system Chrome). Backend must be on Railway or Render.

**Fix:** Replaced `vercel.json` with a simple frontend-only config. Vercel now just builds the React/Vite frontend and serves the `dist/` folder.

**File changed:** `vercel.json`

---

### 5. No `.env.example` files (nobody knew what keys were needed)
**Fix:** Created `.env.example` files for both frontend and backend with every variable documented, what it does, and where to get the key.

**Files created:** `backend/.env.example`, `frontend/.env.example`

---

## How to Deploy

### Backend → Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select the `AuraDesign-Project/AuraDesign.AI` folder as the root **or** set the root directory to `backend/`
3. Railway will detect the `Dockerfile` and build it automatically
4. In Railway → Variables tab, add all variables from `backend/.env.example`:
   ```
   NODE_ENV=production
   PORT=3002
   SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...
   JWT_SECRET=...  (generate: openssl rand -base64 32)
   GROQ_API_KEY=...
   GEMINI_API_KEY=...
   FRONTEND_URL=https://your-vercel-app.vercel.app
   ```
5. Copy the Railway public URL (looks like `https://xxx.up.railway.app`) — you'll need it for step below

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. Set **Root Directory** to `AuraDesign.AI/` (or wherever the `vercel.json` lives)
3. In Environment Variables, add:
   ```
   VITE_API_URL=https://your-railway-backend.up.railway.app
   ```
4. Deploy. Vercel reads `vercel.json`, builds the frontend, done.

### Database → Supabase (already set up)

1. Go to your Supabase project → SQL Editor
2. Run `backend/src/db/migrations/003_exec_sql_functions.sql` **FIRST** (creates exec_sql RPC functions — without this ALL queries fail)
3. Run `backend/src/db/migrations/001_schema.sql` (creates all tables)
4. Run `backend/src/db/migrations/002_missing_tables.sql` (adds missing columns)
5. All migrations are idempotent (safe to run multiple times)

> **Critical:** Migration 003 creates the `exec_sql` and `exec_sql_write` Postgres functions that the backend's database layer calls. Every raw SQL query will fail without these.

---

## Keys You Need to Add Before Deploying

| Key | Where to get it | Required? |
|-----|-----------------|-----------|
| `SUPABASE_URL` | Supabase → Project Settings → API | ✅ Yes |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API | ✅ Yes |
| `JWT_SECRET` | Run `openssl rand -base64 32` | ✅ Yes |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) (free) | ✅ Yes |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) (free) | ✅ Yes |
| `PINECONE_API_KEY` | [pinecone.io](https://www.pinecone.io) (free tier) | Optional |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 | Optional (Google login) |
| `VITE_API_URL` | Your Railway backend URL | ✅ Yes (frontend) |
| `FRONTEND_URL` | Your Vercel frontend URL | ✅ Yes (backend CORS) |

---

## Local Dev (unchanged — still works as before)

```bash
# Terminal 1 — backend
cd backend
npm install
# Edit .env with your keys
npm run dev     # → http://localhost:3002

# Terminal 2 — frontend
cd frontend
npm install
# VITE_API_URL stays empty in .env (Vite proxy handles it)
npm run dev     # → http://localhost:5174
```

---

*Changes made by Claude on 2026-06-02*
