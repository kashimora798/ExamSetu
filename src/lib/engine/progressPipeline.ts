import { supabase } from '../supabase';

/**
 * A single attempt entry as recorded in question_attempts joined with questions.
 */
export interface AttemptRecord {
  id: string;
  question_id: string;
  selected_option: string | null;
  is_correct: boolean | null;
  time_taken_secs?: number;
  questions: {
    id: string;
    topic_id: string | null;
    chapter_id: string | null;
    subject_id: string | null;
  };
}

export interface ProgressResult {
  topicsUpdated: number;
  chaptersUpdated: number;
  subjectsUpdated: number;
}

/**
 * updateProgressRollups
 *
 * Call this after every session submit. It updates:
 *  1. user_topic_stats via upsert_topic_stat RPC  (per topic answered)
 *  2. user_chapter_stats via upsert_chapter_stat RPC (per chapter answered)
 *  3. user_subject_stats via upsert_subject_stat RPC (per subject answered)
 *  4. user_profiles counters (total_questions_attempted, total_correct)
 *
 * This ensures chapter progress updates regardless of whether a topic is
 * "fully mastered" — any attempt in a chapter advances the chapter stat.
 */
export async function updateProgressRollups(
  userId: string,
  attempts: AttemptRecord[],
): Promise<ProgressResult> {
  // ── Build per-topic aggregates ───────────────────────────────────────
  const topicMap: Record<string, { attempts: number; correct: number }> = {};
  const chapterMap: Record<string, { attempts: number; correct: number }> = {};
  const subjectMap: Record<string, { attempts: number; correct: number }> = {};

  for (const a of attempts) {
    if (!a.selected_option) continue; // skip unanswered

    const topicId = a.questions?.topic_id;
    const chapterId = a.questions?.chapter_id;
    const subjectId = a.questions?.subject_id;
    const correct = a.is_correct === true ? 1 : 0;

    if (topicId) {
      if (!topicMap[topicId]) topicMap[topicId] = { attempts: 0, correct: 0 };
      topicMap[topicId].attempts += 1;
      topicMap[topicId].correct += correct;
    }
    if (chapterId) {
      if (!chapterMap[chapterId]) chapterMap[chapterId] = { attempts: 0, correct: 0 };
      chapterMap[chapterId].attempts += 1;
      chapterMap[chapterId].correct += correct;
    }
    if (subjectId) {
      if (!subjectMap[subjectId]) subjectMap[subjectId] = { attempts: 0, correct: 0 };
      subjectMap[subjectId].attempts += 1;
      subjectMap[subjectId].correct += correct;
    }
  }

  const results = await Promise.allSettled([
    // ── 1. Topic stats ────────────────────────────────────────────────
    ...Object.entries(topicMap).map(([topicId, stats]) =>
      supabase.rpc('upsert_topic_stat', {
        p_user_id: userId,
        p_topic_id: topicId,
        p_new_attempts: stats.attempts,
        p_new_correct: stats.correct,
      }),
    ),

    // ── 2. Chapter stats ──────────────────────────────────────────────
    ...Object.entries(chapterMap).map(([chapterId, stats]) =>
      supabase.rpc('upsert_chapter_stat', {
        p_user_id: userId,
        p_chapter_id: chapterId,
        p_new_attempts: stats.attempts,
        p_new_correct: stats.correct,
      }),
    ),

    // ── 3. Subject stats ──────────────────────────────────────────────
    ...Object.entries(subjectMap).map(([subjectId, stats]) =>
      supabase.rpc('upsert_subject_stat', {
        p_user_id: userId,
        p_subject_id: subjectId,
        p_new_attempts: stats.attempts,
        p_new_correct: stats.correct,
      }),
    ),
  ]);

  // Log any RPC failures (non-blocking)
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[progressPipeline] rollup #${i} failed:`, r.reason);
    } else if ((r.value as any)?.error) {
      console.warn(`[progressPipeline] rollup #${i} error:`, (r.value as any).error);
    }
  });

  // ── 4. Profile grand totals ───────────────────────────────────────────
  try {
    const { data: totals } = await supabase
      .from('question_attempts')
      .select('id, is_correct')
      .eq('user_id', userId)
      .not('selected_option', 'is', null);

    if (totals) {
      await supabase.from('user_profiles').update({
        total_questions_attempted: totals.length,
        total_correct: totals.filter((t: any) => t.is_correct).length,
        last_active_at: new Date().toISOString(),
      }).eq('id', userId);
    }
  } catch (err) {
    console.warn('[progressPipeline] profile update failed:', err);
  }

  return {
    topicsUpdated: Object.keys(topicMap).length,
    chaptersUpdated: Object.keys(chapterMap).length,
    subjectsUpdated: Object.keys(subjectMap).length,
  };
}
