-- =============================================================================
-- Migration: P0 telemetry events + app error logging tables
-- Date: 2026-04-12
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID NULL,
  path TEXT NULL,
  app_version TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON analytics_events (name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created
  ON analytics_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_errors (
  id BIGSERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  stack TEXT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID NULL,
  path TEXT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_errors_created
  ON app_errors (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_errors_user_created
  ON app_errors (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

COMMIT;
