-- ============================================================================
-- 004 — Production hardening
--
-- Safe to run more than once. Run AFTER 001, 002 and 003 (or on its own if
-- those already ran). In Supabase: SQL Editor → paste this file → Run.
--
-- What it does
--   1. Creates the tables the code uses but no migration created
--      (user_interactions, user_preference_profiles, page_rankings).
--   2. Replaces exec_sql / exec_sql_write:
--        • INSERT/UPDATE/DELETE … RETURNING now works (it used to fail with
--          "syntax error at or near INTO", which broke creating chat sessions).
--        • No 10-parameter limit (the backend now inlines safely-quoted values).
--   3. SECURITY: locks those functions to the service_role. Supabase grants
--      EXECUTE on new public functions to `anon` and `authenticated` by default,
--      and `REVOKE … FROM PUBLIC` does not remove that grant. Because the
--      functions are SECURITY DEFINER, anyone holding your project's anon key
--      could run arbitrary SQL as the database owner.
--   4. Enables Row Level Security on every app table. The backend uses the
--      service_role key (which bypasses RLS), so nothing breaks — but the
--      tables (including users.password_hash) are no longer readable through
--      the public REST API with the anon key.
--   5. Adds a schema version function the backend checks at startup.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. Missing tables ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_interactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  site_url    TEXT,
  page_key    VARCHAR(500),
  action_type VARCHAR(50) NOT NULL,
  action_data JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_interactions_user ON user_interactions(user_id);

CREATE TABLE IF NOT EXISTS user_preference_profiles (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_styles      TEXT[] DEFAULT '{}',
  preferred_laws        TEXT[] DEFAULT '{}',
  site_type_history     JSONB  DEFAULT '{}',
  applied_fixes_count   INTEGER DEFAULT 0,
  dismissed_fixes_count INTEGER DEFAULT 0,
  last_updated          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS page_rankings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url          TEXT NOT NULL,
  page_key          VARCHAR(500) NOT NULL,
  site_type         VARCHAR(50),
  design_score      FLOAT DEFAULT 0,
  heatmap_score     FLOAT DEFAULT 0,
  engagement_score  FLOAT DEFAULT 0,
  composite_score   FLOAT DEFAULT 0,
  analysis_count    INTEGER DEFAULT 0,
  improvement_delta FLOAT DEFAULT 0,
  last_analysed     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (site_url, page_key)
);
CREATE INDEX IF NOT EXISTS idx_page_rankings_composite ON page_rankings(composite_score DESC);

-- Make sure heatmap_summaries has its (site_url, page_key) unique constraint
-- (the code upserts on it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.heatmap_summaries'::regclass AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.heatmap_summaries'::regclass AND attname = 'site_url'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.heatmap_summaries'::regclass AND attname = 'page_key')
      ]::smallint[]
  ) THEN
    ALTER TABLE heatmap_summaries ADD CONSTRAINT heatmap_summaries_site_url_page_key_key UNIQUE (site_url, page_key);
  END IF;
END $$;

-- Helpful indexes for the hottest queries
CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_heatmap_summaries_site  ON heatmap_summaries(site_url);

-- Keep users.updated_at current
CREATE OR REPLACE FUNCTION aura_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION aura_touch_updated_at();

-- ── 2. SQL bridge functions (used when the backend has no direct DB link) ───

CREATE OR REPLACE FUNCTION exec_sql(query text, params text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  is_dml boolean := query ~* '^\s*(insert|update|delete)\M';
BEGIN
  IF is_dml THEN
    -- Data-modifying statements must be at the top level of a WITH.
    EXECUTE format('WITH aura_q AS (%s) SELECT jsonb_agg(row_to_json(aura_q)) FROM aura_q', query)
      INTO result
      USING params[1], params[2], params[3], params[4], params[5],
            params[6], params[7], params[8], params[9], params[10];
  ELSE
    EXECUTE format('SELECT jsonb_agg(row_to_json(aura_q)) FROM (%s) aura_q', query)
      INTO result
      USING params[1], params[2], params[3], params[4], params[5],
            params[6], params[7], params[8], params[9], params[10];
  END IF;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

DROP FUNCTION IF EXISTS exec_sql_write(text, text[]);
CREATE FUNCTION exec_sql_write(query text, params text[] DEFAULT '{}')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  EXECUTE query
    USING params[1], params[2], params[3], params[4], params[5],
          params[6], params[7], params[8], params[9], params[10];
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION aura_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
AS $$ SELECT 4 $$;

-- ── 3. Lock the functions down to the backend's service role ────────────────

REVOKE ALL ON FUNCTION exec_sql(text, text[])        FROM PUBLIC;
REVOKE ALL ON FUNCTION exec_sql_write(text, text[])  FROM PUBLIC;
REVOKE ALL ON FUNCTION aura_schema_version()         FROM PUBLIC;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION exec_sql(text, text[]) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION exec_sql_write(text, text[]) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION aura_schema_version() FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION exec_sql(text, text[])       TO service_role;
    GRANT EXECUTE ON FUNCTION exec_sql_write(text, text[]) TO service_role;
    GRANT EXECUTE ON FUNCTION aura_schema_version()        TO service_role;
  END IF;
END $$;

-- ── 4. Row Level Security on every app table ────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'chat_sessions', 'chat_messages', 'scraped_pages', 'design_analyses',
    'benchmark_sites', 'heatmap_summaries', 'checkpoints', 'checkpoint_blobs',
    'checkpoint_writes', 'gaze_sessions', 'gaze_events', 'heatmap_survey_links',
    'survey_click_events', 'heatmap_bundles', 'recommendation_cards', 'insight_cards',
    'user_profiles', 'user_interactions', 'user_preference_profiles', 'page_rankings'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
