import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { useShareCard } from '../../hooks/useShareCard';
import ShareCardTemplate from '../../components/shared/ShareCardTemplate';
import SharePreviewModal from '../../components/shared/SharePreviewModal';
import {
  AlarmClockCheck,
  BarChart3,
  BookCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  Flame,
  Lock,
  Medal,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
  ArrowRight,
  Zap,
} from 'lucide-react';

interface SubjectStat {
  subjectId: string;
  subjectName: string;
  attempted: number;
  correct: number;
  accuracy: number;
  topics: TopicStat[];
}

interface TopicStat {
  topicId: string;
  topicName: string;
  accuracy: number;
  attempts: number;
}

interface DayPoint {
  date: string; // yyyy-mm-dd
  label: string; // e.g. "26 Mar"
  accuracy: number | null;
}

interface MockHistoryItem {
  id: string;
  name: string;
  date: string;
  score: number;
  max: number;
}

interface RevisionItem {
  topicId: string;
  topicName: string;
  subjectName: string;
  accuracy: number;
  dueText: string;
  urgency: 'high' | 'medium' | 'low';
}

interface LeaderboardItem {
  rank: number | 'avg' | 'you';
  name: string;
  accuracy: number;
  isYou: boolean;
}

export default function AnalyticsPage() {
  const { user, profile } = useAuth();
  const { isFree } = useSubscription();
  const { isSharing, shareElement, sharePreview, closeSharePreview, downloadSharePreview, sharePreviewNative } = useShareCard();
  const streakShareRef = useRef<HTMLDivElement>(null);
  const rankShareRef = useRef<HTMLDivElement>(null);
  const achievementShareRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [activeSessionDates, setActiveSessionDates] = useState<string[]>([]);
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [trendData, setTrendData] = useState<DayPoint[]>([]);
  const [hourlyAccuracy, setHourlyAccuracy] = useState<{ label: string; accuracy: number }[]>([]);
  const [mockHistory, setMockHistory] = useState<MockHistoryItem[]>([]);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardItem[]>([]);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadAnalytics();
  }, [user]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadOverallStats(),
        loadSubjectStats(),
        loadTrend(),
        loadHourlyAccuracy(),
        loadMockHistory(),
        loadLeaderboardSnapshot(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadOverallStats = async () => {
    try {
      const { data: sessions } = await supabase
        .from('practice_sessions')
        .select('correct, attempted, total_questions, completed_at, created_at')
        .eq('user_id', user!.id).eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (!sessions) return;
      const att = sessions.reduce((s, r) => s + (r.attempted || 0), 0);
      const cor = sessions.reduce((s, r) => s + (r.correct || 0), 0);
      setTotalAttempted(att); setTotalCorrect(cor);
      setTotalSessions(sessions.length);

      // Streak
      const dates = [...new Set(sessions.map(s => new Date(s.completed_at || s.created_at).toDateString()))];
      const dateISO = [...new Set(sessions.map(s => (s.completed_at || s.created_at || '').slice(0, 10)).filter(Boolean))];
      setActiveSessionDates(dateISO);
      let st = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(Date.now() - i * 86400000).toDateString();
        if (dates.includes(d)) st++; else break;
      }
      setStreak(st);
    } catch { }
  };

  const loadHourlyAccuracy = async () => {
    try {
      const { data: sessions } = await supabase
        .from('practice_sessions')
        .select('correct, attempted, completed_at, created_at')
        .eq('user_id', user!.id)
        .eq('status', 'completed')
        .limit(400);

      const buckets = Array.from({ length: 18 }, (_, i) => ({
        hour: i + 6,
        correct: 0,
        attempted: 0,
      }));

      for (const s of sessions || []) {
        const d = new Date(s.completed_at || s.created_at || '');
        const h = d.getHours();
        if (h < 6 || h > 23) continue;
        const idx = h - 6;
        buckets[idx].correct += s.correct || 0;
        buckets[idx].attempted += s.attempted || 0;
      }

      setHourlyAccuracy(buckets.map(b => ({
        label: b.hour <= 11 ? `${b.hour}AM` : b.hour === 12 ? '12PM' : `${b.hour - 12}PM`,
        accuracy: b.attempted > 0 ? Math.round((b.correct / b.attempted) * 100) : 0,
      })));
    } catch {
      setHourlyAccuracy([]);
    }
  };

  const loadMockHistory = async () => {
    try {
      const { data } = await supabase
        .from('practice_sessions')
        .select('id, score, correct, total_questions, completed_at, created_at')
        .eq('user_id', user!.id)
        .eq('session_type', 'mock_test')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(4);

      const mapped = (data || []).map((s: any, idx) => ({
        id: s.id,
        name: `Full Mock #${(data?.length || 0) - idx}`,
        date: new Date(s.completed_at || s.created_at || '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        score: s.score || s.correct || 0,
        max: s.total_questions || 150,
      }));
      setMockHistory(mapped);
    } catch {
      setMockHistory([]);
    }
  };

  const loadLeaderboardSnapshot = async () => {
    try {
      const { data } = await supabase
        .from('practice_sessions')
        .select('user_id, correct, attempted, user_profiles(full_name)')
        .eq('session_type', 'mock_test')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(300);

      if (!data || data.length === 0) {
        setLeaderboardRows([]);
        return;
      }

      const byUser = new Map<string, { name: string; cor: number; att: number }>();
      for (const r of data as any[]) {
        const id = r.user_id;
        if (!id) continue;
        const existing = byUser.get(id) || {
          name: r.user_profiles?.full_name || 'Learner',
          cor: 0,
          att: 0,
        };
        existing.cor += r.correct || 0;
        existing.att += r.attempted || 0;
        byUser.set(id, existing);
      }

      const ranked = [...byUser.entries()]
        .map(([uid, v]) => ({
          uid,
          name: v.name,
          acc: v.att > 0 ? Math.round((v.cor / v.att) * 100) : 0,
        }))
        .sort((a, b) => b.acc - a.acc);

      const topThree: LeaderboardItem[] = ranked.slice(0, 3).map((r, i) => ({
        rank: i + 1,
        name: r.name,
        accuracy: r.acc,
        isYou: r.uid === user?.id,
      }));

      const me = ranked.find(r => r.uid === user?.id);
      const avg = Math.round(ranked.reduce((s, r) => s + r.acc, 0) / Math.max(ranked.length, 1));
      const rows: LeaderboardItem[] = [
        ...topThree,
        ...(me ? [{ rank: 'you' as const, name: `${me.name || 'You'} (You)`, accuracy: me.acc, isYou: true }] : []),
        { rank: 'avg', name: 'Avg. user', accuracy: avg, isYou: false },
      ];
      setLeaderboardRows(rows);
    } catch {
      setLeaderboardRows([]);
    }
  };

  const loadSubjectStats = async () => {
    try {
      const { data: attempts } = await supabase
        .from('question_attempts')
        .select('is_correct, questions(topic_id, topics(name_hi, name_en, chapters(name_hi, name_en, subjects(id, name_hi, name_en))))')
        .eq('user_id', user!.id)
        .not('selected_option', 'is', null);

      if (!attempts || attempts.length === 0) { setSubjectStats([]); return; }

      const subMap: Record<string, { name: string; topics: Record<string, { name: string; correct: number; total: number }> }> = {};

      for (const a of attempts as any[]) {
        const topic = a.questions?.topics;
        const chapter = topic?.chapters;
        const subject = chapter?.subjects;
        if (!subject) continue;

        const sid = subject.id;
        const sName = subject.name_hi || subject.name_en || sid;
        const tid = a.questions?.topic_id;
        const tName = topic?.name_hi || topic?.name_en || tid;

        if (!subMap[sid]) subMap[sid] = { name: sName, topics: {} };
        if (tid && !subMap[sid].topics[tid]) subMap[sid].topics[tid] = { name: tName, correct: 0, total: 0 };
        if (tid) {
          subMap[sid].topics[tid].total++;
          if (a.is_correct) subMap[sid].topics[tid].correct++;
        }
      }

      const stats: SubjectStat[] = Object.entries(subMap).map(([sid, d]) => {
        const topics: TopicStat[] = Object.entries(d.topics).map(([tid, t]) => ({
          topicId: tid, topicName: t.name,
          accuracy: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0,
          attempts: t.total,
        })).sort((a, b) => a.accuracy - b.accuracy);

        const totalAtt = topics.reduce((s, t) => s + t.attempts, 0);
        const totalCor = topics.reduce((s, t) => s + Math.round((t.accuracy / 100) * t.attempts), 0);

        return {
          subjectId: sid, subjectName: d.name,
          attempted: totalAtt, correct: totalCor,
          accuracy: totalAtt > 0 ? Math.round((totalCor / totalAtt) * 100) : 0,
          topics,
        };
      }).sort((a, b) => a.accuracy - b.accuracy);

      setSubjectStats(stats);
    } catch (err) { console.error('Subject stats error:', err); }
  };

  const loadTrend = async () => {
    try {
      const days: DayPoint[] = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(Date.now() - (13 - i) * 86400000);
        return {
          date: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' }),
          accuracy: null,
        };
      });

      const { data: sessions } = await supabase
        .from('practice_sessions')
        .select('correct, attempted, completed_at')
        .eq('user_id', user!.id).eq('status', 'completed')
        .gte('completed_at', days[0].date)
        .order('completed_at', { ascending: true });

      if (sessions) {
        const byDay: Record<string, { cor: number; att: number }> = {};
        for (const s of sessions) {
          const day = (s.completed_at || '').slice(0, 10);
          if (!byDay[day]) byDay[day] = { cor: 0, att: 0 };
          byDay[day].cor += s.correct || 0;
          byDay[day].att += s.attempted || 0;
        }
        days.forEach(d => {
          const b = byDay[d.date];
          if (b && b.att > 0) d.accuracy = Math.round((b.cor / b.att) * 100);
        });
      }
      setTrendData(days);
    } catch { }
  };

  const overallAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

  const predictedScore = Math.round((overallAccuracy / 100) * 150);
  const cutoffs = [
    { cat: 'General (60%)', cut: 90 },
    { cat: 'OBC/SC/ST/Ex-Servicemen/PwD (55%)', cut: 82 },
  ];

  const examDate = useMemo(() => {
    if (profile?.target_exam_date) return new Date(profile.target_exam_date);
    return new Date(new Date().getFullYear(), 11, 31);
  }, [profile?.target_exam_date]);

  const daysLeft = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000));
  const weeksLeft = Math.max(0, Math.ceil(daysLeft / 7));
  const monthsLeft = Math.max(0, Math.round((daysLeft / 30) * 10) / 10);

  const weakTopicsForActions = subjectStats
    .flatMap(s => s.topics
      .filter(t => t.accuracy < 65 && t.attempts >= 3)
      .map(t => ({ ...t, subjectName: s.subjectName })))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  const revisionDue: RevisionItem[] = weakTopicsForActions.map((t, idx) => {
    const urgency: RevisionItem['urgency'] = idx < 2 ? 'high' : idx < 4 ? 'medium' : 'low';
    return {
      topicId: t.topicId,
      topicName: t.topicName,
      subjectName: t.subjectName,
      accuracy: t.accuracy,
      urgency,
      dueText: urgency === 'high' ? 'Due today' : urgency === 'medium' ? 'Due tomorrow' : 'Due in 2 days',
    };
  });

  const hourlyPeak = hourlyAccuracy.reduce((best, h) => h.accuracy > best.accuracy ? h : best, { label: '-', accuracy: 0 });
  const hourlyWorst = hourlyAccuracy.reduce((worst, h) => (h.accuracy > 0 && h.accuracy < worst.accuracy) ? h : worst, { label: '-', accuracy: 101 });

  const achievementBadges = [
    { label: 'First session', earned: totalSessions >= 1 },
    { label: '7-day streak', earned: streak >= 7 },
    { label: '100 questions', earned: totalAttempted >= 100 },
    { label: '50% accuracy', earned: overallAccuracy >= 50 },
    { label: '500 questions', earned: totalAttempted >= 500 },
    { label: 'Mock master', earned: mockHistory.length >= 3 },
  ];

  const topAchievement = achievementBadges.filter(b => b.earned).at(-1)?.label || 'First session';
  const yourRow = leaderboardRows.find(r => r.rank === 'you' || r.isYou);

  const handleShareStreakCard = async () => {
    await shareElement(streakShareRef.current, {
      kind: 'streak',
      userId: user?.id,
      filename: 'uptet-analytics-streak.png',
      title: 'My Study Streak',
      payload: {
        streak,
        sessionsToday: totalSessions,
        accuracy: overallAccuracy,
      },
    });
  };

  const handleShareRankCard = async () => {
    if (!yourRow) return;
    await shareElement(rankShareRef.current, {
      kind: 'rank',
      userId: user?.id,
      filename: 'uptet-analytics-rank.png',
      title: 'My Rank Snapshot',
      payload: {
        rank: yourRow.rank === 'you' ? 'You' : yourRow.rank,
        accuracy: yourRow.accuracy,
      },
    });
  };

  const handleShareAchievementCard = async () => {
    await shareElement(achievementShareRef.current, {
      kind: 'achievement',
      userId: user?.id,
      filename: 'uptet-achievement.png',
      title: 'Achievement Unlocked',
      payload: {
        badge: topAchievement,
      },
    });
  };

  const Skeleton = ({ h = '40px', w = '100%' }: { h?: string; w?: string }) => (
    <div className="skeleton" style={{ height: h, width: w, borderRadius: '10px' }} />
  );

  // SVG line chart for trend
  const TrendChart = ({ data }: { data: DayPoint[] }) => {
    const W = 600; const H = 120; const pad = 20;
    const points = data.filter(d => d.accuracy !== null);
    if (points.length < 2) return <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px', fontSize: '0.85rem' }}>अभी पर्याप्त data नहीं है — practice करते रहें!</div>;

    const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (W - pad * 2));
    const filled = data.map(d => d.accuracy ?? null);
    const pathD: string[] = [];
    const areaD: string[] = [];
    let started = false;
    filled.forEach((acc, i) => {
      if (acc === null) return;
      const x = xs[i];
      const y = pad + (1 - acc / 100) * (H - pad * 2);
      if (!started) { pathD.push(`M${x},${y}`); areaD.push(`M${x},${H - pad} L${x},${y}`); started = true; }
      else { pathD.push(`L${x},${y}`); areaD.push(`L${x},${y}`); }
    });
    if (areaD.length) {
      const lastFilled = filled.map((a, i) => ({ a, i })).filter(x => x.a !== null).at(-1);
      if (lastFilled) areaD.push(`L${xs[lastFilled.i]},${H - pad} Z`);
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', minWidth: '280px' }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(v => (
            <line key={v} x1={pad} y1={pad + (1 - v / 100) * (H - pad * 2)} x2={W - pad} y2={pad + (1 - v / 100) * (H - pad * 2)} stroke="#f3f4f6" strokeWidth="1" />
          ))}
          {/* Area */}
          <path d={areaD.join(' ')} fill="url(#areaGrad)" />
          {/* Line */}
          <path d={pathD.join(' ')} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* Dots */}
          {data.map((d, i) => d.accuracy !== null ? (
            <circle key={i} cx={xs[i]} cy={pad + (1 - d.accuracy / 100) * (H - pad * 2)} r="4" fill="#6366f1" stroke="white" strokeWidth="2">
              <title>{d.label}: {d.accuracy}%</title>
            </circle>
          ) : null)}
          {/* X labels */}
          {data.filter((_, i) => i % 2 === 0).map((d, idx) => {
            const i = data.indexOf(d);
            return <text key={idx} x={xs[i]} y={H - 2} textAnchor="middle" fontSize="9" fill="#9ca3af">{d.label}</text>;
          })}
        </svg>
      </div>
    );
  };

  // SVG bar chart for subjects
  const SubjectBarChart = ({ subjects }: { subjects: SubjectStat[] }) => {
    if (subjects.length === 0) return null;
    const maxAcc = 100;
    const BAR_H = 32; const GAP = 10;
    const H = subjects.length * (BAR_H + GAP);

    return (
      <svg viewBox={`0 0 400 ${H}`} style={{ width: '100%', height: 'auto' }}>
        {subjects.map((s, i) => {
          const y = i * (BAR_H + GAP);
          const barW = (s.accuracy / maxAcc) * 280;
          const color = s.accuracy >= 70 ? '#16a34a' : s.accuracy >= 50 ? '#d97706' : '#dc2626';
          return (
            <g key={s.subjectId}>
              <text x="0" y={y + BAR_H / 2 + 5} fontSize="12" fill="#374151" fontWeight="600">{s.subjectName.slice(0, 10)}</text>
              <rect x="110" y={y} width="280" height={BAR_H} rx="6" fill="#f3f4f6" />
              <rect x="110" y={y} width={Math.max(barW, 4)} height={BAR_H} rx="6" fill={color} style={{ transition: 'width 1s ease' }} />
              <text x={115 + Math.min(barW, 240)} y={y + BAR_H / 2 + 5} fontSize="11" fill="white" fontWeight="800">{s.accuracy}%</text>
              <text x="398" y={y + BAR_H / 2 + 5} textAnchor="end" fontSize="10" fill="#9ca3af">{s.attempted}Q</text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '48px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontWeight: 900, fontSize: '1.75rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 4px' }}>
            <BarChart3 size={28} color="#6366f1" /> Analytics
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.9rem' }}>UPTET Paper 1 · आपकी तैयारी का पूरा विश्लेषण</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Target exam</div>
          <div style={{ fontSize: '0.88rem', color: '#111827', fontWeight: 800, marginTop: '2px' }}>UPTET 2026</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={handleShareStreakCard} disabled={loading || isSharing} style={{ border: '1px solid #e5e7eb', background: 'white', color: '#0f766e', borderRadius: '10px', padding: '6px 10px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}>Share Streak</button>
            <button onClick={handleShareRankCard} disabled={loading || !yourRow || isSharing} style={{ border: '1px solid #e5e7eb', background: 'white', color: '#6d28d9', borderRadius: '10px', padding: '6px 10px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}>Share Rank</button>
            <button onClick={handleShareAchievementCard} disabled={loading || isSharing} style={{ border: '1px solid #e5e7eb', background: 'white', color: '#1d4ed8', borderRadius: '10px', padding: '6px 10px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}>Share Badge</button>
          </div>
        </div>
      </div>

      <div style={{ position: 'fixed', left: '-9999px', top: 0, width: '420px', opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={streakShareRef}>
          <ShareCardTemplate
            kind="streak"
            title="Practice Streak"
            subtitle={`Your current streak is ${streak} day${streak === 1 ? '' : 's'} with ${overallAccuracy}% overall accuracy.`}
            primaryValue={streak}
            primaryLabel="Days active"
            brand="ExamSetu"
            detailRows={[
              { label: 'Accuracy', value: `${overallAccuracy}%` },
              { label: 'Sessions', value: String(totalSessions) },
              { label: 'Questions', value: String(totalAttempted) },
            ]}
          />
        </div>
        <div ref={rankShareRef}>
          <ShareCardTemplate
            kind="rank"
            title="Leaderboard Snapshot"
            subtitle={yourRow ? `Current performance among mock-test learners.` : 'Keep practicing to enter the leaderboard snapshot.'}
            primaryValue={yourRow ? (yourRow.rank === 'you' ? 'YOU' : `#${yourRow.rank}`) : '--'}
            primaryLabel={yourRow ? `${yourRow.accuracy}% accuracy` : 'Unranked'}
            brand="ExamSetu"
            detailRows={[
              { label: 'Your Accuracy', value: `${yourRow?.accuracy ?? 0}%` },
              { label: 'Overall', value: `${overallAccuracy}%` },
              { label: 'Mocks', value: String(mockHistory.length) },
            ]}
          />
        </div>
        <div ref={achievementShareRef}>
          <ShareCardTemplate
            kind="achievement"
            title="Achievement Unlocked"
            subtitle={`You unlocked: ${topAchievement}. Build momentum and unlock the next milestone.`}
            primaryValue={topAchievement}
            primaryLabel="Current badge"
            brand="ExamSetu"
            detailRows={[
              { label: 'Streak', value: `${streak} days` },
              { label: 'Sessions', value: String(totalSessions) },
              { label: 'Accuracy', value: `${overallAccuracy}%` },
            ]}
          />
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
        {[
          { icon: Target, label: 'कुल प्रश्न', value: loading ? null : totalAttempted, color: '#6366f1', bg: '#eef2ff', sub: `${totalCorrect} सही` },
          { icon: TrendingUp, label: 'Overall Accuracy', value: loading ? null : `${overallAccuracy}%`, color: overallAccuracy >= 70 ? '#16a34a' : overallAccuracy >= 50 ? '#d97706' : '#dc2626', bg: overallAccuracy >= 70 ? '#f0fdf4' : overallAccuracy >= 50 ? '#fffbeb' : '#fef2f2', sub: 'कुल average' },
          { icon: Flame, label: 'Streak', value: loading ? null : `${streak} दिन`, color: '#ea580c', bg: '#fff7ed', sub: '🔥 आज भी practice करें' },
          { icon: CheckCircle2, label: 'Sessions', value: loading ? null : totalSessions, color: '#0891b2', bg: '#ecfeff', sub: 'पूरे sessions' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <s.icon size={22} color={s.color} />
            </div>
            <div>
              {loading ? <Skeleton h="28px" w="60px" /> : <div style={{ fontSize: '1.6rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>}
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, marginTop: '4px' }}>{s.label}</div>
              {!loading && <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>{s.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {!isFree && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <AlarmClockCheck size={18} color="#0f766e" />
              <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#111827' }}>Exam countdown</h2>
            </div>
            <p style={{ margin: '0 0 12px', color: '#9ca3af', fontSize: '0.72rem' }}>Days remaining to target exam</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
              {[
                { value: daysLeft, label: 'days' },
                { value: weeksLeft, label: 'weeks' },
                { value: monthsLeft, label: 'months' },
              ].map(k => (
                <div key={k.label} style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center', padding: '10px 4px' }}>
                  <div style={{ fontWeight: 900, fontSize: '1.3rem', color: '#0f172a' }}>{k.value}</div>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Daily target to reach qualifying score</div>
            <div style={{ marginTop: '6px', height: '6px', borderRadius: '99px', background: '#e5e7eb', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(overallAccuracy, 100)}%`, background: '#0ea5e9' }} />
            </div>
            <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#9ca3af' }}>
              <span>{Math.max(1, Math.round((90 - predictedScore) / Math.max(daysLeft, 1)))} correct/day needed</span>
              <span>{overallAccuracy}% to 60% target</span>
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Target size={18} color="#7c3aed" />
              <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#111827' }}>Predicted score today</h2>
            </div>
            <p style={{ margin: '0 0 8px', color: '#9ca3af', fontSize: '0.72rem' }}>Based on current overall accuracy</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px' }}>
              <span style={{ fontWeight: 900, fontSize: '2rem', color: '#111827' }}>{predictedScore}</span>
              <span style={{ color: '#6b7280' }}>/150</span>
            </div>
            <div style={{ marginBottom: '8px', fontSize: '0.7rem', color: '#6b7280', fontWeight: 700 }}>UPTET 2026 Passing Marks</div>
            {cutoffs.map(c => {
              const gap = c.cut - predictedScore;
              const tone = gap <= 8 ? '#16a34a' : gap <= 20 ? '#d97706' : '#dc2626';
              return (
                <div key={c.cat} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', borderBottom: '1px solid #f3f4f6', padding: '6px 0', fontSize: '0.78rem' }}>
                  <span style={{ color: '#6b7280' }}>{c.cat}</span>
                  <span style={{ color: '#111827', fontWeight: 700 }}>{c.cut}</span>
                  <span style={{ color: tone, fontWeight: 700 }}>{gap <= 0 ? 'safe' : `${gap} short`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Free user gate for sections below ── */}
      {isFree ? (
        <div style={{ position: 'relative' }}>
          {/* Blurred preview */}
          <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none', display: 'flex', flexDirection: 'column', gap: '16px', opacity: 0.5 }}>
            <div style={{ background: 'white', borderRadius: '20px', height: '200px', border: '1px solid #e5e7eb' }} />
            <div style={{ background: 'white', borderRadius: '20px', height: '180px', border: '1px solid #e5e7eb' }} />
          </div>
          {/* Overlay */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <div style={{ background: 'white', borderRadius: '24px', padding: '36px 32px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', border: '1px solid #e5e7eb', maxWidth: '360px', width: '95%' }}>
              <div style={{ width: '60px', height: '60px', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(239,68,68,0.3)' }}>
                <Lock size={28} color="white" />
              </div>
              <h3 style={{ fontWeight: 900, fontSize: '1.2rem', color: '#111827', margin: '0 0 8px' }}>Pro Analytics 📊</h3>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 20px', lineHeight: 1.6 }}>Subject accuracy, topic heatmap, और 14-day trend देखने के लिए Pro में upgrade करें।</p>
              <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 28px', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: 'white', fontWeight: 900, borderRadius: '14px', textDecoration: 'none', fontSize: '0.9rem', boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}>
                <Crown size={18} /> Pro में अपग्रेड करें — ₹149/माह
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── 14-day Accuracy Trend ── */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: '36px', height: '36px', background: '#eef2ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={18} color="#6366f1" />
              </div>
              <div>
                <h2 style={{ fontWeight: 800, color: '#111827', margin: 0, fontSize: '1rem' }}>14-Day Accuracy Trend</h2>
                <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.72rem' }}>रोज़ की accuracy का trend</p>
              </div>
            </div>
            {loading ? <Skeleton h="120px" /> : <TrendChart data={trendData} />}
          </div>

          {/* ── Subject Accuracy Bars ── */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: '36px', height: '36px', background: '#f0fdf4', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart3 size={18} color="#16a34a" />
              </div>
              <div>
                <h2 style={{ fontWeight: 800, color: '#111827', margin: 0, fontSize: '1rem' }}>Subject-wise Accuracy</h2>
                <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.72rem' }}>विषय के अनुसार accuracy</p>
              </div>
            </div>
            {loading ? <Skeleton h="140px" /> : subjectStats.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '32px', fontSize: '0.875rem' }}>अभी कोई data नहीं — practice शुरू करें!</div>
            ) : <SubjectBarChart subjects={subjectStats} />}
          </div>

          {/* ── Topic Heatmap (expandable) ── */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', background: '#fef3c7', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={18} color="#f59e0b" />
                </div>
                <div>
                  <h2 style={{ fontWeight: 800, color: '#111827', margin: 0, fontSize: '1rem' }}>Topic Heatmap</h2>
                  <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.72rem' }}>Topic का accuracy — सबसे weak पहले</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[1, 2, 3].map(i => <Skeleton key={i} h="52px" />)}
              </div>
            ) : subjectStats.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>अभी data नहीं है — practice करें!</div>
            ) : (
              <div>
                {subjectStats.map(sub => (
                  <div key={sub.subjectId}>
                    <button onClick={() => setExpandedSubject(expandedSubject === sub.subjectId ? null : sub.subjectId)}
                      style={{ width: '100%', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', background: 'none', border: 'none', borderBottom: '1px solid #f3f4f6', fontFamily: 'inherit', textAlign: 'left', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f9fafb'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 800, color: '#111827', fontSize: '0.9rem' }}>{sub.subjectName}</span>
                          <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{sub.attempted} questions</span>
                        </div>
                        <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden', width: '100%' }}>
                          <div style={{ height: '100%', width: `${sub.accuracy}%`, background: sub.accuracy >= 70 ? '#16a34a' : sub.accuracy >= 50 ? '#f59e0b' : '#ef4444', borderRadius: '999px', transition: 'width 0.8s ease' }} />
                        </div>
                      </div>
                      <div style={{ fontWeight: 900, fontSize: '1.1rem', color: sub.accuracy >= 70 ? '#16a34a' : sub.accuracy >= 50 ? '#d97706' : '#dc2626', minWidth: '44px', textAlign: 'right' }}>{sub.accuracy}%</div>
                      {expandedSubject === sub.subjectId ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                    </button>

                    {expandedSubject === sub.subjectId && (
                      <div style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                        {sub.topics.length === 0 ? (
                          <p style={{ padding: '16px 24px', color: '#9ca3af', fontSize: '0.82rem', margin: 0 }}>कोई topic data नहीं</p>
                        ) : sub.topics.map(t => (
                          <div key={t.topicId} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 24px 10px 40px', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.accuracy >= 70 ? '#16a34a' : t.accuracy >= 50 ? '#f59e0b' : '#ef4444', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.topicName}</div>
                              <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{t.attempts} attempts</div>
                            </div>
                            <div style={{ fontWeight: 800, color: t.accuracy >= 70 ? '#16a34a' : t.accuracy >= 50 ? '#d97706' : '#dc2626', fontSize: '0.875rem', minWidth: '36px', textAlign: 'right' }}>{t.accuracy}%</div>
                            <Link to={`/practice?mode=topic_practice&topic=${t.topicId}`} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', color: '#6366f1', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                              Practice <ArrowRight size={12} />
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Weak Areas Action List ── */}
          {!loading && subjectStats.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: '1px solid #fecaca', borderRadius: '24px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <XCircle size={20} color="#dc2626" />
                <h2 style={{ fontWeight: 900, fontSize: '1rem', color: '#111827', margin: 0 }}>⚠️ Weak Topics — अभी practice करें</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {subjectStats.flatMap(s => s.topics.filter(t => t.accuracy < 65 && t.attempts >= 3)).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5).map(t => (
                  <Link key={t.topicId} to={`/practice?mode=topic_practice&topic=${t.topicId}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'white', border: '1px solid #fecaca', borderRadius: '14px', padding: '12px 16px', textDecoration: 'none', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#dc2626'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(220,38,38,0.1)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#fecaca'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
                    <div style={{ width: '36px', height: '36px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '1rem' }}>⚠️</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.topicName}</div>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '2px' }}>{t.accuracy}% accuracy · {t.attempts} attempts</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: 800, fontSize: '0.78rem', flexShrink: 0 }}>Practice <ArrowRight size={14} /></div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Time-of-day Accuracy Heatmap ── */}
          {!loading && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '36px', height: '36px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChart3 size={18} color="#2563eb" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>Time-of-day accuracy</h2>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Darker blocks indicate higher accuracy hours</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {(hourlyAccuracy.length ? hourlyAccuracy : Array.from({ length: 18 }, (_, i) => ({ label: `${i + 6}`, accuracy: 0 }))).map(h => {
                  const alpha = 0.08 + Math.min(h.accuracy, 100) / 100 * 0.72;
                  const textColor = h.accuracy >= 55 ? '#0b2d59' : '#64748b';
                  return (
                    <div key={h.label} title={`${h.label}: ${h.accuracy}%`} style={{ width: '32px', height: '32px', borderRadius: '6px', background: `rgba(37, 99, 235, ${alpha})`, color: textColor, fontSize: '0.56rem', display: 'grid', placeItems: 'center', border: '1px solid rgba(148,163,184,0.35)' }}>
                      <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
                        <div>{h.label}</div>
                        <div style={{ fontWeight: 800 }}>{h.accuracy}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.68rem', color: '#9ca3af' }}>
                <span>Peak: {hourlyPeak.label} ({hourlyPeak.accuracy}%)</span>
                <span>Weakest: {hourlyWorst.label === '-' ? 'N/A' : `${hourlyWorst.label} (${hourlyWorst.accuracy}%)`}</span>
                <span>Tip: shift heavy practice to peak slots</span>
              </div>
            </div>
          )}

          {/* ── Revision Due ── */}
          {!loading && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <BookCheck size={18} color="#b45309" />
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>Spaced repetition - revision due</h2>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Topics that should be reviewed before forgetting</p>
                  </div>
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9a3412', background: '#ffedd5', borderRadius: '999px', padding: '4px 10px' }}>{revisionDue.length} due</span>
              </div>

              {revisionDue.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: '0.82rem', padding: '10px 0' }}>No revision queue yet. Attempt more topics to activate spaced repetition insights.</div>
              ) : revisionDue.map(r => {
                const tone = r.urgency === 'high' ? '#dc2626' : r.urgency === 'medium' ? '#d97706' : '#16a34a';
                return (
                  <div key={r.topicId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', padding: '8px 0' }}>
                    <div>
                      <div style={{ fontSize: '0.82rem', color: '#111827', fontWeight: 700 }}>{r.topicName}</div>
                      <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{r.subjectName} - {r.accuracy}% accuracy</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.68rem', color: tone, fontWeight: 700 }}>{r.dueText}</span>
                      <Link to={`/practice?mode=topic_practice&topic=${r.topicId}`} style={{ border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '0.72rem', padding: '6px 12px', color: '#111827', textDecoration: 'none', fontWeight: 700 }}>Review</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Streak + Mock History ── */}
          {!loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '24px' }}>
                <h2 style={{ margin: '0 0 2px', fontSize: '1rem', color: '#111827' }}>Practice streak</h2>
                <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: '#9ca3af' }}>Last 12 days activity</p>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date(Date.now() - (11 - i) * 86400000);
                    const iso = d.toISOString().slice(0, 10);
                    const isActive = activeSessionDates.includes(iso);
                    const isToday = i === 11;
                    return (
                      <div key={iso} style={{ width: '26px', height: '26px', borderRadius: '6px', border: isToday ? '1.5px solid #10b981' : '1px solid #d1d5db', display: 'grid', placeItems: 'center', fontSize: '0.62rem', color: isActive ? 'white' : '#94a3b8', background: isActive ? '#10b981' : 'transparent', fontWeight: 700 }}>
                        {d.getDate()}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Current: {streak} · Active: {activeSessionDates.length}/12 days</div>
              </div>

              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '24px' }}>
                <h2 style={{ margin: '0 0 2px', fontSize: '1rem', color: '#111827' }}>Mock test history</h2>
                <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: '#9ca3af' }}>Recent mock performance</p>
                {mockHistory.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#9ca3af', paddingTop: '8px' }}>No mock tests completed yet.</div>
                ) : mockHistory.map(m => {
                  const pct = Math.round((m.score / Math.max(m.max, 1)) * 100);
                  return (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: '10px', alignItems: 'center', borderBottom: '1px solid #f3f4f6', padding: '7px 0' }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827' }}>{m.name}</div>
                        <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{m.date}</div>
                      </div>
                      <div style={{ height: '5px', borderRadius: '999px', background: '#e5e7eb', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: '#3b82f6' }} />
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827' }}>{m.score}/{m.max}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Topper Comparison ── */}
          {!loading && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <Medal size={18} color="#ca8a04" />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1rem', color: '#111827', fontWeight: 800 }}>Topper comparison</h2>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Where you stand among mock-test users</p>
                </div>
              </div>

              {leaderboardRows.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No leaderboard data yet.</div>
              ) : leaderboardRows.map((r, idx) => {
                const isYou = r.isYou;
                const accColor = r.accuracy >= 60 ? '#16a34a' : r.accuracy >= 40 ? '#d97706' : '#dc2626';
                return (
                  <div key={`${r.rank}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: '8px', alignItems: 'center', borderBottom: '1px solid #f3f4f6', padding: '7px 6px', background: isYou ? '#eff6ff' : 'transparent', borderRadius: isYou ? '8px' : 0 }}>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', textAlign: 'center' }}>{r.rank === 'avg' ? '-' : r.rank === 'you' ? '-' : r.rank}</div>
                    <div style={{ fontSize: '0.82rem', color: '#111827' }}>{r.name}</div>
                    <div style={{ fontSize: '0.82rem', color: accColor, fontWeight: 800 }}>{r.accuracy}%</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Smart Insights + Achievements ── */}
          {!loading && (
            <>
              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Sparkles size={18} color="#7c3aed" />
                  <h2 style={{ margin: 0, fontSize: '1rem', color: '#111827', fontWeight: 800 }}>Smart insights</h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', fontSize: '0.8rem', color: '#334155' }}>
                    Strongest subject: <strong>{subjectStats.slice().sort((a, b) => b.accuracy - a.accuracy)[0]?.subjectName || 'N/A'}</strong>. Push this above 60% for quick score gain.
                  </div>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '10px 12px', fontSize: '0.8rem', color: '#9a3412' }}>
                    Biggest drag: <strong>{subjectStats[0]?.subjectName || 'N/A'}</strong> at {subjectStats[0]?.accuracy ?? 0}% accuracy. Improve 10 correct answers here for noticeable overall gain.
                  </div>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '10px 12px', fontSize: '0.8rem', color: '#1d4ed8' }}>
                    Revision queue has {revisionDue.length} topics. Short daily review blocks can improve retention faster than long one-time sessions.
                  </div>
                </div>
              </div>

              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '24px' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: '1rem', color: '#111827', fontWeight: 800 }}>Achievements</h2>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {achievementBadges.map(b => (
                    <span key={b.label} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '0.68rem', border: b.earned ? '1px solid #86efac' : '1px dashed #d1d5db', color: b.earned ? '#166534' : '#9ca3af', background: b.earned ? '#f0fdf4' : '#f9fafb' }}>
                      {b.earned ? '✓' : '○'} {b.label}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      <SharePreviewModal
        open={sharePreview.open}
        title={sharePreview.title}
        text={sharePreview.text}
        imageUrl={sharePreview.imageUrl}
        onClose={closeSharePreview}
        onDownload={downloadSharePreview}
        onNativeShare={sharePreviewNative}
      />
    </div>
  );
}
