import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { fetchQuestionsForSession } from '../../lib/engine/questionSelector';
import { validateSubscriptionForSession, formatSubscriptionError } from '../../lib/engine/subscriptionValidation';
import { Play, Clock, Lock, ChevronRight, Target, Zap, BookOpen } from 'lucide-react';

/* ── Design tokens ── */
const C = {
  ink: '#1a1814', ink2: '#3a3628', ink3: '#8a8370',
  bg: '#f7f5f0', surface: '#ffffff', border: '#e5e1d5',
  teal: '#0f6b5e', tealLight: '#e0f4f1', tealMid: '#1a8a7a',
  gold: '#c8860a', goldLight: '#fdf6e3',
  blue: '#1a4b8c', blueLight: '#e8eef8',
  purple: '#6b3fa0', purpleLight: '#f3eeff',
  red: '#c0392b', redLight: '#fdf0ee',
  green: '#2d7a3a', greenLight: '#e8f5eb',
  shadow: '0 2px 12px rgba(28,26,20,0.08)',
};

const PYQ_PAPERS = [
  { year: 2022, paper: 1, questions: 150, label: 'UPTET Nov 2022' },
  { year: 2019, paper: 1, questions: 150, label: 'UPTET Jan 2019' },
  { year: 2018, paper: 1, questions: 150, label: 'UPTET Oct 2018' },
  { year: 2017, paper: 1, questions: 150, label: 'UPTET Oct 2017' },
  { year: 2016, paper: 1, questions: 150, label: 'UPTET Feb 2016' },
  { year: 2015, paper: 1, questions: 150, label: 'UPTET Feb 2015' },
  { year: 2014, paper: 1, questions: 150, label: 'UPTET Feb 2014' },
  { year: 2013, paper: 1, questions: 120, label: 'UPTET Nov 2013' },
  { year: 2011, paper: 1, questions: 138, label: 'UPTET Nov 2011' },
];

const SUBJECT_OPTS = [
  { code: 'CDP',     label: 'CDP', labelHi: 'बाल विकास',  emoji: '🧠' },
  { code: 'Hindi',   label: 'Hindi', labelHi: 'हिन्दी',   emoji: '📖' },
  { code: 'English', label: 'English', labelHi: 'English', emoji: '🔤' },
  { code: 'Maths',   label: 'Maths', labelHi: 'गणित',     emoji: '🔢' },
  { code: 'EVS',     label: 'EVS', labelHi: 'पर्यावरण',   emoji: '🌿' },
];

const DIFFICULTY_OPTS = [
  { key: 'easy',   label: 'Easy',  color: C.green,  bg: C.greenLight },
  { key: 'mixed',  label: 'Mixed', color: C.gold,   bg: C.goldLight },
  { key: 'hard',   label: 'Hard',  color: C.red,    bg: C.redLight },
] as const;

type SubMode = 'full' | 'pyq' | 'quick';

export default function MockTestPage() {
  const { user } = useAuth();
  const { isPro, isGrandfatheredFree } = useSubscription();
  const navigate = useNavigate();

  const [subMode, setSubMode] = useState<SubMode>('full');
  const [starting, setStarting] = useState<string | null>(null);

  // Quick Test state
  const [qtSubject, setQtSubject] = useState<string>('CDP');
  const [qtCount, setQtCount] = useState(20);
  const [qtDiff, setQtDiff] = useState<'easy' | 'mixed' | 'hard'>('mixed');

  // Best scores per year (pulled from user's sessions)
  const [bestScores, setBestScores] = useState<Record<number, { score: number; pct: number }>>({});

  useEffect(() => {
    if (!user) return;
    supabase
      .from('practice_sessions')
      .select('filters, correct, total_questions')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .eq('session_type', 'pyq_paper')
      .then(({ data }) => {
        if (!data) return;
        const map: Record<number, { score: number; pct: number }> = {};
        data.forEach((s: any) => {
          const yr = s.filters?.sourceYear as number;
          if (!yr) return;
          const pct = s.total_questions > 0 ? Math.round((s.correct / s.total_questions) * 100) : 0;
          if (!map[yr] || pct > map[yr].pct) map[yr] = { score: s.correct, pct };
        });
        setBestScores(map);
      });
  }, [user]);

  /* ── shared session creator ── */
  const createAndStart = async (mode: string, questions: any[], extra: Record<string, any>) => {
    if (!user || !questions.length) {
      alert('इस section में पर्याप्त प्रश्न उपलब्ध नहीं हैं।');
      return;
    }
    const timeLimitSecs =
      mode === 'pyq_paper' ? 9000
      : mode === 'mock_test' ? 9000
      : qtCount * 90;

    const { data: session, error } = await supabase.from('practice_sessions').insert({
      user_id: user.id,
      session_type: mode,
      filters: extra,
      total_questions: questions.length,
      time_limit_secs: timeLimitSecs,
      status: 'in_progress',
      attempted: 0, correct: 0, wrong: 0, skipped: 0,
    }).select().single();
    if (error || !session) { console.error(error); return; }

    await supabase.from('question_attempts').insert(
      questions.map((q, idx) => ({
        session_id: session.id,
        user_id: user.id,
        question_id: q.id,
        question_order: idx + 1,
        is_skipped: false,
        is_marked: false,
      }))
    );
    navigate(`/practice/${session.id}`);
  };

  const startPYQ = async (year: number, paper: number) => {
    const key = `pyq_${year}`;
    setStarting(key);
    try {
      const access = await validateSubscriptionForSession(user!.id, 'pyq_paper');
      if (!access.allowed) {
        alert(formatSubscriptionError(access));
        return;
      }
      const questions = await fetchQuestionsForSession('pyq_paper', user!.id, {
        sourceYear: year, paperNumber: paper, limit: 150,
      });
      await createAndStart('pyq_paper', questions, { sourceYear: year, paperNumber: paper });
    } catch (e) { console.error(e); }
    finally { setStarting(null); }
  };

  const startFullMock = async () => {
    setStarting('full_mock');
    try {
      const access = await validateSubscriptionForSession(user!.id, 'mock_test');
      if (!access.allowed) {
        alert(formatSubscriptionError(access));
        return;
      }
      const questions = await fetchQuestionsForSession('mock_test', user!.id, { limit: 150 });
      await createAndStart('mock_test', questions, { mode: 'full_mock' });
    } catch (e) { console.error(e); }
    finally { setStarting(null); }
  };

  const startQuickTest = async () => {
    setStarting('quick');
    try {
      const access = await validateSubscriptionForSession(user!.id, 'mock_test');
      if (!access.allowed) {
        alert(formatSubscriptionError(access));
        return;
      }
      const subObj = SUBJECT_OPTS.find(s => s.code === qtSubject);
      // Get subject ID
      const { data: subData } = await supabase
        .from('subjects')
        .select('id')
        .eq('code', qtSubject)
        .maybeSingle();

      const questions = await fetchQuestionsForSession('mock_test', user!.id, {
        subjectId: subData?.id,
        limit: qtCount,
        difficulty: qtDiff === 'mixed' ? 'mixed' : qtDiff,
      });
      await createAndStart('mock_test', questions, {
        mode: 'quick', subject: qtSubject, difficulty: qtDiff,
      });
    } catch (e) { console.error(e); }
    finally { setStarting(null); }
  };

  /* ─── Render ─── */
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', fontFamily: "'DM Sans',system-ui,sans-serif", background: C.bg, minHeight: '100vh', paddingBottom: '90px' }}>

      {/* Top bar */}
      <div style={{ background: C.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 40, borderRadius: '0 0 20px 20px', marginBottom: '16px', boxShadow: '0 4px 20px rgba(0,0,0,.2)' }}>
        <BookOpen size={18} color={C.goldLight} />
        <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem', flex: 1 }}>मॉक टेस्ट</span>
        {!isPro && (
          <span style={{ background: isGrandfatheredFree ? 'linear-gradient(135deg,#0f6b5e,#1a8a7a)' : 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white', fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: '20px' }}>{isGrandfatheredFree ? 'EARLY ACCESS' : 'FREE'}</span>
        )}
      </div>

      <div style={{ padding: '0 14px' }}>

        {/* Sub-mode tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '20px' }}>
          {([ ['full', '🏆', 'Full Mock'], ['pyq', '📄', 'PYQ Papers'], ['quick', '⚡', 'Quick Test'] ] as const).map(([mode, emoji, label]) => (
            <button key={mode} onClick={() => setSubMode(mode)}
              style={{ padding: '10px 6px', borderRadius: '12px', border: `2px solid`, borderColor: subMode === mode ? C.teal : C.border, background: subMode === mode ? C.tealLight : C.surface, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', transition: 'all .15s' }}>
              <div style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{emoji}</div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: subMode === mode ? C.teal : C.ink2 }}>{label}</div>
            </button>
          ))}
        </div>

        {/* ── FULL MOCK ── */}
        {subMode === 'full' && (
          <div>
            {/* Hero card */}
            <div style={{ background: `linear-gradient(135deg, ${C.teal} 0%, ${C.tealMid} 100%)`, borderRadius: '20px', padding: '24px 20px', marginBottom: '20px', boxShadow: `0 6px 24px ${C.teal}40` }}>
              <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Full Simulation</div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '1.25rem', marginBottom: '4px' }}>UPTET Mock Test</div>
              <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.8rem', marginBottom: '18px' }}>150 प्रश्न · 5 विषय · 2.5 घंटे · Real Exam Format</div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
                {[['150', 'Questions'], ['150', 'Minutes'], ['5', 'Subjects']].map(([v, l]) => (
                  <div key={l} style={{ background: 'rgba(255,255,255,.15)', borderRadius: '10px', padding: '10px 14px', textAlign: 'center', flex: 1 }}>
                    <div style={{ color: 'white', fontWeight: 800, fontSize: '1.1rem' }}>{v}</div>
                    <div style={{ color: 'rgba(255,255,255,.65)', fontSize: '0.62rem', marginTop: '2px' }}>{l}</div>
                  </div>
                ))}
              </div>
              <button onClick={startFullMock} disabled={!!starting}
                style={{ width: '100%', background: 'white', color: C.teal, border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: starting === 'full_mock' ? 0.7 : 1 }}>
                <Play size={16} fill={C.teal} /> {starting === 'full_mock' ? 'शुरू हो रहा है...' : 'Random Full Mock शुरू करें'}
              </button>
              {!isPro && isGrandfatheredFree && (
                <div style={{ marginTop: '10px', background: '#ecfeff', color: '#0f766e', border: '1px solid #a5f3fc', borderRadius: '12px', padding: '10px 12px', fontSize: '0.8rem', fontWeight: 700 }}>
                  Early access active: unlimited mock tests and PYQ papers are unlocked for your launch cohort.
                </div>
              )}
            </div>

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {[
                { emoji: '🔀', title: 'Random Questions', desc: 'हर बार नया set, same syllabus' },
                { emoji: '⏱', title: 'Real Timer', desc: '2.5 घंटे का countdown' },
                { emoji: '📊', title: 'Detailed Analysis', desc: 'Subject-wise breakdown' },
                { emoji: '🔒', title: 'Exam Mode', desc: 'Answer देखो exam के बाद' },
              ].map(c => (
                <div key={c.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px', boxShadow: C.shadow }}>
                  <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>{c.emoji}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: C.ink, marginBottom: '2px' }}>{c.title}</div>
                  <div style={{ fontSize: '0.68rem', color: C.ink3 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PYQ PAPERS ── */}
        {subMode === 'pyq' && (
          <div>
            <div style={{ fontSize: '0.75rem', color: C.ink3, marginBottom: '14px', lineHeight: 1.5 }}>
              📄 पिछले वर्षों के असली प्रश्नपत्र — original order में, 2.5 घंटे का timer
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {PYQ_PAPERS.map(p => {
                const key = `pyq_${p.year}`;
                const best = bestScores[p.year];
                const isStarting = starting === key;
                return (
                  <div key={p.year}
                    style={{ background: C.surface, border: `1.5px solid ${best ? C.teal + '40' : C.border}`, borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: C.shadow }}>
                    {/* Year badge */}
                    <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: best ? C.tealLight : C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${best ? C.teal + '30' : C.border}` }}>
                      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: C.ink3 }}>PYQ</div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: best ? C.teal : C.ink }}>{p.year}</div>
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: C.ink }}>{p.label}</div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '4px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '3px', color: C.ink3 }}>
                          <Clock size={11} /> 150 min
                        </span>
                        <span style={{ fontSize: '0.68rem', color: C.ink3 }}>{p.questions} Qs</span>
                        {best && (
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: best.pct >= 60 ? C.greenLight : C.goldLight, color: best.pct >= 60 ? C.green : C.gold }}>
                            Best: {best.pct}%
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Action */}
                    <button onClick={() => startPYQ(p.year, p.paper)} disabled={!!starting}
                      style={{ background: `linear-gradient(135deg, ${C.teal}, ${C.tealMid})`, color: 'white', border: 'none', borderRadius: '10px', padding: '10px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, opacity: isStarting ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                      {isStarting ? '⏳' : <><Play size={13} fill="white" /> Start</>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── QUICK TEST ── */}
        {subMode === 'quick' && (
          <div>
            <div style={{ background: C.surface, borderRadius: '20px', padding: '20px', boxShadow: C.shadow, border: `1px solid ${C.border}` }}>
              {/* Subject picker */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.ink3, marginBottom: '10px' }}>विषय चुनें</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                  {SUBJECT_OPTS.map(s => (
                    <button key={s.code} onClick={() => setQtSubject(s.code)}
                      style={{ padding: '10px 4px', borderRadius: '10px', border: `2px solid`, borderColor: qtSubject === s.code ? C.teal : C.border, background: qtSubject === s.code ? C.tealLight : C.bg, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', transition: 'all .12s' }}>
                      <div style={{ fontSize: '1.1rem', marginBottom: '3px' }}>{s.emoji}</div>
                      <div style={{ fontSize: '0.55rem', fontWeight: 700, color: qtSubject === s.code ? C.teal : C.ink3, lineHeight: 1.2 }}>{s.labelHi}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.ink3, marginBottom: '10px' }}>कठिनाई</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {DIFFICULTY_OPTS.map(d => (
                    <button key={d.key} onClick={() => setQtDiff(d.key)}
                      style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `2px solid`, borderColor: qtDiff === d.key ? d.color : C.border, background: qtDiff === d.key ? d.bg : C.bg, color: qtDiff === d.key ? d.color : C.ink3, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' }}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question count slider */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: C.ink3 }}>कितने प्रश्न?</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: C.teal }}>{qtCount}</div>
                </div>
                <input type="range" min={5} max={50} step={5} value={qtCount}
                  onChange={e => setQtCount(Number(e.target.value))}
                  style={{ width: '100%', accentColor: C.teal, cursor: 'pointer' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.6rem', color: C.ink3 }}>
                  <span>5</span><span>25</span><span>50</span>
                </div>
              </div>

              {/* Summary row */}
              <div style={{ background: C.bg, borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', display: 'flex', gap: '16px' }}>
                {[
                  { icon: <Target size={13} color={C.teal} />, val: SUBJECT_OPTS.find(s=>s.code===qtSubject)?.labelHi || qtSubject, lbl: 'Subject' },
                  { icon: <Zap size={13} color={C.gold} />, val: qtCount, lbl: 'Questions' },
                  { icon: <Clock size={13} color={C.ink3} />, val: `~${Math.ceil(qtCount * 1.5)} min`, lbl: 'Est. Time' },
                ].map(item => (
                  <div key={item.lbl} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '3px' }}>{item.icon}</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: C.ink }}>{item.val}</div>
                    <div style={{ fontSize: '0.6rem', color: C.ink3 }}>{item.lbl}</div>
                  </div>
                ))}
              </div>

              <button onClick={startQuickTest} disabled={!!starting}
                style={{ width: '100%', background: `linear-gradient(135deg, ${C.teal}, ${C.tealMid})`, color: 'white', border: 'none', borderRadius: '14px', padding: '16px', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: starting === 'quick' ? 0.7 : 1, boxShadow: `0 4px 20px ${C.teal}40` }}>
                <Play size={18} fill="white" />
                {starting === 'quick' ? 'शुरू हो रहा है...' : `${qtCount} प्रश्न शुरू करें`}
              </button>
            </div>

            {/* Tips */}
            <div style={{ marginTop: '16px', padding: '14px 16px', background: C.goldLight, borderRadius: '12px', border: `1px solid ${C.gold}30` }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C.gold, marginBottom: '6px' }}>💡 Quick Test vs Full Mock</div>
              <div style={{ fontSize: '0.72rem', color: C.ink2, lineHeight: 1.6 }}>
                Quick Test में आप एक विषय पर focus करते हैं, answer review मिलती है। Full Mock में सभी 5 विषय होते हैं और answer exam के बाद दिखती है।
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
