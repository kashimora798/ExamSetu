import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import {
  ChevronLeft, CheckCircle2, XCircle, Clock, Target,
  ArrowRight, Zap, TrendingUp, Share2, RotateCcw, Trophy,
  AlertCircle, BarChart2, BookOpen, Minus
} from 'lucide-react';
import { calculateSessionXP } from '../../lib/engine/gamification';
import { MathText } from '../../components/app/practice/MathText';
import { useShareCard } from '../../hooks/useShareCard';
import ReportQuestionModal from '../../components/shared/ReportQuestionModal';
import SharePreviewModal from '../../components/shared/SharePreviewModal';
import { submitQuestionReport } from '../../lib/reporting';

/* ── Colour tokens ── */
const C = {
  ink: '#1a1814', ink2: '#3a3628', ink3: '#8a8370',
  gold: '#c8860a', goldLight: '#fdf6e3',
  teal: '#0f6b5e', tealLight: '#e0f4f1',
  red: '#c0392b', redLight: '#fdf0ee',
  green: '#2d7a3a', greenLight: '#e8f5eb',
  blue: '#1a4b8c', blueLight: '#e8eef8',
  purple: '#6b3fa0', purpleLight: '#f3eeff',
  bg: '#f7f5f0', surface: '#ffffff', border: '#e5e1d5',
  shadow: '0 2px 12px rgba(28,26,20,0.08)',
};

/* ── UPTET Paper I standard cutoff estimate ── */
const CUTOFF_GENERAL = 90; // out of 150
const CUTOFF_OBC = 82;
const CUTOFF_SC_ST = 75;

function grade(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 80) return { label: 'Outstanding', color: C.green, bg: C.greenLight };
  if (pct >= 65) return { label: 'Very Good', color: C.teal, bg: C.tealLight };
  if (pct >= 50) return { label: 'Good', color: C.gold, bg: C.goldLight };
  if (pct >= 40) return { label: 'Average', color: C.blue, bg: C.blueLight };
  return { label: 'Needs Work', color: C.red, bg: C.redLight };
}

/* Estimate rank percentile from score */
function rankEstimate(correct: number, total: number): string {
  const pct = (correct / total) * 100;
  if (pct >= 80) return 'Top 10%';
  if (pct >= 70) return 'Top 20%';
  if (pct >= 60) return 'Top 35%';
  if (pct >= 50) return 'Top 50%';
  if (pct >= 40) return 'Top 65%';
  return 'Bottom 35%';
}

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* ── Subject colours ── */
const SUBJECT_COLORS: Record<string, { ring: string; bg: string; text: string }> = {
  CDP: { ring: '#6b3fa0', bg: '#f3eeff', text: '#6b3fa0' },
  Hindi: { ring: '#0f6b5e', bg: '#e0f4f1', text: '#0f6b5e' },
  English: { ring: '#1a4b8c', bg: '#e8eef8', text: '#1a4b8c' },
  Maths: { ring: '#c0392b', bg: '#fdf0ee', text: '#c0392b' },
  Mathematics: { ring: '#c0392b', bg: '#fdf0ee', text: '#c0392b' },
  EVS: { ring: '#2d7a3a', bg: '#e8f5eb', text: '#2d7a3a' },
  Science: { ring: '#2d7a3a', bg: '#e8f5eb', text: '#2d7a3a' },
  default: { ring: C.gold, bg: C.goldLight, text: C.gold },
};

function subjectColor(name: string) {
  for (const [key, val] of Object.entries(SUBJECT_COLORS)) {
    if (key !== 'default' && name?.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return SUBJECT_COLORS.default;
}

/* ── Ring SVG ── */
function Ring({ pct, size = 48, color, bg = '#e5e1d5' }: { pct: number; size?: number; color: string; bg?: string }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bg} strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(pct, 100) / 100)}
        style={{ transition: 'stroke-dashoffset .8s ease' }} />
    </svg>
  );
}

/* ── groupBySubject ── */
function groupBySubject(attempts: any[]) {
  const map = new Map<string, { name: string; code: string; correct: number; wrong: number; skipped: number; total: number; totalTime: number; attempts: any[] }>();
  for (const a of attempts) {
    const q = a.questions || {};
    const key = q.subject_id || q.subject_code || 'other';
    const name = q.subjects?.name_hi || q.subjects?.name_en || q.subject_name || q.subject_code || 'Subject';
    const code = q.subjects?.code || q.subject_code || key;
    if (!map.has(key)) map.set(key, { name, code, correct: 0, wrong: 0, skipped: 0, total: 0, totalTime: 0, attempts: [] });
    const b = map.get(key)!;
    b.total++;
    b.totalTime += (a.time_taken_secs || 0);
    b.attempts.push(a);
    if (!a.selected_option) b.skipped++;
    else if (a.is_correct) b.correct++;
    else b.wrong++;
  }
  return [...map.values()];
}

type ReviewFilter = 'all' | 'wrong' | 'skipped' | 'marked';

/* ════════════════════════════════════════════════════════════════════ */
export default function MockTestResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription();

  const [session, setSession] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'summary' | 'review' | 'leaderboard'>('summary');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('wrong');
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [xpResult, setXpResult] = useState<any>(null);
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [lang, setLang] = useState<'hi' | 'en'>('hi');
  const [percentile, setPercentile] = useState<number | null>(null);
  const [reportState, setReportState] = useState<{ open: boolean; question: any | null }>({ open: false, question: null });
  const { isSharing, shareElement, sharePreview, closeSharePreview, downloadSharePreview, sharePreviewNative } = useShareCard();
  const scoreCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (sessionId && user) loadData(); }, [sessionId, user]);

  useEffect(() => {
    if (tab === 'leaderboard' && leaderboard.length === 0 && session) {
      loadLeaderboard();
    }
  }, [tab, session]);

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true);
    try {
      const { data } = await supabase.from('practice_sessions')
        .select(`id, user_id, score, time_taken_secs, completed_at, total_questions, user_profiles(full_name, avatar_url)`)
        .eq('session_type', session.session_type)
        .eq('status', 'completed')
        // We order by score desc, time asc
        .order('score', { ascending: false })
        .order('time_taken_secs', { ascending: true })
        .limit(200); // fetch more to dedupe
      
      const seen = new Set();
      const deduped = [];
      for (const row of (data || [])) {
        if (!seen.has(row.user_id)) {
          seen.add(row.user_id);
          deduped.push(row);
          if (deduped.length >= 50) break; // only top 50
        }
      }
      setLeaderboard(deduped);
    } catch (e) {
      console.error('Failed to load leaderboard', e);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [sr, ar] = await Promise.all([
        supabase.from('practice_sessions').select('*').eq('id', sessionId!).single(),
        supabase.from('question_attempts')
          .select('*, questions(*, subjects(id,name_hi,name_en,code))')
          .eq('session_id', sessionId!).order('question_order'),
      ]);
      if (!sr.data) { navigate('/dashboard'); return; }
      setSession(sr.data);
      setAttempts(ar.data || []);
      setXpResult(calculateSessionXP({ attempted: sr.data.attempted || 0, correct: sr.data.correct || 0, sessionType: 'mock_test' }));
      const { data: bm } = await supabase.from('bookmarks').select('question_id').eq('user_id', user!.id);
      setBookmarked(new Set((bm || []).map((b: any) => b.question_id)));

      // Calculate Percentile
      const [lowerRes, totalRes] = await Promise.all([
        supabase.from('practice_sessions').select('*', { count: 'exact', head: true }).eq('session_type', sr.data.session_type).eq('status', 'completed').lt('score', sr.data.score),
        supabase.from('practice_sessions').select('*', { count: 'exact', head: true }).eq('session_type', sr.data.session_type).eq('status', 'completed')
      ]);
      const lowerScores = lowerRes.count || 0;
      const totalScores = totalRes.count || 1;
      setPercentile(Math.max(1, Math.round((lowerScores / totalScores) * 100)));
      
    } catch { navigate('/dashboard'); }
    finally { setLoading(false); }
  };

  const toggleBookmark = async (qId: string) => {
    const has = bookmarked.has(qId);
    const next = new Set(bookmarked);
    if (has) { next.delete(qId); await supabase.from('bookmarks').delete().eq('user_id', user!.id).eq('question_id', qId); }
    else { next.add(qId); await supabase.from('bookmarks').upsert({ user_id: user!.id, question_id: qId, collection: 'default' }); }
    setBookmarked(next);
  };

  const handleSubmitReport = async (reportType: any, reportText: string) => {
    if (!reportState.question) return;
    await submitQuestionReport({
      userId: user!.id,
      questionId: reportState.question.questions?.id || reportState.question.question_id || reportState.question.id,
      sessionId: session?.id,
      reportType,
      reportText,
      source: 'mock_results',
    });
  };

  const handleShare = async () => {
    if (!scoreCardRef.current) return;
    try {
      await shareElement(scoreCardRef.current, {
        kind: 'score',
        userId: user?.id,
        filename: 'uptet-mock-score.png',
        title: 'My Mock Test Score',
        payload: {
        score: Math.round((session.correct / (session.total_questions || 1)) * 100),
        correct: session.correct,
        total: session.total_questions,
        },
      });
    } catch { }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
      <div style={{ width: '52px', height: '52px', border: '4px solid #e5e1d5', borderTopColor: C.gold, borderRadius: '50%', animation: 'spinCW 0.8s linear infinite' }} />
      <p style={{ color: C.ink3, fontWeight: 600 }}>Results तैयार हो रहे हैं...</p>
    </div>
  );
  if (!session) return null;

  /* ── Derived values ── */
  const total = session.total_questions || attempts.length || 1;
  const correct = session.correct || 0;
  const wrong = (session.attempted || 0) - correct;
  const skipped = total - (session.attempted || 0);
  const accuracy = session.attempted > 0 ? Math.round((correct / session.attempted) * 100) : 0;
  const scorePct = Math.round((correct / total) * 100);
  const timeTaken = session.time_taken_secs || 0;
  const timeLimit = session.time_limit_secs || 9000;
  const avgTimePerQ = session.attempted > 0 ? Math.round(timeTaken / session.attempted) : 0;
  const attemptRate = Math.round(((session.attempted || 0) / total) * 100);
  const subjectGroups = groupBySubject(attempts);
  const g = grade(scorePct);
  const markedAttempts = attempts.filter(a => a.is_marked);

  /* ── Filtered review list ── */
  const reviewList = reviewFilter === 'all' ? attempts
    : reviewFilter === 'wrong' ? attempts.filter(a => a.selected_option && !a.is_correct)
    : reviewFilter === 'skipped' ? attempts.filter(a => !a.selected_option)
    : markedAttempts;

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', fontFamily: "'DM Sans',system-ui,sans-serif", background: C.bg, minHeight: '100vh', paddingBottom: '40px' }}>

      {/* ── Top Bar ── */}
      <div style={{ background: C.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 50 }}>
        <button onClick={() => navigate('/mock-test')} style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'white', display: 'flex' }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem' }}>Mock Test Result</div>
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '0.68rem', marginTop: '1px' }}>
            {new Date(session.completed_at || session.created_at).toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <button onClick={handleShare} disabled={isSharing}
          style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: '10px', padding: '8px 14px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit' }}>
          <Share2 size={15} /> {isSharing ? 'Sharing...' : 'Share'}
        </button>
      </div>

      {/* ── Score Hero ── */}
      <div ref={scoreCardRef} style={{ background: `linear-gradient(135deg, ${C.ink} 0%, #2a2620 100%)`, padding: '28px 20px 32px' }}>
        {/* Grade badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div style={{ background: g.bg, color: g.color, padding: '5px 18px', borderRadius: '20px', fontWeight: 800, fontSize: '0.78rem', border: `1.5px solid ${g.color}40` }}>
            {g.label}
          </div>
        </div>

        {/* Big score ring */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <div style={{ position: 'relative', width: '130px', height: '130px' }}>
            <svg width="130" height="130" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
              <circle cx="65" cy="65" r="58" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="10" />
              <circle cx="65" cy="65" r="58" fill="none" stroke={g.color} strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 58}
                strokeDashoffset={2 * Math.PI * 58 * (1 - scorePct / 100)}
                style={{ transition: 'stroke-dashoffset 1s ease' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ color: 'white', fontWeight: 900, fontSize: '2.2rem', lineHeight: 1 }}>{correct}</div>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '0.75rem', marginTop: '2px' }}>/ {total}</div>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'white', fontWeight: 900, fontSize: '1.4rem' }}>{scorePct}%</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '0.72rem' }}>Score · Rank est. {rankEstimate(correct, total)}</div>
          </div>
        </div>

        {/* 5-stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '20px' }}>
          {[
            { label: 'सही', value: correct, color: '#4ade80', icon: '✓' },
            { label: 'गलत', value: wrong, color: '#f87171', icon: '✗' },
            { label: 'छोड़े', value: skipped, color: 'rgba(255,255,255,.5)', icon: '—' },
            { label: 'Accuracy', value: `${accuracy}%`, color: '#fbbf24', icon: '🎯' },
            { label: 'Time', value: fmtTime(timeTaken), color: '#93c5fd', icon: '⏱' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,.07)', borderRadius: '12px', padding: '10px 6px', textAlign: 'center', border: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ color: s.color, fontWeight: 900, fontSize: '1.05rem' }}>{s.value}</div>
              <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '0.58rem', marginTop: '3px', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Cut-off row */}
        <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Trophy size={16} color="#fbbf24" />
          <div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.68rem', fontWeight: 600 }}>Est. Cut-off 2025</div>
            <div style={{ color: 'white', fontSize: '0.78rem', fontWeight: 800, marginTop: '2px' }}>
              General: {CUTOFF_GENERAL} · OBC: {CUTOFF_OBC} · SC/ST: {CUTOFF_SC_ST}
              <span style={{ color: correct >= CUTOFF_GENERAL ? '#4ade80' : correct >= CUTOFF_OBC ? '#fbbf24' : '#f87171', marginLeft: '10px' }}>
                {correct >= CUTOFF_GENERAL ? '✓ Cleared (General)' : correct >= CUTOFF_OBC ? '✓ Cleared (OBC)' : correct >= CUTOFF_SC_ST ? '✓ Cleared (SC/ST)' : '✗ Below Cut-off'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab strip ── */}
      <div style={{ display: 'flex', background: C.surface, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: '62px', zIndex: 40 }}>
        {[
          { key: 'summary', label: '📊 Analysis' },
          { key: 'review', label: '📝 Review' },
          { key: 'leaderboard', label: '🏆 Ranking' }
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            style={{ flex: 1, padding: '14px 4px', border: 'none', background: 'none', fontWeight: tab === t.key ? 800 : 600, fontSize: '0.85rem', color: tab === t.key ? C.ink : C.ink3, borderBottom: `3px solid ${tab === t.key ? C.gold : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', transition: 'color .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '18px 14px' }}>
        {tab === 'summary' && (
          <>
            {/* ── KPIs ── */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: C.ink, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={15} color={C.gold} /> Key Performance Indicators
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {percentile != null && (
                  <div style={{ background: `linear-gradient(135deg, ${C.goldLight} 0%, #fffbeb 100%)`, border: `1.5px solid ${C.gold}`, borderRadius: '14px', padding: '14px', boxShadow: C.shadow, gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '1.4rem', marginBottom: '2px' }}>🏆</div>
                        <div style={{ fontWeight: 900, fontSize: '1.4rem', color: C.goldDeep }}>Top {100 - percentile}%</div>
                        <div style={{ fontWeight: 700, fontSize: '0.78rem', color: C.ink2, marginTop: '2px' }}>Competition Rank</div>
                        <div style={{ fontSize: '0.68rem', color: C.gold, marginTop: '2px', fontWeight: 600 }}>You scored higher than {percentile}% of users!</div>
                      </div>
                      <div style={{ background: C.gold, color: 'white', fontWeight: 800, padding: '8px 12px', borderRadius: '12px', fontSize: '1.2rem' }}>
                        #{100 - percentile}P
                      </div>
                    </div>
                  </div>
                )}
                {[
                  {
                    label: 'Attempt Rate', value: `${attemptRate}%`,
                    note: attemptRate >= 95 ? 'Excellent' : attemptRate >= 80 ? 'Good' : 'Improve',
                    color: attemptRate >= 95 ? C.green : attemptRate >= 80 ? C.gold : C.red,
                    icon: '🎯',
                  },
                  {
                    label: 'Avg Speed', value: `${avgTimePerQ}s/Q`,
                    note: avgTimePerQ <= 60 ? 'Fast' : avgTimePerQ <= 90 ? 'Good' : 'Slow',
                    color: avgTimePerQ <= 60 ? C.green : avgTimePerQ <= 90 ? C.gold : C.red,
                    icon: '⚡',
                  },
                  {
                    label: 'Time Used', value: fmtTime(timeTaken),
                    note: `${fmtTime(timeLimit - timeTaken)} remaining`,
                    color: C.blue, icon: '⏱',
                  },
                  {
                    label: 'Marked Qs', value: markedAttempts.length,
                    note: 'for review',
                    color: C.gold, icon: '🔖',
                  },
                ].map(kpi => (
                  <div key={kpi.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '14px', boxShadow: C.shadow }}>
                    <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>{kpi.icon}</div>
                    <div style={{ fontWeight: 900, fontSize: '1.3rem', color: kpi.color }}>{kpi.value}</div>
                    <div style={{ fontWeight: 700, fontSize: '0.72rem', color: C.ink2, marginTop: '2px' }}>{kpi.label}</div>
                    <div style={{ fontSize: '0.62rem', color: kpi.color, marginTop: '2px', fontWeight: 600 }}>{kpi.note}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Subject-wise Breakdown (Table) ── */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: C.ink, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BarChart2 size={15} color={C.gold} /> Subject Analysis
              </div>
              {/* Table header */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden', boxShadow: C.shadow }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 14px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  {['Subject', '✓', '✗', '—', 'Acc%'].map(h => (
                    <div key={h} style={{ fontSize: '0.62rem', fontWeight: 800, color: C.ink3, textAlign: h === 'Subject' ? 'left' : 'center', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</div>
                  ))}
                </div>
                {subjectGroups.map((sg, i) => {
                  const sc = subjectColor(sg.name);
                  const acc = sg.correct + sg.wrong > 0 ? Math.round((sg.correct / (sg.correct + sg.wrong)) * 100) : 0;
                  return (
                    <div key={sg.name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 14px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sc.ring, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.78rem', color: C.ink }}>{sg.name}</div>
                          <div style={{ fontSize: '0.58rem', color: C.ink3 }}>{sg.total}Q</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', fontWeight: 800, color: C.green, fontSize: '0.92rem' }}>{sg.correct}</div>
                      <div style={{ textAlign: 'center', fontWeight: 800, color: C.red, fontSize: '0.92rem' }}>{sg.wrong}</div>
                      <div style={{ textAlign: 'center', fontWeight: 800, color: C.ink3, fontSize: '0.92rem' }}>{sg.skipped}</div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px', background: acc >= 70 ? C.greenLight : acc >= 50 ? C.goldLight : C.redLight, color: acc >= 70 ? C.green : acc >= 50 ? C.gold : C.red }}>
                          {acc}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Subject progress bars ── */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: C.ink, marginBottom: '12px' }}>Subject Progress</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {subjectGroups.map(sg => {
                  const sc = subjectColor(sg.name);
                  const acc = sg.correct + sg.wrong > 0 ? Math.round((sg.correct / (sg.correct + sg.wrong)) * 100) : 0;
                  const correct_pct = Math.round((sg.correct / sg.total) * 100);
                  const wrong_pct = Math.round((sg.wrong / sg.total) * 100);
                  return (
                    <div key={sg.name} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '14px', boxShadow: C.shadow }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: C.ink }}>{sg.name}</div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.62rem', color: C.ink3 }}>{sg.correct}/{sg.total}</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '8px', background: sc.bg, color: sc.text }}>{acc}%</span>
                        </div>
                      </div>
                      {/* Stacked bar */}
                      <div style={{ height: '8px', background: '#f0ece4', borderRadius: '8px', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ height: '100%', width: `${correct_pct}%`, background: C.green, transition: 'width .8s ease' }} />
                        <div style={{ height: '100%', width: `${wrong_pct}%`, background: C.red, transition: 'width .8s ease' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.58rem', color: C.ink3 }}>
                        <span>✓ {sg.correct} correct</span>
                        <span>✗ {sg.wrong} wrong</span>
                        <span>— {sg.skipped} skipped</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Strongest & Weakest ── */}
            {subjectGroups.length >= 2 && (() => {
              const withAcc = subjectGroups.map(sg => ({
                ...sg,
                acc: sg.correct + sg.wrong > 0 ? Math.round((sg.correct / (sg.correct + sg.wrong)) * 100) : 0,
              }));
              const best = [...withAcc].sort((a, b) => b.acc - a.acc)[0];
              const worst = [...withAcc].sort((a, b) => a.acc - b.acc)[0];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                  <div style={{ background: C.greenLight, border: `1.5px solid ${C.green}30`, borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem' }}>🏆</div>
                    <div style={{ fontWeight: 800, fontSize: '0.72rem', color: C.green, marginTop: '6px' }}>Strongest Subject</div>
                    <div style={{ fontWeight: 900, fontSize: '1rem', color: C.green, marginTop: '4px' }}>{best.name}</div>
                    <div style={{ fontSize: '0.7rem', color: C.ink3, marginTop: '2px' }}>{best.acc}% accuracy</div>
                  </div>
                  <div style={{ background: C.redLight, border: `1.5px solid ${C.red}30`, borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem' }}>📉</div>
                    <div style={{ fontWeight: 800, fontSize: '0.72rem', color: C.red, marginTop: '6px' }}>Needs Practice</div>
                    <div style={{ fontWeight: 900, fontSize: '1rem', color: C.red, marginTop: '4px' }}>{worst.name}</div>
                    <div style={{ fontSize: '0.7rem', color: C.ink3, marginTop: '2px' }}>{worst.acc}% accuracy</div>
                  </div>
                </div>
              );
            })()}

            {/* ── XP Earned ── */}
            {xpResult && (
              <div style={{ background: `linear-gradient(135deg, ${C.purple}, #8b3fa0)`, borderRadius: '14px', padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                <div style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,.15)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>⚡</div>
                <div>
                  <div style={{ color: 'white', fontWeight: 900, fontSize: '1.2rem' }}>+{xpResult.xp} XP Earned</div>
                  <div style={{ color: 'rgba(255,255,255,.6)', fontSize: '0.7rem', marginTop: '2px' }}>Mock Test Complete · Keep it up!</div>
                </div>
              </div>
            )}

            {/* ── Action buttons ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={() => setTab('review')}
                style={{ width: '100%', background: C.ink, color: 'white', border: 'none', borderRadius: '14px', padding: '15px', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <BookOpen size={17} /> Review Questions
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button onClick={() => navigate('/mock-test')}
                  style={{ padding: '13px', borderRadius: '12px', border: `1.5px solid ${C.border}`, background: C.surface, color: C.ink, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <RotateCcw size={15} /> New Test
                </button>
                <button onClick={() => {
                  const worst = subjectGroups.sort((a, b) => (a.correct / a.total) - (b.correct / b.total))[0];
                  navigate(`/practice?subject=${worst?.code || ''}`);
                }}
                  style={{ padding: '13px', borderRadius: '12px', border: `1.5px solid ${C.gold}60`, background: C.goldLight, color: C.gold, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <TrendingUp size={15} /> Practice Weak
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════════ REVIEW TAB ════════ */}
        {tab === 'review' && (
          <>
            {/* Lang toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['wrong', 'skipped', 'marked', 'all'] as ReviewFilter[]).map(f => {
                  const counts: Record<ReviewFilter, number> = {
                    wrong: attempts.filter(a => a.selected_option && !a.is_correct).length,
                    skipped: attempts.filter(a => !a.selected_option).length,
                    marked: markedAttempts.length,
                    all: attempts.length,
                  };
                  const labels: Record<ReviewFilter, string> = { wrong: '✗ Wrong', skipped: '— Skip', marked: '🔖 Marked', all: 'All' };
                  return (
                    <button key={f} onClick={() => setReviewFilter(f)}
                      style={{ padding: '6px 10px', borderRadius: '20px', border: `1.5px solid ${reviewFilter === f ? C.gold : C.border}`, background: reviewFilter === f ? C.goldLight : C.surface, color: reviewFilter === f ? C.gold : C.ink3, fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {labels[f]} ({counts[f]})
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '2px', flexShrink: 0 }}>
                {(['hi', 'en'] as const).map(l => (
                  <button key={l} onClick={() => setLang(l)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: lang === l ? 'white' : 'transparent', fontWeight: 700, fontSize: '0.72rem', color: lang === l ? C.ink : C.ink3, boxShadow: lang === l ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontFamily: 'inherit' }}>
                    {l === 'hi' ? 'हिं' : 'EN'}
                  </button>
                ))}
              </div>
            </div>

            {reviewList.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: C.ink3, background: C.surface, borderRadius: '14px', border: `1px dashed ${C.border}` }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🎉</div>
                <div style={{ fontWeight: 600 }}>{reviewFilter === 'wrong' ? 'कोई गलत उत्तर नहीं!' : reviewFilter === 'skipped' ? 'कोई प्रश्न नहीं छोड़ा!' : 'कोई item नहीं'}</div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {reviewList.map((att, i) => {
                const q = att.questions || {};
                const isExpanded = expandedQ === att.id;
                const questionText = lang === 'hi' && q.question_hi ? q.question_hi : q.question_en;
                const options = ['A', 'B', 'C', 'D'].map(k => ({ id: k, text: lang === 'hi' && q.options_hi?.[k] ? q.options_hi[k] : q.options?.[k] || '' })).filter(o => o.text);
                const isCorrect = att.is_correct;
                const isSkipped = !att.selected_option;
                const subj = subjectColor(q.subjects?.name_hi || q.subject_name || '');

                return (
                  <div key={att.id} style={{ background: C.surface, border: `1.5px solid ${isCorrect ? C.green + '40' : isSkipped ? C.border : C.red + '40'}`, borderRadius: '16px', overflow: 'hidden', boxShadow: C.shadow }}>
                    {/* Q header */}
                    <div onClick={() => setExpandedQ(isExpanded ? null : att.id)}
                      style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      {/* Status icon */}
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isCorrect ? C.greenLight : isSkipped ? '#f3f4f6' : C.redLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {isCorrect ? <CheckCircle2 size={15} color={C.green} /> : isSkipped ? <Minus size={15} color={C.ink3} /> : <XCircle size={15} color={C.red} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '5px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: C.ink3 }}>Q{att.question_order}</span>
                          {q.subjects?.name_hi && <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: subj.bg, color: subj.text }}>{q.subjects.name_hi}</span>}
                          {q.source_year && <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: '#eef2ff', color: '#6366f1' }}>{q.source_year}</span>}
                          {att.is_marked && <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: '#fffbeb', color: '#d97706' }}>🔖</span>}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: C.ink, fontWeight: 500, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: isExpanded ? 100 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: lang === 'hi' ? "'Noto Serif', serif" : 'inherit' }}>
                          <MathText text={questionText || ''} lang={lang} />
                        </div>
                      </div>
                      <ArrowRight size={15} color={C.ink3} style={{ flexShrink: 0, marginTop: '4px', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${C.border}` }}>
                        {/* Question image */}
                        {q.image_url && (
                          <div style={{ margin: '12px 0', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${C.border}` }}>
                            <img src={q.image_url} alt="Question diagram" style={{ width: '100%', maxHeight: '240px', objectFit: 'contain', display: 'block' }} />
                          </div>
                        )}

                        {/* Options */}
                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {options.map(opt => {
                            const isCorrectOpt = opt.id === q.correct_option;
                            const isSelected = opt.id === att.selected_option;
                            return (
                              <div key={opt.id} style={{ padding: '10px 14px', borderRadius: '10px', border: `1.5px solid ${isCorrectOpt ? C.green + '80' : isSelected && !isCorrectOpt ? C.red + '80' : C.border}`, background: isCorrectOpt ? C.greenLight : isSelected && !isCorrectOpt ? C.redLight : '#fafaf8', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <span style={{ minWidth: '22px', height: '22px', borderRadius: '50%', background: isCorrectOpt ? C.green : isSelected && !isCorrectOpt ? C.red : C.border, color: isCorrectOpt || (isSelected && !isCorrectOpt) ? 'white' : C.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.65rem', flexShrink: 0 }}>{opt.id}</span>
                                <span style={{ fontSize: '0.8rem', color: isCorrectOpt ? C.green : isSelected && !isCorrectOpt ? C.red : C.ink2, fontWeight: isCorrectOpt ? 700 : 500, lineHeight: 1.5, fontFamily: lang === 'hi' ? "'Noto Serif', serif" : 'inherit' }}>
                                  <MathText text={opt.text} lang={lang} />
                                  {isCorrectOpt && <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800 }}>✓ Correct</span>}
                                  {isSelected && !isCorrectOpt && <span style={{ marginLeft: '6px', fontSize: '0.65rem', fontWeight: 800 }}>✗ Your answer</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Explanation */}
                        {(q.explanation_hi || q.explanation_en) && (
                          <div style={{ marginTop: '14px', background: isPro ? '#eef2ff' : '#fffbeb', border: `1px solid ${isPro ? '#c7d2fe' : '#fde68a'}`, borderRadius: '12px', padding: '14px' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.75rem', color: isPro ? '#6366f1' : '#d97706', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              💡 Explanation {!isPro && <a href="/pricing" style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#d97706', fontWeight: 700 }}>→ Pro</a>}
                            </div>
                            {isPro
                              ? <p lang="hi" style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.7, margin: 0 }}>{q.explanation_hi || q.explanation_en}</p>
                              : <div style={{ filter: 'blur(4px)', fontSize: '0.82rem', color: '#374151', pointerEvents: 'none', userSelect: 'none' }}>{(q.explanation_hi || q.explanation_en).slice(0, 80)}...</div>
                            }
                          </div>
                        )}

                        {/* Bookmark */}
                        <button onClick={() => toggleBookmark(q.id)}
                          style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: `1.5px solid ${bookmarked.has(q.id) ? C.gold : C.border}`, borderRadius: '8px', padding: '7px 14px', color: bookmarked.has(q.id) ? C.gold : C.ink3, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {bookmarked.has(q.id) ? '🔖 Bookmarked' : '+ Bookmark'}
                        </button>

                        <button onClick={() => setReportState({ open: true, question: att })}
                          style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: '#ecfeff', border: '1.5px solid #a5f3fc', borderRadius: '8px', padding: '7px 14px', color: '#0f766e', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Report issue
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ════════ LEADERBOARD TAB ════════ */}
        {tab === 'leaderboard' && (
          <div style={{ padding: '4px 0' }}>
            <div style={{ background: `linear-gradient(135deg, ${C.ink} 0%, ${C.ink2} 100%)`, borderRadius: '16px', padding: '24px 20px', color: 'white', textAlign: 'center', marginBottom: '20px', boxShadow: C.shadow }}>
              <Trophy size={32} color={C.gold} style={{ marginBottom: '10px' }} />
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Global Leaderboard</h2>
              <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,.6)', fontSize: '0.78rem' }}>Top scorers for {session.session_type.replace('_', ' ')}s</p>
            </div>

            {leaderboardLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ width: '32px', height: '32px', border: `3px solid ${C.border}`, borderTopColor: C.gold, borderRadius: '50%', animation: 'spinCW 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ color: C.ink3, fontSize: '0.8rem', fontWeight: 600 }}>Loading rankings...</p>
              </div>
            ) : leaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: C.surface, borderRadius: '14px', border: `1px solid ${C.border}` }}>
                <p style={{ color: C.ink3, fontSize: '0.85rem', fontWeight: 600 }}>No scores yet. You're the first one here!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {leaderboard.map((lb, idx) => {
                  const isMe = lb.user_id === user!.id;
                  const rank = idx + 1;
                  const rankColor = rank === 1 ? '#fbbf24' : rank === 2 ? '#9ca3af' : rank === 3 ? '#b45309' : C.ink3;
                  const rankBg = rank === 1 ? '#fffbeb' : rank === 2 ? '#f3f4f6' : rank === 3 ? '#fef3c7' : 'transparent';
                  
                  return (
                    <div key={lb.id} style={{ display: 'flex', alignItems: 'center', background: isMe ? C.goldLight : C.surface, border: `1.5px solid ${isMe ? C.gold : C.border}`, borderRadius: '14px', padding: '12px 14px', gap: '12px', boxShadow: C.shadow }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: rankBg, color: rankColor, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: rank <= 3 ? `1.5px solid ${rankColor}40` : 'none' }}>
                        {rank}
                      </div>
                      
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {lb.user_profiles?.full_name || 'Anonymous Learner'}
                          </span>
                          {isMe && <span style={{ fontSize: '0.55rem', background: C.gold, color: 'white', padding: '2px 6px', borderRadius: '10px', fontWeight: 800, textTransform: 'uppercase' }}>You</span>}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: C.ink3, marginTop: '2px' }}>
                          {fmtTime(lb.time_taken_secs)} · {new Date(lb.completed_at).toLocaleDateString('hi-IN', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 900, fontSize: '1.2rem', color: isMe ? C.goldDeep : C.ink }}>{lb.score}</div>
                        <div style={{ fontSize: '0.62rem', color: C.ink3, fontWeight: 700 }}>/ {lb.total_questions || session.total_questions}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <ReportQuestionModal
        open={reportState.open}
        onClose={() => setReportState({ open: false, question: null })}
        onSubmit={handleSubmitReport}
        questionLabel={reportState.question ? `Q: ${reportState.question.question_id || reportState.question.id}` : 'Question'}
        source="mock_results"
      />
      <SharePreviewModal
        open={sharePreview.open}
        title={sharePreview.title}
        text={sharePreview.text}
        imageUrl={sharePreview.imageUrl}
        onClose={closeSharePreview}
        onDownload={downloadSharePreview}
        onNativeShare={sharePreviewNative}
      />
      <style>{`@keyframes spinCW{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
