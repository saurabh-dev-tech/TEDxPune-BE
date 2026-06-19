-- ─────────────────────────────────────────────────────────────────────────────
-- 007: Add user social links
--      Adds optional fields for LinkedIn, WhatsApp, Instagram, and X (Twitter)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS linkedin  text,
  ADD COLUMN IF NOT EXISTS whatsapp  text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS x         text;
