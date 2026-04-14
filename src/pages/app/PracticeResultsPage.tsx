import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import {
  ChevronLeft, CheckCircle2, XCircle, Clock, Target,
  ArrowRight, Zap, TrendingUp, Bookmark, BookmarkCheck,
  Share2, RotateCcw, Lock, Trophy, Star,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { calculateSessionXP } from '../../lib/engine/gamification';
import { generateRecommendations } from '../../lib/engine/recommendations';

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
  const [isSharing, setIsSharing] = useState(false);
  const [accuracy, setAccuracy] = useState(0);
  const scoreCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (sessionId && user) loadData(); }, [sessionId, user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sr, ar] = await Promise.all([
        supabase.from('practice_sessions').select('*').eq('id', sessionId!).single(),
        supabase.from('question_attempts').select('*, questions(*)').eq('session_id', sessionId!).order('question_order'),
      ]);
      if (sr.error || !sr.data) { navigate('/practice'); return; }
      setSession(sr.data);
      const attemptsData = ar.data || [];
      setAttempts(attemptsData);
      const total = sr.data.total_questions || attemptsData.length || 1;
      const acc = Math.round(((sr.data.correct || 0) / total) * 100);
      setAccuracy(acc);
      const xp = calculateSessionXP({ attempted: sr.data.attempted || 0, correct: sr.data.correct || 0, sessionType: sr.data.session_type });
      setXpResult(xp);
      try {
        const { data: prev } = await supabase.from('practice_sessions').select('correct, total_questions').eq('user_id', user!.id).eq('status', 'completed').neq('id', sessionId!).order('completed_at', { ascending: false }).limit(1).maybeSingle();
        if (prev && (prev.total_questions ?? 0) > 0) setPrevAccuracy(Math.round((prev.correct / prev.total_questions) * 100));
      } catch { }
      try {
        const { data: bmarks } = await supabase.from('bookmarks').select('question_id').eq('user_id', user!.id);
        setBookmarked(new Set((bmarks || []).map((b: any) => b.question_id)));
      } catch { }
      try { setRecommendations(await generateRecommendations(user!.id)); } catch { }
    } catch (err) {
      console.error('Results load error:', err);
      navigate('/practice');
    } finally { setLoading(false); }
  };

  const handleShare = async () => {
    if (!scoreCardRef.current) return;
    setIsSharing(true);
    try {
      const canvas = await html2canvas(scoreCardRef.current, { scale: 2, backgroundColor: null, useCORS: true });
      canvas.toBlob(blob => {
        if (!blob) return;
        const file = new File([blob], 'uptet-score.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare({ files: [file] })) {
          navigator.share({ title: 'मेरा UPTET Score', text: `मैंने ${accuracy}% score किया! 🎯 ShikshaSetu पर try करें।`, files: [file] }).catch(console.error);
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.download = 'uptet-score.png'; a.href = url; a.click(); URL.revokeObjectURL(url);
        }
      });
    } catch (err) { console.error(err); } finally { setIsSharing(false); }
  };

  const toggleBookmark = async (qId: string) => {
    if (!qId) return;
    const is = bookmarked.has(qId);
    const u = new Set(bookmarked);
    if (is) { u.delete(qId); await supabase.from('bookmarks').delete().eq('user_id', user!.id).eq('question_id', qId); }
    else { u.add(qId); await supabase.from('bookmarks').upsert({ user_id: user!.id, question_id: qId, collection: 'default' }); }
    setBookmarked(u);
  };

  if (loading || !session) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '52px', height: '52px', border: '4px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spinCW 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#6b7280', fontWeight: 600, fontSize: '0.95rem' }}>Results तैयार हो रहे हैं...</p>
      </div>
    </div>
  );

  const improvement = prevAccuracy !== null ? accuracy - prevAccuracy : null;
  const filtered = attempts.filter(a => {
    if (filter === 'correct') return a.is_correct;
    if (filter === 'wrong') return a.selected_option && !a.is_correct;
    if (filter === 'skipped') return !a.selected_option;
    return true;
  });

  // Score ring parameters
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

      {/* ── Back ── */}
      <button onClick={() => navigate('/practice')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#6366f1', fontWeight: 700, fontSize: '0.875rem', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', width: 'fit-content', fontFamily: 'inherit' }}>
        <ChevronLeft size={18} /> Practice Hub
      </button>

      {/* ── Hero Score Card ── */}
      <div ref={scoreCardRef} style={{ background: scoreGrade.bg, borderRadius: '28px', overflow: 'hidden', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', background: 'rgba(255,255,255,0.08)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-30px', left: '-20px', width: '140px', height: '140px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '20px', left: '20px', width: '60px', height: '60px', background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />

        <div style={{ position: 'relative', padding: '36px 32px 28px', display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap' }}>
          {/* SVG Ring */}
          <div style={{ flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
              <circle cx="64" cy="64" r={radius} fill="none" stroke="white" strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circ - dash}`}
                style={{ transition: 'stroke-dasharray 1.6s cubic-bezier(0.16,1,0.3,1)' }} />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>{accuracy}%</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.75)', fontWeight: 700, marginTop: '2px' }}>SCORE</div>
            </div>
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: '180px' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {sessionTypeLabel[session.session_type] || session.session_type} · {new Date(session.completed_at || session.created_at).toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' })}
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', lineHeight: 1.15, marginBottom: '8px' }}>
              {session.correct} / {session.total_questions}
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.2)', borderRadius: '999px', padding: '5px 14px', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)' }}>
              <Star size={13} color="white" fill="white" />
              <span style={{ color: 'white', fontWeight: 800, fontSize: '0.82rem' }}>{scoreGrade.label}</span>
            </div>
          </div>
        </div>

        {/* Bottom stats strip */}
        <div style={{ background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(8px)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { icon: CheckCircle2, label: 'Correct', value: session.correct, color: '#86efac' },
            { icon: XCircle, label: 'Wrong', value: session.wrong ?? attempts.filter(a => a.selected_option && !a.is_correct).length, color: '#fca5a5' },
            { icon: Target, label: 'Skipped', value: session.skipped ?? attempts.filter(a => !a.selected_option).length, color: 'rgba(255,255,255,0.5)' },
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

      {/* ── XP + Improvement row ── */}
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

      {/* ── Action Buttons ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
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

      {/* ── Recommendations ── */}
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
                <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>
                  {rec.priority === 'urgent' ? '⚠️' : rec.type === 'mock' ? '📝' : rec.type === 'revision' ? '🔖' : '💡'}
                </span>
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

      {/* ── Answer Review ── */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontWeight: 900, fontSize: '1rem', color: '#111827', margin: '0 0 14px' }}>📋 Answer Review</h2>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            {([
              { key: 'all', label: `All`, count: attempts.length, color: '#111827' },
              { key: 'correct', label: `Correct`, count: attempts.filter(a => a.is_correct).length, color: '#16a34a' },
              { key: 'wrong', label: `Wrong`, count: attempts.filter(a => a.selected_option && !a.is_correct).length, color: '#dc2626' },
              { key: 'skipped', label: `Skipped`, count: attempts.filter(a => !a.selected_option).length, color: '#9ca3af' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFilter(f.key as Filter)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', padding: '7px 14px', borderRadius: '999px', border: '2px solid', borderColor: filter === f.key ? f.color : '#e5e7eb', background: filter === f.key ? f.color : 'white', color: filter === f.key ? 'white' : '#6b7280', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0, fontFamily: 'inherit' }}>
                <span>{f.label}</span>
                <span style={{ background: filter === f.key ? 'rgba(255,255,255,0.25)' : '#f3f4f6', borderRadius: '999px', padding: '0 6px', fontSize: '0.7rem', fontWeight: 800 }}>{f.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Question cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {filtered.length === 0 ? (
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
                {/* Q header */}
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

                {/* Q body */}
                <div style={{ padding: '18px 24px 20px' }}>
                  <p lang="hi" style={{ fontWeight: 600, color: '#111827', lineHeight: 1.75, fontSize: '0.9rem', margin: '0 0 16px' }}>
                    {q?.question_hi || q?.question_en}
                  </p>

                  {/* Answer comparison */}
                  <div style={{ display: 'grid', gridTemplateColumns: isCorrect ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: isPro && (q?.explanation_hi || q?.explanation_en) ? '14px' : '0' }}>
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

                  {/* Explanation */}
                  {(q?.explanation_hi || q?.explanation_en) && (
                    isPro ? (
                      <div style={{ background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)', border: '1px solid #c7d2fe', borderRadius: '12px', padding: '14px 16px', marginTop: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                          <div style={{ width: '22px', height: '22px', background: '#6366f1', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Zap size={13} color="white" fill="white" />
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Explanation</span>
                        </div>
                        <p lang="hi" style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.75, margin: 0 }}>{q.explanation_hi || q.explanation_en}</p>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', marginTop: '14px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '14px 16px', filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none', fontSize: '0.85rem', color: '#374151', lineHeight: 1.6 }}>
                          {(q.explanation_hi || q.explanation_en).slice(0, 120)}...
                        </div>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(2px)' }}>
                          <Lock size={18} color="#9ca3af" style={{ marginBottom: '6px' }} />
                          <a onClick={() => navigate('/pricing')} style={{ fontSize: '0.78rem', fontWeight: 800, color: '#6366f1', cursor: 'pointer', textDecoration: 'none' }}>Pro में unlock करें</a>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
