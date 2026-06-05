-- ─────────────────────────────────────────────────────────────────────────────
-- 002: Multi-provider auth (Google + Apple alongside LinkedIn)
-- ─────────────────────────────────────────────────────────────────────────────

-- Make linkedin_id nullable so Google/Apple users don't need it
ALTER TABLE users ALTER COLUMN linkedin_id DROP NOT NULL;

-- Drop the old non-partial unique index (fails with NULLs in some Postgres versions)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_tenant_id_linkedin_id_key'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_tenant_id_linkedin_id_key;
  END IF;
END $$;

-- Add provider columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id  text;

-- Partial unique indexes — only enforce when the column is non-null
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_linkedin
  ON users(tenant_id, linkedin_id) WHERE linkedin_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google
  ON users(tenant_id, google_id) WHERE google_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple
  ON users(tenant_id, apple_id) WHERE apple_id IS NOT NULL;
