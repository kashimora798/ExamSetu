-- =============================================================================
-- Migration: P0.13 content quality reporting
-- Date: 2026-04-13
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS questions_reports (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  session_id UUID NULL REFERENCES practice_sessions(id) ON DELETE SET NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'practice_results'
    CHECK (source IN ('practice_session', 'practice_results', 'mock_results')),
  report_type VARCHAR(30) NOT NULL DEFAULT 'other'
    CHECK (report_type IN ('typo', 'wrong_answer', 'wrong_explanation', 'translation_issue', 'other')),
  report_text TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'resolved', 'rejected')),
  moderator_note TEXT NULL,
  resolved_by UUID NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_reports_question_created
  ON questions_reports (question_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_reports_status_created
  ON questions_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_questions_reports_user_created
  ON questions_reports (user_id, created_at DESC);

ALTER TABLE questions_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS questions_reports_insert_own ON questions_reports;
CREATE POLICY questions_reports_insert_own
  ON questions_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS questions_reports_select_own ON questions_reports;
CREATE POLICY questions_reports_select_own
  ON questions_reports
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'superadmin')
    )
  );

DROP POLICY IF EXISTS questions_reports_update_admin ON questions_reports;
CREATE POLICY questions_reports_update_admin
  ON questions_reports
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin', 'superadmin')
    )
  );

COMMIT;
