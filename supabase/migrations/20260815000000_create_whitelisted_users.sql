-- Migration: Create whitelisted_users table for invite-only access control
CREATE TABLE IF NOT EXISTS public.whitelisted_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  contact     TEXT,
  invited_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_whitelisted_users_tenant_email UNIQUE (tenant_id, email)
);

-- Index for fast case-insensitive lookup by email & tenant
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_lower_email
  ON public.whitelisted_users(tenant_id, lower(email));

-- Enable Row Level Security (RLS)
ALTER TABLE public.whitelisted_users ENABLE ROW LEVEL SECURITY;

-- Allow backend service role full access
CREATE POLICY "Service role can manage whitelisted_users"
  ON public.whitelisted_users
  FOR ALL
  USING (true)
  WITH CHECK (true);
