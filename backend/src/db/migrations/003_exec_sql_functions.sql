-- ============================================================
-- AURA DESIGN AI — Migration 003: exec_sql RPC Functions
-- Run this FIRST before migrations 001 and 002 if starting fresh,
-- or run it standalone if you already ran the earlier migrations.
--
-- IMPORTANT: This must be run in Supabase → SQL Editor → Run
-- The backend's pool.js calls these two RPC functions for all
-- raw SQL queries. Without them, every query will fail with
-- "function exec_sql does not exist".
-- ============================================================

-- ── exec_sql: runs SELECT queries and returns rows ──────────
-- Security: SECURITY DEFINER runs as the function owner (postgres)
-- Access: restricted to service_role via RLS policy below
CREATE OR REPLACE FUNCTION exec_sql(query text, params text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Execute the query and aggregate rows as JSON array
  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (%s) t',
    query
  )
  USING params[1], params[2], params[3], params[4], params[5],
        params[6], params[7], params[8], params[9], params[10]
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'exec_sql error: %', SQLERRM;
END;
$$;

-- ── exec_sql_write: runs INSERT/UPDATE/DELETE queries ────────
CREATE OR REPLACE FUNCTION exec_sql_write(query text, params text[] DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query
  USING params[1], params[2], params[3], params[4], params[5],
        params[6], params[7], params[8], params[9], params[10];
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'exec_sql_write error: %', SQLERRM;
END;
$$;

-- ── Restrict these functions to service_role only ────────────
-- Revoke from public, grant to service_role
REVOKE EXECUTE ON FUNCTION exec_sql(text, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION exec_sql_write(text, text[]) FROM PUBLIC;

-- Note: The Supabase service_role key bypasses RLS automatically.
-- These functions are ONLY called from the backend with the service key.
-- They are never exposed to the frontend.

-- ============================================================
-- Run complete.
-- ============================================================
