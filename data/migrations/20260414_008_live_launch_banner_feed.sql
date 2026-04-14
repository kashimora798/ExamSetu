-- ============================================================================
-- Migration: Live launch banner data + registration feed
-- Date: 2026-04-14
-- Purpose:
--   1) DB-backed live seat counts + countdown for homepage launch banner
--   2) Real-time feed of newly registered user names for bottom-left toast
-- ============================================================================

BEGIN;

-- 1) Campaign table (single active row expected at a time)
CREATE TABLE IF NOT EXISTS public.launch_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Registration FREE + Premium Access Live',
  total_seats INTEGER NOT NULL CHECK (total_seats > 0),
  claimed_seats INTEGER NOT NULL DEFAULT 0 CHECK (claimed_seats >= 0),
  offer_ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_launch_campaigns_active
  ON public.launch_campaigns (is_active, offer_ends_at DESC);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at_launch_campaigns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_launch_campaigns ON public.launch_campaigns;
CREATE TRIGGER trg_set_updated_at_launch_campaigns
BEFORE UPDATE ON public.launch_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_launch_campaigns();

-- 2) Public, sanitized registration feed for live homepage toasts
CREATE TABLE IF NOT EXISTS public.live_registration_events (
  id BIGSERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_registration_events_created
  ON public.live_registration_events (created_at DESC);

-- 3) Trigger function:
--    a) Push sanitized display name into live_registration_events
--    b) Increment claimed seats for the currently active campaign
CREATE OR REPLACE FUNCTION public.handle_new_user_profile_for_launch_feed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
BEGIN
  v_display_name := NULLIF(trim(COALESCE(NEW.full_name, '')), '');
  IF v_display_name IS NULL THEN
    v_display_name := 'A new aspirant';
  ELSE
    -- Keep only first token for privacy, e.g. "Rahul Sharma" -> "Rahul"
    v_display_name := split_part(v_display_name, ' ', 1);
  END IF;

  INSERT INTO public.live_registration_events (display_name)
  VALUES (v_display_name);

  UPDATE public.launch_campaigns lc
  SET claimed_seats = LEAST(lc.total_seats, lc.claimed_seats + 1)
  WHERE lc.is_active = true
    AND lc.offer_ends_at > NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_launch_feed ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_launch_feed
AFTER INSERT ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile_for_launch_feed();

-- 4) Ensure there is an active campaign row
WITH profile_count AS (
  SELECT COUNT(*)::INTEGER AS cnt FROM public.user_profiles
)
INSERT INTO public.launch_campaigns (id, title, total_seats, claimed_seats, offer_ends_at, is_active)
SELECT
  'launch-2026-main',
  'Registration FREE + Premium Access Live',
  GREATEST(1200, cnt + 300),
  cnt,
  '2026-05-01 23:59:59+05:30'::timestamptz,
  true
FROM profile_count
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  total_seats = GREATEST(public.launch_campaigns.total_seats, EXCLUDED.total_seats),
  claimed_seats = GREATEST(public.launch_campaigns.claimed_seats, EXCLUDED.claimed_seats),
  offer_ends_at = EXCLUDED.offer_ends_at,
  is_active = true;

-- 5) RLS + public read access for homepage (anon + authenticated)
ALTER TABLE public.launch_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_registration_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS launch_campaigns_select_public ON public.launch_campaigns;
CREATE POLICY launch_campaigns_select_public
  ON public.launch_campaigns
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS live_registration_events_select_public ON public.live_registration_events;
CREATE POLICY live_registration_events_select_public
  ON public.live_registration_events
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Explicit grants (safe for repeat runs)
GRANT SELECT ON public.launch_campaigns TO anon, authenticated;
GRANT SELECT ON public.live_registration_events TO anon, authenticated;

-- 6) Realtime publication (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.launch_campaigns;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_registration_events;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END;
$$;

COMMIT;

-- ============================================================================
-- Verify
-- ============================================================================
-- SELECT id, total_seats, claimed_seats, (total_seats - claimed_seats) AS remaining, offer_ends_at
-- FROM public.launch_campaigns
-- WHERE is_active = true
-- ORDER BY created_at DESC;
--
-- SELECT id, display_name, created_at
-- FROM public.live_registration_events
-- ORDER BY created_at DESC
-- LIMIT 10;
