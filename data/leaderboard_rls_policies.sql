-- =================================================================================
-- Leaderboard RLS Policy Migration
-- =================================================================================
-- The original Row Level Security (RLS) policies restricted users to ONLY read 
-- their own rows. This prevents the Global Leaderboard API calls from seeing 
-- competitors. This script adds SELECT-only policies allowing all authenticated 
-- users to securely read global scores while keeping write/edit access private.
-- =================================================================================

BEGIN;

-- 1. Unblock Subject Stats Reader for Leaderboard Tab
DROP POLICY IF EXISTS "user_subject_stats_read_all" ON user_subject_stats;
CREATE POLICY "user_subject_stats_read_all" ON user_subject_stats
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. Unblock Topic Stats Reader for Practice "Topic Masters" Preview
DROP POLICY IF EXISTS "user_topic_stats_read_all" ON user_topic_stats;
CREATE POLICY "user_topic_stats_read_all" ON user_topic_stats
    FOR SELECT
    TO authenticated
    USING (true);

-- 3. Unblock Practice Sessions Reader for Mock Test Leaderboard
-- (Only allows viewing the score/time summary, individual question attempts stay private)
DROP POLICY IF EXISTS "practice_sessions_read_all" ON practice_sessions;
CREATE POLICY "practice_sessions_read_all" ON practice_sessions
    FOR SELECT
    TO authenticated
    USING (true);

-- 4. Ensure User Profiles are readable so competitor names display
DROP POLICY IF EXISTS "user_profiles_read_all" ON user_profiles;
CREATE POLICY "user_profiles_read_all" ON user_profiles
    FOR SELECT
    TO authenticated
    USING (true);

COMMIT;
