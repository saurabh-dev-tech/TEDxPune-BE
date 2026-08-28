-- Migration: Create user_push_tokens table for push notifications
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  push_token   TEXT NOT NULL,
  platform     TEXT DEFAULT 'unknown',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_push_token UNIQUE (user_id, push_token)
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON public.user_push_tokens(user_id);

-- Enable RLS
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage user_push_tokens"
  ON public.user_push_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);
