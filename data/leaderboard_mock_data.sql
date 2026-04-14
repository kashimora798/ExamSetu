-- This script populates the 'questions' and 'user_topic_stats' tables with mock aggregated data
-- so that peer performance features ("65% users got this right", "Top Masters") can be visualized.

BEGIN;

-- 1. Populate questions table with random attempt and accuracy data
UPDATE questions
SET 
  attempt_count = floor(random() * 50 + 5)::int,
  correct_count = floor(random() * (floor(random() * 50 + 5)::int))::int
WHERE attempt_count = 0 OR attempt_count IS NULL;

UPDATE questions
SET accuracy_pct = CASE 
  WHEN attempt_count > 0 THEN round((correct_count::numeric / attempt_count::numeric) * 100, 2)
  ELSE 0
END
WHERE attempt_count > 0;

-- 2. Populate Practice Sessions to show "You are in top X%"
-- Note: Assuming there are some user profiles available. We can do a quick check and insert dummy sessions IF NEEDED.
-- Since the user wanted mock data, we can create fake 'competitors' for existing mock test sessions if the table is empty,
-- but the simplest is just ensuring 'questions' and 'user_topic_stats' have rows.

-- 3. Let's make sure 'user_topic_stats' has data so Topic Masters appear.
-- For every topic, let's insert a few mock user stats if they don't exist.
-- First, ensure a dummy user exists
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'mock1@example.com'),
       ('00000000-0000-0000-0000-000000000002', 'mock2@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_profiles (id, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'Rahul MockUser', 'student'),
       ('00000000-0000-0000-0000-000000000002', 'Priya TopScorer', 'student')
ON CONFLICT (id) DO NOTHING;

-- Now populate user_topic_stats for these dummy users on EVERY topic!
INSERT INTO public.user_topic_stats (user_id, topic_id, attempts, correct, accuracy_pct, mastery_level)
SELECT 
  '00000000-0000-0000-0000-000000000001', 
  t.id, 
  floor(random() * 20 + 2)::int AS attempts,
  floor(random() * 10 + 2)::int AS correct,
  floor(random() * 40 + 40)::numeric AS accuracy_pct,
  'learning'
FROM public.topics t
ON CONFLICT (user_id, topic_id) DO UPDATE SET 
  attempts = EXCLUDED.attempts,
  accuracy_pct = EXCLUDED.accuracy_pct;

INSERT INTO public.user_topic_stats (user_id, topic_id, attempts, correct, accuracy_pct, mastery_level)
SELECT 
  '00000000-0000-0000-0000-000000000002', 
  t.id, 
  floor(random() * 20 + 5)::int AS attempts,
  floor(random() * 15 + 5)::int AS correct,
  floor(random() * 30 + 70)::numeric AS accuracy_pct,
  'proficient'
FROM public.topics t
ON CONFLICT (user_id, topic_id) DO UPDATE SET 
  attempts = EXCLUDED.attempts,
  accuracy_pct = EXCLUDED.accuracy_pct;

-- 4. Insert dummy mock test sessions so the percentile and global leaderboard is populated
INSERT INTO public.practice_sessions (user_id, session_type, status, score, total_questions, time_taken_secs, completed_at)
SELECT 
  '00000000-0000-0000-0000-000000000002', 
  'mock_test', 
  'completed', 
  floor(random() * 30 + 100)::int, 
  150, 
  floor(random() * 2000 + 4000)::int,
  NOW() - (random() * interval '10 days')
FROM generate_series(1, 10)
ON CONFLICT DO NOTHING;

INSERT INTO public.practice_sessions (user_id, session_type, status, score, total_questions, time_taken_secs, completed_at)
SELECT 
  '00000000-0000-0000-0000-000000000001', 
  'mock_test', 
  'completed', 
  floor(random() * 50 + 40)::int, 
  150, 
  floor(random() * 2000 + 4000)::int,
  NOW() - (random() * interval '10 days')
FROM generate_series(1, 10)
ON CONFLICT DO NOTHING;

-- 5. Insert dummy subject stats for 'Subject Accuracy' Global Leaderboard
INSERT INTO public.user_subject_stats (user_id, subject_id, attempts, correct, accuracy_pct, last_updated)
SELECT 
  '00000000-0000-0000-0000-000000000002', 
  s.id, 
  floor(random() * 200 + 50)::int AS attempts,
  floor(random() * 100 + 50)::int AS correct,
  floor(random() * 30 + 70)::numeric AS accuracy_pct,
  NOW()
FROM public.subjects s
ON CONFLICT (user_id, subject_id) DO UPDATE SET 
  attempts = EXCLUDED.attempts,
  accuracy_pct = EXCLUDED.accuracy_pct;

INSERT INTO public.user_subject_stats (user_id, subject_id, attempts, correct, accuracy_pct, last_updated)
SELECT 
  '00000000-0000-0000-0000-000000000001', 
  s.id, 
  floor(random() * 150 + 30)::int AS attempts,
  floor(random() * 50 + 20)::int AS correct,
  floor(random() * 40 + 40)::numeric AS accuracy_pct,
  NOW()
FROM public.subjects s
ON CONFLICT (user_id, subject_id) DO UPDATE SET 
  attempts = EXCLUDED.attempts,
  accuracy_pct = EXCLUDED.accuracy_pct;

COMMIT;
