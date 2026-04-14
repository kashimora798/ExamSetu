-- ============================================================
-- Migration: Question Images + Math/LaTeX Support
-- Run this in Supabase SQL editor
-- ============================================================

-- 1. Add image_url column to questions
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Optional: add a column for option images if options can have images too
ALTER TABLE questions ADD COLUMN IF NOT EXISTS option_images JSONB DEFAULT '{}'::jsonb;
-- Usage: { "A": "https://...", "B": "https://..." }

-- 2. Add has_math flag for quick client-side pre-filtering (optional optimisation)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS has_math BOOLEAN GENERATED ALWAYS AS (
  question_en ~* '\\\\frac|\\\\sqrt|\\\\times|\\\\div|\\\\alpha|\\\\beta|\\\\theta|\\\\pi|\\\\sigma|\\\$'
  OR question_hi ~* '\\\\frac|\\\\sqrt|\\\\times|\\\\div|\\\$'
) STORED;

-- 3. Supabase Storage bucket for question images (run separately via dashboard or API)
-- bucket name: question-images
-- public: true
-- allowed MIME: image/jpeg, image/png, image/webp, image/svg+xml
-- max size: 5MB

-- 4. Index for fast lookup of image questions
CREATE INDEX IF NOT EXISTS idx_questions_has_image
  ON questions(id) WHERE image_url IS NOT NULL;

-- 5. Index for math questions
CREATE INDEX IF NOT EXISTS idx_questions_has_math
  ON questions(id, subject_id) WHERE has_math = true;

-- ============================================================
-- Verify
-- ============================================================
SELECT
  COUNT(*) as total_questions,
  COUNT(image_url) as has_image,
  COUNT(*) FILTER (WHERE has_math) as has_math
FROM questions;
