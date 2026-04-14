import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { useToast } from '../../hooks/useToast';
import {
 ChevronLeft, CheckCircle2, XCircle, Clock, Target,
 ArrowRight, Zap, TrendingUp, Bookmark, BookmarkCheck,
 Share2, RotateCcw, Lock, Trophy, Star,
} from 'lucide-react';
import { calculateSessionXP } from '../../lib/engine/gamification';
import { generateRecommendations } from '../../lib/engine/recommendations';
import { useShareCard } from '../../hooks/useShareCard';
import ReportQuestionModal from '../../components/shared/ReportQuestionModal';
import SharePreviewModal from '../../components/shared/SharePreviewModal';
import { submitQuestionReport } from '../../lib/reporting';
import { trackError, trackEvent } from '../../lib/telemetry';

function getSubjectName(q: any) {
 return q?.subjects?.name_hi || q?.subjects?.name_en || q?.subject_name || q?.subject_code || 'Subject';
}

/* ── Explanation block: shown after every answer in review ── */
function ExplanationBlock({ q, isPro, navigate }: { q: any; isPro: boolean; navigate: (path: string) => void }) {
  const hasExplanation = !!(q?.explanation_hi || q?.explanation_en);

  if (!hasExplanation) {
    return (
      <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: '#f9fafb', border: '1px dashed #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '1rem' }}>🤷</span>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>कोई explanation उपलब्ध नहीं है</span>
      </div>
    );
  }

  if (isPro) {
    return (
      <div style={{ background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)', border: '1px solid #c7d2fe', borderRadius: '12px', padding: '14px 16px', marginTop: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <div style={{ width: '22px', height: '22px', background: '#6366f1', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={13} color="white" fill="white" />
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Explanation</span>
        </div>
        <p lang="hi" style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.75, margin: 0 }}>
          {q.explanation_hi || q.explanation_en}
        </p>
      </div>
    );
  }

  // Free user — blurred with upgrade prompt
  return (
    <div style={{ position: 'relative', marginTop: '14px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none', fontSize: '0.85rem', color: '#374151', lineHeight: 1.6 }}>
        {(q.explanation_hi || q.explanation_en).slice(0, 120)}...
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(2px)' }}>
        <Lock size={18} color="#9ca3af" style={{ marginBottom: '6px' }} />
        <span style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: '4px' }}>Explanation Pro users के लिए है</span>
        <a onClick={() => navigate('/pricing')} style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6366f1', cursor: 'pointer', textDecoration: 'none' }}>Pro में upgrade करें →</a>
      </div>
    </div>
  );
}

function groupBySubject(attempts: any[]) {
 const map = new Map<string, { key: string; name: string; attempts: any[]; correct: number; wrong: number; skipped: number }>();

 for (const attempt of attempts) {
    const q = attempt.questions || {};
    const key = q.subject_id || q.subject_code || 'other';
    const name = getSubjectName(q);

    if (!map.has(key)) map.set(key, { key, name, attempts: [], correct: 0, wrong: 0, skipped: 0 });
    const bucket = map.get(key)!;
    bucket.attempts.push(attempt);

    if (!attempt.selected_option) bucket.skipped += 1;
    else if (attempt.is_correct) bucket.correct += 1;
    else bucket.wrong += 1;
 }

 return [...map.values()];
}

type Filter = 'all' | 'correct' | 'wrong' | 'skipped';

export default function PracticeResultsPage() {
 const { sessionId } = useParams<{ sessionId: string }>();
 const navigate = useNavigate();
 const { user } = useAuth();
 const { isPro } = useSubscription();

 const [session, setSession] = useState<any>(null);
 const [attempts, setAttempts] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);
 const [filter, setFilter] = useState<Filter>('all');
 const [xpResult, setXpResult] = useState<any>(null);
 const [prevAccuracy, setPrevAccuracy] = useState<number | null>(null);
 const [recommendations, setRecommendations] = useState<any[]>([]);
 const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
 const [accuracy, setAccuracy] = useState(0);
 const [reportState, setReportState] = useState<{ open: boolean; question: any | null }>({ open: false, question: null });
 const { isSharing, shareElement, sharePreview, closeSharePreview, downloadSharePreview, sharePreviewNative } = useShareCard();
 const { showToast } = useToast();
 const scoreCardRef = useRef<HTMLDivElement>(null);
 const hasShownSharePrompt = useRef(false);

 useEffect(() => { if (sessionId && user) loadData(); }, [sessionId, user]);

 useEffect(() => {
   if (!loading && session && !hasShownSharePrompt.current) {
     hasShownSharePrompt.current = true;
     showToast({
       type: 'info',
       title: 'Share your result',
       message: 'Tap Share to post your score card and celebrate your progress.',
       duration: 5000,
     });
   }
 }, [loading, session, showToast]);

 const loadData = async () => {
    setLoading(true);
    try {
      const [sr, ar] = await Promise.all([
        supabase.from('practice_sessions').select('*').eq('id', sessionId!).single(),
        supabase.from('question_attempts').select('*, questions(*, subjects(id, name_hi, name_en, code))').eq('session_id', sessionId!).order('question_order'),
      ]);

      if (sr.error || !sr.data) { navigate('/practice'); return; }
      setSession(sr.data);
      void trackEvent('results_load', { session_id: sessionId, session_type: sr.data.session_type }, user?.id);

      const attemptsData = (ar.data || []).map((a: any) => ({
        ...a,
        questions: {
          ...a.questions,
          subject_name: getSubjectName(a.questions),
        },
      }));
      setAttempts(attemptsData);

      const total = sr.data.total_questions || attemptsData.length || 1;
      const acc = Math.round(((sr.data.correct || 0) / total) * 100);
      setAccuracy(acc);
      setXpResult(calculateSessionXP({ attempted: sr.data.attempted || 0, correct: sr.data.correct || 0, sessionType: sr.data.session_type }));

      try {
        const { data: prev } = await supabase
          .from('practice_sessions')
          .select('correct, total_questions')
          .eq('user_id', user!.id)
          .eq('status', 'completed')
          .neq('id', sessionId!)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prev && (prev.total_questions ?? 0) > 0) setPrevAccuracy(Math.round((prev.correct / prev.total_questions) * 100));
      } catch { }

      try {
        const { data: bmarks } = await supabase.from('bookmarks').select('question_id').eq('user_id', user!.id);
        setBookmarked(new Set((bmarks || []).map((b: any) => b.question_id)));
      } catch { }

      try { setRecommendations(await generateRecommendations(user!.id)); } catch { }
    } catch (err) {
      console.error('Results load error:', err);
      void trackError(err, { stage: 'results_load', session_id: sessionId }, user?.id);
      navigate('/practice');
    } finally {
      setLoading(false);
    }
 };

 const handleShare = async () => {
    if (!scoreCardRef.current) return;
    try {
      void trackEvent('results_share', { session_id: sessionId }, user?.id);
      await shareElement(scoreCardRef.current, {
        kind: 'score',
        userId: user?.id,
        filename: 'uptet-score.png',
        title: 'My Practice Score',
        payload: {
          score: accuracy,
          correct: session?.correct,
          total: session?.total_questions,
        },
      });
    } catch (err) {
      console.error(err);
      void trackError(err, { stage: 'results_share', session_id: sessionId }, user?.id);
      showToast({
        type: 'error',
        title: 'Share failed',
        message: 'Please try again or use download/share from the preview.',
        duration: 4000,
      });
    }
 };

 const toggleBookmark = async (qId: string) => {
    if (!qId) return;
    const is = bookmarked.has(qId);
    const u = new Set(bookmarked);
    if (is) {
      u.delete(qId);
      await supabase.from('bookmarks').delete().eq('user_id', user!.id).eq('question_id', qId);
      void trackEvent('bookmark_toggle', { action: 'remove', question_id: qId, from: 'results' }, user?.id);
    } else {
      u.add(qId);
      await supabase.from('bookmarks').upsert({ user_id: user!.id, question_id: qId, collection: 'default' });
      void trackEvent('bookmark_toggle', { action: 'add', question_id: qId, from: 'results' }, user?.id);
    }
    setBookmarked(u);
 };

   const handleSubmitReport = async (reportType: any, reportText: string) => {
      if (!reportState.question) return;
      await submitQuestionReport({
        userId: user!.id,
        questionId: reportState.question.id,
        sessionId: session?.id,
        reportType,
        reportText,
        source: 'practice_results',
      });
    };

 if (loading || !session) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '52px', height: '52px', border: '4px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spinCW 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#6b7280', fontWeight: 600, fontSize: '0.95rem' }}>Results तैयार हो रहे हैं...</p>
      </div>
    </div>
 );

 const isPyqPaper = session.session_type === 'pyq_paper';
 const subjectGroups = isPyqPaper ? groupBySubject(attempts) : [];
 const subjectSummary = isPyqPaper
    ? subjectGroups.map(g => ({
        key: g.key,
        name: g.name,
        total: g.attempts.length,
        attempted: g.attempts.filter(a => a.selected_option).length,
        correct: g.correct,
        wrong: g.wrong,
        skipped: g.skipped,
        accuracy: g.attempts.length ? Math.round((g.correct / g.attempts.length) * 100) : 0,
      }))
    : [];

 const improvement = prevAccuracy !== null ? accuracy - prevAccuracy : null;
 const filtered = attempts.filter(a => {
    if (filter === 'correct') return a.is_correct;
    if (filter === 'wrong') return a.selected_option && !a.is_correct;
    if (filter === 'skipped') return !a.selected_option;
    return true;
 });

 const totalCorrect = attempts.filter(a => a.is_correct).length;
 const totalWrong = attempts.filter(a => a.selected_option && !a.is_correct).length;
 const totalSkipped = attempts.filter(a => !a.selected_option).length;

 const radius = 52; const circ = 2 * Math.PI * radius;
 const dash = (accuracy / 100) * circ;

 const scoreGrade = accuracy >= 80 ? { label: 'Excellent! 🏆', color: '#16a34a', bg: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' }
    : accuracy >= 65 ? { label: 'Good Job! 👍', color: '#0891b2', bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }
    : accuracy >= 50 ? { label: 'Keep Going! 💪', color: '#d97706', bg: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' }
    : { label: 'Practice More! 📖', color: '#dc2626', bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' };

 const sessionTypeLabel: Record<string, string> = {
    topic_practice: 'Topic Practice', pyq_paper: 'PYQ Paper',
    mock_test: 'Mock Test', weak_mix: 'Weakness Mix',
    challenge: 'Daily Challenge', revision: 'Revision',
 };

 return (
    <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '48px' }}>
      <button onClick={() => navigate('/dashboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#6366f1', fontWeight: 700, fontSize: '0.875rem', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', width: 'fit-content', fontFamily: 'inherit' }}>
        <ChevronLeft size={18} /> Back to Dashboard
      </button>

      <div ref={scoreCardRef} style={{ background: scoreGrade.bg, borderRadius: '28px', overflow: 'hidden', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', background: 'rgba(255,255,255,0.08)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-30px', left: '-20px', width: '140px', height: '140px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '20px', left: '20px', width: '60px', height: '60px', background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />

        <div style={{ position: 'relative', padding: '32px 28px 24px', display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr)', alignItems: 'center', columnGap: '18px' }}>
          <div style={{ flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '112px', height: '112px' }}>
            <svg width="112" height="112" viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
              <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
              <circle cx="64" cy="64" r={radius} fill="none" stroke="white" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${dash} ${circ - dash}`} style={{ transition: 'stroke-dasharray 1.6s cubic-bezier(0.16,1,0.3,1)' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: '1.55rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{accuracy}%</div>
              <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.78)', fontWeight: 800, marginTop: '4px', letterSpacing: '0.12em' }}>SCORE</div>
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.72rem', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {sessionTypeLabel[session.session_type] || session.session_type} · {new Date(session.completed_at || session.created_at).toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' })}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', lineHeight: 1.1, marginBottom: '8px', whiteSpace: 'nowrap' }}>
              {session.correct} / {session.total_questions}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.2)', borderRadius: '999px', padding: '6px 12px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)', maxWidth: '100%', boxSizing: 'border-box' }}>
              <Star size={13} color="white" fill="white" />
              <span style={{ color: 'white', fontWeight: 800, fontSize: '0.78rem', lineHeight: 1.15, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{scoreGrade.label}</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(8px)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { icon: CheckCircle2, label: 'Correct', value: session.correct, color: '#86efac' },
            { icon: XCircle, label: 'Wrong', value: session.wrong ?? totalWrong, color: '#fca5a5' },
            { icon: Target, label: 'Skipped', value: session.skipped ?? totalSkipped, color: 'rgba(255,255,255,0.5)' },
            { icon: Clock, label: 'Time', value: session.time_taken_secs ? `${Math.floor(session.time_taken_secs / 60)}m ${session.time_taken_secs % 60}s` : '—', color: '#a5b4fc' },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: '14px 12px', textAlign: 'center', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
              <s.icon size={16} color={s.color} style={{ margin: '0 auto 4px' }} />
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600, marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: improvement !== null ? '1fr 1fr' : '1fr', gap: '14px' }}>
        {xpResult?.total > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fde68a', borderRadius: '20px', padding: '18px 20px', boxShadow: '0 2px 12px rgba(245,158,11,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{ width: '32px', height: '32px', background: '#f59e0b', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(245,158,11,0.35)' }}>
                <Zap size={16} color="white" fill="white" />
              </div>
              <span style={{ fontWeight: 900, color: '#92400e', fontSize: '1rem' }}>+{xpResult.total} XP</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {xpResult.breakdown.map((b: any, i: number) => (
                <span key={i} style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #fde68a', borderRadius: '999px', padding: '3px 10px', fontSize: '0.68rem', color: '#92400e', fontWeight: 700 }}>{b.label} +{b.xp}</span>
              ))}
            </div>
          </div>
        )}
        {improvement !== null && (
          <div style={{ background: improvement >= 0 ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: `1px solid ${improvement >= 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius: '20px', padding: '18px 20px', boxShadow: improvement >= 0 ? '0 2px 12px rgba(22,163,74,0.1)' : '0 2px 12px rgba(220,38,38,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', background: improvement >= 0 ? '#16a34a' : '#dc2626', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={16} color="white" />
              </div>
              <span style={{ fontWeight: 900, color: '#111827', fontSize: '0.9rem' }}>
                {improvement >= 0 ? `+${improvement}% बेहतर! 🎉` : `${improvement}% — आगे बढ़ो!`}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 500 }}>पिछला: {prevAccuracy}% → आज: {accuracy}%</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isPyqPaper ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '10px' }}>
        <button onClick={handleShare} disabled={isSharing} style={{ padding: '14px 10px', background: '#25D366', color: 'white', fontWeight: 800, borderRadius: '16px', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', fontSize: '0.78rem', boxShadow: '0 4px 16px rgba(37,211,102,0.3)', opacity: isSharing ? 0.7 : 1, fontFamily: 'inherit' }}>
          <Share2 size={20} /> {isSharing ? '...' : 'Share'}
        </button>
        <button onClick={() => navigate('/practice')} style={{ padding: '14px 10px', background: '#6366f1', border: 'none', color: 'white', fontWeight: 800, borderRadius: '16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', fontSize: '0.78rem', boxShadow: '0 4px 16px rgba(99,102,241,0.3)', fontFamily: 'inherit' }}>
          <RotateCcw size={20} /> फिर Practice
        </button>
        <button onClick={() => navigate('/dashboard')} style={{ padding: '14px 10px', background: '#111827', border: 'none', color: 'white', fontWeight: 800, borderRadius: '16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontFamily: 'inherit' }}>
          <Trophy size={20} /> Dashboard
        </button>
      </div>

      {recommendations.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '22px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontWeight: 900, fontSize: '1rem', color: '#111827', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🎯 आगे क्या करें?
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recommendations.slice(0, 3).map(rec => (
              <button key={rec.id} onClick={() => navigate('/practice')}
                style={{ background: rec.priority === 'urgent' ? '#fef2f2' : rec.priority === 'suggested' ? '#eef2ff' : '#f9fafb', border: `1px solid ${rec.priority === 'urgent' ? '#fecaca' : rec.priority === 'suggested' ? '#c7d2fe' : '#e5e7eb'}`, borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', transition: 'transform 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ''}>
                <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{rec.priority === 'urgent' ? '⚠️' : rec.type === 'mock' ? '📝' : rec.type === 'revision' ? '🔖' : '💡'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.title}</div>
                  <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: '2px' }}>{rec.subtitle}</div>
                </div>
                <ArrowRight size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontWeight: 900, fontSize: '1rem', color: '#111827', margin: '0 0 14px' }}>{isPyqPaper ? '📋 Subject-wise Review' : '📋 Answer Review'}</h2>

          {isPyqPaper && subjectSummary.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px' }}>
              {subjectSummary.map(s => (
                <div key={s.key} style={{ minWidth: '160px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{s.name}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#111827' }}>{s.accuracy}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '4px' }}>{s.correct}/{s.total} सही · {s.wrong} गलत · {s.skipped} छोड़े</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            {([
              { key: 'all', label: 'All', count: attempts.length, color: '#111827' },
              { key: 'correct', label: 'Correct', count: attempts.filter(a => a.is_correct).length, color: '#16a34a' },
              { key: 'wrong', label: 'Wrong', count: attempts.filter(a => a.selected_option && !a.is_correct).length, color: '#dc2626' },
              { key: 'skipped', label: 'Skipped', count: attempts.filter(a => !a.selected_option).length, color: '#9ca3af' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFilter(f.key as Filter)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', padding: '7px 14px', borderRadius: '999px', border: '2px solid', borderColor: filter === f.key ? f.color : '#e5e7eb', background: filter === f.key ? f.color : 'white', color: filter === f.key ? 'white' : '#6b7280', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0, fontFamily: 'inherit' }}>
                <span>{f.label}</span>
                <span style={{ background: filter === f.key ? 'rgba(255,255,255,0.25)' : '#f3f4f6', borderRadius: '999px', padding: '0 6px', fontSize: '0.7rem', fontWeight: 800 }}>{f.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {isPyqPaper ? (
            subjectGroups.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af' }}>कोई subject breakdown उपलब्ध नहीं</div>
            ) : subjectGroups.map(group => {
              const reviewAttempts = group.attempts.filter(a => {
                if (filter === 'correct') return a.is_correct;
                if (filter === 'wrong') return a.selected_option && !a.is_correct;
                if (filter === 'skipped') return !a.selected_option;
                return true;
              });

              return (
                <div key={group.key} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ fontWeight: 900, color: '#111827', fontSize: '0.92rem' }}>{group.name}</div>
                    <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.72rem', color: '#6b7280' }}>
                      <span>Q {group.attempts.length}</span>
                      <span>Attempted {group.attempts.filter(a => a.selected_option).length}</span>
                      <span>Correct {group.correct}</span>
                      <span>Wrong {group.wrong}</span>
                      <span>Skipped {group.skipped}</span>
                      <span>Accuracy {group.attempts.length ? Math.round((group.correct / group.attempts.length) * 100) : 0}%</span>
                    </div>
                  </div>

                  {reviewAttempts.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>इस subject में कोई question नहीं</div>
                  ) : reviewAttempts.map((attempt, idx) => {
                    const q = attempt.questions;
                    const attempted = !!attempt.selected_option;
                    const isCorrect = attempt.is_correct;
                    const isBmarked = bookmarked.has(q?.id);
                    const statusBg = isCorrect ? '#f0fdf4' : attempted ? '#fef2f2' : '#f9fafb';
                    const statusBorder = isCorrect ? '#bbf7d0' : attempted ? '#fecaca' : '#e5e7eb';

                    return (
                      <div key={attempt.id} style={{ borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: statusBg, borderLeft: `4px solid ${statusBorder}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '2px 8px', fontSize: '0.68rem', fontWeight: 800, color: '#6b7280', fontFamily: 'monospace' }}>Q{attempt.question_order}</span>
                            {isCorrect ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '3px 10px', borderRadius: '999px' }}><CheckCircle2 size={12} /> सही</span>
                              : attempted ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '3px 10px', borderRadius: '999px' }}><XCircle size={12} /> गलत</span>
                              : <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', background: 'white', border: '1px solid #e5e7eb', padding: '3px 10px', borderRadius: '999px' }}>⏭ छोड़ा</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {attempt.time_taken_secs && <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#9ca3af' }}>{attempt.time_taken_secs}s</span>}
                            <button onClick={() => toggleBookmark(q?.id)} style={{ border: 'none', background: 'rgba(0,0,0,0.04)', borderRadius: '8px', padding: '5px', cursor: 'pointer', display: 'flex', color: isBmarked ? '#d97706' : '#d1d5db', transition: 'all 0.15s' }}>
                              {isBmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                            </button>
                          </div>
                        </div>

                        <div style={{ padding: '18px 24px 20px' }}>
                          <p lang="hi" style={{ fontWeight: 600, color: '#111827', lineHeight: 1.75, fontSize: '0.9rem', margin: '0 0 16px' }}>{q?.question_hi || q?.question_en}</p>

                          <div style={{ display: 'grid', gridTemplateColumns: isCorrect ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                            <div style={{ background: attempted ? (isCorrect ? '#f0fdf4' : '#fef2f2') : '#f9fafb', border: `1.5px solid ${isCorrect ? '#86efac' : attempted ? '#fca5a5' : '#e5e7eb'}`, borderRadius: '12px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>आपका जवाब</div>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isCorrect ? '#15803d' : attempted ? '#b91c1c' : '#9ca3af' }}>
                                {attempted ? `${attempt.selected_option}. ${q?.options?.[attempt.selected_option] ?? ''}` : 'उत्तर नहीं दिया'}
                              </div>
                            </div>
                            {!isCorrect && (
                              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '12px', padding: '12px 14px' }}>
                                <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>सही जवाब</div>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#15803d' }}>{q?.correct_option}. {q?.options?.[q?.correct_option] ?? ''}</div>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                            <button onClick={() => setReportState({ open: true, question: q })} style={{ border: '1px solid #a5f3fc', background: '#ecfeff', color: '#0f766e', borderRadius: '999px', padding: '8px 12px', fontWeight: 800, fontSize: '0.74rem', cursor: 'pointer' }}>
                              Report issue
                            </button>
                          </div>

                          <ExplanationBlock q={q} isPro={isPro} navigate={navigate} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          ) : (
            filtered.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af' }}>इस category में कोई question नहीं</div>
            ) : filtered.map((attempt, idx) => {
              const q = attempt.questions;
              const attempted = !!attempt.selected_option;
              const isCorrect = attempt.is_correct;
              const isBmarked = bookmarked.has(q?.id);
              const statusBg = isCorrect ? '#f0fdf4' : attempted ? '#fef2f2' : '#f9fafb';
              const statusBorder = isCorrect ? '#bbf7d0' : attempted ? '#fecaca' : '#e5e7eb';

              return (
                <div key={attempt.id} style={{ borderTop: idx > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: statusBg, borderLeft: `4px solid ${statusBorder}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '2px 8px', fontSize: '0.68rem', fontWeight: 800, color: '#6b7280', fontFamily: 'monospace' }}>Q{attempt.question_order}</span>
                      {isCorrect
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '3px 10px', borderRadius: '999px' }}><CheckCircle2 size={12} /> सही</span>
                        : attempted
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '3px 10px', borderRadius: '999px' }}><XCircle size={12} /> गलत</span>
                          : <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', background: 'white', border: '1px solid #e5e7eb', padding: '3px 10px', borderRadius: '999px' }}>⏭ छोड़ा</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {attempt.time_taken_secs && <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#9ca3af' }}>{attempt.time_taken_secs}s</span>}
                      <button onClick={() => toggleBookmark(q?.id)} style={{ border: 'none', background: 'rgba(0,0,0,0.04)', borderRadius: '8px', padding: '5px', cursor: 'pointer', display: 'flex', color: isBmarked ? '#d97706' : '#d1d5db', transition: 'all 0.15s' }}>
                        {isBmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: '18px 24px 20px' }}>
                    <p lang="hi" style={{ fontWeight: 600, color: '#111827', lineHeight: 1.75, fontSize: '0.9rem', margin: '0 0 16px' }}>
                      {q?.question_hi || q?.question_en}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: isCorrect ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                      <div style={{ background: attempted ? (isCorrect ? '#f0fdf4' : '#fef2f2') : '#f9fafb', border: `1.5px solid ${isCorrect ? '#86efac' : attempted ? '#fca5a5' : '#e5e7eb'}`, borderRadius: '12px', padding: '12px 14px' }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>आपका जवाब</div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isCorrect ? '#15803d' : attempted ? '#b91c1c' : '#9ca3af' }}>
                          {attempted ? `${attempt.selected_option}. ${q?.options?.[attempt.selected_option] ?? ''}` : 'उत्तर नहीं दिया'}
                        </div>
                      </div>
                      {!isCorrect && (
                        <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '12px', padding: '12px 14px' }}>
                          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>सही जवाब</div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#15803d' }}>{q?.correct_option}. {q?.options?.[q?.correct_option] ?? ''}</div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                      <button onClick={() => setReportState({ open: true, question: q })} style={{ border: '1px solid #a5f3fc', background: '#ecfeff', color: '#0f766e', borderRadius: '999px', padding: '8px 12px', fontWeight: 800, fontSize: '0.74rem', cursor: 'pointer' }}>
                        Report issue
                      </button>
                    </div>

                    <ExplanationBlock q={q} isPro={isPro} navigate={navigate} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    <ReportQuestionModal
      open={reportState.open}
      onClose={() => setReportState({ open: false, question: null })}
      onSubmit={handleSubmitReport}
      questionLabel={reportState.question ? `Q: ${reportState.question.question_id || reportState.question.id}` : 'Question'}
      source="practice_results"
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
    </div>
 );
}
