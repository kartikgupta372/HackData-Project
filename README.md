# AuraDesign.AI

> **AI-powered UI/UX design analyst that scrapes your website, generates heatmaps, compares you against top industry benchmarks, and gives you a prioritised list of changes — each one approvable with a single click that opens a ready-to-code AI chat session.**

---

## Pitch

Most website owners know their site "looks off" but can't articulate why — and hiring a UX consultant costs thousands. Tools like Hotjar give you raw data but no diagnosis. Figma plugins give you design help but no real-world usage data.

**AuraDesign.AI closes the gap.**

You paste a URL. Within 30 seconds we've taken full-page screenshots of every page, scraped the DOM, and run it through design-law analysis (Fitts's Law, Gestalt, F-Pattern, Visual Hierarchy, Hick's Law). We compare your site against the top 5–6 benchmark sites in your industry — Stripe for SaaS, Shopify for e-commerce, Linear for productivity tools. We surface the specific gaps and generate actionable "change cards" ranked by business impact.

You approve a card. A chat session opens pre-loaded with a structured implementation prompt: what the benchmark does, what you're missing, and a request for copy-paste HTML/CSS. You can also generate a "Vibe-Coding Prompt" — a single document you paste into Cursor or GitHub Copilot to apply multiple changes at once.

And while all this is happening, real users are clicking through your heatmap survey link. Their attention data feeds back into the AI's recommendations automatically.

**The whole loop — audit → benchmark comparison → approval → implementation → real user validation — in one product.**

---

## Feature Overview

| Feature | What it does |
|---|---|
| **AI Chatbot** | Streaming UX consultant. Knows your site, scraped pages, heatmap data, and full conversation history. Powered by Llama 4 (Groq, free) with Gemini fallback. |
| **Heatmap Studio** | Takes full-page screenshots, generates shareable survey links, collects click data from real users, auto-computes attention heatmaps at 5/10/20 responses. |
| **Insight Engine** | Auto-generates UX finding cards from heatmap + page data. Severity-ranked (Critical/High/Medium/Low). One-click to discuss in chat. |
| **Recommendations** | Compares any website against top industry benchmarks using AI. Generates approve/reject change cards with Before/After, design law, and benchmark source. Approve → instant chat session with implementation prompt. |
| **Vibe-Coding Prompt** | Select multiple approved cards → generate one copy-paste prompt for Cursor/Copilot/any AI coding tool. |
| **Benchmark RAG** | Pinecone vector search over curated benchmark sites. Falls back to Supabase DB if Pinecone index is empty. |

---

## Tech Stack

```
Frontend          React 18 + Vite + Tailwind CSS + Zustand + TanStack Query + Framer Motion
Backend           Node.js + Express (CommonJS)
Database          Supabase (PostgreSQL + REST API via service key)
AI — Chat         Groq API (llama-4-scout-17b, free 14.4k req/day) + Gemini 2.0 Flash fallback
AI — Recs/Insight Groq API (same model, zero quota issues)
Scraping          Puppeteer (headless Chrome, full-page screenshots)
Vector Search     Pinecone (benchmark site embeddings via Gemini embedding-001)
Auth              JWT in HttpOnly cookie (7-day expiry)
File Uploads      Multer (brand assets, 10MB, 5 files max)
```

---

## Architecture

```
Browser (localhost:5173)
  │
  ├── /auth /chat /heatmap /recommendations /insights /onboarding /uploads
  │          ↓  Vite proxy in dev (no CORS, cookies work)
  └── Backend (localhost:3002)
        │
        ├── Supabase REST API ──── 21 tables (users, sessions, messages,
        │                          scraped_pages, heatmap_summaries,
        │                          recommendation_cards, insight_cards, ...)
        │
        ├── Groq API ─────────── llama-4-scout (chat stream + recommendations)
        ├── Gemini API ─────────── fallback for chat, embeddings for Pinecone
        ├── Pinecone ───────────── benchmark vector search
        └── Puppeteer ──────────── full-page screenshot + DOM scrape
```

---

## User Flow

```
1. Register / Login
       ↓
2. Onboarding  →  set website URL, domain type, goal, visual style, upload brand docs
       ↓
3. Chatbot  →  paste URL → auto-scrapes → AI analyses → full UX audit streamed live
       ↓                        ↑ heatmap context injected automatically
4. Heatmap Studio
   → New Survey → screenshot captured → shareable link generated
   → Share with users → they click where they look
   → Auto-computes heatmap at 5/10/20 responses
   → Bundle pages → Send to Chat for AI analysis
       ↓
5. Insight Engine
   → Generate Insights → AI reads heatmap + scraped data → severity-ranked findings
   → Discuss in Chat / Mark reviewed
       ↓
6. Recommendations
   → Enter any URL + domain type → AI compares vs top benchmarks
   → Approve card → Chat opens with full implementation prompt
   → Reject card → tracked for preference learning
   → Select multiple → Generate Vibe-Coding Prompt → paste into Cursor
```

---

## Key Code Highlights

### 1. Groq-powered streaming chat with Gemini fallback
`backend/src/routes/chat.routes.js`
```js
// Try Gemini first, silently switch to Groq on quota error
try {
  const streamResult = await chat.sendMessageStream(message);
  for await (const chunk of streamResult.stream) {
    const token = chunk.text();
    if (token) { fullResponse += token; emit('token', { token }); }
  }
} catch (streamErr) {
  if (isQuotaError(streamErr)) {
    console.log('[Chat] Gemini quota hit — falling back to Groq');
    fullResponse = await streamWithGroq(systemPrompt, chatHistory, message, emit);
  } else {
    throw streamErr;
  }
}
```

### 2. Heatmap grid computation from real click data
`backend/src/routes/heatmap.routes.js`
```js
// Gaussian kernel over 20x20 grid, first clicks weighted 4x
for (const c of clicks) {
  const cx = Math.min(19, Math.floor(c.x_pct * 20));
  const cy = Math.min(19, Math.floor(c.y_pct * 20));
  const weight = c.click_order === 1 ? 4.0 : c.click_order === 2 ? 2.5 : 1.0;
  for (let r = 0; r < 20; r++)
    for (let col = 0; col < 20; col++)
      grid[r][col] += weight * Math.exp(-((col-cx)**2 + (r-cy)**2) / (2*1.5*1.5));
}
```

### 3. Benchmark comparison prompt (Recommendations)
`backend/src/routes/recommendation.routes.js`
```js
// Loads onboarding data automatically — no need to pass from frontend
const ob = await loadOnboarding(req.user.id);
const siteUrl  = req.body.siteUrl || ob?.url;
const siteType = req.body.siteType || DOMAIN_TO_TYPE[ob?.domain] || 'saas';
const intent   = INTENT_LABELS[ob?.intent] || 'improve design';
const style    = ob?.style_preference || '';

// Fetch top 6 benchmark sites for this domain
const benchmarks = await searchBenchmarks({ siteType, designStyle: style, topK: 6 });

// AI generates cards: gap between client site and each benchmark
// Each card: title, before/after, design law, inspired_by, impact_level
```

### 4. Approve card → rich implementation prompt sent to chat
`backend/src/routes/recommendation.routes.js`
```js
const implPrompt =
  `I have approved a design recommendation for **${card.site_url}**...\n\n` +
  `**What needs to change:** ${card.element_target} on the ${card.page_key} page\n\n` +
  `**Benchmark inspiration:** This is inspired by **${card.inspired_by}**\n` +
  `${card.inspired_by} achieves this by: ${card.after_snippet}\n\n` +
  `**Design principle:** ${card.design_law.toUpperCase()}\n\n` +
  `Please generate complete HTML/CSS. Preserve my brand colors. Copy-paste ready.`;
// Saves as first message in a new chat session → opens ready to code
```

### 5. System prompt with full site context
`backend/src/routes/chat.routes.js`
```js
// Every message carries: onboarding data + scraped pages + heatmap + style + docs
function buildSystemPrompt(onboarding, scrapedPages, siteUrl, sessionFormData, heatmapContext) {
  // Includes: site URL, domain type, goal, style preference, uploaded docs
  // + DOM summaries of every scraped page
  // + heatmap attention data (above-fold %, hot zones, confidence level)
  // = AI knows everything about the site without user repeating themselves
}
```

### 6. Full-page Puppeteer scraper
`backend/src/tools/scraper.tool.js`
```js
// fullPage: true → scrolls to bottom, triggers lazy images, screenshots entire page
// Used for heatmap surveys (long screenshots for click mapping)
if (fullPage) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: ssPath, fullPage: true });
}
// On failure: survey still created, user informed, link still works
```

---

## Database — 21 Supabase Tables

```
users                    auth + onboarding_data (JSONB: url, domain, intent, style, docs)
chat_sessions            thread metadata, site_url, design_prefs
chat_messages            full conversation history (role, content, metadata)
scraped_pages            DOM summary, screenshot_url, element_count, has_cta
heatmap_summaries        grid_data (20x20 JSONB), hot_zones, above_fold_pct, confidence
heatmap_survey_links     shareable token, screenshot_url, response_count
survey_click_events      x_pct, y_pct, click_order, device_type per participant
heatmap_bundles          grouped pages, ai_summary, bundle_data
recommendation_cards     title, before/after snippets, design_law, inspired_by, status
insight_cards            severity, evidence, recommendation, insight_type
user_interactions        action tracking for preference learning
user_preference_profiles preferred_laws, preferred_styles learned from approvals
benchmark_sites          curated benchmark DB (Pinecone fallback)
design_analyses          per-page scores (fitts, gestalt, fpattern, hierarchy, contrast)
page_rankings            composite score for recommendation personalisation
gaze_sessions / gaze_events  legacy eye-tracking support
```

---

## Setup & Running

### Prerequisites
- Node.js ≥ 20
- A Supabase project
- Groq API key (free at console.groq.com)
- Gemini API key (free at aistudio.google.com)

### Install
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### Environment — `backend/.env`
```env
PORT=3002
NODE_ENV=development

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
DATABASE_URL=postgresql://postgres.YOUR_PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
JWT_SECRET=your_32_char_secret

GROQ_API_KEY=gsk_your_groq_key          # primary LLM — free 14,400 req/day
GEMINI_API_KEY=your_gemini_key          # fallback chat + embeddings

PINECONE_API_KEY=your_pinecone_key      # optional — vector benchmark search
PINECONE_INDEX_BENCHMARKS=aura-benchmarks

FRONTEND_URL=http://localhost:5173
```

### Run
```bash
# Option 1: one command (Windows)
start.bat

# Option 2: two terminals
cd backend && npm run dev      # nodemon, port 3002
cd frontend && npm run dev     # Vite HMR, port 5173
```

Then open: **http://localhost:5173**

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login, sets HttpOnly cookie |
| POST | `/chat/sessions` | Create chat session + background scrape |
| POST | `/chat/message` | SSE streaming chat (Groq/Gemini) |
| POST | `/heatmap/screenshot` | Full-page Puppeteer screenshot |
| POST | `/heatmap/create-survey` | Generate shareable heatmap survey link |
| GET | `/heatmap/survey/:token` | Public — get survey data |
| POST | `/heatmap/survey/:token/submit` | Public — submit click events |
| POST | `/heatmap/compute/:token` | Compute heatmap grid from clicks |
| POST | `/heatmap/bundle` | Bundle pages + AI summary |
| POST | `/recommendations/generate-cards` | AI benchmark comparison cards |
| POST | `/recommendations/cards/:id/action` | Approve/reject card |
| POST | `/recommendations/cards/:id/discuss` | Open discussion chat |
| POST | `/recommendations/vibe-prompt` | Generate Vibe-Coding Prompt doc |
| POST | `/insights/generate` | Generate UX insight cards |
| GET | `/insights` | List insights by status/severity |
| POST | `/onboarding/submit` | Save onboarding preferences |
| POST | `/onboarding/upload-documents` | Upload brand assets (Multer) |

---

## What Was Built — Development Log

All bugs fixed and features implemented across this session:

**Bugs Fixed**
- Chat flow reset on every message → persistent sessions with 40-message history
- Form data not passed to chatbot → `sessionFormData` injected into system prompt
- Chatbot outputting code comments and meta-text → `sanitizeChatResponse()` filter
- LangGraph agent removed → direct Gemini/Groq streaming, no overhead
- Screenshots viewport-only → `fullPage: true` for heatmap surveys
- Heatmap context not reaching chatbot → `loadHeatmapContext()` injected into prompt
- Recommendations not sorted by priority → JS sort `high → medium → low`
- Landing page auto-analysis not firing → `useEffect` ordering bug (TDZ) fixed
- Today filter wrong timezone → IST-aware midnight calculation for `?since=today`
- Rate limiter too tight (10/min) → 100 per 15 minutes
- Screenshot failure blocked survey creation → graceful fallback, survey still created
- `\uXXXX` unicode escapes rendering as literal text in JSX → replaced with HTML entities
- `scraper.tool.js` duplicate tail code → syntax error crash fixed
- `chat.routes.js` corrupted with two `router.post('/message')` handlers → full rewrite

**Features Built**
- Onboarding style preference selector (6 styles)
- Document upload for brand assets (Multer, 5 files, 10MB)
- Insight Engine (generate/list/discuss/dismiss)
- Recommendations: multi-select, approve/reject, Discuss/Rectify/Vibe-Coding Prompt
- Heatmap responses table showing all collected click events
- Retry button on quota errors in chat
- Groq as primary LLM across all 4 AI routes (chat, recs, insights, heatmap)
- Gemini auto-fallback in chat when Groq isn't sufficient
- Recommendations URL input — analyse any site, not just onboarding URL

---

## Project Structure

```
AuraDesign.AI/
├── backend/
│   ├── src/
│   │   ├── app.js                    # Express server, route registration
│   │   ├── routes/
│   │   │   ├── auth.routes.js        # Register, login, logout, /me
│   │   │   ├── chat.routes.js        # SSE streaming chat, session management
│   │   │   ├── heatmap.routes.js     # Screenshots, surveys, bundles, compute
│   │   │   ├── recommendation.routes.js  # Card generation, approve/reject, vibe-prompt
│   │   │   ├── insights.routes.js    # UX insight cards
│   │   │   └── onboarding.routes.js  # Preferences, file upload
│   │   ├── tools/
│   │   │   ├── scraper.tool.js       # Puppeteer full-page scraper
│   │   │   ├── heatmap.tool.js       # Heatmap aggregation helpers
│   │   │   ├── vectorSearch.tool.js  # Pinecone benchmark search
│   │   │   └── recommendation.tool.js # Preference learning engine
│   │   ├── memory/
│   │   │   └── chatMemory.js         # Session CRUD, message storage
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js    # JWT verification
│   │   │   └── upload.middleware.js  # Multer config
│   │   └── db/
│   │       ├── pool.js               # Supabase client + pg pool
│   │       └── migrations/           # SQL migration files
│   └── uploads/                      # Screenshots served at /uploads
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── chat/                 # ChatView, MessageList, MessageBubble
│       │   ├── heatmap/              # HeatmapView, survey creation modal
│       │   ├── recommendations/      # RecommendationsView, cards, vibe modal
│       │   ├── insights/             # InsightsView
│       │   ├── onboarding/           # OnboardingForm
│       │   └── layout/               # AppShell, Sidebar, FeatureSwitcher
│       ├── api/                      # axios wrappers per feature
│       ├── store/                    # Zustand (auth, chat, ui)
│       └── pages/                    # App, Landing, Login, Register, Survey
│
├── start.bat                         # One-click launch (kills ports, starts both)
└── README.md                         # This file
```

---

*Built with Node.js, React, Supabase, Groq (Llama 4), Gemini, Puppeteer, Pinecone.*
