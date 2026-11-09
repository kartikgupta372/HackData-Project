-- 005: refresh tokens for the access/refresh JWT system.
--
-- Each row is one refresh token. A "family" is every token descended from one
-- sign-in, which lets the backend revoke a whole session at once and detect a
-- stolen token being replayed. Safe to run more than once.
--
-- The backend works without this table (it falls back to stateless refresh
-- tokens that cannot be revoked), so apply it whenever convenient.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jti         text        NOT NULL UNIQUE,
  family_id   uuid        NOT NULL,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx   ON refresh_tokens (user_id);

-- Same lockdown as every other table: only the backend's service role may touch it.
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE refresh_tokens FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE refresh_tokens TO service_role;
  END IF;
END $$;
