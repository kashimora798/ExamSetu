# DB Migrations Upload Order

Apply these SQL files in this exact order:

1. `20260412_001_telemetry_events_and_errors.sql`
2. `20260412_002_validate_session_submit_rpc.sql`
3. `20260412_005_launch_cohort_free_access.sql`
4. `20260412_003_validate_subscription_rpc.sql`
5. `20260412_006_validate_subscription_with_launch_gate.sql` (safe re-apply of subscription RPC)
6. `20260413_007_questions_reports.sql`
7. `20260412_004_staging_validation_queries.sql` (optional smoke checks after deploy)

## What each migration does

- `20260412_001_telemetry_events_and_errors.sql`
  - Creates `analytics_events` table
  - Creates `app_errors` table
  - Adds indexes for fast dashboard/error queries

- `20260412_002_validate_session_submit_rpc.sql`
  - Creates `validate_session_submit(p_session_id, p_user_id)` RPC
  - Recomputes correctness server-side
  - Detects answer tampering/score inflation

- `20260412_003_validate_subscription_rpc.sql`
  - Creates `validate_subscription(p_user_id, p_session_type)` RPC
  - Enforces Pro gating for `mock_test` and `pyq_paper`

- `20260412_004_staging_validation_queries.sql`
  - Verifies tables, RPCs, grants, and recent security telemetry
  - Provides copy-paste smoke checks for staging verification

- `20260412_005_launch_cohort_free_access.sql`
  - Creates the launch cohort gate tables
  - Allocates early users into the free launch cohort
  - Exposes `check_launch_gate_eligibility` RPC

- `20260412_006_validate_subscription_with_launch_gate.sql`
  - Recreates `validate_subscription` after launch gate exists
  - Prevents dependency-order failure on `check_launch_gate_eligibility`

- `20260413_007_questions_reports.sql`
  - Creates `questions_reports` table for typo/content issue reporting
  - Adds RLS policies for submitters and admin moderators
  - Adds status workflow: open → in_review → resolved/rejected

## Upload Notes

- Run each file as a separate migration in Supabase SQL editor or migration runner.
- Each file is idempotent (`IF NOT EXISTS` or `DROP FUNCTION IF EXISTS` patterns).
- If one migration fails, fix and re-run that migration before moving to next.
