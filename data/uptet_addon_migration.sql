-- =============================================================================
--  UPTET PLATFORM — ADDON MIGRATION
--  Gap Fixes: SRS · AI Recommendations · Percentiles ·
--             Cross-Institute Benchmarking · Diagnostic Test
--  PostgreSQL 15+ | Supabase Compatible
--  Run AFTER the main schema (uptet_initial.sql)
-- =============================================================================
--
--  WHAT THIS FILE ADDS
--  ───────────────────
--  [J] SPACED REPETITION  — srs_cards table + SM-2 update function + trigger
--  [K] RECOMMENDATIONS    — get_recommended_questions() tiered SQL function
--  [L] PERCENTILES        — nightly window-function recompute function
--  [M] PLATFORM STATS     — cross-institute topic benchmarking table + view
--  [N] DIAGNOSTIC TEST    — is_diagnostic flag + helper function + seed template
--  [O] AI EXPLANATION     — cost guard, enqueue RPC, complete callback, cost view
--  [P] CRON SCHEDULES     — pg_cron jobs for all nightly tasks
--  [Q] RLS POLICIES       — RLS for every new table + GRANT for RPCs
--  [R] INDEXES            — supporting indexes for new tables/functions
--
-- =============================================================================

-- =============================================================================
-- [J] SPACED REPETITION (SM-2 Algorithm)
-- =============================================================================

-- ─── J1. SRS CARDS ────────────────────────────────────────────────────────────
-- One row per (user, question) pair. Updated every time the user reviews a card.
CREATE TABLE IF NOT EXISTS srs_cards (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID         NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    question_id      UUID         NOT NULL REFERENCES questions(id)     ON DELETE CASCADE,

    -- SM-2 core fields
    ease_factor      DECIMAL(4,2) NOT NULL DEFAULT 2.5,  -- min 1.3, starts at 2.5
    interval_days    INTEGER      NOT NULL DEFAULT 1,     -- days until next review
    repetitions      INTEGER      NOT NULL DEFAULT 0,     -- successful reviews in a row

    -- Scheduling
    next_review_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_reviewed_at TIMESTAMPTZ,

    -- Last performance grade: 0=blackout 1=wrong 2=hard 3=ok 4=easy 5=perfect
    last_grade       SMALLINT     CHECK (last_grade BETWEEN 0 AND 5),

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, question_id)
);

COMMENT ON TABLE srs_cards IS
    'SM-2 spaced-repetition schedule per user per question. '
    'Updated by update_srs_card() after every question_attempt insert.';

-- ─── J2. SM-2 UPDATE FUNCTION ─────────────────────────────────────────────────
-- Call this after every question_attempt INSERT.
-- grade: 0-5 matching SM-2 scale (map: skipped=0, wrong=1, correct=4)
CREATE OR REPLACE FUNCTION update_srs_card(
    p_user_id     UUID,
    p_question_id UUID,
    p_grade       SMALLINT   -- 0..5
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as DB owner, bypasses RLS so it can always write
SET search_path = public
AS $$
DECLARE
    v_ef          DECIMAL(4,2);
    v_interval    INTEGER;
    v_reps        INTEGER;
    v_next_ef     DECIMAL(4,2);
    v_next_int    INTEGER;
    v_next_reps   INTEGER;
BEGIN
    -- Fetch or default-initialise the card
    SELECT ease_factor, interval_days, repetitions
    INTO   v_ef, v_interval, v_reps
    FROM   srs_cards
    WHERE  user_id = p_user_id AND question_id = p_question_id;

    IF NOT FOUND THEN
        v_ef := 2.5; v_interval := 1; v_reps := 0;
    END IF;

    -- SM-2 algorithm
    IF p_grade >= 3 THEN
        -- Correct answer
        v_next_reps := v_reps + 1;
        v_next_int  := CASE
            WHEN v_reps = 0 THEN 1
            WHEN v_reps = 1 THEN 6
            ELSE ROUND(v_interval * v_ef)
        END;
        -- EF' = EF + (0.1 - (5-grade)*(0.08+(5-grade)*0.02))
        v_next_ef := GREATEST(1.3,
            v_ef + 0.1 - (5 - p_grade) * (0.08 + (5 - p_grade) * 0.02)
        );
    ELSE
        -- Wrong / skipped — reset to day 1
        v_next_reps := 0;
        v_next_int  := 1;
        v_next_ef   := GREATEST(1.3, v_ef - 0.2);
    END IF;

    INSERT INTO srs_cards (
        user_id, question_id,
        ease_factor, interval_days, repetitions,
        next_review_at, last_reviewed_at, last_grade
    )
    VALUES (
        p_user_id, p_question_id,
        v_next_ef, v_next_int, v_next_reps,
        NOW() + (v_next_int || ' days')::INTERVAL,
        NOW(), p_grade
    )
    ON CONFLICT (user_id, question_id) DO UPDATE SET
        ease_factor      = EXCLUDED.ease_factor,
        interval_days    = EXCLUDED.interval_days,
        repetitions      = EXCLUDED.repetitions,
        next_review_at   = EXCLUDED.next_review_at,
        last_reviewed_at = EXCLUDED.last_reviewed_at,
        last_grade       = EXCLUDED.last_grade;
END;
$$;

COMMENT ON FUNCTION update_srs_card IS
    'Implements SM-2 spaced-repetition scheduling. '
    'Usage: SELECT update_srs_card(user_id, question_id, CASE WHEN is_correct THEN 4 ELSE 1 END)';

-- ─── J3. TRIGGER — auto-update SRS after every attempt ───────────────────────
-- Fires AFTER INSERT on question_attempts so grade is always recorded automatically.
CREATE OR REPLACE FUNCTION trg_srs_after_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Map attempt outcome to SM-2 grade (0-5):
    --   skipped  → 0 (blackout, treat as forgotten)
    --   wrong    → 1 (recalled incorrectly)
    --   correct  → 4 (correct with some effort)
    PERFORM update_srs_card(
        NEW.user_id,
        NEW.question_id,
        CASE
            WHEN NEW.is_skipped  THEN 0
            WHEN NEW.is_correct  THEN 4
            ELSE 1
        END::SMALLINT
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_srs_update ON question_attempts;
CREATE TRIGGER trg_srs_update
    AFTER INSERT ON question_attempts
    FOR EACH ROW
    EXECUTE FUNCTION trg_srs_after_attempt();


-- =============================================================================
-- [K] TIERED QUESTION RECOMMENDATIONS (Pure SQL — no AI needed)
-- =============================================================================

-- ─── K1. RECOMMENDATION FUNCTION ─────────────────────────────────────────────
-- Priority tier: 1=SRS due → 2=weak topics (<50% acc) → 3=unseen high-freq topics
CREATE OR REPLACE FUNCTION get_recommended_questions(
    p_user_id     UUID,
    p_limit       INTEGER  DEFAULT 10,
    p_subject     VARCHAR  DEFAULT NULL,   -- optional: 'CDP', 'Maths', etc.
    p_paper       SMALLINT DEFAULT NULL    -- optional: 1 or 2
)
RETURNS TABLE (
    question_id   UUID,
    reason        TEXT,
    priority      INTEGER,
    subject_code  VARCHAR,
    topic_name    TEXT,
    difficulty    VARCHAR
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_per_tier INTEGER := GREATEST(1, p_limit / 3);
BEGIN
    RETURN QUERY

    -- ── TIER 1: Due for SRS review (wrong/hard cards whose time has come) ──
    SELECT
        s.question_id,
        'SRS: समीक्षा करने का समय आ गया है'::TEXT   AS reason,
        1                                              AS priority,
        q.subject_code,
        t.name_en                                      AS topic_name,
        q.difficulty
    FROM srs_cards s
    JOIN questions  q ON q.id = s.question_id
    LEFT JOIN topics t ON t.id = q.topic_id
    WHERE s.user_id        = p_user_id
      AND s.next_review_at <= NOW()
      AND s.last_grade      < 3
      AND q.is_active       = TRUE
      AND q.deleted_at      IS NULL
      AND (p_subject IS NULL OR q.subject_code = p_subject)
      AND (p_paper   IS NULL OR q.paper_number = p_paper)
    ORDER BY s.next_review_at ASC
    LIMIT v_per_tier

    UNION ALL

    -- ── TIER 2: Weak topics — questions on topics where user accuracy < 50% ──
    SELECT
        q.id                                                            AS question_id,
        ('कमज़ोर topic: ' || t.name_en || ' (' ||
         ROUND(uts.accuracy_pct) || '% accuracy)')::TEXT               AS reason,
        2                                                               AS priority,
        q.subject_code,
        t.name_en                                                       AS topic_name,
        q.difficulty
    FROM questions q
    JOIN topics           t   ON t.id        = q.topic_id
    JOIN user_topic_stats uts ON uts.topic_id = q.topic_id
                              AND uts.user_id = p_user_id
    WHERE uts.accuracy_pct < 50
      AND q.is_active       = TRUE
      AND q.deleted_at      IS NULL
      -- Exclude questions attempted in the last 7 days (avoid immediate repetition)
      AND q.id NOT IN (
          SELECT qa.question_id FROM question_attempts qa
          WHERE  qa.user_id     = p_user_id
            AND  qa.attempted_at > NOW() - INTERVAL '7 days'
      )
      AND (p_subject IS NULL OR q.subject_code = p_subject)
      AND (p_paper   IS NULL OR q.paper_number = p_paper)
    ORDER BY uts.accuracy_pct ASC, RANDOM()
    LIMIT v_per_tier

    UNION ALL

    -- ── TIER 3: High-frequency topics never attempted by this user ──
    SELECT
        q.id                                                                    AS question_id,
        ('उच्च-आवृत्ति topic जो आपने अभी तक नहीं पढ़ा: ' || tf.topic_name)::TEXT AS reason,
        3                                                                        AS priority,
        q.subject_code,
        t.name_en                                                                AS topic_name,
        q.difficulty
    FROM questions q
    JOIN topics          t  ON t.id         = q.topic_id
    JOIN topic_frequency tf ON tf.topic_slug = q.topic_slug
    WHERE tf.total_questions >= 5   -- topic appears 5+ times across years
      AND q.is_active       = TRUE
      AND q.deleted_at      IS NULL
      AND q.id NOT IN (
          SELECT qa.question_id FROM question_attempts qa
          WHERE  qa.user_id = p_user_id
      )
      AND (p_subject IS NULL OR q.subject_code = p_subject)
      AND (p_paper   IS NULL OR q.paper_number = p_paper)
    ORDER BY tf.total_questions DESC, RANDOM()
    LIMIT v_per_tier;
END;
$$;

COMMENT ON FUNCTION get_recommended_questions IS
    'Tiered recommendation engine — pure SQL, zero AI cost. '
    'Powers: "Questions for you today", weak topic drilling, spaced repetition. '
    'Usage: SELECT * FROM get_recommended_questions(auth.uid(), 10, NULL, 1)';


-- =============================================================================
-- [L] PERCENTILE COMPUTATION
-- =============================================================================

-- ─── L1. NIGHTLY PERCENTILE RECOMPUTE FUNCTION ───────────────────────────────
-- Uses PERCENT_RANK() window function — no extra table needed.
-- Scoped per exam_code + paper_number so Paper 1 and Paper 2 rank separately.
CREATE OR REPLACE FUNCTION recompute_session_percentiles()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    WITH ranked AS (
        SELECT
            ps.id,
            ROUND(
                PERCENT_RANK() OVER (
                    PARTITION BY
                        ps.filters->>'exam_code',
                        ps.filters->>'paper_number'
                    ORDER BY ps.score
                ) * 100
            , 1) AS computed_percentile
        FROM practice_sessions ps
        WHERE ps.status       = 'completed'
          AND ps.session_type IN ('mock_test', 'pyq_paper')
          AND ps.completed_at  > NOW() - INTERVAL '30 days'
          AND ps.score         IS NOT NULL
    )
    UPDATE practice_sessions ps
    SET    percentile = ranked.computed_percentile
    FROM   ranked
    WHERE  ps.id = ranked.id;

    RAISE NOTICE 'Session percentiles recomputed at %', NOW();
END;
$$;

COMMENT ON FUNCTION recompute_session_percentiles IS
    'Nightly percentile computation via PERCENT_RANK() window function. '
    'Scheduled by pg_cron at 4 AM daily — see Section [P].';


-- =============================================================================
-- [M] CROSS-INSTITUTE BENCHMARKING (Platform-wide stats)
-- =============================================================================

-- ─── M1. PLATFORM TOPIC STATS TABLE ──────────────────────────────────────────
-- Pre-aggregated nightly. Institutes compare their student accuracy vs this.
-- No raw user data is exposed — only aggregated platform numbers.
CREATE TABLE IF NOT EXISTS platform_topic_stats (
    topic_id               UUID         PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
    topic_slug             VARCHAR(100) NOT NULL,
    subject_code           VARCHAR(30)  NOT NULL,
    total_attempts         INTEGER      NOT NULL DEFAULT 0,
    total_correct          INTEGER      NOT NULL DEFAULT 0,
    platform_accuracy_pct  DECIMAL(5,2),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE platform_topic_stats IS
    'Platform-wide aggregated accuracy per topic. Updated nightly. '
    'Institutes use this for "My students vs platform avg" comparison.';

-- ─── M2. REFRESH FUNCTION ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_platform_topic_stats()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO platform_topic_stats (
        topic_id, topic_slug, subject_code,
        total_attempts, total_correct, platform_accuracy_pct, updated_at
    )
    SELECT
        q.topic_id,
        q.topic_slug,
        q.subject_code,
        COUNT(a.id)                                                          AS total_attempts,
        SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)                       AS total_correct,
        ROUND(AVG(CASE WHEN a.is_correct THEN 100.0 ELSE 0.0 END), 1)       AS platform_accuracy_pct,
        NOW()                                                                AS updated_at
    FROM question_attempts a
    JOIN questions q ON q.id = a.question_id
    WHERE q.topic_id IS NOT NULL
    GROUP BY q.topic_id, q.topic_slug, q.subject_code
    ON CONFLICT (topic_id) DO UPDATE SET
        total_attempts        = EXCLUDED.total_attempts,
        total_correct         = EXCLUDED.total_correct,
        platform_accuracy_pct = EXCLUDED.platform_accuracy_pct,
        updated_at            = EXCLUDED.updated_at;

    RAISE NOTICE 'platform_topic_stats refreshed at %', NOW();
END;
$$;

-- ─── M3. INSTITUTE vs PLATFORM COMPARISON VIEW ───────────────────────────────
-- Exposes per-institute topic performance vs platform average.
-- Query from Edge Function / server only; filter by institute_id in app layer.
CREATE OR REPLACE VIEW institute_topic_benchmark AS
SELECT
    im.institute_id,
    q.subject_code,
    q.topic_slug,
    t.name_en                                                              AS topic_name,
    COUNT(a.id)                                                            AS institute_attempts,
    SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)                         AS institute_correct,
    ROUND(AVG(CASE WHEN a.is_correct THEN 100.0 ELSE 0.0 END), 1)         AS institute_accuracy_pct,
    pts.platform_accuracy_pct,
    ROUND(
        AVG(CASE WHEN a.is_correct THEN 100.0 ELSE 0.0 END)
        - pts.platform_accuracy_pct
    , 1)                                                                   AS delta_vs_platform
FROM question_attempts    a
JOIN questions             q   ON q.id         = a.question_id
JOIN topics                t   ON t.id         = q.topic_id
JOIN institute_members     im  ON im.user_id   = a.user_id
JOIN platform_topic_stats  pts ON pts.topic_id = q.topic_id
GROUP BY im.institute_id, q.subject_code, q.topic_slug, t.name_en,
         pts.platform_accuracy_pct;

COMMENT ON VIEW institute_topic_benchmark IS
    'Institute accuracy vs platform average per topic. '
    'delta_vs_platform < 0 means the institute is below platform avg (needs attention). '
    'Always filter by institute_id in the application query.';


-- =============================================================================
-- [N] DIAGNOSTIC TEST
-- =============================================================================

-- ─── N1. ADD DIAGNOSTIC FLAG TO QUESTIONS ────────────────────────────────────
ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS is_diagnostic BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_questions_diagnostic
    ON questions (is_diagnostic, paper_number, subject_code)
    WHERE is_diagnostic = TRUE AND deleted_at IS NULL;

COMMENT ON COLUMN questions.is_diagnostic IS
    'TRUE for the curated 30-question onboarding diagnostic set (6 per subject). '
    'Tag manually once using the seed template below, then never change.';

-- ─── N2. DIAGNOSTIC QUESTION FETCH FUNCTION ───────────────────────────────────
-- Returns the 30-question diagnostic set for a given paper.
-- Safe to call anonymously on signup before user profile is fully created.
CREATE OR REPLACE FUNCTION get_diagnostic_questions(p_paper SMALLINT DEFAULT 1)
RETURNS TABLE (
    id           UUID,
    question_hi  TEXT,
    question_en  TEXT,
    options      JSONB,
    correct_option CHAR,
    subject_code VARCHAR,
    topic_name   TEXT,
    difficulty   VARCHAR,
    bloom_level  VARCHAR
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        q.id,
        q.question_hi,
        q.question_en,
        q.options,
        q.correct_option,
        q.subject_code,
        t.name_en   AS topic_name,
        q.difficulty,
        q.bloom_level
    FROM questions q
    LEFT JOIN topics t ON t.id = q.topic_id
    WHERE q.is_diagnostic  = TRUE
      AND q.paper_number   = p_paper
      AND q.is_active      = TRUE
      AND q.deleted_at     IS NULL
    ORDER BY q.subject_code, q.source_year DESC
    LIMIT 30;
$$;

-- ─── N3. SEED TEMPLATE — mark your diagnostic questions ───────────────────────
-- Uncomment and replace legacy_ids with actual IDs from your question bank.
-- Pattern: 6 per subject × 5 subjects = 30 questions for Paper 1.
-- Pick questions covering the highest-frequency exam topics per subject.
/*
UPDATE questions SET is_diagnostic = TRUE
WHERE paper_number = 1
  AND legacy_id IN (
    -- CDP (6): Piaget, Vygotsky, Kohlberg, Gardner, Bloom's, Motivation
    'UPTET_P1_CDP_2022_001',
    'UPTET_P1_CDP_2021_005',
    'UPTET_P1_CDP_2019_003',
    'UPTET_P1_CDP_2019_011',
    'UPTET_P1_CDP_2017_007',
    'UPTET_P1_CDP_2017_022',
    -- Hindi (6): Vakya shuddhi, Sandhi, Alankar, Ras, Nibandh, Vyakaran
    'UPTET_P1_Hindi_2022_004',
    'UPTET_P1_Hindi_2021_009',
    'UPTET_P1_Hindi_2019_002',
    'UPTET_P1_Hindi_2019_018',
    'UPTET_P1_Hindi_2017_006',
    'UPTET_P1_Hindi_2017_015',
    -- English (6): Tenses, Voice, Narration, Comprehension, Vocabulary, Grammar
    'UPTET_P1_English_2022_002',
    'UPTET_P1_English_2021_007',
    'UPTET_P1_English_2019_004',
    'UPTET_P1_English_2019_013',
    'UPTET_P1_English_2017_003',
    'UPTET_P1_English_2017_019',
    -- Maths (6): Fractions, LCM/HCF, Percentage, Geometry, Algebra, Profit/Loss
    'UPTET_P1_Maths_2022_006',
    'UPTET_P1_Maths_2021_011',
    'UPTET_P1_Maths_2019_008',
    'UPTET_P1_Maths_2019_021',
    'UPTET_P1_Maths_2017_004',
    'UPTET_P1_Maths_2017_016',
    -- EVS (6): Environment, Pollution, Food/Nutrition, Plants, Water, Family
    'UPTET_P1_EVS_2022_003',
    'UPTET_P1_EVS_2021_008',
    'UPTET_P1_EVS_2019_005',
    'UPTET_P1_EVS_2019_017',
    'UPTET_P1_EVS_2017_002',
    'UPTET_P1_EVS_2017_014'
);
*/


-- =============================================================================
-- [O] AI EXPLANATION GUARD & HELPERS
-- =============================================================================

-- ─── O1. COST GUARD — prevent duplicate AI jobs ───────────────────────────────
-- Returns FALSE if an explanation already exists or a job is in-flight.
-- Always call this before invoking the Claude Edge Function.
CREATE OR REPLACE FUNCTION should_generate_explanation(p_question_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_explanation BOOLEAN;
    v_job_status      VARCHAR;
BEGIN
    -- Already has a stored explanation
    SELECT (explanation_hi IS NOT NULL OR explanation_en IS NOT NULL)
    INTO   v_has_explanation
    FROM   questions
    WHERE  id = p_question_id;

    IF v_has_explanation THEN RETURN FALSE; END IF;

    -- Job already pending or processing
    SELECT status INTO v_job_status
    FROM   explanation_jobs
    WHERE  question_id = p_question_id
    ORDER  BY created_at DESC
    LIMIT  1;

    IF v_job_status IN ('pending', 'processing') THEN RETURN FALSE; END IF;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION should_generate_explanation IS
    'Cost guard — call before any Claude API invocation. '
    'Returns TRUE only when no explanation exists and no job is in-flight.';

-- ─── O2. ENQUEUE EXPLANATION (frontend-safe RPC) ──────────────────────────────
-- Frontend calls this via supabase.rpc(). Enforces Pro subscription in-DB
-- before creating the job, so the check cannot be bypassed by client code.
CREATE OR REPLACE FUNCTION enqueue_explanation(p_question_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_id UUID;
BEGIN
    -- Guard: skip if already exists or in-flight
    IF NOT should_generate_explanation(p_question_id) THEN
        RETURN NULL;
    END IF;

    -- Enforce Pro subscription server-side (cannot be bypassed by client)
    IF NOT EXISTS (
        SELECT 1
        FROM   subscriptions  s
        JOIN   plans          p ON p.id = s.plan_id
        WHERE  s.user_id   = auth.uid()
          AND  s.status    = 'active'
          AND  (p.features->>'ai_explanations')::BOOLEAN = TRUE
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'AI explanations require a Pro subscription.';
    END IF;

    INSERT INTO explanation_jobs (question_id, status)
    VALUES (p_question_id, 'pending')
    RETURNING id INTO v_job_id;

    RETURN v_job_id;
END;
$$;

COMMENT ON FUNCTION enqueue_explanation IS
    'Safe RPC for enqueueing a Claude explanation job. '
    'Enforces Pro subscription in-database before inserting job. '
    'Frontend: const { data: jobId } = await supabase.rpc(''enqueue_explanation'', { p_question_id: id })';

-- ─── O3. COMPLETE EXPLANATION JOB (called by Edge Function on success) ────────
-- Edge Function calls this after receiving Claude API response.
-- Saves explanation to questions table (permanent cache) + records cost.
CREATE OR REPLACE FUNCTION complete_explanation_job(
    p_question_id       UUID,
    p_explanation_hi    TEXT,
    p_explanation_en    TEXT    DEFAULT NULL,
    p_model             VARCHAR DEFAULT 'claude-haiku-4-5-20251001',
    p_prompt_tokens     INTEGER DEFAULT 0,
    p_completion_tokens INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cost_usd DECIMAL(10,6);
BEGIN
    -- Haiku 2025 pricing: input $0.80/M tokens, output $4.00/M tokens
    v_cost_usd := (p_prompt_tokens * 0.0000008) + (p_completion_tokens * 0.000004);

    -- Write explanation to question row (permanent — never call API again for this Q)
    UPDATE questions SET
        explanation_hi       = p_explanation_hi,
        explanation_en       = p_explanation_en,
        explanation_source   = 'ai',
        explanation_verified = FALSE,
        updated_at           = NOW()
    WHERE id = p_question_id;

    -- Mark job done + record cost for billing/monitoring
    UPDATE explanation_jobs SET
        status            = 'done',
        model_used        = p_model,
        prompt_tokens     = p_prompt_tokens,
        completion_tokens = p_completion_tokens,
        cost_usd          = v_cost_usd,
        completed_at      = NOW()
    WHERE question_id = p_question_id
      AND status      = 'processing';
END;
$$;

COMMENT ON FUNCTION complete_explanation_job IS
    'Called by generate-explanation Edge Function on Claude API success. '
    'Writes explanation permanently to questions; records token cost.';

-- ─── O4. MONTHLY AI COST SUMMARY VIEW ─────────────────────────────────────────
-- Surface in superadmin dashboard to monitor Claude API spend.
CREATE OR REPLACE VIEW ai_cost_summary AS
SELECT
    DATE_TRUNC('month', completed_at)          AS month,
    COUNT(*)                                    AS jobs_completed,
    SUM(prompt_tokens)                          AS total_prompt_tokens,
    SUM(completion_tokens)                      AS total_completion_tokens,
    ROUND(SUM(cost_usd)::NUMERIC, 4)           AS total_cost_usd,
    ROUND((SUM(cost_usd) * 83)::NUMERIC, 2)   AS total_cost_inr   -- approx USD→INR
FROM explanation_jobs
WHERE status = 'done'
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW ai_cost_summary IS
    'Monthly Claude API spend tracker. '
    'Access restricted to superadmin via application layer.';


-- =============================================================================
-- [P] pg_cron SCHEDULES
-- =============================================================================
-- Requires pg_cron extension: Dashboard → Database → Extensions → pg_cron → Enable

-- P1. Refresh topic_frequency materialized view (2 AM daily)
SELECT cron.schedule(
    'refresh-topic-frequency',
    '0 2 * * *',
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY topic_frequency;$$
);

-- P2. Recompute question accuracy_pct from raw counts (3 AM daily)
SELECT cron.schedule(
    'compute-question-accuracy',
    '0 3 * * *',
    $$
    UPDATE questions
    SET accuracy_pct = ROUND(
        correct_count::DECIMAL / NULLIF(attempt_count, 0) * 100, 2
    )
    WHERE attempt_count > 0;
    $$
);

-- P3. Recompute session percentiles (4 AM daily)
SELECT cron.schedule(
    'compute-percentiles',
    '0 4 * * *',
    $$SELECT recompute_session_percentiles();$$
);

-- P4. Refresh cross-institute platform topic stats (4:30 AM daily)
SELECT cron.schedule(
    'refresh-platform-topic-stats',
    '30 4 * * *',
    $$SELECT refresh_platform_topic_stats();$$
);

-- P5. Rebuild user_subject_stats from raw attempts (5 AM daily)
SELECT cron.schedule(
    'refresh-user-subject-stats',
    '0 5 * * *',
    $$
    INSERT INTO user_subject_stats (
        user_id, subject_id, attempts, correct, accuracy_pct,
        avg_time_secs, last_updated
    )
    SELECT
        a.user_id,
        q.subject_id,
        COUNT(a.id)                                                         AS attempts,
        SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)                       AS correct,
        ROUND(AVG(CASE WHEN a.is_correct THEN 100.0 ELSE 0.0 END), 1)       AS accuracy_pct,
        ROUND(AVG(a.time_taken_secs), 1)                                     AS avg_time_secs,
        NOW()                                                                AS last_updated
    FROM question_attempts a
    JOIN questions q ON q.id = a.question_id
    GROUP BY a.user_id, q.subject_id
    ON CONFLICT (user_id, subject_id) DO UPDATE SET
        attempts      = EXCLUDED.attempts,
        correct       = EXCLUDED.correct,
        accuracy_pct  = EXCLUDED.accuracy_pct,
        avg_time_secs = EXCLUDED.avg_time_secs,
        last_updated  = EXCLUDED.last_updated;
    $$
);

-- P6. Rebuild user_topic_stats + mastery_level (5:30 AM daily)
SELECT cron.schedule(
    'refresh-user-topic-stats',
    '30 5 * * *',
    $$
    INSERT INTO user_topic_stats (
        user_id, topic_id, attempts, correct, accuracy_pct,
        last_attempted, mastery_level
    )
    SELECT
        a.user_id,
        q.topic_id,
        COUNT(a.id)                                                         AS attempts,
        SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)                       AS correct,
        ROUND(AVG(CASE WHEN a.is_correct THEN 100.0 ELSE 0.0 END), 1)       AS accuracy_pct,
        MAX(a.attempted_at)                                                  AS last_attempted,
        CASE
            WHEN COUNT(a.id) < 3
                THEN 'not_started'
            WHEN AVG(CASE WHEN a.is_correct THEN 100.0 ELSE 0.0 END) < 40
                THEN 'learning'
            WHEN AVG(CASE WHEN a.is_correct THEN 100.0 ELSE 0.0 END) < 75
                THEN 'proficient'
            ELSE 'mastered'
        END                                                                  AS mastery_level
    FROM question_attempts a
    JOIN questions q ON q.id = a.question_id
    WHERE q.topic_id IS NOT NULL
    GROUP BY a.user_id, q.topic_id
    ON CONFLICT (user_id, topic_id) DO UPDATE SET
        attempts       = EXCLUDED.attempts,
        correct        = EXCLUDED.correct,
        accuracy_pct   = EXCLUDED.accuracy_pct,
        last_attempted = EXCLUDED.last_attempted,
        mastery_level  = EXCLUDED.mastery_level;
    $$
);

-- P7. Streak maintenance — reset broken streaks (midnight daily)
SELECT cron.schedule(
    'maintain-streaks',
    '1 0 * * *',
    $$
    UPDATE user_streaks
    SET current_streak = 0
    WHERE last_activity < CURRENT_DATE - INTERVAL '1 day'
      AND current_streak > 0;
    $$
);

-- P8. Recover stuck explanation jobs + mark permanently failed (every 5 minutes)
SELECT cron.schedule(
    'maintain-explanation-jobs',
    '*/5 * * * *',
    $$
    -- Stuck in 'processing' for > 3 minutes → reset to 'pending' for retry
    UPDATE explanation_jobs
    SET    status      = 'pending',
           retry_count = retry_count + 1
    WHERE  status      = 'processing'
      AND  created_at  < NOW() - INTERVAL '3 minutes'
      AND  retry_count < 3;

    -- Too many retries → mark failed permanently
    UPDATE explanation_jobs
    SET status = 'failed'
    WHERE status      = 'pending'
      AND retry_count >= 3;
    $$
);


-- =============================================================================
-- [Q] ROW LEVEL SECURITY + GRANTS
-- =============================================================================

-- ─── Q1. srs_cards ────────────────────────────────────────────────────────────
ALTER TABLE srs_cards ENABLE ROW LEVEL SECURITY;

-- Users can read and write only their own SRS cards
CREATE POLICY "srs_cards_own_all" ON srs_cards
    FOR ALL
    USING     (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ─── Q2. platform_topic_stats ─────────────────────────────────────────────────
-- Read is public to all authenticated users (aggregate data, no PII).
-- Write is restricted to service_role (cron / Edge Functions).
ALTER TABLE platform_topic_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_topic_stats_auth_read" ON platform_topic_stats
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "platform_topic_stats_service_write" ON platform_topic_stats
    FOR ALL
    USING     (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ─── Q3. questions.is_diagnostic ──────────────────────────────────────────────
-- Existing questions_public_read policy already covers this column. No change needed.

-- ─── Q4. GRANT EXECUTE on RPCs exposed to client ──────────────────────────────
-- All functions use SECURITY DEFINER — they run as the DB owner internally.
-- These GRANTs allow PostgREST to call them via supabase.rpc().

GRANT EXECUTE ON FUNCTION get_recommended_questions(UUID, INTEGER, VARCHAR, SMALLINT)
    TO authenticated;

GRANT EXECUTE ON FUNCTION get_diagnostic_questions(SMALLINT)
    TO authenticated, anon;   -- anon: called before profile exists on signup

GRANT EXECUTE ON FUNCTION enqueue_explanation(UUID)
    TO authenticated;

GRANT EXECUTE ON FUNCTION should_generate_explanation(UUID)
    TO authenticated;

-- service_role only — called exclusively from Edge Functions / cron
GRANT EXECUTE ON FUNCTION update_srs_card(UUID, UUID, SMALLINT)
    TO service_role;

GRANT EXECUTE ON FUNCTION complete_explanation_job(UUID, TEXT, TEXT, VARCHAR, INTEGER, INTEGER)
    TO service_role;

GRANT EXECUTE ON FUNCTION recompute_session_percentiles()
    TO service_role;

GRANT EXECUTE ON FUNCTION refresh_platform_topic_stats()
    TO service_role;


-- =============================================================================
-- [R] INDEXES
-- =============================================================================

-- srs_cards — most performance-critical new table
CREATE INDEX IF NOT EXISTS idx_srs_due
    ON srs_cards (user_id, next_review_at)
    WHERE next_review_at <= NOW() + INTERVAL '1 day';  -- near-future due cards

CREATE INDEX IF NOT EXISTS idx_srs_hard_cards
    ON srs_cards (user_id, last_grade)
    WHERE last_grade < 3;   -- wrong/hard cards (most common SRS query)

-- platform_topic_stats
CREATE INDEX IF NOT EXISTS idx_platform_stats_subject
    ON platform_topic_stats (subject_code, platform_accuracy_pct);

-- explanation_jobs — poller needs to find pending jobs quickly
CREATE INDEX IF NOT EXISTS idx_explanation_jobs_pending
    ON explanation_jobs (status, created_at)
    WHERE status IN ('pending', 'processing');


-- =============================================================================
-- FRONTEND QUICK-REFERENCE
-- How to call each new capability from your React app
-- =============================================================================
/*

─── SRS / RECOMMENDATIONS ────────────────────────────────────────────────────

  // All-subject recommendations (Dashboard "For you today" section)
  const { data } = await supabase.rpc('get_recommended_questions', {
    p_user_id: user.id,
    p_limit:   10,
  })

  // Subject-specific (Topic Practice page)
  const { data } = await supabase.rpc('get_recommended_questions', {
    p_user_id: user.id,
    p_limit:   6,
    p_subject: 'CDP',
    p_paper:   1,
  })
  // Returns: [{ question_id, reason, priority, subject_code, topic_name, difficulty }]


─── AI EXPLANATION ────────────────────────────────────────────────────────────

  // Step 1: Enqueue (DB RPC — enforces Pro check server-side)
  const { data: jobId, error } = await supabase.rpc('enqueue_explanation', {
    p_question_id: questionId,
  })
  if (error?.message.includes('Pro subscription')) showPaywall()

  // Step 2: Invoke Edge Function (does actual Claude API call)
  if (jobId) {
    await supabase.functions.invoke('generate-explanation', {
      body: { question_id: questionId },
    })
  }

  // Step 3: Subscribe to question update (Supabase Realtime)
  supabase
    .channel('explanation-' + questionId)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'questions',
      filter: 'id=eq.' + questionId,
    }, (payload) => setExplanation(payload.new.explanation_hi))
    .subscribe()


─── DIAGNOSTIC TEST ──────────────────────────────────────────────────────────

  // On signup — fetch the curated 30-question diagnostic set
  const { data: questions } = await supabase.rpc('get_diagnostic_questions', {
    p_paper: 1,
  })
  // Create a practice_session with session_type='custom', then run normally


─── INSTITUTE BENCHMARK ──────────────────────────────────────────────────────

  // Institute dashboard — worst gaps vs platform (via Edge Function, not client)
  const { data } = await supabase
    .from('institute_topic_benchmark')
    .select('topic_name, institute_accuracy_pct, platform_accuracy_pct, delta_vs_platform')
    .eq('institute_id', institute.id)
    .order('delta_vs_platform', { ascending: true })  // worst gaps first
    .limit(10)


─── PERCENTILE (on session completion) ───────────────────────────────────────

  // Percentile is updated nightly — show after next morning or poll until set
  const { data: session } = await supabase
    .from('practice_sessions')
    .select('score, percentile')
    .eq('id', sessionId)
    .single()
  // "Better than ${session.percentile}% of users"


─── AI COST MONITORING (superadmin) ─────────────────────────────────────────

  // Monthly spend summary (call from admin Edge Function, not client)
  const { data } = await supabase.from('ai_cost_summary').select('*').limit(12)

*/

-- =============================================================================
-- END OF ADDON MIGRATION
-- ─────────────────────────────────────────────────────────────────────────────
-- New tables    : 2  (srs_cards, platform_topic_stats)
-- New functions : 8  (update_srs_card, get_recommended_questions,
--                     recompute_session_percentiles, refresh_platform_topic_stats,
--                     get_diagnostic_questions, should_generate_explanation,
--                     enqueue_explanation, complete_explanation_job)
-- New trigger   : 1  (trg_srs_update on question_attempts)
-- New views     : 2  (institute_topic_benchmark, ai_cost_summary)
-- New column    : 1  (questions.is_diagnostic)
-- Cron jobs     : 8
-- RLS policies  : 3  (srs_cards × 1, platform_topic_stats × 2)
-- New indexes   : 4
-- =============================================================================
