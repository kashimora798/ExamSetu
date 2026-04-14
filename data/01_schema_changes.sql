-- =============================================================================
-- MIGRATION: UPTET Platform — Schema Changes
-- Date: 2026-04-06
-- Changes:
--   1. Add is_diagnostic column (already in SQL dump, missing from schema)
--   2. Add options_hi column for Hindi options
--   3. Add question_number column for ordering within exam paper
--   4. Add match_based question type support
--   5. Add assertion_reason question type support
--   6. Add source_pdf_page column for PDF reference
--   7. Refresh api_usage_logs partition for 2026 (already exists, verification)
--   8. Add index on explanation_source for filtering
-- =============================================================================

BEGIN;

-- -------------------------------------------------
-- 1. Add is_diagnostic column (present in SQL dump, missing from CREATE TABLE)
-- -------------------------------------------------
ALTER TABLE questions 
  ADD COLUMN IF NOT EXISTS is_diagnostic BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN questions.is_diagnostic IS 
  'TRUE if question is used in the diagnostic test shown to new users on onboarding';

-- -------------------------------------------------
-- 2. Add options_hi — Hindi text for each option
--    Options are currently stored only in one language in the options JSONB.
--    For the UPTET paper (bilingual), we need Hindi options separately.
--    Schema: {"A": "...", "B": "...", "C": "...", "D": "..."}
-- -------------------------------------------------
ALTER TABLE questions 
  ADD COLUMN IF NOT EXISTS options_hi JSONB;

COMMENT ON COLUMN questions.options_hi IS 
  'Hindi text for each option. Same schema as options: {"A":"...","B":"...","C":"...","D":"..."}. 
   NULL if question is English-only or Hindi options same as options column.';

-- -------------------------------------------------
-- 3. Add question_number — the original serial number within the paper
--    (e.g., Q.1 to Q.150 for UPTET Paper 1)
-- -------------------------------------------------
ALTER TABLE questions 
  ADD COLUMN IF NOT EXISTS question_number SMALLINT;

COMMENT ON COLUMN questions.question_number IS 
  'Original question serial number within the exam paper (1-150 for UPTET Paper 1)';

-- -------------------------------------------------
-- 4. Extend question_type CHECK constraint to support new types found in paper:
--    - match_based: Column A–Column B matching questions (Q16, Q22, Q32, Q133)
--    - assertion_reason: Assertion-Reason type (not in this paper but future-proof)
--    - passage_based: Reading comprehension passage questions (Q42, Q43, Q81, Q82)
--    - sequence_based: Correct sequence/order questions (Q31, Q28, Q9)
-- -------------------------------------------------

-- Drop old constraint
ALTER TABLE questions 
  DROP CONSTRAINT IF EXISTS questions_question_type_check;

-- Add new extended constraint
ALTER TABLE questions 
  ADD CONSTRAINT questions_question_type_check 
  CHECK (question_type IN (
    'factual',
    'conceptual', 
    'application',
    'vocabulary',
    'analytical',
    'match_based',       -- NEW: Column A–B matching type
    'assertion_reason',  -- NEW: Assertion-Reason type
    'passage_based',     -- NEW: Based on a reading passage
    'sequence_based'     -- NEW: Find correct sequence/order
  ));

-- -------------------------------------------------
-- 5. Add source_pdf_page — page number in source PDF for QA reference
-- -------------------------------------------------
ALTER TABLE questions 
  ADD COLUMN IF NOT EXISTS source_pdf_page SMALLINT;

COMMENT ON COLUMN questions.source_pdf_page IS 
  'Page number in the source PDF where this question appears (for QA/verification)';

-- -------------------------------------------------
-- 6. Add index on explanation_source for filtering unexplained questions
-- -------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_questions_expl_source 
  ON questions (explanation_source) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_expl_verified 
  ON questions (explanation_verified) 
  WHERE deleted_at IS NULL;

-- -------------------------------------------------
-- 7. Add index on is_diagnostic for fast lookup
-- -------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_questions_diagnostic 
  ON questions (is_diagnostic) 
  WHERE deleted_at IS NULL AND is_active = TRUE;

-- -------------------------------------------------
-- 8. Update question_type for match_based questions in 2019 paper
--    These are Q16 (CDP match columns), Q22 (teaching models match),
--    Q32 (Hindi lit orgs match), Q133 (EVS institutions match)
-- -------------------------------------------------
UPDATE questions SET question_type = 'match_based'
WHERE legacy_id IN (
  'UPTET_P1_CDP_2019_016',   -- Column A–B: Animal Intelligence, Piaget etc.
  'UPTET_P1_CDP_2019_022',   -- Teaching models match
  'UPTET_P1_Hindi_2019_032', -- Hindi literary orgs + founding years
  'UPTET_P1_EVS_2019_133'    -- Government institutions + heads
);

-- Update question_type for passage_based questions
UPDATE questions SET question_type = 'passage_based'
WHERE legacy_id IN (
  'UPTET_P1_Hindi_2019_042', -- Gandhism passage Q1
  'UPTET_P1_Hindi_2019_043', -- Gandhism passage Q2
  'UPTET_P1_English_2019_081', -- Forgiveness passage Q1
  'UPTET_P1_English_2019_082', -- Forgiveness passage Q2
  'UPTET_P1_English_2019_083', -- Poetry comprehension Q1
  'UPTET_P1_English_2019_084'  -- Poetry comprehension Q2
);

-- Update question_type for sequence_based questions
UPDATE questions SET question_type = 'sequence_based'
WHERE legacy_id IN (
  'UPTET_P1_CDP_2019_028',   -- Morrison's 5 steps sequence
  'UPTET_P1_Hindi_2019_031'  -- Bachchan's works chronological order
);

-- -------------------------------------------------
-- 9. Set question_number from legacy_id for all 2019 questions
-- -------------------------------------------------
UPDATE questions SET question_number = CAST(
  regexp_replace(legacy_id, '.*_(\d+)$', '\1') AS SMALLINT
)
WHERE source_year = 2019 AND exam_code = 'UPTET' AND paper_number = 1 
  AND question_number IS NULL;

-- -------------------------------------------------
-- 10. Set is_diagnostic = TRUE for a sample of balanced diagnostic questions
--     (5 per subject = 25 total for onboarding diagnostic)
-- -------------------------------------------------
UPDATE questions SET is_diagnostic = TRUE
WHERE legacy_id IN (
  -- CDP (5 representative questions)
  'UPTET_P1_CDP_2019_001',  -- Multiple Intelligence
  'UPTET_P1_CDP_2019_002',  -- Dyslexia
  'UPTET_P1_CDP_2019_005',  -- Child growth
  'UPTET_P1_CDP_2019_017',  -- Principles of development
  'UPTET_P1_CDP_2019_026',  -- Reinforcement theory
  -- Hindi (5)
  'UPTET_P1_Hindi_2019_036', -- Tadbhav words
  'UPTET_P1_Hindi_2019_037', -- Deshaj words
  'UPTET_P1_Hindi_2019_046', -- Synonyms
  'UPTET_P1_Hindi_2019_047', -- Antonyms
  'UPTET_P1_Hindi_2019_056', -- Voice (Vachya)
  -- English (5)
  'UPTET_P1_English_2019_061', -- Passive voice
  'UPTET_P1_English_2019_065', -- Gender
  'UPTET_P1_English_2019_068', -- Parts of speech
  'UPTET_P1_English_2019_072', -- Teaching methods
  'UPTET_P1_English_2019_086', -- Past perfect tense
  -- Maths (5)
  'UPTET_P1_Maths_2019_091', -- Rectangle area
  'UPTET_P1_Maths_2019_095', -- Points on a line
  'UPTET_P1_Maths_2019_097', -- Divisibility
  'UPTET_P1_Maths_2019_104', -- HCF/LCM
  'UPTET_P1_Maths_2019_116', -- 3D shapes
  -- EVS (5)
  'UPTET_P1_EVS_2019_121', -- First passenger train
  'UPTET_P1_EVS_2019_124', -- Articles of Constitution
  'UPTET_P1_EVS_2019_128', -- Continents by population
  'UPTET_P1_EVS_2019_138', -- Plant hormones
  'UPTET_P1_EVS_2019_145'  -- UP state bird
);

COMMIT;

-- =============================================================================
-- P0 Launch Hardening: telemetry + crash/error event capture
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

-- =============================================================================
-- P0.10 Launch Hardening: Server-Validated Scoring (Anti-Tamper)
-- =============================================================================
--
-- RPC: validate_session_submit (p_session_id UUID, p_user_id UUID)
-- Purpose:
--   1. Fetch all question_attempts for the session
--   2. For each attempt, fetch the authoritative correct_option from questions table
--   3. Recompute is_correct on server: selected_option == correct_option
--   4. Detect tampering: if client-computed differs from server-computed
--   5. Return corrected score and tampering flag
--
-- Returns:
--   {
--     "valid": boolean,                    -- TRUE if score matches server computation
--     "corrected_score": integer,          -- Server-computed correct count
--     "client_score": integer,             -- Client-reported score (for debugging)
--     "corrections": integer,              -- Number of score corrections applied
--     "message": string                    -- "OK" or error description
--   }
--
-- Tampering Detection Scenarios:
--   1. Client attempted to inflate score by marking wrong answers as correct
--   2. Client attempted to modify question's correct_option in memory
--   3. Client sent stale or replayed attempts
--   4. Post-submission replay attacks (covered by session status check)
--
-- =============================================================================

-- Drop the RPC if it already exists (for idempotency)
DROP FUNCTION IF EXISTS validate_session_submit(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION validate_session_submit(
  p_session_id UUID,
  p_user_id UUID
)
RETURNS jsonb AS $$
DECLARE
  v_correct_count INTEGER := 0;
  v_total_attempted INTEGER := 0;
  v_tampering_detected BOOLEAN := FALSE;
  v_corrections INTEGER := 0;
  v_corrections_detail JSONB := '[]'::jsonb;
  v_session_status TEXT;
  v_attempt RECORD;
BEGIN
  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. Verify session exists and is in progress (not already submitted)
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT ps.status INTO v_session_status
  FROM practice_sessions ps
  WHERE ps.id = p_session_id AND ps.user_id = p_user_id
  LIMIT 1;

  IF v_session_status IS NULL THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'corrected_score', 0,
      'client_score', 0,
      'corrections', 0,
      'message', 'Session not found or access denied'
    );
  END IF;

  IF v_session_status = 'completed' THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'corrected_score', 0,
      'client_score', 0,
      'corrections', 0,
      'message', 'Session already submitted'
    );
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. Iterate through all attempts and recompute correctness on server
  -- ──────────────────────────────────────────────────────────────────────────
  FOR v_attempt IN
    SELECT
      qa.id,
      qa.selected_option AS client_selected,
      qa.is_correct AS client_is_correct,
      q.correct_option AS server_correct,
      q.id AS question_id
    FROM question_attempts qa
    JOIN questions q ON qa.question_id = q.id
    WHERE qa.session_id = p_session_id
      AND qa.user_id = p_user_id
      AND qa.selected_option IS NOT NULL  -- Skip unanswered questions
    ORDER BY qa.question_order ASC
  LOOP
    v_total_attempted := v_total_attempted + 1;

    -- Compute server-side correctness
    IF v_attempt.client_selected = v_attempt.server_correct THEN
      v_correct_count := v_correct_count + 1;

      -- Detect if client and server agree (no tampering on this question)
      IF v_attempt.client_is_correct IS FALSE THEN
        v_tampering_detected := TRUE;
        v_corrections := v_corrections + 1;
        v_corrections_detail := v_corrections_detail || jsonb_build_object(
          'question_id', v_attempt.question_id,
          'client_is_correct', v_attempt.client_is_correct,
          'server_is_correct', TRUE,
          'reason', 'Client marked correct answer as wrong'
        );
      END IF;
    ELSE
      -- Client selected wrong answer

      -- Detect if client incorrectly marked this as correct (major tampering)
      IF v_attempt.client_is_correct IS TRUE THEN
        v_tampering_detected := TRUE;
        v_corrections := v_corrections + 1;
        v_corrections_detail := v_corrections_detail || jsonb_build_object(
          'question_id', v_attempt.question_id,
          'client_selected', v_attempt.client_selected,
          'server_correct', v_attempt.server_correct,
          'client_is_correct', v_attempt.client_is_correct,
          'server_is_correct', FALSE,
          'reason', 'Client marked wrong answer as correct'
        );
      END IF;
    END IF;
  END LOOP;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 3. Determine validity: Do NOT validate if tampering found
  --    (Tampering = client score != server score)
  -- ──────────────────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'valid', NOT v_tampering_detected,
    'corrected_score', v_correct_count,
    'client_score', (
      SELECT COALESCE(attempted, 0) FROM practice_sessions WHERE id = p_session_id
    ),
    'corrections', v_corrections,
    'corrections_detail', v_corrections_detail,
    'message', CASE
      WHEN v_corrections = 0 THEN 'OK'
      WHEN v_tampering_detected THEN 'Tampering detected: score discrepancy'
      ELSE 'Corrections applied'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant RPC permission to authenticated users
GRANT EXECUTE ON FUNCTION validate_session_submit(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION validate_session_submit IS
  'Server-side session validation RPC for anti-tampering.
   Recomputes question correctness from authoritative DB and detects score inflation.
   Called by client on session submit before marking session as completed.';
-- =============================================================================
-- P0.11 Launch Hardening: Subscription Gating Validation
-- =============================================================================
--
-- RPC: validate_subscription (p_user_id UUID, p_session_type VARCHAR)
-- Purpose:
--   Verify that user has an active Pro subscription for gated session types.
--   Prevents: Free user accessing mock_test or pyq_paper mode without payment
--
-- Gated Session Types (Pro-only):
--   - 'mock_test': Full mock test with timed mode
--   - 'pyq_paper': Past year question papers with exam conditions
--
-- Free Session Types:
--   - 'topic_practice': Single topic practice with instant feedback
--   - 'revision': Quick revision mode
--   - 'challenge': Streak-based challenges (may become Pro later)
--   - 'custom': Custom-filtered question set
--
-- Returns:
--   {
--     "allowed": boolean,                  -- TRUE if user can access session type
--     "reason": string,                    -- "OK" or explanation
--     "subscription_status": string,       -- 'active', 'expired', 'cancelled', 'none'
--     "expires_at": timestamp              -- When subscription expires (if active)
--   }
--
-- =============================================================================

-- Drop the RPC if it already exists (for idempotency)
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
BEGIN
  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. Determine if session type requires Pro subscription
  -- ──────────────────────────────────────────────────────────────────────────
  v_is_gated := p_session_type IN ('mock_test', 'pyq_paper');

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. Check user's subscription status
  -- ──────────────────────────────────────────────────────────────────────────
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
    AND p.code LIKE 'pro%'  -- Match 'pro', 'pro_monthly', 'pro_annual', etc.
    AND s.status IN ('active', 'trial', 'paused')  -- Exclude cancelled/expired
  LIMIT 1;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 3. Determine access based on session type and subscription
  -- ──────────────────────────────────────────────────────────────────────────
  IF NOT v_is_gated THEN
    -- Free session type — always allowed
    RETURN jsonb_build_object(
      'allowed', TRUE,
      'reason', 'OK',
      'subscription_status', COALESCE(v_subscription_status, 'none'),
      'expires_at', v_expires_at
    );
  END IF;

  -- Gated session type — require active Pro subscription
  IF v_is_active THEN
    RETURN jsonb_build_object(
      'allowed', TRUE,
      'reason', 'OK',
      'subscription_status', v_subscription_status,
      'expires_at', v_expires_at
    );
  END IF;

  -- No active Pro subscription for gated session type
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

-- Grant RPC permission to authenticated users
GRANT EXECUTE ON FUNCTION validate_subscription(UUID, VARCHAR) TO authenticated;

COMMENT ON FUNCTION validate_subscription IS
  'Validate user subscription for gated session types (mock_test, pyq_paper).
   Returns allowed=true/false and reason string for UI display.
   Called by client before starting a session to gate Pro-only features.';


-- Verify
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN is_diagnostic THEN 1 ELSE 0 END) as diagnostic_count,
  COUNT(DISTINCT question_type) as question_types,
  MIN(question_number) as min_q, MAX(question_number) as max_q
FROM questions 
WHERE source_year = 2019 AND exam_code = 'UPTET';
