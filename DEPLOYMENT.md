# Aura Design AI — Deployment Guide

## Recommended setup: one service

The backend builds the frontend and serves it, so the whole app lives on **one URL**:

- no CORS setup
- login cookies are first-party, so sign-in works in Safari and on iPhone too
- streaming chat isn't cut off by a proxy timeout

```
Browser ──► https://aura.yourdomain.com ──► Express (API + built React app) ──► Supabase
                                               └─ Chromium (screenshots)    └─► Groq (AI)
```

Host it anywhere that runs a Dockerfile and keeps a process running: **Railway, Render or Fly.io**.
**Don't put the backend on Vercel.** It needs Chromium, long-running streaming responses and
background work after a response is sent, and Vercel's serverless functions support none of these.
(The root `vercel.json` that uses `experimentalServices` won't work for this backend.)

---

## 1. Database (Supabase): do this first

In Supabase, open **SQL Editor** and run these files in order. Each one is safe to run more than once.

1. `backend/src/db/migrations/001_schema.sql`
2. `backend/src/db/migrations/002_missing_tables.sql`
3. `backend/src/db/migrations/003_exec_sql_functions.sql`
4. `backend/src/db/migrations/004_production_hardening.sql` ← **required**

If `DATABASE_URL` works from your machine, you can run `cd backend && npm run migrate` instead.

When the backend starts it checks the schema. If it logs `Database schema is v… needs v4`, migration 004 hasn't been run yet.

## 2. Deploy on Railway (or Render)

1. Push the repo to GitHub.
2. **Railway:** New Project → Deploy from GitHub repo → choose this repo. It finds the root `Dockerfile` automatically.
   **Render:** New → Web Service → Runtime: Docker → Dockerfile path `./Dockerfile`, health check path `/health`.
3. Add these variables (the full list with notes is in `backend/.env.example`):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` |
| `DATABASE_URL` | optional, Supabase → Settings → Database → pooler string |
| `JWT_SECRET` | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `GROQ_API_KEY` | console.groq.com |
| `STORAGE_DRIVER` | `supabase` (the default in production; screenshots survive redeploys) |
| `GOOGLE_CLIENT_ID` | only if you use Google sign-in |

Railway and Render set `PORT` for you. To enable Google sign-in in the UI, also add a **build argument**
`VITE_GOOGLE_CLIENT_ID` (Railway: add it as a variable; Render: Docker build args).

4. Deploy, then open `https://<your-app>/health/ready`. You should see `"status":"ready"`.
5. If you use Google sign-in, add your domain to the OAuth client's **Authorized JavaScript origins** in Google Cloud Console.

## Alternative: frontend on Vercel, backend on Railway

Only use this if you need it.

- Vercel project **Root Directory** = `frontend` (it uses `frontend/vercel.json`).
- Vercel env: `VITE_API_URL=https://<your-railway-backend>`, plus `VITE_GOOGLE_CLIENT_ID` if needed.
- Railway env: `FRONTEND_URL=https://<your-vercel-app>`, `COOKIE_SAMESITE=none`.
- Known limitation: Safari blocks cross-site cookies, so Safari and iPhone users can't stay signed in. A custom
  domain with both apps on subdomains of it (`app.` and `api.`) avoids this.

## Local development

```bash
cd backend  && npm install && npm run dev     # http://localhost:3002
cd frontend && npm install && npm run dev     # http://localhost:5174 (proxies the API)
```

Or run `start.ps1` on Windows. To try the production build locally, run `cd frontend && npm run build`,
then start the backend. It serves the app at http://localhost:3002.

## Operations

- `GET /health`: liveness (no DB access)
- `GET /health/ready`: checks the DB connection (use for uptime monitors)
- AI models are set by env (`GROQ_CHAT_MODEL`, `GROQ_VISION_MODEL`). If Groq retires a model, the backend switches
  to `GROQ_FALLBACK_MODELS` and logs a warning. Update the variable when you see it.
- `MAX_CONCURRENT_SCRAPES` (default 2) caps how many Chromium instances run at once. Each one uses about 200–300 MB of RAM,
  so give the service at least 1 GB.
