import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { ChevronLeft, Flag, LayoutGrid, ArrowRight, ArrowLeft, Coffee, Users } from 'lucide-react';
import { SubmitModal } from '../../components/app/practice/SubmitModal';
import { MobileNavigatorSheet } from '../../components/app/practice/MobileNavigatorSheet';
import { MathText } from '../../components/app/practice/MathText';
import ReportQuestionModal from '../../components/shared/ReportQuestionModal';
import { updateProgressRollups } from '../../lib/engine/progressPipeline';
import { validateSessionSubmit, formatScoringValidationError } from '../../lib/engine/scoringValidation';
import { validateSubscriptionForSession, isSessionTypeGated, formatSubscriptionError } from '../../lib/engine/subscriptionValidation';
import { submitQuestionReport } from '../../lib/reporting';
import { trackError, trackEvent } from '../../lib/telemetry';
import SessionCompleteModal from '../../components/app/practice/SessionCompleteModal';

type AttemptState = {
  id: string; question_id: string; question_order: number;
  selected_option: string | null; is_correct: boolean | null;
  is_marked: boolean; time_taken_secs: number; questions: any;
};

export default function PracticeSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = useSubscription();

  const [session, setSession] = useState<any>(null);
  const [attempts, setAttempts] = useState<AttemptState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showNavigator, setShowNavigator] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFatigue, setShowFatigue] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [lang, setLang] = useState<'hi' | 'en'>('hi');
  const [showExplanation, setShowExplanation] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const questionStartTime = useRef<number>(Date.now());
  const elapsedRef = useRef<number>(0);
  // Keep a ref so the timer interval can always read the current value
  // (avoids stale-closure where timeRemaining stays null forever)
  const timeRemainingRef = useRef<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      elapsedRef.current += 1;
      if (timeRemainingRef.current !== null) {
        const next = Math.max(0, timeRemainingRef.current - 1);
        timeRemainingRef.current = next;
        setTimeRemaining(next);
      }
      if (elapsedRef.current === 2700) setShowFatigue(true);
    }, 1000);
    return () => clearInterval(t);
  }, []); // runs once — reads via ref, not stale state

  useEffect(() => { if (sessionId) loadData(); }, [sessionId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showSubmit || showNavigator) return;
      const curr = attempts[currentIndex];
      switch (e.key.toUpperCase()) {
        case 'A': handleAnswer('A'); break;
        case 'B': handleAnswer('B'); break;
        case 'C': handleAnswer('C'); break;
        case 'D': handleAnswer('D'); break;
        case 'ARROWRIGHT': case ' ': case 'ENTER': e.preventDefault(); nextQuestion(); break;
        case 'ARROWLEFT': e.preventDefault(); prevQuestion(); break;
        case 'F': toggleMark(); break;
        case 'ESCAPE': setShowSubmit(true); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [attempts, currentIndex, showSubmit, showNavigator]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase.from('practice_sessions').select('*').eq('id', sessionId!).single();
      if (!s) { navigate('/practice'); return; }
      setSession(s);

            // Check if session is already completed
            if (s.status === 'completed') {
              setShowCompleteModal(true);
              return;
            }

      void trackEvent('session_load', { session_id: sessionId, session_type: s.session_type }, user?.id);
      if (s.session_type === 'pyq_paper') {
        timeRemainingRef.current = null;
        setTimeRemaining(null);
      } else if (s.time_limit_secs) {
        timeRemainingRef.current = s.time_limit_secs;
        setTimeRemaining(s.time_limit_secs);
      }
      const { data: a } = await supabase.from('question_attempts').select('*, questions(*)').eq('session_id', sessionId!).order('question_order', { ascending: true });
      if (a) {
        const subjectIds = [...new Set((a as any[]).map(x => x.questions?.subject_id).filter(Boolean))];
        let subjectMap: Record<string, { name_en: string; name_hi: string; code: string }> = {};
        if (subjectIds.length) {
          const { data: subjects } = await supabase.from('subjects').select('id,name_en,name_hi,code').in('id', subjectIds);
          subjectMap = Object.fromEntries((subjects || []).map((s: any) => [s.id, s]));
        }

        const enriched = (a as any[]).map((att) => {
          const subject = att.questions?.subject_id ? subjectMap[att.questions.subject_id] : null;
          return {
            ...att,
            questions: {
              ...att.questions,
              subject_name: subject?.name_hi || subject?.name_en || att.questions?.subject_code || '',
            },
          };
        });

        setAttempts(enriched as AttemptState[]);
        const first = enriched.findIndex((x: any) => !x.selected_option);
        setCurrentIndex(first >= 0 ? first : 0);
      }
    } catch (error) {
      void trackError(error, { stage: 'session_load', session_id: sessionId }, user?.id);
      navigate('/practice');
    }
    finally { setLoading(false); questionStartTime.current = Date.now(); }
  };

  const handleAnswer = useCallback(async (option: string) => {
    const attempt = attempts[currentIndex];
    if (!attempt) return;
    // Lock the first choice for every session type.
    if (attempt.selected_option) return;
    const newOption = option;
    const isCorrect = newOption ? newOption === attempt.questions?.correct_option : null;
    const timeTaken = Math.round((Date.now() - questionStartTime.current) / 1000);
    const updated = [...attempts];
    updated[currentIndex] = { ...updated[currentIndex], selected_option: newOption, is_correct: isCorrect, time_taken_secs: timeTaken };
    setAttempts(updated);
    if (newOption) {
      void trackEvent('session_answer', {
        session_id: session?.id,
        question_order: attempt.question_order,
        is_correct: Boolean(isCorrect),
        time_secs: timeTaken,
      }, user?.id);
    }
    if (newOption) setShowExplanation(true); else setShowExplanation(false);
    supabase.from('question_attempts').update({ selected_option: newOption, is_correct: isCorrect, time_taken_secs: timeTaken, attempted_at: new Date().toISOString() }).eq('id', attempt.id).then(({ error }) => { if (error) console.error(error); });
  }, [attempts, currentIndex, session]);

  const toggleMark = useCallback(async () => {
    const attempt = attempts[currentIndex];
    if (!attempt) return;
    const updated = [...attempts];
    updated[currentIndex] = { ...updated[currentIndex], is_marked: !attempt.is_marked };
    setAttempts(updated);
    await supabase.from('question_attempts').update({ is_marked: !attempt.is_marked }).eq('id', attempt.id);
  }, [attempts, currentIndex]);

  const nextQuestion = useCallback(() => {
    if (currentIndex < attempts.length - 1) { setCurrentIndex(i => i + 1); setShowExplanation(false); questionStartTime.current = Date.now(); }
  }, [currentIndex, attempts.length]);

  const handleSubmitReport = async (reportType: any, reportText: string) => {
    const attempt = attempts[currentIndex];
    if (!attempt) return;
    await submitQuestionReport({
      userId: user!.id,
      questionId: attempt.question_id,
      sessionId: session?.id,
      reportType,
      reportText,
      source: 'practice_session',
    });
  };

  const prevQuestion = useCallback(() => {
    if (currentIndex > 0) { setCurrentIndex(i => i - 1); setShowExplanation(false); questionStartTime.current = Date.now(); }
  }, [currentIndex]);

  const handleSubmit = async () => {
    if (!session || !user) return;
    setIsSubmitting(true);
    try {
      const attempted = attempts.filter(a => a.selected_option).length;
      const clientComputedScore = attempts.filter(a => a.is_correct).length;
      void trackEvent('session_submit_attempt', { session_id: session.id, attempted, correct: clientComputedScore }, user.id);

      // Enforce Pro entitlement at submit-time for gated modes.
      if (isSessionTypeGated(session.session_type)) {
        const subscriptionResult = await validateSubscriptionForSession(user.id, session.session_type);
        if (!subscriptionResult.allowed) {
          const reason = formatSubscriptionError(subscriptionResult);
          alert(`Access Restricted\n\n${reason}`);
          void trackEvent('session_submit_blocked_subscription', {
            session_id: session.id,
            session_type: session.session_type,
            subscription_status: subscriptionResult.subscription_status,
          }, user.id);
          setIsSubmitting(false);
          return;
        }
      }

      // ── 1. SERVER-VALIDATED SCORING (Anti-Tamper Check) ──────────────────
      // Before accepting the score, validate it on the server.
      // This catches: score inflation, answer key tampering, replay attacks
      const validationResult = await validateSessionSubmit(session.id, user.id);

      // If server detected tampering, reject the submission
      if (!validationResult.valid) {
        const errorMsg = formatScoringValidationError(validationResult);
        alert(`⚠️ Validation Failed\n\n${errorMsg}\n\nYour session has NOT been submitted. Please refresh and try again.`);
        setIsSubmitting(false);
        return;
      }

      // Use server-validated score (in case corrections were needed)
      const correctScore = validationResult.corrected_score;
      const hasCorrections = validationResult.corrections > 0;

      if (hasCorrections) {
        console.warn(`[PracticeSessionPage] Score corrections applied: ${clientComputedScore} → ${correctScore}`);
        void trackEvent('session_score_corrected', {
          session_id: session.id,
          client_score: clientComputedScore,
          corrected_score: correctScore,
          corrections: validationResult.corrections,
        }, user.id);
      }

      // ── 2. MARK SESSION COMPLETE with server-validated score ──────────────
      await supabase.from('practice_sessions').update({
        status: 'completed', completed_at: new Date().toISOString(),
        attempted, correct: correctScore, wrong: attempted - correctScore,
        skipped: attempts.length - attempted, score: correctScore,
        time_taken_secs: elapsedRef.current,
      }).eq('id', session.id);

      // ── 3. UPDATE PROGRESS ROLLUPS ─────────────────────────────────────────
      // Uses the shared pipeline that always writes chapter stats,
      // so chapter progress advances even without mastery threshold.
      await updateProgressRollups(user.id, attempts as any);
      
      void trackEvent('session_submit_success', {
        session_id: session.id,
        session_type: session.session_type,
        attempted,
        correct: correctScore,
        score: correctScore,
        score_validated: true,
      }, user.id);

      // ── 4. NAVIGATE TO RESULTS ─────────────────────────────────────────────
      const isExamSession = session.session_type === 'mock_test' || session.session_type === 'pyq_paper';
      navigate(isExamSession ? `/mock-results/${session.id}` : `/results/${session.id}`);
    } catch(e) {
      console.error(e);
      const errorMsg = e instanceof Error ? e.message : String(e);
      alert(`❌ Submission Failed\n\n${errorMsg}\n\nPlease check your connection and try again.`);
      void trackEvent('session_submit_error', { session_id: session?.id, message: errorMsg }, user.id);
      void trackError(e, { stage: 'session_submit', session_id: session?.id }, user.id);
      setIsSubmitting(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartX.current) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { if (diff > 0 && attempts[currentIndex]?.selected_option) nextQuestion(); else if (diff < 0) prevQuestion(); }
    touchStartX.current = null;
  };

  const navigateToResults = () => {
    const isExamSession = session?.session_type === 'mock_test' || session?.session_type === 'pyq_paper';
    navigate(isExamSession ? `/mock-results/${sessionId}` : `/results/${sessionId}`);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spinCW 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#6b7280', fontWeight: 600 }}>Loading session...</p>
      </div>
    </div>
  );

  // Completed sessions are read-only; show modal and route to results.
  if (showCompleteModal && session) {
    return <SessionCompleteModal sessionId={sessionId!} onConfirm={navigateToResults} />;
  }

  if (!session || attempts.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <button onClick={() => navigate('/practice')} style={{ color: '#6366f1', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem' }}>← Practice पर वापस जाएं</button>
    </div>
  );

  const curr = attempts[currentIndex];
  const q = curr?.questions;
  const isMockTest = session.session_type === 'mock_test';
  const isPyqPaper = session.session_type === 'pyq_paper';
  const isExamMode = isMockTest || isPyqPaper;
  const showFeedback = !!curr?.selected_option;
  const questionText = lang === 'hi' && q?.question_hi ? q.question_hi : q?.question_en;
  const options = ['A', 'B', 'C', 'D'].map(k => ({ id: k, text: q?.options?.[k] || '' })).filter(o => o.text);
  const minutes = timeRemaining !== null ? Math.floor(timeRemaining / 60) : null;
  const seconds = timeRemaining !== null ? timeRemaining % 60 : null;
  const isTimerWarning = timeRemaining !== null && timeRemaining < 300;
  const isTimerDanger = timeRemaining !== null && timeRemaining < 60;
  const pct = Math.round((currentIndex / attempts.length) * 100);

  const getOptionStyle = (optId: string) => {
    const base: React.CSSProperties = {
      width: '100%', display: 'flex', alignItems: 'flex-start', gap: '14px',
      padding: '16px 20px', borderRadius: '16px', border: '2px solid',
      cursor: curr.selected_option ? 'default' : 'pointer',
      textAlign: 'left', fontFamily: 'inherit', fontSize: '0.95rem',
      transition: 'all 0.2s', marginBottom: '10px',
      background: 'white', borderColor: '#e5e7eb', color: '#374151',
    };
    if (!curr.selected_option) {
      return { ...base, ':hover': { borderColor: '#6366f1' } };
    }
    if (showFeedback) {
      if (optId === q?.correct_option) return { ...base, background: '#f0fdf4', borderColor: '#22c55e', color: '#15803d' };
      if (optId === curr.selected_option) return { ...base, background: '#fef2f2', borderColor: '#ef4444', color: '#dc2626' };
      return { ...base, background: '#f9fafb', borderColor: '#e5e7eb', color: '#9ca3af' };
    }
    if (optId === curr.selected_option) return { ...base, background: '#eef2ff', borderColor: '#6366f1', color: '#4338ca' };
    return { ...base, background: '#f9fafb', borderColor: '#e5e7eb', color: '#9ca3af' };
  };

  const getOptionLabel = (optId: string) => {
    const s: React.CSSProperties = {
      minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem',
      flexShrink: 0, border: '2px solid',
    };
    if (!curr.selected_option) return { ...s, background: '#f3f4f6', borderColor: '#e5e7eb', color: '#6b7280' };
    if (showFeedback) {
      if (optId === q?.correct_option) return { ...s, background: '#22c55e', borderColor: '#22c55e', color: 'white' };
      if (optId === curr.selected_option) return { ...s, background: '#ef4444', borderColor: '#ef4444', color: 'white' };
      return { ...s, background: '#f3f4f6', borderColor: '#e5e7eb', color: '#9ca3af' };
    }
    if (optId === curr.selected_option) return { ...s, background: '#6366f1', borderColor: '#6366f1', color: 'white' };
    return { ...s, background: '#f3f4f6', borderColor: '#e5e7eb', color: '#9ca3af' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', userSelect: 'none', fontFamily: 'inherit' }}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

      {/* ── Top Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: 'white', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', zIndex: 20, flexShrink: 0 }}>
        <button onClick={() => navigate('/practice')} style={{ padding: '8px', background: '#f3f4f6', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#111827' }}>
            {session.session_type?.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600 }}>Q {currentIndex + 1} / {attempts.length}</div>
        </div>
        <button onClick={toggleMark} style={{ padding: '8px 12px', border: '1px solid', borderColor: curr.is_marked ? '#f59e0b' : '#e5e7eb', background: curr.is_marked ? '#fffbeb' : '#f9fafb', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.78rem', color: curr.is_marked ? '#d97706' : '#6b7280' }}>
          <Flag size={15} fill={curr.is_marked ? '#d97706' : 'none'} /> {curr.is_marked ? 'Marked' : 'Mark'}
        </button>
        {!isPyqPaper && timeRemaining !== null && (
          <div style={{ padding: '8px 14px', borderRadius: '10px', background: isTimerDanger ? '#fef2f2' : isTimerWarning ? '#fffbeb' : '#f3f4f6', border: '1px solid', borderColor: isTimerDanger ? '#fecaca' : isTimerWarning ? '#fde68a' : '#e5e7eb', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: '1rem', color: isTimerDanger ? '#dc2626' : isTimerWarning ? '#d97706' : '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
        )}
          <button onClick={() => setShowReport(true)} style={{ padding: '8px 10px', background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#0f766e', fontWeight: 700, gap: '6px', fontSize: '0.74rem' }}>
            <Flag size={16} /> Report
          </button>
          <button onClick={() => setShowNavigator(true)} style={{ padding: '8px', background: '#f3f4f6', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}>
          <LayoutGrid size={20} />
        </button>
      </div>

      {/* ── Progress Bar ── */}
      <div style={{ padding: '0 20px', background: 'white', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
        <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7)', borderRadius: '999px', transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600 }}>प्रश्न {currentIndex + 1}</span>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600 }}>{pct}% complete</span>
        </div>
      </div>

      {/* ── Question Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '100px' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 20px' }} key={curr.id}>
          
          {/* Question meta chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#9ca3af', fontFamily: 'monospace', letterSpacing: '0.1em' }}>Q {currentIndex + 1}</span>
            {q?.subject_name && <span style={{ fontSize: '0.72rem', background: '#ecfeff', color: '#0f766e', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', border: '1px solid #a5f3fc' }}>{q.subject_name}</span>}
            {q?.source_year && <span style={{ fontSize: '0.72rem', background: '#eef2ff', color: '#6366f1', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', border: '1px solid #c7d2fe' }}>{q.source_year}</span>}
            {q?.difficulty && <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', border: '1px solid', background: q.difficulty === 'hard' ? '#fef2f2' : q.difficulty === 'medium' ? '#fffbeb' : '#f0fdf4', color: q.difficulty === 'hard' ? '#dc2626' : q.difficulty === 'medium' ? '#d97706' : '#16a34a', borderColor: q.difficulty === 'hard' ? '#fecaca' : q.difficulty === 'medium' ? '#fde68a' : '#bbf7d0' }}>{q.difficulty}</span>}
            {showFeedback && (q?.accuracy_pct != null || (q?.attempt_count > 0 && q?.correct_count != null)) && (() => {
              const acc = q.accuracy_pct != null ? Math.round(q.accuracy_pct) : Math.round((q.correct_count / q.attempt_count) * 100);
              if (isNaN(acc)) return null;
              return (
                <span style={{ fontSize: '0.72rem', background: '#f8fafc', color: '#475569', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Users size={12} strokeWidth={3} /> {acc}% users got this right
                </span>
              );
            })()}
            {/* Lang toggle */}
            {q?.question_hi && q?.question_en && (
              <div style={{ marginLeft: 'auto', display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '2px' }}>
                {['hi', 'en'].map(l => (
                  <button key={l} onClick={() => setLang(l as 'hi' | 'en')} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: lang === l ? 'white' : 'transparent', fontWeight: 700, fontSize: '0.72rem', color: lang === l ? '#374151' : '#9ca3af', boxShadow: lang === l ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
                    {l === 'hi' ? 'हि' : 'EN'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Question text */}
          <p lang={lang} style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', lineHeight: 1.6, marginBottom: questionText && q?.image_url ? '14px' : '24px', fontFamily: lang === 'hi' ? "'Noto Serif', serif" : 'inherit' }}>
            <MathText text={questionText || ''} lang={lang} />
          </p>

          {/* Question image (if any) */}
          {q?.image_url && (
            <div style={{ marginBottom: '24px', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f8fafc' }}>
              <img
                src={q.image_url}
                alt="Question diagram"
                style={{ width: '100%', maxHeight: '320px', objectFit: 'contain', display: 'block' }}
                loading="lazy"
              />
            </div>
          )}

          {/* Options */}
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => handleAnswer(opt.id)}
              disabled={!!curr.selected_option}
              style={getOptionStyle(opt.id) as React.CSSProperties}
              onMouseEnter={e => { if (!curr.selected_option) { (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 4px #6366f110'; } }}
              onMouseLeave={e => { if (!curr.selected_option) { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; } }}>
              <span style={getOptionLabel(opt.id) as React.CSSProperties}>{opt.id}</span>
              <span style={{ paddingTop: '4px', lineHeight: 1.6 }}>
                {/* Check if this option has an image */}
                {q?.option_images?.[opt.id] ? (
                  <img src={q.option_images[opt.id]} alt={`Option ${opt.id}`} style={{ maxWidth: '100%', maxHeight: '120px', objectFit: 'contain', borderRadius: '8px', display: 'block', marginBottom: opt.text ? '8px' : 0 }} />
                ) : null}
                {opt.text && <MathText text={opt.text} lang={lang} />}
              </span>
            </button>
          ))}

          {/* Explanation */}
          {showFeedback && (q?.explanation_hi || q?.explanation_en) && (
            <div style={{ marginTop: '20px', padding: '20px', borderRadius: '16px', background: isPro ? '#eef2ff' : '#fffbeb', border: `1px solid ${isPro ? '#c7d2fe' : '#fde68a'}` }}>
              <div style={{ fontWeight: 800, color: isPro ? '#4338ca' : '#92400e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
                💡 Explanation
                {!isPro && <span style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>
                  <a href="/pricing" style={{ color: '#d97706', fontWeight: 700 }}>Upgrade to Pro</a>
                </span>}
              </div>
              {isPro ? (
                <p lang="hi" style={{ color: '#374151', fontSize: '0.875rem', lineHeight: 1.7, margin: 0 }}>
                  {q.explanation_hi || q.explanation_en}
                </p>
              ) : (
                <div style={{ filter: 'blur(4px)', fontSize: '0.875rem', color: '#374151', pointerEvents: 'none', userSelect: 'none' }}>
                  {(q.explanation_hi || q.explanation_en)?.slice(0, 100)}...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Nav Bar ── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #e5e7eb', boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', zIndex: 20, padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={prevQuestion} disabled={currentIndex === 0} style={{ padding: '12px 16px', borderRadius: '12px', border: '2px solid #e5e7eb', background: 'white', color: '#374151', fontWeight: 700, cursor: currentIndex === 0 ? 'not-allowed' : 'pointer', opacity: currentIndex === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
            <ArrowLeft size={16} /> Prev
          </button>
          {currentIndex === attempts.length - 1 ? (
            <button onClick={() => setShowSubmit(true)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#111827', color: 'white', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '0.95rem', letterSpacing: '0.02em' }}>
              Submit Test ✓
            </button>
          ) : (
            <button onClick={nextQuestion} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 800, border: 'none', cursor: 'pointer', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              Next <ArrowRight size={16} />
            </button>
          )}
          <button onClick={() => setShowSubmit(true)} style={{ padding: '12px 16px', borderRadius: '12px', border: '2px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            End
          </button>
        </div>
      </div>

      {/* ── Fatigue Nudge ── */}
      {showFatigue && (
        <div style={{ position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', background: 'white', border: '1px solid #fde68a', borderRadius: '16px', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 30, minWidth: '300px', maxWidth: '400px' }}>
          <div style={{ width: '40px', height: '40px', background: '#fffbeb', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Coffee size={20} color="#d97706" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, color: '#111827', margin: '0 0 2px', fontSize: '0.875rem' }}>45 minutes हो गए!</p>
            <p style={{ color: '#6b7280', margin: 0, fontSize: '0.75rem' }}>Break लो — brain को rest चाहिए।</p>
          </div>
          <button onClick={() => setShowFatigue(false)} style={{ border: 'none', background: 'none', color: '#6366f1', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>OK</button>
        </div>
      )}

      {showSubmit && <SubmitModal totalQuestions={attempts.length} attemptedCount={attempts.filter(a => a.selected_option).length} markedCount={attempts.filter(a => a.is_marked).length} onConfirm={handleSubmit} onCancel={() => setShowSubmit(false)} isLoading={isSubmitting} />}
      <ReportQuestionModal
        open={showReport}
        onClose={() => setShowReport(false)}
        onSubmit={handleSubmitReport}
        questionLabel={`Q ${currentIndex + 1}`}
        source="practice_session"
      />
      {showNavigator && <MobileNavigatorSheet attempts={attempts} currentIndex={currentIndex} isMockTest={isExamMode} isPyqPaper={isPyqPaper} onNavigate={(idx) => { setCurrentIndex(idx); setShowExplanation(false); questionStartTime.current = Date.now(); }} onClose={() => setShowNavigator(false)} onSubmit={() => { setShowNavigator(false); setShowSubmit(true); }} />}
    </div>
  );
}
