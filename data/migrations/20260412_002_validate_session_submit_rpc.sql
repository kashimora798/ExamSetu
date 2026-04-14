-- =============================================================================
-- Migration: P0.10 server-validated scoring RPC (anti-tamper)
-- Date: 2026-04-12
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS validate_session_submit(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION validate_session_submit(
  p_session_id UUID,
  p_user_id UUID
)
RETURNS jsonb AS $$
DECLARE
  v_correct_count INTEGER := 0;
  v_tampering_detected BOOLEAN := FALSE;
  v_corrections INTEGER := 0;
  v_corrections_detail JSONB := '[]'::jsonb;
  v_session_status TEXT;
  v_attempt RECORD;
BEGIN
  -- Session must exist and belong to the user.
  SELECT ps.status INTO v_session_status
  FROM practice_sessions ps
  WHERE ps.id = p_session_id
    AND ps.user_id = p_user_id
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
      AND qa.selected_option IS NOT NULL
    ORDER BY qa.question_order ASC
  LOOP
    IF v_attempt.client_selected = v_attempt.server_correct THEN
      v_correct_count := v_correct_count + 1;

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

  RETURN jsonb_build_object(
    'valid', NOT v_tampering_detected,
    'corrected_score', v_correct_count,
    'client_score', (
      SELECT COALESCE(correct, 0)
      FROM practice_sessions
      WHERE id = p_session_id
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

GRANT EXECUTE ON FUNCTION validate_session_submit(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION validate_session_submit IS
  'Server-side session validation RPC for anti-tampering.
   Recomputes correctness from authoritative DB and detects score inflation.';

COMMIT;
