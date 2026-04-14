import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Flame, Target, TrendingUp, BookOpenCheck,
  SlidersHorizontal, FileText, Crown, ArrowRight,
  Zap, AlertTriangle, ChevronRight, Trophy,
  BarChart2, CheckCircle2, Star,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';
import './DashboardPage.css';

interface DashStats {
  totalAttempted: number;
  totalCorrect: number;
  accuracy: number;
  streak: number;
  sessionsToday: number;
  weeklyAccuracy: number | null;
  prevWeekAccuracy: number | null;
  weekTrend: number | null;
}

interface WeakTopic {
  topic_id: string;
  topicName: string;
  chapterName: string;
  accuracy: number;
  attempts: number;
}

interface RecentSession {
  id: string;
  session_type: string;
  correct: number;
  total_questions: number;
  accuracy: number;
  completed_at: string;
}

export default function DashboardPage() {
  const { profile, user } = useAuth();
  const { isFree } = useSubscription();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashStats>({
    totalAttempted: 0, totalCorrect: 0, accuracy: 0,
    streak: 0, sessionsToday: 0, weeklyAccuracy: null,
    prevWeekAccuracy: null, weekTrend: null,
  });
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Student';

  useEffect(() => {
    if (user) loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadWeakTopics(),
        loadRecentSessions(),
      ]);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // ── Aggregate from practice_sessions ──────────────────────────────
      const { data: sessions } = await supabase
        .from('practice_sessions')
        .select('correct, total_questions, attempted, completed_at, created_at')
        .eq('user_id', user!.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (!sessions || sessions.length === 0) {
        // Try profile as fallback
        setStats({
          totalAttempted: profile?.total_questions_attempted ?? 0,
          totalCorrect: profile?.total_correct ?? 0,
          accuracy: 0,
          streak: profile?.streak_days ?? 0,
          sessionsToday: 0,
          weeklyAccuracy: null,
          prevWeekAccuracy: null,
          weekTrend: null,
        });
        return;
      }

      const totalAttempted = sessions.reduce((s, r) => s + (r.attempted || r.total_questions || 0), 0);
      const totalCorrect = sessions.reduce((s, r) => s + (r.correct || 0), 0);
      const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

      // ── Today sessions ─────────────────────────────────────────────────
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sessionsToday = sessions.filter(s => new Date(s.completed_at || s.created_at) >= today).length;

      // ── Streak: count consecutive days with at least 1 session ────────
      const sessionDates = [...new Set(
        sessions.map(s => new Date(s.completed_at || s.created_at).toDateString())
      )].map(d => new Date(d)).sort((a, b) => b.getTime() - a.getTime());

      let streak = 0;
      const todayStr = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      if (sessionDates.length > 0 &&
        (sessionDates[0].toDateString() === todayStr || sessionDates[0].toDateString() === yesterdayStr)) {
        for (let i = 0; i < sessionDates.length; i++) {
          const expected = new Date(Date.now() - i * 86400000).toDateString();
          const has = sessionDates.some(d => d.toDateString() === expected);
          if (has) streak++;
          else break;
        }
      }

      // ── Weekly accuracy comparison ─────────────────────────────────────
      const oneWeekAgo = new Date(Date.now() - 7 * 86400000);
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000);
      const thisWeek = sessions.filter(s => new Date(s.completed_at || s.created_at) >= oneWeekAgo);
      const lastWeek = sessions.filter(s => {
        const d = new Date(s.completed_at || s.created_at);
        return d >= twoWeeksAgo && d < oneWeekAgo;
      });

      const calcAcc = (arr: typeof sessions) => {
        const att = arr.reduce((s, r) => s + (r.attempted || r.total_questions || 0), 0);
        const cor = arr.reduce((s, r) => s + (r.correct || 0), 0);
        return att > 0 ? Math.round((cor / att) * 100) : null;
      };

      const weeklyAccuracy = calcAcc(thisWeek);
      const prevWeekAccuracy = calcAcc(lastWeek);
      const weekTrend = weeklyAccuracy !== null && prevWeekAccuracy !== null
        ? weeklyAccuracy - prevWeekAccuracy : null;

      setStats({ totalAttempted, totalCorrect, accuracy, streak, sessionsToday, weeklyAccuracy, prevWeekAccuracy, weekTrend });
    } catch (err) {
      console.error('Stats load error:', err);
    }
  };

  const loadWeakTopics = async () => {
    try {
      // Try user_topic_stats first (fast path)
      const { data: topicStats, error } = await supabase
        .from('user_topic_stats')
        .select('topic_id, accuracy_pct, attempts, topics(name_hi, name_en, chapters(name_hi, name_en))')
        .eq('user_id', user!.id)
        .lt('accuracy_pct', 65)
        .gte('attempts', 3)
        .order('accuracy_pct', { ascending: true })
        .limit(4);

      if (!error && topicStats && topicStats.length > 0) {
        setWeakTopics(topicStats.map((t: any) => ({
          topic_id: t.topic_id,
          topicName: t.topics?.name_hi || t.topics?.name_en || 'Unknown Topic',
          chapterName: t.topics?.chapters?.name_hi || t.topics?.chapters?.name_en || '',
          accuracy: t.accuracy_pct,
          attempts: t.attempts,
        })));
        return;
      }

      // Fallback: compute from question_attempts directly
      const { data: attempts } = await supabase
        .from('question_attempts')
        .select('is_correct, questions(topic_id, topics(name_hi, name_en, chapters(name_hi, name_en)))')
        .eq('user_id', user!.id)
        .not('selected_option', 'is', null);

      if (!attempts || attempts.length === 0) { setWeakTopics([]); return; }

      // Aggregate by topic
      const topicMap: Record<string, { name: string; chapterName: string; correct: number; total: number }> = {};
      for (const a of attempts as any[]) {
        const tid = a.questions?.topic_id;
        if (!tid) continue;
        if (!topicMap[tid]) topicMap[tid] = {
          name: a.questions?.topics?.name_hi || a.questions?.topics?.name_en || tid,
          chapterName: a.questions?.topics?.chapters?.name_hi || a.questions?.topics?.chapters?.name_en || '',
          correct: 0, total: 0,
        };
        topicMap[tid].total++;
        if (a.is_correct) topicMap[tid].correct++;
      }

      const weak = Object.entries(topicMap)
        .map(([tid, d]) => ({
          topic_id: tid,
          topicName: d.name,
          chapterName: d.chapterName,
          accuracy: Math.round((d.correct / d.total) * 100),
          attempts: d.total,
        }))
        .filter(t => t.accuracy < 65 && t.attempts >= 3)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 4);

      setWeakTopics(weak);
    } catch (err) {
      console.error('Weak topics load error:', err);
      setWeakTopics([]);
    }
  };

  const loadRecentSessions = async () => {
    try {
      const { data } = await supabase
        .from('practice_sessions')
        .select('id, session_type, correct, total_questions, attempted, completed_at')
        .eq('user_id', user!.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(3);

      if (data) {
        setRecentSessions(data.map(s => ({
          ...s,
          accuracy: (s.attempted || s.total_questions || 0) > 0
            ? Math.round((s.correct / (s.attempted || s.total_questions)) * 100)
            : 0,
        })));
      }
    } catch (err) {
      console.error('Recent sessions load error:', err);
    }
  };

  const modeLabel: Record<string, string> = {
    topic_practice: 'Topic Practice', pyq_paper: 'PYQ Paper',
    mock_test: 'Mock Test', weak_mix: 'Weakness Mix',
    challenge: 'Daily Challenge', revision: 'Revision',
  };

  const Skeleton = ({ w = '60px', h = '24px' }: { w?: string; h?: string }) => (
    <div className="skeleton" style={{ width: w, height: h, borderRadius: '6px' }} />
  );

  return (
    <div className="dashboard" id="dashboard-page">

      {/* ── Welcome Hero ── */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', borderRadius: '24px', padding: '28px 32px', color: 'white', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '180px', height: '180px', background: 'rgba(255,255,255,0.04)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-20px', left: '30%', width: '100px', height: '100px', background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'white', margin: '0 0 4px' }}>
              नमस्ते, {displayName}! 👋
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.65)', margin: 0, fontSize: '0.95rem' }}>
              {stats.sessionsToday > 0
                ? `आज ${stats.sessionsToday} practice session${stats.sessionsToday > 1 ? 's' : ''} हो गए 💪`
                : 'आज भी UPTET की तैयारी जारी रखें 🎯'}
            </p>
          </div>
          {/* Streak badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '12px 20px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <Flame size={26} color="#fbbf24" />
            <div>
              {loading ? <Skeleton w="32px" h="20px" /> : <span style={{ display: 'block', fontSize: '1.5rem', fontWeight: 900, color: '#fbbf24', lineHeight: 1 }}>{stats.streak}</span>}
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', fontWeight: 600, letterSpacing: '0.05em' }}>दिन streak</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="dash-stats">
        {[
          { icon: Target, label: 'कुल प्रश्न', value: loading ? null : stats.totalAttempted, color: '#6366f1', bg: '#eef2ff' },
          { icon: TrendingUp, label: 'सटीकता', value: loading ? null : `${stats.accuracy}%`, color: '#16a34a', bg: '#f0fdf4' },
          { icon: BookOpenCheck, label: 'सही उत्तर', value: loading ? null : stats.totalCorrect, color: '#0891b2', bg: '#ecfeff' },
          { icon: BarChart2, label: 'इस हफ्ते', value: loading ? null : stats.weeklyAccuracy !== null ? `${stats.weeklyAccuracy}%` : '—', color: '#d97706', bg: '#fffbeb',
            sub: stats.weekTrend !== null ? `${stats.weekTrend >= 0 ? '+' : ''}${stats.weekTrend}% vs last week` : undefined },
        ].map((s) => (
          <div key={s.label} className="dash-stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <s.icon size={22} color={s.color} />
            </div>
            <div>
              {loading ? <Skeleton w="48px" h="28px" /> : <span className="dash-stat-value" style={{ color: s.color }}>{s.value}</span>}
              <span className="dash-stat-label" lang="hi">{s.label}</span>
              {s.sub && !loading && (
                <span style={{ fontSize: '0.65rem', color: stats.weekTrend! >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700, display: 'block' }}>
                  {stats.weekTrend! >= 0 ? '↑' : '↓'} {s.sub}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick Actions ── */}
      <div className="dash-section">
        <h3 lang="hi">🚀 आज क्या करें?</h3>
        <div className="dash-actions">
          <Link to="/practice" className="dash-action-card dash-action-primary" id="action-practice">
            <div className="dash-action-icon"><SlidersHorizontal size={24} /></div>
            <div>
              <h4>Topic-wise Practice</h4>
              <p lang="hi">विषय चुनें और अभ्यास शुरू करें</p>
            </div>
            <ArrowRight size={18} className="dash-action-arrow" />
          </Link>
          <Link to="/practice?mode=mock_test" className="dash-action-card dash-action-gold" id="action-mock">
            <div className="dash-action-icon"><FileText size={24} /></div>
            <div>
              <h4>Mock Test</h4>
              <p lang="hi">150 Qs · 2.5 hrs · Full exam simulation</p>
            </div>
            <ArrowRight size={18} className="dash-action-arrow" />
          </Link>
          <Link to="/practice?mode=challenge" className="dash-action-card" id="action-challenge">
            <div className="dash-action-icon"><Zap size={24} /></div>
            <div>
              <h4>Daily Challenge ⚡</h4>
              <p lang="hi">10 प्रश्न · 10 मिनट · आज का challenge</p>
            </div>
            <ArrowRight size={18} className="dash-action-arrow" />
          </Link>
        </div>
      </div>

      {/* ── Recent Sessions (comparison) ── */}
      {!loading && recentSessions.length > 0 && (
        <div className="dash-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ margin: 0 }}>📊 हाल की Performance</h3>
            <Link to="/analytics" style={{ fontSize: '0.8rem', color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>सब देखें →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentSessions.map((s, idx) => {
              const accColor = s.accuracy >= 70 ? '#16a34a' : s.accuracy >= 50 ? '#d97706' : '#dc2626';
              const accBg = s.accuracy >= 70 ? '#f0fdf4' : s.accuracy >= 50 ? '#fffbeb' : '#fef2f2';
              const timeSince = (() => {
                const diff = Date.now() - new Date(s.completed_at).getTime();
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);
                return days > 0 ? `${days} दिन पहले` : hours > 0 ? `${hours} घंटे पहले` : 'अभी';
              })();
              return (
                <button key={s.id} onClick={() => navigate(`/results/${s.id}`)}
                  style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', transition: 'all 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLElement).style.transform = ''; }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '1.25rem' }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.875rem' }}>{modeLabel[s.session_type] || s.session_type}</div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '2px' }}>{timeSince}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>{s.correct}/{s.total_questions}</span>
                    <div style={{ background: accBg, color: accColor, fontWeight: 800, fontSize: '0.875rem', padding: '4px 12px', borderRadius: '999px', minWidth: '52px', textAlign: 'center' }}>
                      {s.accuracy}%
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Weak Topics (dynamic) ── */}
      <div className="dash-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3 style={{ margin: 0 }}>⚠️ कमज़ोर विषय</h3>
          <Link to="/practice?mode=weak_mix" style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700, textDecoration: 'none' }}>Weakness Mix →</Link>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '68px', borderRadius: '12px' }} />)}
          </div>
        ) : weakTopics.length === 0 ? (
          <div style={{ background: '#f0fdf4', border: '2px dashed #bbf7d0', borderRadius: '16px', padding: '28px', textAlign: 'center' }}>
            <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 700, color: '#15803d', marginBottom: '4px' }}>शाबाश! 🎉</div>
            <div style={{ fontSize: '0.85rem', color: '#4ade80' }}>अभी कोई weak topic नहीं — practice करते रहें!</div>
          </div>
        ) : (
          <div className="dash-weak-areas">
            {weakTopics.map(t => (
              <div key={t.topic_id} className="dash-weak-card" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div style={{ width: '36px', height: '36px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertTriangle size={16} color="#dc2626" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span className="dash-weak-topic" lang="hi" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {t.chapterName ? `${t.chapterName} — ${t.topicName}` : t.topicName}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                      <span className="dash-weak-accuracy">{t.accuracy}% accuracy</span>
                      <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>({t.attempts} attempts)</span>
                    </div>
                  </div>
                </div>
                <Link
                  to={`/practice?mode=topic_practice&topic=${t.topic_id}`}
                  className="btn btn-sm"
                  onClick={e => e.stopPropagation()}
                  style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '10px', padding: '6px 14px', fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                >
                  Practice <ChevronRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Weekly Trend Card ── */}
      {!loading && stats.weekTrend !== null && stats.weeklyAccuracy !== null && (
        <div style={{ background: stats.weekTrend >= 0 ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: `2px solid ${stats.weekTrend >= 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius: '20px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: stats.weekTrend >= 0 ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {stats.weekTrend >= 0 ? <Trophy size={24} color="#16a34a" /> : <Star size={24} color="#dc2626" />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#111827', fontSize: '1rem' }}>
              {stats.weekTrend >= 0
                ? `🎉 इस हफ्ते ${stats.weekTrend}% बेहतर!`
                : `💪 ${Math.abs(stats.weekTrend)}% की गिरावट — मेहनत ज़रूरी है`}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '3px' }}>
              पिछला हफ्ता: {stats.prevWeekAccuracy}% → इस हफ्ता: {stats.weeklyAccuracy}%
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '1.5rem', color: stats.weekTrend >= 0 ? '#16a34a' : '#dc2626' }}>
              {stats.weekTrend >= 0 ? '+' : ''}{stats.weekTrend}%
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade Banner ── */}
      {isFree && (
        <Link to="/pricing" className="dash-upgrade-banner" id="dashboard-upgrade-cta">
          <Crown size={22} />
          <div>
            <h4 lang="hi">Pro में अपग्रेड करें — ₹149/माह</h4>
            <p lang="hi">Unlimited mock tests, AI explanations, और analytics — सब कुछ unlock करें</p>
          </div>
          <ArrowRight size={20} />
        </Link>
      )}
    </div>
  );
}
