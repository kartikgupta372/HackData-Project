-- 006: the backend only ever talks to Postgres as the service role, so the public
-- API roles (anon, authenticated) should have no table access at all.
-- Row-level security already blocks every row; this also hides the tables from the
-- GraphQL schema and removes a footgun if a policy is ever added by mistake.
-- Safe to run more than once. Run 005_refresh_tokens.sql first.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- Pin the search path of the two helper functions (Supabase security advisory).
ALTER FUNCTION public.aura_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.aura_schema_version()   SET search_path = public;
