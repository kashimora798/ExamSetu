-- =============================================================================
-- Staging Validation Queries for P0.10 + P0.11
-- Date: 2026-04-12
-- Purpose: Quick smoke tests after uploading migrations
-- =============================================================================

-- 1) Confirm telemetry tables exist
SELECT to_regclass('public.analytics_events') AS analytics_events_table;
SELECT to_regclass('public.app_errors') AS app_errors_table;

-- 2) Confirm RPC functions exist
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('validate_session_submit', 'validate_subscription', 'check_launch_gate_eligibility')
ORDER BY p.proname;

-- 2b) Confirm launch gate tables exist
SELECT to_regclass('public.launch_gates') AS launch_gates_table;
SELECT to_regclass('public.launch_gate_allocations') AS launch_gate_allocations_table;

-- 3) Confirm grants to authenticated
SELECT routine_name, privilege_type, grantee
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN ('validate_session_submit', 'validate_subscription')
  AND grantee = 'authenticated'
ORDER BY routine_name;

-- 4) Basic telemetry write check (run as authenticated context in app)
-- Expected after app usage: count > 0
SELECT COUNT(*) AS analytics_event_count FROM analytics_events;
SELECT COUNT(*) AS app_error_count FROM app_errors;

-- 5) Subscription RPC behavior checks
-- Replace UUID/session type as needed while testing.
-- Example (free account should fail for mock_test):
-- SELECT validate_subscription('00000000-0000-0000-0000-000000000000'::uuid, 'mock_test');
-- Example (free account should pass for topic_practice):
-- SELECT validate_subscription('00000000-0000-0000-0000-000000000000'::uuid, 'topic_practice');

-- 5b) Launch-gate eligibility checks
-- SELECT check_launch_gate_eligibility('00000000-0000-0000-0000-000000000000'::uuid, 'launch_free_access');

-- Current launch gate config
SELECT feature_name, max_free_users, free_duration_days, is_active
FROM launch_gates
ORDER BY created_at DESC
LIMIT 5;

-- 6) Session scoring RPC behavior checks
-- Replace with a real in_progress session/user from staging.
-- SELECT validate_session_submit('SESSION_UUID'::uuid, 'USER_UUID'::uuid);

-- 7) Optional: Recent security-related errors/events
SELECT id, message, created_at
FROM app_errors
WHERE message ILIKE '%Tampering%'
ORDER BY created_at DESC
LIMIT 20;

SELECT id, name, payload, created_at
FROM analytics_events
WHERE name IN ('session_score_corrected', 'session_submit_error', 'session_submit_blocked_subscription')
ORDER BY created_at DESC
LIMIT 50;
