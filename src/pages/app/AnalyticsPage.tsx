import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import {
  BarChart3, Lock, TrendingUp, Target, Flame, Crown,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, ArrowRight, Zap,
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

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { isPro, isFree } = useSubscription();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [trendData, setTrendData] = useState<DayPoint[]>([]);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadAnalytics();
  }, [user]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      await Promise.all([loadOverallStats(), loadSubjectStats(), loadTrend()]);
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
      let st = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(Date.now() - i * 86400000).toDateString();
        if (dates.includes(d)) st++; else break;
      }
      setStreak(st);
    } catch { }
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
      <div>
        <h1 style={{ fontWeight: 900, fontSize: '1.75rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 4px' }}>
          <BarChart3 size={28} color="#6366f1" /> Analytics
        </h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.9rem' }}>आपकी तैयारी का पूरा विश्लेषण</p>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
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
        </>
      )}
    </div>
  );
}
