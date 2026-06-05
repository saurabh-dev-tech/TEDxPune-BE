-- ─────────────────────────────────────────────────────────────────────────────
-- 004: Extended user profile fields
--      Adds bio, location, website so the mobile app can save full profiles.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bio      text CHECK (char_length(bio)      <= 500),
  ADD COLUMN IF NOT EXISTS location text CHECK (char_length(location) <= 100),
  ADD COLUMN IF NOT EXISTS website  text CHECK (char_length(website)  <= 255);
