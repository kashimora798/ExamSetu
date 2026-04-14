-- =============================================================================
-- Migration: P0.11 subscription validation RPC for gated session types
-- Date: 2026-04-12
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS validate_subscription(UUID, VARCHAR) CASCADE;

CREATE OR REPLACE FUNCTION validate_subscription(
  p_user_id UUID,
  p_session_type VARCHAR
)
RETURNS jsonb AS $$
DECLARE
  v_is_gated BOOLEAN;
  v_subscription_status VARCHAR;
  v_expires_at TIMESTAMPTZ;
  v_is_active BOOLEAN := FALSE;
  v_launch_gate jsonb;
BEGIN
  v_is_gated := p_session_type IN ('mock_test', 'pyq_paper');

  SELECT
    s.status,
    s.expires_at,
    CASE
      WHEN s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW()) THEN TRUE
      ELSE FALSE
    END
  INTO v_subscription_status, v_expires_at, v_is_active
  FROM subscriptions s
  JOIN plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND p.code LIKE 'pro%'
    AND s.status IN ('active', 'trial', 'paused')
  LIMIT 1;

  IF NOT v_is_gated THEN
    RETURN jsonb_build_object(
      'allowed', TRUE,
      'reason', 'OK',
      'subscription_status', COALESCE(v_subscription_status, 'none'),
      'expires_at', v_expires_at
    );
  END IF;

  IF v_is_active THEN
    RETURN jsonb_build_object(
      'allowed', TRUE,
      'reason', 'OK',
      'subscription_status', v_subscription_status,
      'expires_at', v_expires_at
    );
  END IF;

  SELECT check_launch_gate_eligibility(p_user_id, 'launch_free_access') INTO v_launch_gate;
  IF COALESCE((v_launch_gate->>'eligible')::boolean, FALSE) THEN
    RETURN jsonb_build_object(
      'allowed', TRUE,
      'reason', 'OK - early access cohort',
      'subscription_status', COALESCE(v_subscription_status, 'none'),
      'access_type', 'launch_free',
      'signup_rank', v_launch_gate->>'signup_rank',
      'expires_at', v_launch_gate->>'expires_at'
    );
  END IF;

  v_subscription_status := COALESCE(v_subscription_status, 'none');
  RETURN jsonb_build_object(
    'allowed', FALSE,
    'reason', CASE
      WHEN v_subscription_status = 'expired' THEN 'Subscription expired. Please renew to continue.'
      WHEN v_subscription_status = 'cancelled' THEN 'Subscription cancelled. Please upgrade to access ' || p_session_type || ' mode.'
      ELSE 'This session type requires a Pro subscription. Please upgrade to continue.'
    END,
    'subscription_status', v_subscription_status,
    'expires_at', v_expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION validate_subscription(UUID, VARCHAR) TO authenticated;

COMMENT ON FUNCTION validate_subscription IS
  'Validates user subscription for gated session types (mock_test, pyq_paper).';

COMMIT;
