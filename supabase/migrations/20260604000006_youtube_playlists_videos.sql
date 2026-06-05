-- ─────────────────────────────────────────────────────────────────────────────
-- YouTube Playlists & Videos
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── youtube_playlists ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.youtube_playlists (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  playlist_name  text        NOT NULL,
  playlist_id    text        NOT NULL,              -- extracted YouTube playlist ID
  playlist_url   text,                               -- original URL provided by admin
  category       text        NOT NULL DEFAULT 'General',
  thumbnail_url  text,
  display_order  integer     NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, playlist_id)
);

-- ─── youtube_videos ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.youtube_videos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  playlist_ref_id   uuid        NOT NULL REFERENCES public.youtube_playlists(id) ON DELETE CASCADE,
  youtube_video_id  text        NOT NULL,
  title             text        NOT NULL,
  description       text,
  thumbnail_url     text,
  video_url         text        NOT NULL,
  published_at      timestamptz,
  duration          text,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, youtube_video_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_yt_playlists_tenant_active
  ON public.youtube_playlists (tenant_id, is_active, display_order);

CREATE INDEX IF NOT EXISTS idx_yt_playlists_playlist_id
  ON public.youtube_playlists (playlist_id);

CREATE INDEX IF NOT EXISTS idx_yt_videos_playlist_ref
  ON public.youtube_videos (playlist_ref_id, is_active, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_yt_videos_video_id
  ON public.youtube_videos (youtube_video_id);

CREATE INDEX IF NOT EXISTS idx_yt_videos_tenant_active
  ON public.youtube_videos (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_yt_videos_published
  ON public.youtube_videos (published_at DESC);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_yt_playlists_updated_at
    BEFORE UPDATE ON public.youtube_playlists
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_yt_videos_updated_at
    BEFORE UPDATE ON public.youtube_videos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.youtube_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_videos    ENABLE ROW LEVEL SECURITY;

-- Service role: full access (backend)
CREATE POLICY "service_role_all_yt_playlists"
  ON public.youtube_playlists FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_yt_videos"
  ON public.youtube_videos FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Public / authenticated: read active only
CREATE POLICY "public_read_active_yt_playlists"
  ON public.youtube_playlists FOR SELECT
  USING (is_active = true);

CREATE POLICY "public_read_active_yt_videos"
  ON public.youtube_videos FOR SELECT
  USING (is_active = true);
