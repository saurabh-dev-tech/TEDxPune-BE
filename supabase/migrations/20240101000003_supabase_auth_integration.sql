-- ─────────────────────────────────────────────────────────────────────────────
-- 003: Wire Supabase Auth → our custom users table
--
-- When a user signs in via Supabase Auth (Google / Apple / LinkedIn) for the
-- first time, auth.users gets a new row automatically. This trigger mirrors
-- that row into public.users so all our app logic (roles, tenant, status) still
-- works without any backend code changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add supabase_uid so we can join auth.users ↔ public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS supabase_uid uuid UNIQUE;

-- Index for fast lookup by supabase_uid on every authenticated request
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON public.users(supabase_uid);

-- 2. Function: called by trigger on auth.users INSERT
CREATE OR REPLACE FUNCTION public.handle_new_supabase_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER                       -- runs as the DB owner, can read auth schema
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_provider  text;
  v_google_id text;
  v_apple_id  text;
  v_linkedin_id text;
BEGIN
  -- Resolve default tenant
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE slug = current_setting('app.default_tenant_slug', true)
     OR slug = 'tedxpune'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE WARNING 'handle_new_supabase_user: no tenant found, skipping user %', NEW.id;
    RETURN NEW;
  END IF;

  -- Determine which provider column to populate
  v_provider := NEW.raw_app_meta_data->>'provider';

  IF v_provider = 'google' THEN
    v_google_id := NEW.raw_user_meta_data->>'provider_id';
    IF v_google_id IS NULL THEN
      -- Fallback: sub claim stored differently depending on Supabase version
      v_google_id := NEW.raw_app_meta_data->'identities'->0->>'id';
    END IF;
  ELSIF v_provider = 'apple' THEN
    v_apple_id := NEW.raw_app_meta_data->'identities'->0->>'id';
  ELSIF v_provider = 'linkedin_oidc' THEN
    v_linkedin_id := NEW.raw_app_meta_data->'identities'->0->>'id';
  END IF;

  INSERT INTO public.users (
    supabase_uid,
    tenant_id,
    email,
    full_name,
    avatar_url,
    google_id,
    apple_id,
    linkedin_id,
    role,
    status
  ) VALUES (
    NEW.id,
    v_tenant_id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, ''), '@', 1)   -- fallback: email prefix
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    v_google_id,
    v_apple_id,
    v_linkedin_id,
    'USER',
    'PENDING_APPROVAL'
  )
  ON CONFLICT (supabase_uid) DO NOTHING;   -- idempotent — safe to replay

  RETURN NEW;
END;
$$;

-- 3. Attach trigger (drop first so this migration is re-runnable)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_supabase_user();
