/* ── Core database types for ShikshaSetu ── */

export interface Exam {
  id: string;
  code: string;
  name_en: string;
  name_hi: string | null;
  state: string | null;
  is_active: boolean;
}

export interface ExamPaper {
  id: string;
  exam_id: string;
  paper_number: number;
  name_en: string;
  name_hi: string | null;
  total_questions: number;
  duration_mins: number;
}

export interface Subject {
  id: string;
  exam_paper_id: string;
  code: string;
  name_en: string;
  name_hi: string | null;
  question_count: number | null;
  sort_order: number;
}

export interface Chapter {
  id: string;
  subject_id: string;
  slug: string;
  name_en: string;
  name_hi: string | null;
  sort_order: number;
}

export interface Topic {
  id: string;
  chapter_id: string;
  slug: string;
  name_en: string;
  name_hi: string | null;
  sort_order: number;
}

export interface Question {
  id: string;
  exam_session_id: string;
  subject_id: string;
  chapter_id: string | null;
  topic_id: string | null;
  exam_code: string;
  paper_number: number;
  source_year: number;
  subject_code: string;
  question_hi: string | null;
  question_en: string | null;
  options: Record<string, string>;
  correct_option: 'A' | 'B' | 'C' | 'D';
  difficulty: 'easy' | 'medium' | 'hard';
  is_pyq: boolean;
  explanation_hi: string | null;
  explanation_en: string | null;
  attempt_count: number;
  correct_count: number;
  accuracy_pct: number | null;
}

export interface UserProfile {
  id: string;
  role: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  preferred_lang: 'hi' | 'en';
  target_exam_id: string | null;
  target_paper: number | null;
  onboarding_done: boolean;
  streak_days: number;
  last_active_at: string | null;
  total_questions_attempted: number;
  total_correct: number;
  /** Array of optional subject IDs the user has opted into (e.g. their Language II choice) */
  subjects_opted: string[] | null;
  /** UPTET exam target date, stored as ISO date string (YYYY-MM-DD) */
  target_exam_date: string | null;
}

export interface PracticeSession {
  id: string;
  user_id: string;
  session_type: 'topic_practice' | 'mock_test' | 'pyq_paper' | 'revision' | 'challenge' | 'custom';
  filters: Record<string, unknown>;
  total_questions: number;
  time_limit_secs: number | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  started_at: string;
  completed_at: string | null;
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number | null;
}

export interface QuestionAttempt {
  id: string;
  session_id: string;
  user_id: string;
  question_id: string;
  selected_option: string | null;
  is_correct: boolean | null;
  is_skipped: boolean;
  is_marked: boolean;
  time_taken_secs: number | null;
  question_order: number;
}

export interface Subscription {
  id: string;
  user_id: string | null;
  plan_id: string;
  status: 'active' | 'cancelled' | 'expired' | 'paused' | 'trial';
  started_at: string;
  expires_at: string | null;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  plan_type: 'b2c' | 'b2b';
  price_inr: number;
  billing_period: 'monthly' | 'annual' | 'one_time';
  features: Record<string, unknown>;
  is_active: boolean;
}

export interface Bookmark {
  user_id: string;
  question_id: string;
  collection: string;
  note: string | null;
  created_at: string;
}
