-- =============================================================================
-- Migration: Launch cohort free access for first N users
-- Date: 2026-04-12
-- Purpose: Grant a limited early-access free package before switching to Pro
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS launch_gates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature_name VARCHAR(100) NOT NULL UNIQUE,
  max_free_users INTEGER NOT NULL CHECK (max_free_users > 0),
  free_duration_days INTEGER NOT NULL DEFAULT 365 CHECK (free_duration_days > 0),
  benefit_package JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS launch_gate_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature_name VARCHAR(100) NOT NULL REFERENCES launch_gates(feature_name) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  signup_rank BIGINT NOT NULL,
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (feature_name, user_id)
);

CREATE INDEX IF NOT EXISTS idx_launch_gate_allocations_feature_rank
  ON launch_gate_allocations (feature_name, signup_rank ASC);

CREATE INDEX IF NOT EXISTS idx_launch_gate_allocations_user_active
  ON launch_gate_allocations (user_id, is_active, expires_at DESC);

INSERT INTO launch_gates (feature_name, max_free_users, free_duration_days, benefit_package, is_active)
VALUES (
  'launch_free_access',
  500,
  365,
  jsonb_build_object(
    'mock_test', true,
    'pyq_paper', true,
    'bookmark_limit', 100,
    'badge', 'Early Access'
  ),
  TRUE
)
ON CONFLICT (feature_name)
DO UPDATE SET
  max_free_users = EXCLUDED.max_free_users,
  free_duration_days = EXCLUDED.free_duration_days,
  benefit_package = EXCLUDED.benefit_package,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

DROP FUNCTION IF EXISTS check_launch_gate_eligibility(UUID, VARCHAR) CASCADE;

CREATE OR REPLACE FUNCTION check_launch_gate_eligibility(
  p_user_id UUID,
  p_feature_name VARCHAR
)
RETURNS jsonb AS $$
DECLARE
  v_gate RECORD;
  v_user RECORD;
  v_rank BIGINT;
  v_alloc RECORD;
  v_eligible BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_gate
  FROM launch_gates
  WHERE feature_name = p_feature_name
    AND is_active = TRUE
  LIMIT 1;

  IF v_gate IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', FALSE,
      'allocated', FALSE,
      'reason', 'Launch gate not found',
      'signup_rank', NULL,
      'max_free_users', NULL,
      'expires_at', NULL,
      'benefit_package', '{}'::jsonb
    );
  END IF;

  SELECT id, created_at, is_active INTO v_user
  FROM user_profiles
  WHERE id = p_user_id
  LIMIT 1;

  IF v_user IS NULL OR v_user.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'eligible', FALSE,
      'allocated', FALSE,
      'reason', 'User not found or inactive',
      'signup_rank', NULL,
      'max_free_users', v_gate.max_free_users,
      'expires_at', NULL,
      'benefit_package', v_gate.benefit_package
    );
  END IF;

  SELECT * INTO v_alloc
  FROM launch_gate_allocations
  WHERE feature_name = p_feature_name
    AND user_id = p_user_id
    AND is_active = TRUE
    AND expires_at > NOW()
  LIMIT 1;

  IF v_alloc IS NOT NULL THEN
    RETURN jsonb_build_object(
      'eligible', TRUE,
      'allocated', TRUE,
      'reason', 'OK - grandfathered launch access',
      'signup_rank', v_alloc.signup_rank,
      'max_free_users', v_gate.max_free_users,
      'expires_at', v_alloc.expires_at,
      'benefit_package', v_gate.benefit_package
    );
  END IF;

  SELECT COUNT(*) + 1 INTO v_rank
  FROM user_profiles u
  WHERE u.is_active = TRUE
    AND (
      u.created_at < v_user.created_at
      OR (u.created_at = v_user.created_at AND u.id < p_user_id)
    );

  IF v_rank <= v_gate.max_free_users THEN
    INSERT INTO launch_gate_allocations (
      feature_name,
      user_id,
      signup_rank,
      expires_at,
      is_active,
      meta
    ) VALUES (
      p_feature_name,
      p_user_id,
      v_rank,
      NOW() + (v_gate.free_duration_days || ' days')::interval,
      TRUE,
      jsonb_build_object('source', 'launch_signup_rank')
    )
    ON CONFLICT (feature_name, user_id)
    DO UPDATE SET
      signup_rank = EXCLUDED.signup_rank,
      expires_at = EXCLUDED.expires_at,
      is_active = TRUE,
      meta = EXCLUDED.meta;

    v_eligible := TRUE;
  END IF;

  SELECT * INTO v_alloc
  FROM launch_gate_allocations
  WHERE feature_name = p_feature_name
    AND user_id = p_user_id
    AND is_active = TRUE
  LIMIT 1;

  RETURN jsonb_build_object(
    'eligible', v_eligible,
    'allocated', v_alloc IS NOT NULL,
    'reason', CASE
      WHEN v_eligible THEN 'OK - within first N launch users'
      ELSE 'Launch cohort full. Please upgrade to Pro.'
    END,
    'signup_rank', COALESCE(v_alloc.signup_rank, v_rank),
    'max_free_users', v_gate.max_free_users,
    'expires_at', COALESCE(v_alloc.expires_at, NULL),
    'benefit_package', v_gate.benefit_package
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION check_launch_gate_eligibility(UUID, VARCHAR) TO authenticated;

COMMENT ON FUNCTION check_launch_gate_eligibility IS
  'Allocates and checks launch cohort early-access eligibility for the first N users.';

COMMIT;
