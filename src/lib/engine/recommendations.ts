import { supabase } from '../supabase';

export interface Recommendation {
  id: string;
  type: 'topic' | 'revision' | 'mock' | 'break';
  priority: 'urgent' | 'suggested' | 'optional';
  title: string;
  subtitle: string;
  targetId?: string;
  estimatedMinutes?: number;
}

export async function generateRecommendations(userId: string): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];

  try {
    // 1. Urgent: topics with accuracy < 50% AND attempted >= 3
    const { data: urgentTopics } = await supabase
      .from('user_topic_stats')
      .select('topic_id, accuracy_pct, attempts, topics(name_hi, name_en)')
      .eq('user_id', userId)
      .lt('accuracy_pct', 50)
      .gte('attempts', 3)
      .order('accuracy_pct', { ascending: true })
      .limit(2);

    (urgentTopics || []).forEach((t: any, i) => {
      recs.push({
        id: `urgent_${i}`,
        type: 'topic',
        priority: 'urgent',
        title: `⚠️ ${t.topics?.name_hi || t.topics?.name_en} में practice करें`,
        subtitle: `आपकी accuracy ${t.accuracy_pct}% है (${t.attempts} attempts) — target 70%+`,
        targetId: t.topic_id,
        estimatedMinutes: 15,
      });
    });

    // 2. Suggested: accuracy 50-70%, attempted >= 5
    const { data: suggestedTopics } = await supabase
      .from('user_topic_stats')
      .select('topic_id, accuracy_pct, topics(name_hi, name_en)')
      .eq('user_id', userId)
      .gte('accuracy_pct', 50)
      .lt('accuracy_pct', 70)
      .gte('attempts', 5)
      .order('accuracy_pct', { ascending: true })
      .limit(1);

    (suggestedTopics || []).forEach((t: any, i) => {
      recs.push({
        id: `suggested_${i}`,
        type: 'topic',
        priority: 'suggested',
        title: `💡 ${t.topics?.name_hi || t.topics?.name_en} को improve करें`,
        subtitle: `Accuracy ${t.accuracy_pct}% — थोड़ी सी practice से 80%+ हो सकता है`,
        targetId: t.topic_id,
        estimatedMinutes: 20,
      });
    });

    // 3. Check if last 3 sessions all same subject → suggest variety
    const { data: recentSessions } = await supabase
      .from('practice_sessions')
      .select('filters')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(3);

    if (recentSessions && recentSessions.length === 3) {
      const subjects = recentSessions.map((s: any) => s.filters?.subjectId).filter(Boolean);
      if (subjects.length === 3 && new Set(subjects).size === 1) {
        recs.push({
          id: 'variety',
          type: 'topic',
          priority: 'suggested',
          title: '📚 कोई और subject try करें',
          subtitle: 'आप पिछले 3 sessions से एक ही subject practice कर रहे हैं',
          estimatedMinutes: 20,
        });
      }
    }

    // 4. Mock test suggestion if not done in 7 days
    const { data: lastMock } = await supabase
      .from('practice_sessions')
      .select('completed_at')
      .eq('user_id', userId)
      .eq('session_type', 'mock_test')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysSinceLastMock = lastMock?.completed_at
      ? (Date.now() - new Date(lastMock.completed_at).getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    if (daysSinceLastMock >= 7) {
      recs.push({
        id: 'mock',
        type: 'mock',
        priority: 'optional',
        title: '📝 Full Mock Test दें',
        subtitle: `${Math.ceil(daysSinceLastMock)} दिनों से Mock Test नहीं दिया — अभी ज़रूरी है`,
        estimatedMinutes: 150,
      });
    }

    // 5. Revision — if there are bookmarks
    const { count } = await supabase
      .from('bookmarks')
      .select('question_id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (count && count > 0) {
      recs.push({
        id: 'revision',
        type: 'revision',
        priority: 'optional',
        title: `🔖 ${count} Bookmarks revise करें`,
        subtitle: 'आपके saved questions को दोबारा practice करें',
        estimatedMinutes: Math.ceil((count as number) / 2),
      });
    }

  } catch (err) {
    console.warn('Recommendations error (non-fatal):', err);
  }

  // Always show at least one action
  if (recs.length === 0) {
    recs.push({
      id: 'start_here',
      type: 'topic',
      priority: 'suggested',
      title: '🎯 Topic Practice शुरू करें',
      subtitle: 'एक topic चुनें और अपनी preparation शुरू करें',
      estimatedMinutes: 20,
    });
  }

  return recs.sort((a, b) => {
    const order = { urgent: 0, suggested: 1, optional: 2 };
    return order[a.priority] - order[b.priority];
  });
}
