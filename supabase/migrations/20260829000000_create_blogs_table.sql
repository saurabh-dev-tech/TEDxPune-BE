-- ─────────────────────────────────────────────────────────────────────────────
-- Blogs Table & RLS Policies
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blogs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  title          text        NOT NULL,
  slug           text        NOT NULL,
  summary        text,
  content        text        NOT NULL,
  cover_image    text,
  category       text        NOT NULL DEFAULT 'General',
  tags           text[]      NOT NULL DEFAULT '{}',
  is_published   boolean     NOT NULL DEFAULT true,
  published_at   timestamptz DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_blogs_tenant_published
  ON public.blogs (tenant_id, is_published, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_blogs_slug
  ON public.blogs (tenant_id, slug);

CREATE INDEX IF NOT EXISTS idx_blogs_category
  ON public.blogs (tenant_id, category);

-- ─── Updated At Trigger ──────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TRIGGER trg_blogs_updated_at
    BEFORE UPDATE ON public.blogs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;

-- Service role: full access (backend API)
CREATE POLICY "service_role_all_blogs"
  ON public.blogs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Public / Authenticated users: read published blogs
CREATE POLICY "public_read_published_blogs"
  ON public.blogs FOR SELECT
  USING (is_published = true);
