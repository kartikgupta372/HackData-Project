-- ============================================================
-- AURA DESIGN AI — Full Database Schema
-- Paste this entire file into Supabase → SQL Editor → Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan          VARCHAR(20) DEFAULT 'free',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Chat Sessions (one thread per analysis) ──────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  thread_id       VARCHAR(255) UNIQUE NOT NULL,
  title           VARCHAR(500) DEFAULT 'New Analysis',
  status          VARCHAR(30) DEFAULT 'active',
  site_url        TEXT,
  site_type       VARCHAR(50),
  design_prefs    JSONB DEFAULT '{}',
  analysis_stage  VARCHAR(50) DEFAULT 'idle',
  last_active_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id     ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_thread_id   ON chat_sessions(thread_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON chat_sessions(last_active_at DESC);

-- ── Chat Messages (full history per session) ─────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  thread_id     VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL,       -- user | assistant | system | tool
  content       TEXT NOT NULL,
  content_type  VARCHAR(30) DEFAULT 'text', -- text | analysis_result | code_diff
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id  ON chat_messages(thread_id);

-- ── Scraped Pages (cached DOM per page) ──────────────────────
CREATE TABLE IF NOT EXISTS scraped_pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  site_url        TEXT NOT NULL,
  page_key        VARCHAR(500) NOT NULL,
  page_url        TEXT NOT NULL,
  page_type       VARCHAR(50),
  raw_html        TEXT,
  computed_css    TEXT,
  dom_summary     TEXT,
  screenshot_url  TEXT,
  element_count   INTEGER,
  has_cta         BOOLEAN DEFAULT false,
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, page_key)
);

-- ── Design Analyses (per-page agent output) ──────────────────
CREATE TABLE IF NOT EXISTS design_analyses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  page_key            VARCHAR(500) NOT NULL,
  score_fitts         SMALLINT,
  score_hicks         SMALLINT,
  score_gestalt       SMALLINT,
  score_fpattern      SMALLINT,
  score_hierarchy     SMALLINT,
  score_typography    SMALLINT,
  score_contrast      SMALLINT,
  score_overall       SMALLINT,
  critique_text       TEXT,
  discrepancies       JSONB,
  recommendations     JSONB,
  heatmap_insights    TEXT,
  enhanced_html       TEXT,
  enhanced_css        TEXT,
  diff_summary        TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analyses_session_id ON design_analyses(session_id);

-- ── Benchmark Sites (for RAG comparison) ─────────────────────
CREATE TABLE IF NOT EXISTS benchmark_sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(200) NOT NULL,
  url             TEXT NOT NULL,
  site_type       VARCHAR(50) NOT NULL,
  description     TEXT,
  design_notes    TEXT,
  tags            TEXT[],
  awwwards_score  FLOAT,
  added_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_site_type ON benchmark_sites(site_type);

-- ── Heatmap Summaries (from Feature 2 tracking tag) ──────────
CREATE TABLE IF NOT EXISTS heatmap_summaries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url              TEXT NOT NULL,
  page_key              VARCHAR(500) NOT NULL,
  session_count         INTEGER DEFAULT 0,
  confidence_level      VARCHAR(20) DEFAULT 'low',
  primary_attention_x   FLOAT,
  primary_attention_y   FLOAT,
  cta_engagement_rate   FLOAT,
  scroll_falloff_fold   INTEGER,
  first_5s_zones        JSONB,
  summary_text          TEXT,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_url, page_key)
);

-- ── LangGraph Checkpoint Tables (DO NOT MODIFY) ───────────────
CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id               TEXT NOT NULL,
  checkpoint_ns           TEXT NOT NULL DEFAULT '',
  checkpoint_id           TEXT NOT NULL,
  parent_checkpoint_id    TEXT,
  type                    TEXT,
  checkpoint              JSONB NOT NULL,
  metadata                JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS checkpoint_blobs (
  thread_id     TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  channel       TEXT NOT NULL,
  version       TEXT NOT NULL,
  type          TEXT NOT NULL,
  blob          BYTEA,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

CREATE TABLE IF NOT EXISTS checkpoint_writes (
  thread_id     TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id       TEXT NOT NULL,
  idx           INTEGER NOT NULL,
  channel       TEXT NOT NULL,
  type          TEXT,
  blob          BYTEA NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- ── Seed: Benchmark Sites ─────────────────────────────────────
INSERT INTO benchmark_sites (name, url, site_type, description, design_notes, tags) VALUES
('Stripe',   'https://stripe.com',    'saas',       'Payment infrastructure', 'Perfect visual hierarchy, F-pattern homepage, minimal cognitive load, strong CTA placement', ARRAY['minimal','conversion-focused','strong-hierarchy']),
('Linear',   'https://linear.app',    'saas',       'Project management tool', 'Dark theme mastery, Gestalt proximity in feature grid, tight typographic scale', ARRAY['dark-theme','modern','developer-focused']),
('Vercel',   'https://vercel.com',    'saas',       'Frontend cloud platform', 'Electric dark aesthetic, scannable hero, developer-friendly language', ARRAY['dark-theme','technical','modern']),
('Shopify',  'https://shopify.com',   'ecommerce',  'E-commerce platform', 'Fitts-optimised CTAs, clear value hierarchy, strong social proof placement', ARRAY['ecommerce','conversion-focused','mobile-first']),
('ASOS',     'https://asos.com',      'ecommerce',  'Fashion retailer', 'High-density product grid, strong visual salience, excellent mobile UX', ARRAY['ecommerce','fashion','high-density']),
('Apple',    'https://apple.com',     'ecommerce',  'Consumer electronics', 'Rule of thirds mastery, cinematic heroes, premium minimalism', ARRAY['premium','minimal','cinematic']),
('Notion',   'https://notion.so',     'saas',       'All-in-one workspace', 'Whitespace mastery, Gestalt grouping in features, strong F-pattern layout', ARRAY['minimal','clean','product-showcase']),
('Figma',    'https://figma.com',     'saas',       'Design tool', 'Colorful but controlled, strong hierarchy, community-forward design', ARRAY['colorful','modern','creative'])
ON CONFLICT DO NOTHING;
