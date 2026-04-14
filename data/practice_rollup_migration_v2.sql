-- ============================================================
-- Practice Rollup Migration v2
-- Fixes chapter completion_pct to reflect actual question
-- coverage (attempts / total_questions_in_chapter) rather than
-- only topic mastery thresholds.
-- Run this in Supabase SQL editor AFTER practice_rollup_migration.sql
-- ============================================================

-- 1. Add questions_seen column to user_chapter_stats (safe if already exists)
ALTER TABLE user_chapter_stats
  ADD COLUMN IF NOT EXISTS questions_seen INTEGER NOT NULL DEFAULT 0;

-- 2. Replace upsert_chapter_stat with a coverage-aware version
CREATE OR REPLACE FUNCTION upsert_chapter_stat(
    p_user_id UUID,
    p_chapter_id UUID,
    p_new_attempts INTEGER,
    p_new_correct INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_topics     INTEGER;
    v_topics_with_any  INTEGER;   -- topics that have at least 1 attempt
    v_total_q          INTEGER;   -- total active questions in chapter
    v_seen_q           INTEGER;   -- distinct questions the user has answered
    v_completion_pct   NUMERIC(5,2);
BEGIN
    -- Count topics in chapter
    SELECT COUNT(*)
    INTO v_total_topics
    FROM topics
    WHERE chapter_id = p_chapter_id;

    -- Count topics that have been attempted at all (coverage-based)
    SELECT COUNT(DISTINCT t.id)
    INTO v_topics_with_any
    FROM topics t
    JOIN user_topic_stats uts
        ON uts.topic_id = t.id AND uts.user_id = p_user_id
    WHERE t.chapter_id = p_chapter_id
      AND COALESCE(uts.attempts, 0) > 0;

    -- Total active questions in chapter
    SELECT COUNT(*)
    INTO v_total_q
    FROM questions
    WHERE chapter_id = p_chapter_id
      AND is_active = true;

    -- Questions user has actually answered in this chapter
    SELECT COUNT(DISTINCT qa.question_id)
    INTO v_seen_q
    FROM question_attempts qa
    JOIN questions q ON q.id = qa.question_id
    WHERE qa.user_id = p_user_id
      AND q.chapter_id = p_chapter_id
      AND qa.selected_option IS NOT NULL;

    -- completion_pct = percentage of questions seen / attempted (coverage)
    -- This moves with every chapter session, not just when topic is mastered
    v_completion_pct := CASE
        WHEN v_total_q > 0
        THEN ROUND((v_seen_q::NUMERIC / v_total_q) * 100, 2)
        ELSE 0
    END;

    INSERT INTO user_chapter_stats (
        user_id, chapter_id,
        attempts, correct, accuracy_pct,
        topics_completed, total_topics,
        questions_seen, completion_pct,
        last_attempted, updated_at
    )
    VALUES (
        p_user_id, p_chapter_id,
        p_new_attempts, p_new_correct,
        CASE WHEN p_new_attempts > 0
             THEN ROUND((p_new_correct::NUMERIC / p_new_attempts) * 100, 2)
             ELSE 0 END,
        v_topics_with_any, v_total_topics,
        v_seen_q, v_completion_pct,
        NOW(), NOW()
    )
    ON CONFLICT (user_id, chapter_id) DO UPDATE SET
        attempts        = user_chapter_stats.attempts + EXCLUDED.attempts,
        correct         = user_chapter_stats.correct  + EXCLUDED.correct,
        accuracy_pct    = ROUND(
            (user_chapter_stats.correct + EXCLUDED.correct)::NUMERIC
            / NULLIF(user_chapter_stats.attempts + EXCLUDED.attempts, 0) * 100,
            2
        ),
        topics_completed = EXCLUDED.topics_completed,
        total_topics     = EXCLUDED.total_topics,
        questions_seen   = EXCLUDED.questions_seen,
        completion_pct   = EXCLUDED.completion_pct,
        last_attempted   = NOW(),
        updated_at       = NOW();
END;
$$;

-- 3. Grant access to authenticated users
GRANT EXECUTE ON FUNCTION upsert_chapter_stat(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- 4. Backfill completion_pct for all existing chapter stats
-- This recalculates completion_pct based on actual questions seen
-- Safe to run multiple times
DO $$
DECLARE
    rec RECORD;
    v_total_q   INTEGER;
    v_seen_q    INTEGER;
    v_topics_done INTEGER;
    v_total_topics INTEGER;
BEGIN
    FOR rec IN SELECT DISTINCT user_id, chapter_id FROM user_chapter_stats LOOP
        SELECT COUNT(*) INTO v_total_q
        FROM questions WHERE chapter_id = rec.chapter_id AND is_active = true;

        SELECT COUNT(DISTINCT qa.question_id) INTO v_seen_q
        FROM question_attempts qa
        JOIN questions q ON q.id = qa.question_id
        WHERE qa.user_id = rec.user_id
          AND q.chapter_id = rec.chapter_id
          AND qa.selected_option IS NOT NULL;

        SELECT COUNT(DISTINCT t.id) INTO v_topics_done
        FROM topics t
        JOIN user_topic_stats uts ON uts.topic_id = t.id AND uts.user_id = rec.user_id
        WHERE t.chapter_id = rec.chapter_id AND COALESCE(uts.attempts, 0) > 0;

        SELECT COUNT(*) INTO v_total_topics
        FROM topics WHERE chapter_id = rec.chapter_id;

        UPDATE user_chapter_stats SET
            questions_seen = v_seen_q,
            completion_pct = CASE WHEN v_total_q > 0
                THEN ROUND((v_seen_q::NUMERIC / v_total_q) * 100, 2)
                ELSE 0 END,
            topics_completed = v_topics_done,
            total_topics = v_total_topics
        WHERE user_id = rec.user_id AND chapter_id = rec.chapter_id;
    END LOOP;
END $$;
