import { supabase } from '../supabase';
import type { Question } from '../types';

export type SessionMode = 'topic_practice' | 'chapter_practice' | 'mock_test' | 'pyq_paper' | 'revision' | 'challenge' | 'weak_mix';

export interface SelectorOptions {
  limit?: number;
  subjectId?: string;
  chapterId?: string;
  topicId?: string;
  sourceYear?: number;
  paperNumber?: number;
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
 contentSource?: 'pyq' | 'mock' | 'mixed';
}

// ─── Priority scores for spaced repetition ─────────────────────────────────
function getSpacedRepPriority(lastCorrect: boolean | null, lastAttemptedAt: string | null): number {
  if (lastAttemptedAt === null) return 100;      // never seen → highest priority
  if (!lastCorrect) return 90;                    // got it wrong → very high
  
  const daysSince = (Date.now() - new Date(lastAttemptedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 1)  return 0;   // just did it → skip
  if (daysSince < 3)  return 20;  // saw recently, correct → low
  if (daysSince < 7)  return 50;  // 3-7 days → medium
  if (daysSince < 14) return 70;  // 1-2 weeks → high
  return 85;                       // 2+ weeks → very high (forgetting curve)
}

// ─── Main selector ──────────────────────────────────────────────────────────
export async function fetchQuestionsForSession(
  mode: SessionMode,
  userId: string,
  options: SelectorOptions,
): Promise<Question[]> {
  const limit = options.limit || 30;

  switch (mode) {
    // ── Topic Practice: spaced-rep prioritized ───────────────────────────
    case 'topic_practice':
    case 'chapter_practice': {
      let query = supabase
        .from('questions')
        .select('*')
        .eq('is_active', true);

      if (options.topicId) query = query.eq('topic_id', options.topicId);
      else if (options.chapterId) query = query.eq('chapter_id', options.chapterId);
      else if (options.subjectId) query = query.eq('subject_id', options.subjectId);
      if (options.difficulty && options.difficulty !== 'mixed') {
        query = query.eq('difficulty', options.difficulty);
      }
      if (options.contentSource === 'pyq') query = query.eq('is_pyq', true);
      if (options.contentSource === 'mock') query = query.eq('is_pyq', false);

      const { data: questions, error } = await query.limit(limit * 3);
      if (error) throw error;
      if (!questions || questions.length === 0) return [];

      // Fetch user's last attempts for these questions
      const questionIds = questions.map(q => q.id);
      const { data: lastAttempts } = await supabase
        .from('question_attempts')
        .select('question_id, is_correct, attempted_at')
        .eq('user_id', userId)
        .in('question_id', questionIds)
        .order('attempted_at', { ascending: false });

      // Build lastAttempt map (question_id → most recent attempt)
      const attemptMap = new Map<string, { is_correct: boolean; attempted_at: string }>();
      (lastAttempts || []).forEach((a: any) => {
        if (!attemptMap.has(a.question_id)) {
          attemptMap.set(a.question_id, { is_correct: a.is_correct, attempted_at: a.attempted_at });
        }
      });

      // Score and sort
      const scored = questions.map(q => ({
        ...q,
        _priority: getSpacedRepPriority(
          attemptMap.get(q.id)?.is_correct ?? null,
          attemptMap.get(q.id)?.attempted_at ?? null,
        ),
      }));

      // Filter out questions answered correctly very recently (priority 0)
      const filtered = scored.filter(q => q._priority > 0);
      const result = filtered.length >= limit
        ? filtered.sort((a, b) => b._priority - a._priority).slice(0, limit)
        : scored.sort((a, b) => b._priority - a._priority).slice(0, limit);

      return result as Question[];
    }

    // ── PYQ Paper: exact year, original order ────────────────────────────
    case 'pyq_paper': {
      let query = supabase
        .from('questions')
        .select('*')
        .eq('is_active', true);
      if (options.sourceYear)  query = query.eq('source_year', options.sourceYear);
      if (options.paperNumber) query = query.eq('paper_number', options.paperNumber);
      const { data, error } = await query.order('legacy_id', { ascending: true }).limit(limit);
      if (error) throw error;
      return (data || []) as Question[];
    }

    // ── Weak Mix (Pro): focus on lowest accuracy topics ──────────────────
    case 'weak_mix': {
      const { data: weakTopics } = await supabase
        .from('user_topic_stats')
        .select('topic_id, accuracy_pct')
        .eq('user_id', userId)
        .lt('accuracy_pct', 60)
        .order('accuracy_pct', { ascending: true })
        .limit(5);

      let questions: any[] = [];

      if (weakTopics && weakTopics.length > 0) {
        // Pull approximately 20% per weak topic
        const perTopic = Math.ceil(limit * 0.2);
        for (const wt of weakTopics) {
          const { data } = await supabase
            .from('questions')
            .select('*')
            .eq('topic_id', wt.topic_id)
            .eq('is_active', true)
            .limit(perTopic);
          if (data) questions.push(...data);
        }
      }

      // Fill remainder with unseen medium questions
      if (questions.length < limit) {
        const existing = questions.map(q => q.id);
        const { data: fill } = await supabase
          .from('questions')
          .select('*')
          .eq('is_active', true)
          .eq('difficulty', 'medium')
          .not('id', 'in', `(${existing.join(',') || 'null'})`)
          .limit(limit - questions.length);
        if (fill) questions.push(...fill);
      }

      return questions.slice(0, limit) as Question[];
    }

    // ── Mock Test: structured by subject ────────────────────────────────
    case 'mock_test': {
      // Default: CDP 30 + Hindi 30 + English 30 + Maths 30 + EVS 30 = 150
      // For Quick Test: filter by specific subjectId or subjectCode
      const perSubject = options.subjectId ? (options.limit || 30) : 30;
      const subjectCodes = ['CDP', 'Hindi', 'English', 'Maths', 'EVS'];
      let allQuestions: any[] = [];

      if (options.subjectId) {
        // Quick Test: single subject
        const { data } = await supabase
          .from('questions')
          .select('*')
          .eq('subject_id', options.subjectId)
          .eq('is_active', true)
          .limit(perSubject * 4); // pull more, then shuffle
        if (data) allQuestions = data;
      } else {
        // Full mock: all 5 subjects
        for (const code of subjectCodes) {
          const { data } = await supabase
            .from('questions')
            .select('*')
            .eq('subject_code', code)
            .eq('is_active', true)
            .limit(perSubject * 3); // pull 3× then shuffle-select
          if (data) allQuestions.push(...data);
        }
      }

      // Fisher-Yates shuffle within each subject bucket to avoid always same questions
      function shuffleArr<T>(arr: T[]): T[] {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }

      if (options.subjectId) {
        return shuffleArr(allQuestions).slice(0, perSubject) as Question[];
      }

      // Group by subject_code, shuffle each group, take 30 per subject
      const grouped = new Map<string, any[]>();
      for (const q of allQuestions) {
        const key = q.subject_code || 'other';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(q);
      }
      const result: any[] = [];
      for (const code of subjectCodes) {
        const bucket = shuffleArr(grouped.get(code) || []);
        result.push(...bucket.slice(0, perSubject));
      }
      return result.slice(0, options.limit || 150) as Question[];
    }


    // ── Daily Challenge: 10 questions, date-seeded ───────────────────────
    case 'challenge': {
      // Use date as seed for consistent questions across all users today
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: all } = await supabase
        .from('questions')
        .select('*')
        .eq('is_active', true)
        .limit(500); // pull a pool, then deterministically select from it
        
      if (!all || all.length === 0) return [];
      
      // Simple seeded pseudo-random selection (same every day for same seed)
      const seed = todayStr.split('-').reduce((acc, s) => acc + parseInt(s), 0);
      const indices: number[] = [];
      let s = seed;
      while (indices.length < Math.min(10, all.length)) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const idx = s % all.length;
        if (!indices.includes(idx)) indices.push(idx);
      }
      return indices.map(i => all[i]) as Question[];
    }

    // ── Revision: from bookmarks or wrong answers ────────────────────────
    case 'revision': {
      // First try bookmarks
      const { data: bookmarks } = await supabase
        .from('bookmarks')
        .select('question_id')
        .eq('user_id', userId)
        .limit(limit);

      if (bookmarks && bookmarks.length > 0) {
        const bIds = bookmarks.map((b: any) => b.question_id);
        const { data } = await supabase
          .from('questions')
          .select('*')
          .in('id', bIds);
        if (data && data.length > 0) return data as Question[];
      }

      // Fallback: questions answered incorrectly
      const { data: wrongAttempts } = await supabase
        .from('question_attempts')
        .select('question_id')
        .eq('user_id', userId)
        .eq('is_correct', false)
        .order('attempted_at', { ascending: false })
        .limit(limit);

      if (!wrongAttempts || wrongAttempts.length === 0) return [];
      const wIds = [...new Set(wrongAttempts.map((a: any) => a.question_id))];
      const { data } = await supabase
        .from('questions')
        .select('*')
        .in('id', wIds);
      return (data || []) as Question[];
    }

    default:
      return [];
  }
}
