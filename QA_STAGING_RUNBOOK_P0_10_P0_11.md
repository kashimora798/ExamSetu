# Staging Runbook: P0.10 + P0.11

## Goal
Validate that server-side score validation and subscription gating work correctly after migration upload.

## Pre-check
1. Upload and run migration files in order from data/migrations/README.md.
2. Ensure staging frontend has latest code.
3. Use two test accounts:
- Free user
- Pro user

## Test A: Free user blocked from Pro modes
1. Login as free user.
2. Attempt mock_test or pyq_paper session and submit flow.
3. Expected:
- Submission blocked with access message
- Event logged: session_submit_blocked_subscription
- No unauthorized completion

## Test B: Free user allowed in non-gated mode
1. Login as free user.
2. Start topic_practice session.
3. Submit session.
4. Expected:
- Submission succeeds
- No subscription block

## Test C: Pro user allowed in gated modes
1. Login as pro user.
2. Start mock_test.
3. Submit session.
4. Expected:
- Submission succeeds
- validate_subscription returns allowed=true

## Test D: Tamper attempt rejected
1. Start a session.
2. Modify client state in DevTools to fake correctness.
3. Submit session.
4. Expected:
- Validation fails
- Session not completed
- Error logged in app_errors with tampering context

## Test E: Normal scoring accepted
1. Complete session without tampering.
2. Submit session.
3. Expected:
- validate_session_submit returns valid=true
- Session completed with server-computed score

## SQL Smoke Checks
Run data/migrations/20260412_004_staging_validation_queries.sql and verify:
1. RPCs exist and have authenticated grants.
2. Telemetry tables exist.
3. Event/error rows are generated during tests.

## Pass Criteria
1. Free users cannot submit gated session types.
2. Pro users can submit gated session types.
3. Tampered sessions are rejected.
4. Untampered sessions complete with correct score.
5. Telemetry and error logging show expected traces.
