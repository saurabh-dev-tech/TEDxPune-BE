-- ─────────────────────────────────────────────────────────────────────────────
-- 005: Rich posts — images, videos, polls, kudos
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Post type + media columns
DO $$ BEGIN
  CREATE TYPE post_type AS ENUM ('text','image','video','poll');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS post_type  post_type NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS image_url  text,
  ADD COLUMN IF NOT EXISTS video_url  text;

-- 2. Poll options (2–4 per poll post)
CREATE TABLE IF NOT EXISTS public.poll_options (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id      uuid NOT NULL REFERENCES public.posts(id)   ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  option_text  text NOT NULL CHECK (char_length(option_text) BETWEEN 1 AND 100),
  sort_order   smallint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_options_post ON public.poll_options(post_id);

-- 3. Poll votes (one per user per post — enforced by UNIQUE)
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  option_id   uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  post_id     uuid NOT NULL REFERENCES public.posts(id)        ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id)        ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id)      ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON public.poll_votes(option_id);
