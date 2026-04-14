-- Practice rollup fixes for UPTET
-- Adds DB-backed topic, chapter, and subject aggregates used by the practice engine.

CREATE TABLE IF NOT EXISTS user_chapter_stats (
    user_id         UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    chapter_id      UUID        NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    attempts        INTEGER     NOT NULL DEFAULT 0,
    correct         INTEGER     NOT NULL DEFAULT 0,
    accuracy_pct    DECIMAL(5,2),
    topics_completed INTEGER    NOT NULL DEFAULT 0,
    total_topics    INTEGER     NOT NULL DEFAULT 0,
    completion_pct DECIMAL(5,2),
    last_attempted TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, chapter_id)
);

CREATE OR REPLACE FUNCTION upsert_topic_stat(
    p_user_id UUID,
    p_topic_id UUID,
    p_new_attempts INTEGER,
    p_new_correct INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempts INTEGER;
    v_correct INTEGER;
    v_accuracy NUMERIC(5,2);
    v_mastery TEXT;
BEGIN
    INSERT INTO user_topic_stats (
        user_id,
        topic_id,
        attempts,
        correct,
        accuracy_pct,
        last_attempted,
        mastery_level
    )
    VALUES (
        p_user_id,
        p_topic_id,
        p_new_attempts,
        p_new_correct,
        NULL,
        NOW(),
        'learning'
    )
    ON CONFLICT (user_id, topic_id) DO UPDATE SET
        attempts = user_topic_stats.attempts + EXCLUDED.attempts,
        correct = user_topic_stats.correct + EXCLUDED.correct,
        accuracy_pct = ROUND(
            (user_topic_stats.correct + EXCLUDED.correct)::NUMERIC
            / NULLIF(user_topic_stats.attempts + EXCLUDED.attempts, 0) * 100,
            2
        ),
        last_attempted = NOW(),
        mastery_level = CASE
            WHEN (user_topic_stats.attempts + EXCLUDED.attempts) < 3 THEN 'not_started'
            WHEN ROUND(
                (user_topic_stats.correct + EXCLUDED.correct)::NUMERIC
                / NULLIF(user_topic_stats.attempts + EXCLUDED.attempts, 0) * 100,
                2
            ) < 40 THEN 'learning'
            WHEN ROUND(
                (user_topic_stats.correct + EXCLUDED.correct)::NUMERIC
                / NULLIF(user_topic_stats.attempts + EXCLUDED.attempts, 0) * 100,
                2
            ) < 75 THEN 'proficient'
            ELSE 'mastered'
        END;
END;
$$;

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
    v_total_topics INTEGER;
    v_topics_done INTEGER;
    v_accuracy NUMERIC(5,2);
    v_attempts INTEGER;
    v_correct INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_total_topics
    FROM topics t
    JOIN chapters c ON c.id = t.chapter_id
    WHERE c.id = p_chapter_id;

    SELECT COUNT(*)
    INTO v_topics_done
    FROM topics t
    LEFT JOIN user_topic_stats uts
        ON uts.topic_id = t.id AND uts.user_id = p_user_id
    WHERE t.chapter_id = p_chapter_id
      AND (
        uts.mastery_level IN ('proficient', 'mastered')
        OR COALESCE(uts.attempts, 0) > 0
      );

    INSERT INTO user_chapter_stats (
        user_id,
        chapter_id,
        attempts,
        correct,
        accuracy_pct,
        topics_completed,
        total_topics,
        completion_pct,
        last_attempted,
        updated_at
    )
    VALUES (
        p_user_id,
        p_chapter_id,
        p_new_attempts,
        p_new_correct,
        NULL,
        v_topics_done,
        v_total_topics,
        CASE WHEN v_total_topics > 0 THEN ROUND((v_topics_done::NUMERIC / v_total_topics) * 100, 2) ELSE 0 END,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id, chapter_id) DO UPDATE SET
        attempts = user_chapter_stats.attempts + EXCLUDED.attempts,
        correct = user_chapter_stats.correct + EXCLUDED.correct,
        accuracy_pct = ROUND(
            (user_chapter_stats.correct + EXCLUDED.correct)::NUMERIC
            / NULLIF(user_chapter_stats.attempts + EXCLUDED.attempts, 0) * 100,
            2
        ),
        topics_completed = EXCLUDED.topics_completed,
        total_topics = EXCLUDED.total_topics,
        completion_pct = CASE WHEN EXCLUDED.total_topics > 0 THEN ROUND((EXCLUDED.topics_completed::NUMERIC / EXCLUDED.total_topics) * 100, 2) ELSE 0 END,
        last_attempted = NOW(),
        updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION upsert_subject_stat(
    p_user_id UUID,
    p_subject_id UUID,
    p_new_attempts INTEGER,
    p_new_correct INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_subject_stats (
        user_id,
        subject_id,
        attempts,
        correct,
        accuracy_pct,
        avg_time_secs,
        last_updated
    )
    VALUES (
        p_user_id,
        p_subject_id,
        p_new_attempts,
        p_new_correct,
        CASE WHEN p_new_attempts > 0 THEN ROUND((p_new_correct::NUMERIC / p_new_attempts) * 100, 2) ELSE 0 END,
        NULL,
        NOW()
    )
    ON CONFLICT (user_id, subject_id) DO UPDATE SET
        attempts = user_subject_stats.attempts + EXCLUDED.attempts,
        correct = user_subject_stats.correct + EXCLUDED.correct,
        accuracy_pct = ROUND(
            (user_subject_stats.correct + EXCLUDED.correct)::NUMERIC
            / NULLIF(user_subject_stats.attempts + EXCLUDED.attempts, 0) * 100,
            2
        ),
        last_updated = NOW();
END;
$$;

ALTER TABLE user_subject_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_topic_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_chapter_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_subject_stats_own_all ON user_subject_stats;
CREATE POLICY user_subject_stats_own_all ON user_subject_stats
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_topic_stats_own_all ON user_topic_stats;
CREATE POLICY user_topic_stats_own_all ON user_topic_stats
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_chapter_stats_own_all ON user_chapter_stats;
CREATE POLICY user_chapter_stats_own_all ON user_chapter_stats
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT EXECUTE ON FUNCTION upsert_topic_stat(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_chapter_stat(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_subject_stat(UUID, UUID, INTEGER, INTEGER) TO authenticated;
