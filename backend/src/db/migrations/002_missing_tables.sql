-- ============================================================
-- AURA DESIGN AI — Migration 002: Missing Tables
-- Paste into Supabase → SQL Editor → Run
-- ============================================================

-- ── Add onboarding columns to users ──────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_data      JSONB   DEFAULT NULL;

-- ── Fix heatmap_summaries: add missing columns ────────────────
ALTER TABLE heatmap_summaries
  ADD COLUMN IF NOT EXISTS grid_data       JSONB,
  ADD COLUMN IF NOT EXISTS hot_zones       JSONB,
  ADD COLUMN IF NOT EXISTS attention_path  JSONB,
  ADD COLUMN IF NOT EXISTS above_fold_pct  FLOAT   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS predicted       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_updated    TIMESTAMPTZ DEFAULT NOW();

-- Rename updated_at → last_updated if old column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='heatmap_summaries' AND column_name='updated_at'
  ) THEN
    ALTER TABLE heatmap_summaries RENAME COLUMN updated_at TO last_updated;
  END IF;
END $$;

-- ── Gaze Sessions (eye-tracking / legacy heatmap) ─────────────
CREATE TABLE IF NOT EXISTS gaze_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url            TEXT NOT NULL,
  page_key            VARCHAR(500) NOT NULL,
  page_url            TEXT,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  participant_id      VARCHAR(255),
  device_width        INTEGER DEFAULT 1280,
  device_height       INTEGER DEFAULT 800,
  webcam_used         BOOLEAN DEFAULT false,
  completed           BOOLEAN DEFAULT false,
  session_duration_ms INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gaze_sessions_site ON gaze_sessions(site_url, page_key);

-- ── Gaze Events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gaze_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES gaze_sessions(id) ON DELETE CASCADE,
  x_pct        FLOAT NOT NULL,
  y_pct        FLOAT NOT NULL,
  timestamp_ms INTEGER DEFAULT 0,
  confidence   FLOAT  DEFAULT 1.0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gaze_events_session ON gaze_events(session_id);

-- ── Heatmap Survey Links ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS heatmap_survey_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  site_url          TEXT NOT NULL,
  page_key          VARCHAR(500) NOT NULL,
  page_url          TEXT,
  token             VARCHAR(255) UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  screenshot_url    TEXT,
  screenshot_width  INTEGER DEFAULT 1280,
  screenshot_height INTEGER DEFAULT 3000,
  title             VARCHAR(500),
  instructions      TEXT,
  is_active         BOOLEAN DEFAULT true,
  response_count    INTEGER DEFAULT 0,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_survey_links_user    ON heatmap_survey_links(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_links_token   ON heatmap_survey_links(token);
CREATE INDEX IF NOT EXISTS idx_survey_links_site    ON heatmap_survey_links(site_url);

-- ── Survey Click Events ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_click_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id      UUID REFERENCES heatmap_survey_links(id) ON DELETE CASCADE,
  participant_id VARCHAR(255),
  x_pct          FLOAT NOT NULL,
  y_pct          FLOAT NOT NULL,
  click_order    INTEGER DEFAULT 1,
  timestamp_ms   INTEGER,
  device_type    VARCHAR(20) DEFAULT 'desktop',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_click_events_survey ON survey_click_events(survey_id);

-- ── Heatmap Bundles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS heatmap_bundles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  site_url    TEXT NOT NULL,
  bundle_name VARCHAR(500),
  page_keys   TEXT[],
  bundle_data JSONB DEFAULT '{}',
  ai_summary  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bundles_user ON heatmap_bundles(user_id);

-- ── Recommendation Cards ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendation_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  site_url        TEXT NOT NULL,
  site_type       VARCHAR(50),
  page_key        VARCHAR(500),
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  change_type     VARCHAR(50),
  element_target  TEXT,
  before_snippet  TEXT,
  after_snippet   TEXT,
  inspired_by     VARCHAR(200),
  inspired_url    TEXT,
  design_law      VARCHAR(50),
  impact_level    VARCHAR(20) DEFAULT 'medium',
  status          VARCHAR(30) DEFAULT 'pending',
  decided_at      TIMESTAMPTZ,
  agent_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_cards_user   ON recommendation_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_rec_cards_site   ON recommendation_cards(site_url);
CREATE INDEX IF NOT EXISTS idx_rec_cards_status ON recommendation_cards(status);

-- ── Insight Cards ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insight_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  site_url        TEXT NOT NULL,
  page_key        VARCHAR(500),
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  insight_type    VARCHAR(50) DEFAULT 'general',
  element_target  TEXT,
  severity        VARCHAR(20) DEFAULT 'medium',
  evidence        TEXT,
  recommendation  TEXT,
  status          VARCHAR(30) DEFAULT 'new',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insight_cards_user   ON insight_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_insight_cards_site   ON insight_cards(site_url);
CREATE INDEX IF NOT EXISTS idx_insight_cards_status ON insight_cards(status);

-- ── User Profile (recommendation engine) ─────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_laws      TEXT[],
  preferred_styles    TEXT[],
  interaction_history JSONB DEFAULT '[]',
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Scraped Pages index fix ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scraped_pages_session ON scraped_pages(session_id);
CREATE INDEX IF NOT EXISTS idx_scraped_pages_site    ON scraped_pages(site_url);

-- ── RLS: Disable for service key (already set in Supabase) ───
-- No RLS needed since we use service key only on backend.
-- If you enable RLS in future, add policies here.

-- ============================================================
-- Run complete. All tables created.
-- ============================================================
