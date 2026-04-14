import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Play, ChevronDown, ChevronUp, Flame, ArrowRight, Calendar, X, Pencil } from 'lucide-react';
import { fetchQuestionsForSession } from '../../lib/engine/questionSelector';

/* ─── Color tokens ─────────────────────────────────────────────────── */
const C = {
  ink:'#1c1a14', ink2:'#3d3a2e', ink3:'#7a7560',
  gold:'#c8860a', goldLight:'#fdf3e0', goldMid:'#f5c842',
  teal:'#0f6b5e', tealLight:'#e0f2ef',
  red:'#c0392b',  redLight:'#fdf0ee',
  green:'#2d7a3a',greenLight:'#e8f5eb',
  blue:'#1a4b8c', blueLight:'#e8eef8',
  bg:'#faf9f5', surface:'#fff', border:'#e8e4d8', border2:'#f0ece2',
};

/* ─── PYQ years with questions ────────────────────────────────────── */
const PYQ_YEARS = [
  { year: 2022, q: 150 }, { year: 2019, q: 150 }, { year: 2018, q: 150 },
  { year: 2017, q: 150 }, { year: 2016, q: 150 }, { year: 2015, q: 150 },
  { year: 2014, q: 150 }, { year: 2013, q: 120 }, { year: 2011, q: 138 },
];

/* ─── Types ────────────────────────────────────────────────────────── */
interface SubjectTab { id:string; code:string; name_en:string; name_hi:string; sort_order:number; is_optional:boolean; accuracy:number|null; attempted:number; }
interface Chapter    { id:string; name_en:string; name_hi:string; sort_order:number; topicCount:number; questionCount:number; attempted:number; correct:number; topicsDone:number; topics:TopicRow[]; }
interface TopicRow   { id:string; name_en:string; name_hi:string; sort_order:number; questionCount:number; attempted:number; accuracy:number|null; mastery:string|null; }
interface TodayCard  { chapterName:string; topicName:string; topicId:string; chapterId:string; subjectCode:string; progressPct:number; questionsLeft:number; sessionId?:string; }
interface WeakAlert  { topicId:string; topicName:string; accuracy:number; }

/* ─── Exam date helpers ────────────────────────────────────────────── */
function calcDays(dateStr: string | null | undefined): number {
  if (!dateStr) return Math.ceil((new Date('2026-12-01').getTime() - Date.now()) / 86400000);
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function PracticePage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [allSubjects, setAllSubjects]   = useState<SubjectTab[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [chapters, setChapters]         = useState<Chapter[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<string|null>(null);
  const [todayCard, setTodayCard]       = useState<TodayCard|null>(null);
  const [weakAlert, setWeakAlert]       = useState<WeakAlert|null>(null);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [starting, setStarting]         = useState<string|null>(null);

  // PYQ modal
  const [showPyq, setShowPyq]           = useState(false);
  // Exam date editor
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [dateInput, setDateInput]       = useState(profile?.target_exam_date || '2026-12-01');
  const [examDays, setExamDays]         = useState(calcDays(profile?.target_exam_date));

  const subjectsOpted: string[] = (profile?.subjects_opted as string[]) || [];

  /* ── Load subjects ── */
  // Sync examDays when profile loads
  useEffect(() => {
    if (profile?.target_exam_date) {
      setDateInput(profile.target_exam_date);
      setExamDays(calcDays(profile.target_exam_date));
    }
  }, [profile?.target_exam_date]);

  useEffect(() => { if (user) loadSubjects(); }, [user, profile]);
  useEffect(() => { if (activeSubjectId) loadChapters(activeSubjectId); }, [activeSubjectId]);
  useEffect(() => { if (user) { loadTodayCard(); loadWeakAlert(); } }, [user]);

  const loadSubjects = async () => {
    const { data: subs } = await supabase.from('subjects')
      .select('id,code,name_en,name_hi,sort_order,is_optional').order('sort_order');
    if (!subs) return;

    const visible = subs.filter(s => {
      if (!s.is_optional) return true;
      return subjectsOpted.length ? subjectsOpted.includes(s.id) : s.code === 'English';
    });

    const { data: stats } = await supabase.from('user_subject_stats')
      .select('subject_id,attempts,correct,accuracy_pct').eq('user_id', user!.id);
    const sm: Record<string,any> = {};
    (stats||[]).forEach(s => { sm[s.subject_id] = s; });

    setAllSubjects(visible.map(s => ({
      ...s,
      accuracy: sm[s.id]?.accuracy_pct ?? null,
      attempted: sm[s.id]?.attempts ?? 0,
    })));
    if (visible.length) setActiveSubjectId(visible[0].id);
  };

  const loadChapters = async (subjectId: string) => {
    setLoadingChapters(true);
    try {
      const { data: chs } = await supabase.from('chapters')
        .select('id,name_en,name_hi,sort_order').eq('subject_id', subjectId).order('sort_order');
      if (!chs?.length) { setChapters([]); return; }

      const chIds = chs.map(c => c.id);
      const { data: topics } = await supabase.from('topics')
        .select('id,chapter_id,name_en,name_hi,sort_order').in('chapter_id', chIds).order('sort_order');
      const { data: qs } = await supabase.from('questions')
        .select('id,chapter_id,topic_id').in('chapter_id', chIds).eq('is_active', true);

      const topicIds = (topics||[]).map(t => t.id);
      let tsMap: Record<string,any> = {};
      if (topicIds.length) {
        const { data: ts } = await supabase.from('user_topic_stats')
          .select('topic_id,attempts,correct,accuracy_pct,mastery_level')
          .eq('user_id', user!.id).in('topic_id', topicIds);
        (ts||[]).forEach(s => { tsMap[s.topic_id] = s; });
      }

      const qByChapter: Record<string,number> = {};
      const qByTopic:   Record<string,number> = {};
      (qs||[]).forEach(q => {
        qByChapter[q.chapter_id] = (qByChapter[q.chapter_id]||0) + 1;
        if (q.topic_id) qByTopic[q.topic_id] = (qByTopic[q.topic_id]||0) + 1;
      });

      const topicsByChapter: Record<string,any[]> = {};
      (topics||[]).forEach(t => { (topicsByChapter[t.chapter_id]??=[]).push(t); });

      const built: Chapter[] = chs.map(ch => {
        const chTopics: TopicRow[] = (topicsByChapter[ch.id]||[]).map(t => {
          const ts = tsMap[t.id];
          const totalQ = qByTopic[t.id] || 0;
          const attempted = ts?.attempts || 0;
          // Topic is "done" when attempts >= total questions (all seen) OR mastery is proficient/mastered
          const mastery = ts?.mastery_level || (attempted === 0 ? 'not_started' : 'learning');
          return {
            id: t.id, name_en: t.name_en, name_hi: t.name_hi || t.name_en,
            sort_order: t.sort_order, questionCount: totalQ,
            attempted, accuracy: ts?.accuracy_pct ?? null, mastery,
          };
        });

        const topicsDone = chTopics.filter(t =>
          t.mastery === 'proficient' || t.mastery === 'mastered' ||
          (t.questionCount > 0 && t.attempted >= t.questionCount)
        ).length;

        const chAttempted = chTopics.reduce((s,t) => s + t.attempted, 0);
        const chCorrect   = chTopics.reduce((s,t) => s + (t.accuracy != null ? Math.round((t.accuracy/100)*t.attempted) : 0), 0);

        return {
          id: ch.id, name_en: ch.name_en, name_hi: ch.name_hi || ch.name_en,
          sort_order: ch.sort_order, topicCount: chTopics.length,
          questionCount: qByChapter[ch.id] || 0,
          attempted: chAttempted, correct: chCorrect, topicsDone, topics: chTopics,
        };
      });

      setChapters(built);
      const current = built.find(c => c.attempted > 0 && c.topicsDone < c.topicCount)
                   || built.find(c => c.attempted === 0);
      if (current) setExpandedChapter(current.id);
    } finally { setLoadingChapters(false); }
  };

  const loadTodayCard = async () => {
    const { data: session } = await supabase.from('practice_sessions')
      .select('id,filters,status,session_type').eq('user_id', user!.id)
      .eq('session_type','topic_practice').order('created_at',{ascending:false})
      .limit(1).maybeSingle();
    if (!session) return;
    const topicId   = (session.filters as any)?.topicId   as string | undefined;
    const chapterId = (session.filters as any)?.chapterId as string | undefined;
    if (!topicId && !chapterId) return;

    let chapterName = '', topicName = '', subjectCode = 'CDP', derivedChapterId = chapterId || '';

    if (topicId) {
      // topics -> chapter_id -> chapter -> subject
      const { data: topic } = await supabase.from('topics')
        .select('id,name_en,name_hi,chapter_id').eq('id', topicId).maybeSingle();
      if (!topic) return;
      topicName = (topic as any).name_en || (topic as any).name_hi;
      derivedChapterId = (topic as any).chapter_id;

      const { data: chapter } = await supabase.from('chapters')
        .select('id,name_en,name_hi,subject_id').eq('id', derivedChapterId).maybeSingle();
      chapterName = (chapter as any)?.name_hi || (chapter as any)?.name_en || '';

      const { data: subject } = await supabase.from('subjects')
        .select('code').eq('id', (chapter as any)?.subject_id).maybeSingle();
      subjectCode = (subject as any)?.code || 'CDP';
    } else if (chapterId) {
      const { data: chapter } = await supabase.from('chapters')
        .select('id,name_en,name_hi,subject_id').eq('id', chapterId).maybeSingle();
      chapterName  = (chapter as any)?.name_hi || (chapter as any)?.name_en || '';
      topicName    = chapterName;
      const { data: subject } = await supabase.from('subjects')
        .select('code').eq('id', (chapter as any)?.subject_id).maybeSingle();
      subjectCode = (subject as any)?.code || 'CDP';
    }

    const { count: totalQ } = await supabase.from('questions')
      .select('*',{count:'exact',head:true})
      .eq(topicId ? 'topic_id' : 'chapter_id', topicId || chapterId!)
      .eq('is_active', true);
    const { data: topicStat } = topicId
      ? await supabase.from('user_topic_stats').select('attempts').eq('user_id',user!.id).eq('topic_id',topicId).maybeSingle()
      : { data: null };

    const total = totalQ || 1;
    const done  = Math.min((topicStat as any)?.attempts || 0, total);

    setTodayCard({
      chapterName, topicName, topicId: topicId || '',
      chapterId: derivedChapterId, subjectCode,
      progressPct: Math.round((done/total)*100),
      questionsLeft: Math.max(0, total - done),
      sessionId: session.status === 'in_progress' ? session.id : undefined,
    });
  };

  const loadWeakAlert = async () => {
    const { data } = await supabase.from('user_topic_stats')
      .select('topic_id,accuracy_pct,topics(name_en,name_hi)')
      .eq('user_id', user!.id).lt('accuracy_pct', 55).gte('attempts', 3)
      .order('accuracy_pct',{ascending:true}).limit(1).maybeSingle();
    if (data) {
      const d = data as any;
      setWeakAlert({ topicId: d.topic_id, accuracy: Math.round(d.accuracy_pct), topicName: d.topics?.name_en || d.topics?.name_hi || '' });
    }
  };

  /* ── Start session ─────────────────────────────────────────────────── */
  const startSession = async (mode: string, opts: any = {}) => {
    if (!user) return;
    const key = opts.topicId || opts.chapterId || mode;
    setStarting(key);
    try {
      const questions = await fetchQuestionsForSession(mode as any, user.id, { limit: 150, ...opts });
      if (!questions?.length) { alert('इस section में कोई प्रश्न उपलब्ध नहीं है।'); setStarting(null); return; }

      const timeLimitSecs = mode === 'mock_test' ? 9000 : mode === 'challenge' ? 600 : mode === 'pyq_paper' ? 9000 : questions.length * 75;
      const { data: session, error } = await supabase.from('practice_sessions').insert({
        user_id: user.id, session_type: mode, filters: opts,
        total_questions: questions.length, time_limit_secs: timeLimitSecs,
        status: 'in_progress', attempted: 0, correct: 0, wrong: 0, skipped: 0,
      }).select().single();
      if (error) throw error;

      await supabase.from('question_attempts').insert(
        questions.map((q,idx) => ({ session_id: session.id, user_id: user.id, question_id: q.id, question_order: idx+1, is_skipped: false, is_marked: false }))
      );
      navigate(`/practice/${session.id}`);
    } catch(e) { console.error(e); setStarting(null); }
  };

  /* ── Derived ───────────────────────────────────────────────────────── */
  const activeSubject   = allSubjects.find(s => s.id === activeSubjectId);
  const optionalSubs    = allSubjects.filter(s => s.is_optional);
  const isOptionalActive = !!allSubjects.find(s => s.is_optional && s.id === activeSubjectId);
  const getStatus = (ch: Chapter) => {
    if (ch.attempted === 0) return 'not_started';
    // Chapter is done when all topics with questions have been attempted
    const topicsWithQ  = ch.topics.filter(t => t.questionCount > 0).length;
    if (topicsWithQ > 0 && ch.topicsDone >= topicsWithQ) return 'done';
    return 'in_progress';
  };
  const doneChapters     = chapters.filter(c => getStatus(c) === 'done');
  const currentChapter   = chapters.find(c => getStatus(c) === 'in_progress');
  const upcomingChapters = chapters.filter(c => getStatus(c) === 'not_started');
  const totalQ           = chapters.reduce((s,c) => s + c.questionCount, 0);
  const doneQ            = chapters.reduce((s,c) => s + c.attempted, 0);

  // Global accuracy from profile
  const globalAcc = profile && profile.total_questions_attempted > 0
    ? Math.round((profile.total_correct / profile.total_questions_attempted) * 100)
    : null;

  /* ═══════════════════ RENDER ═══════════════════════════════════════ */
  return (
    <>
    {/* ── PYQ Year Picker Modal ── */}
    {showPyq && (
      <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
        onClick={() => setShowPyq(false)}>
        <div style={{ background:C.surface, borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', width:'100%', maxWidth:'520px' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px' }}>
            <div>
              <div style={{ fontWeight:800, fontSize:'1.05rem', color:C.ink }}>Previous Year Papers</div>
              <div style={{ fontSize:'0.72rem', color:C.ink3 }}>साल चुनें — 150 प्रश्नों का Full Paper</div>
            </div>
            <button onClick={() => setShowPyq(false)} style={{ background:'none', border:'none', cursor:'pointer', color:C.ink3 }}><X size={20}/></button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
            {PYQ_YEARS.map(({year, q}) => (
              <button key={year}
                onClick={() => { setShowPyq(false); startSession('pyq_paper', { sourceYear: year, limit: 200 }); }}
                disabled={starting === `pyq_${year}`}
                style={{ background: C.tealLight, border:`1.5px solid ${C.teal}33`, borderRadius:'12px', padding:'14px 10px', cursor:'pointer', fontFamily:'inherit', textAlign:'center' }}>
                <div style={{ fontWeight:800, fontSize:'1.1rem', color:C.teal }}>{year}</div>
                <div style={{ fontSize:'0.65rem', color:C.ink3, marginTop:'2px' }}>{q} प्रश्न</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* ── Exam Date Editor ── */}
    {showDateEdit && (
      <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
        onClick={() => setShowDateEdit(false)}>
        <div style={{ background:C.surface, borderRadius:'16px', padding:'24px', width:'100%', maxWidth:'340px' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ fontWeight:800, fontSize:'1rem', color:C.ink, marginBottom:'6px' }}>परीक्षा की तारीख बदलें</div>
          <div style={{ fontSize:'0.75rem', color:C.ink3, marginBottom:'16px' }}>UPTET की अगली परीक्षा कब है?</div>
          <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)}
            style={{ width:'100%', padding:'10px 14px', border:`1.5px solid ${C.border}`, borderRadius:'10px', fontSize:'0.95rem', fontFamily:'inherit', boxSizing:'border-box', marginBottom:'14px' }} />
          <button onClick={async () => {
            setExamDays(calcDays(dateInput));
            setShowDateEdit(false);
            // Save to DB so it persists across devices/refreshes
            if (user) {
              await supabase.from('user_profiles')
                .update({ target_exam_date: dateInput })
                .eq('id', user.id);
            }
          }} style={{ width:'100%', background:C.teal, color:'white', border:'none', borderRadius:'10px', padding:'11px', fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            Save करें
          </button>
        </div>
      </div>
    )}

    {/* ── MAIN LAYOUT (responsive) ── */}
    <div style={{ maxWidth:'960px', margin:'0 auto', fontFamily:"'DM Sans',system-ui,sans-serif", background:C.bg, minHeight:'100vh', paddingBottom:'80px' }}>

      {/* TOP BAR */}
      <div style={{ background:C.ink, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50, borderRadius:'0 0 18px 18px', marginBottom:'16px' }}>
        <div style={{ color:'white', fontWeight:700, fontSize:'1rem' }}>📚 अभ्यास करें</div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {(profile?.streak_days ?? 0) > 0 && (
            <div style={{ background:C.gold, color:'white', fontSize:'0.72rem', fontWeight:700, padding:'3px 10px', borderRadius:'20px', display:'flex', alignItems:'center', gap:'4px' }}>
              <Flame size={12}/> {profile!.streak_days}
            </div>
          )}
          <button onClick={() => setShowDateEdit(true)}
            style={{ background:'rgba(255,255,255,.08)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px', color: examDays < 0 ? '#f87171' : '#fbbf24', fontSize:'0.72rem', fontWeight:700, padding:'4px 10px', borderRadius:'20px' }}>
            <Calendar size={12}/>
            {examDays < 0 ? `Exam ${Math.abs(examDays)} दिन पहले था` : `${examDays} दिन बाकी`}
            <Pencil size={10}/>
          </button>
        </div>
      </div>

      {/* RESPONSIVE GRID: 1 col mobile, 2 col desktop */}
      <div style={{ padding:'0 14px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:'14px', alignItems:'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

          {/* TODAY CARD */}
          {todayCard && (
            <div>
              <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:C.ink3, marginBottom:'6px' }}>⚡ आज का अभ्यास</div>
              <div style={{ background:C.ink, borderRadius:'14px', padding:'16px', position:'relative', overflow:'hidden', cursor:'pointer' }}
                onClick={() => todayCard.sessionId ? navigate(`/practice/${todayCard.sessionId}`) : startSession('topic_practice', { topicId: todayCard.topicId, chapterId: todayCard.chapterId })}>
                <div style={{ position:'absolute', top:'-24px', right:'-24px', width:'100px', height:'100px', background:C.gold, opacity:0.12, borderRadius:'50%' }}/>
                <div style={{ display:'inline-block', background:'rgba(200,134,10,.25)', color:C.goldMid, fontSize:'0.62rem', fontWeight:700, padding:'2px 8px', borderRadius:'4px', marginBottom:'8px' }}>
                  {todayCard.subjectCode} · {todayCard.chapterName}
                </div>
                <div style={{ color:'white', fontSize:'0.95rem', fontWeight:700, marginBottom:'4px' }}>{todayCard.topicName}</div>
                <div style={{ color:'rgba(255,255,255,.5)', fontSize:'0.72rem', marginBottom:'10px' }}>
                  {todayCard.progressPct > 0 ? `${todayCard.progressPct}% पूरा — ${todayCard.questionsLeft} बाकी` : `${todayCard.questionsLeft} प्रश्न`}
                </div>
                <div style={{ height:'3px', background:'rgba(255,255,255,.12)', borderRadius:'4px', marginBottom:'10px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${todayCard.progressPct}%`, background:`linear-gradient(90deg,${C.gold},#f59e0b)`, borderRadius:'4px' }}/>
                </div>
                <button style={{ width:'100%', background:C.gold, color:'white', border:'none', borderRadius:'9px', padding:'10px 14px', fontWeight:700, fontSize:'0.88rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontFamily:'inherit' }}>
                  {todayCard.sessionId ? 'जारी रखें' : 'शुरू करें'} — {todayCard.topicName.slice(0,24)}{todayCard.topicName.length > 24 ? '…':''}
                  <ArrowRight size={15}/>
                </button>
              </div>
            </div>
          )}

          {/* QUICK STATS */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
            {[
              { val: globalAcc != null ? `${globalAcc}%` : '—', lbl:'Accuracy' },
              { val: profile?.total_questions_attempted || 0, lbl:'प्रश्न हल' },
              { val: `${doneChapters.length}/${chapters.length}`, lbl:'अध्याय पूरे' },
            ].map(s => (
              <div key={s.lbl} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'10px', padding:'10px', textAlign:'center' }}>
                <div style={{ fontSize:'1.2rem', fontWeight:800, color:C.ink }}>{s.val}</div>
                <div style={{ fontSize:'0.62rem', color:C.ink3, marginTop:'2px' }}>{s.lbl}</div>
              </div>
            ))}
          </div>

          {/* QUICK START */}
          <div>
            <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:C.ink3, marginBottom:'8px' }}>Quick Start</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
              {[
                { id:'pyq', label:'Old Papers', emoji:'📄', accent:C.teal, bg:C.tealLight, action:() => setShowPyq(true) },
                { id:'mock_test', label:'Mock Test', emoji:'⏱', accent:C.blue, bg:C.blueLight, action:() => startSession('mock_test') },
                { id:'challenge', label:'Daily 10', emoji:'⚡', accent:'#7c3aed', bg:'#f5f3ff', action:() => startSession('challenge',{limit:10}) },
                { id:'revision', label:'Revision', emoji:'📚', accent:C.green, bg:C.greenLight, action:() => startSession('revision') },
              ].map(m => (
                <button key={m.id} onClick={m.action} disabled={starting === m.id}
                  style={{ background:m.bg, border:`1.5px solid ${m.accent}22`, borderRadius:'12px', padding:'10px 6px', cursor:'pointer', textAlign:'center', fontFamily:'inherit', opacity:starting === m.id ? 0.6 : 1, transition:'transform .1s' }}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(.95)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}>
                  <div style={{ fontSize:'1.3rem', marginBottom:'4px' }}>{m.emoji}</div>
                  <div style={{ fontSize:'0.62rem', fontWeight:700, color:m.accent, lineHeight:1.3 }}>{m.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* WEAK ALERT */}
          {weakAlert && (
            <button onClick={() => startSession('topic_practice',{topicId:weakAlert.topicId,limit:20})}
              style={{ background:C.redLight, border:`1px solid #f5c6c2`, borderRadius:'10px', padding:'10px 14px', display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', textAlign:'left', width:'100%', fontFamily:'inherit' }}>
              <span style={{ fontSize:'1.2rem' }}>⚠️</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'0.78rem', fontWeight:700, color:C.red }}>कमज़ोर विषय मिला</div>
                <div style={{ fontSize:'0.68rem', color:'#a93226', marginTop:'1px' }}>{weakAlert.topicName} — {weakAlert.accuracy}% accuracy</div>
              </div>
              <div style={{ background:C.red, color:'white', border:'none', borderRadius:'6px', padding:'5px 10px', fontSize:'0.7rem', fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                अभ्यास करें
              </div>
            </button>
          )}
        </div>

        {/* ── RIGHT COLUMN (subject tabs + chapters) ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

          {/* SUBJECT TABS */}
          <div>
            <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:C.ink3, marginBottom:'8px' }}>विषय चुनें</div>
            <div style={{ overflowX:'auto', scrollbarWidth:'none', paddingBottom:'4px' }}>
              <div style={{ display:'flex', gap:'6px', width:'max-content' }}>
                {allSubjects.map(s => {
                  const active = s.id === activeSubjectId;
                  const acc = s.accuracy != null ? Math.round(s.accuracy) : null;
                  return (
                    <button key={s.id} onClick={() => setActiveSubjectId(s.id)}
                      style={{ display:'flex', alignItems:'center', gap:'5px', padding:'6px 13px', borderRadius:'20px', whiteSpace:'nowrap',
                        border:`1.5px solid ${active ? C.ink : C.border}`, background: active ? C.ink : C.surface,
                        color: active ? 'white' : C.ink2, fontWeight:600, fontSize:'0.8rem', cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}>
                      {s.name_hi || s.code}
                      {acc != null && (
                        <span style={{ fontSize:'0.6rem', fontWeight:700, padding:'1px 5px', borderRadius:'10px',
                          background: active ? 'rgba(255,255,255,.2)' : C.greenLight, color: active ? 'rgba(255,255,255,.85)' : C.green }}>
                          {acc}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language II picker */}
            {isOptionalActive && optionalSubs.length > 1 && (
              <div style={{ marginTop:'10px', background:C.goldLight, border:`1px solid #fde68a`, borderRadius:'10px', padding:'10px 14px' }}>
                <div style={{ fontSize:'0.68rem', fontWeight:700, color:C.gold, marginBottom:'6px' }}>Language II — अपनी भाषा चुनें</div>
                <div style={{ display:'flex', gap:'8px' }}>
                  {optionalSubs.map(s => (
                    <button key={s.id} onClick={async () => {
                      await supabase.from('user_profiles').update({ subjects_opted:[s.id] }).eq('id', user!.id);
                      setActiveSubjectId(s.id);
                    }} style={{ padding:'6px 14px', borderRadius:'20px', border:`1.5px solid ${activeSubjectId === s.id ? C.gold : C.border}`,
                      background: activeSubjectId === s.id ? C.gold : C.surface, color: activeSubjectId === s.id ? 'white' : C.ink2,
                      fontWeight:700, fontSize:'0.78rem', cursor:'pointer', fontFamily:'inherit' }}>
                      {s.code}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SUBJECT PROGRESS RING */}
          {activeSubject && !loadingChapters && chapters.length > 0 && (
            <div style={{ background:`linear-gradient(135deg,${C.teal} 0%,#1a6b5e 100%)`, borderRadius:'13px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'14px' }}>
              <svg viewBox="0 0 48 48" style={{ width:'46px', height:'46px', flexShrink:0, transform:'rotate(-90deg)' }}>
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="3"/>
                <circle cx="24" cy="24" r="20" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray="125.6" strokeDashoffset={125.6*(1-doneChapters.length/Math.max(chapters.length,1))}/>
                <text x="24" y="24" dominantBaseline="middle" textAnchor="middle"
                  style={{ fontSize:'8px', fontWeight:800, fill:'white', transform:'rotate(90deg)', transformOrigin:'24px 24px' }}>
                  {Math.round((doneChapters.length/Math.max(chapters.length,1))*100)}%
                </text>
              </svg>
              <div>
                <div style={{ color:'white', fontWeight:700, fontSize:'0.88rem' }}>{activeSubject.name_hi}</div>
                <div style={{ color:'rgba(255,255,255,.65)', fontSize:'0.7rem', marginTop:'3px' }}>
                  {doneChapters.length} पूरे · {upcomingChapters.length} बाकी · {doneQ}/{totalQ} प्रश्न हल
                </div>
              </div>
            </div>
          )}

          {/* CHAPTER LIST */}
          {loadingChapters && [1,2,3].map(i => (
            <div key={i} style={{ height:'62px', background:'#eee', borderRadius:'14px', animation:'pulse 1.5s infinite' }}/>
          ))}

          {!loadingChapters && chapters.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {doneChapters.length > 0 && <>
                <Divider label="✓ पूरे किये गये अध्याय"/>
                {doneChapters.map(ch => <ChapterCard key={ch.id} ch={ch} status="done" expanded={expandedChapter===ch.id} onToggle={() => setExpandedChapter(expandedChapter===ch.id?null:ch.id)} onStart={startSession} starting={starting}/>)}
              </>}

              {currentChapter && <>
                <Divider label="▶ अभी यहाँ हैं" pulse/>
                <ChapterCard ch={currentChapter} status="in_progress" expanded={expandedChapter===currentChapter.id} onToggle={() => setExpandedChapter(expandedChapter===currentChapter.id?null:currentChapter.id)} onStart={startSession} starting={starting}/>
              </>}

              {upcomingChapters.length > 0 && <>
                <Divider label="आगे के अध्याय"/>
                {upcomingChapters.map(ch => <ChapterCard key={ch.id} ch={ch} status="not_started" expanded={expandedChapter===ch.id} onToggle={() => setExpandedChapter(expandedChapter===ch.id?null:ch.id)} onStart={startSession} starting={starting}/>)}
              </>}
            </div>
          )}

          {!loadingChapters && chapters.length === 0 && activeSubjectId && (
            <div style={{ textAlign:'center', padding:'40px', color:C.ink3, fontSize:'0.875rem' }}>
              इस विषय के लिए प्रश्न उपलब्ध नहीं हैं
            </div>
          )}

        </div>
      </div>
    </div>
    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */
function Divider({ label, pulse }: { label: string; pulse?: boolean }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 0 2px' }}>
      <div style={{ flex:1, height:'1px', background:C.border }}/>
      <div style={{ fontSize:'0.6rem', fontWeight:700, color: pulse ? C.gold : C.ink3, textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap', animation: pulse ? 'pulse 2s infinite' : undefined }}>{label}</div>
      <div style={{ flex:1, height:'1px', background:C.border }}/>
    </div>
  );
}

function ChapterCard({ ch, status, expanded, onToggle, onStart, starting }: {
  ch: Chapter; status: 'done'|'in_progress'|'not_started';
  expanded: boolean; onToggle: () => void;
  onStart: (mode: string, opts: any) => void; starting: string|null;
}) {
  const progressPct = ch.topicCount > 0 ? Math.round((ch.topicsDone/ch.topicCount)*100) : 0;
  const accuracy    = ch.attempted > 0 ? Math.round((ch.correct/ch.attempted)*100) : 0;

  const numBg = status==='done' ? C.green : status==='in_progress' ? C.gold : C.border2;
  const numColor = status==='done'||status==='in_progress' ? 'white' : C.ink3;
  const barColor = status==='done' ? C.green : status==='in_progress' ? C.gold : C.blue;
  const chipBg   = status==='done' ? C.greenLight : status==='in_progress' ? C.goldLight : C.blueLight;
  const chipColor = status==='done' ? C.green : status==='in_progress' ? C.gold : C.blue;

  return (
    <div style={{ background:C.surface, border:`1px solid ${expanded||status==='in_progress' ? barColor : C.border}`, borderRadius:'13px', overflow:'hidden' }}>
      <div onClick={onToggle} style={{ display:'flex', alignItems:'center', padding:'12px 14px', cursor:'pointer', gap:'10px' }}>
        <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:numBg, color:numColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.72rem', fontWeight:800, flexShrink:0 }}>
          {status==='done' ? '✓' : ch.sort_order}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:'0.88rem', color:C.ink, lineHeight:1.3 }}>{ch.name_hi}</div>
          <div style={{ fontSize:'0.66rem', color:C.ink3 }}>{ch.topicCount} topics · {ch.questionCount} Q</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px', flexShrink:0 }}>
          <div style={{ fontSize:'0.62rem', fontWeight:700, padding:'2px 7px', borderRadius:'10px', background:chipBg, color:chipColor, whiteSpace:'nowrap' }}>
            {status==='done' ? 'पूरा हुआ' : status==='in_progress' ? `${progressPct}% — जारी है` : `${ch.topicCount} topics`}
          </div>
          {expanded ? <ChevronUp size={13} color={C.ink3}/> : <ChevronDown size={13} color={C.ink3}/>}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'0 14px 10px' }}>
        <div style={{ flex:1, height:'3px', background:C.border2, borderRadius:'4px', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${progressPct}%`, background:barColor, borderRadius:'4px', transition:'width .6s ease' }}/>
        </div>
        <div style={{ fontSize:'0.62rem', color:C.ink3, fontWeight:700, whiteSpace:'nowrap' }}>
          {status==='done' ? `${accuracy}% accuracy` : `${ch.topicsDone}/${ch.topicCount} topics`}
        </div>
      </div>

      {/* Topic list */}
      {expanded && (
        <div style={{ borderTop:`1px solid ${C.border2}`, paddingBottom:'8px' }}>
          {/* Start full chapter button */}
          <div style={{ padding:'10px 14px 6px' }}>
            <button
              onClick={() => onStart('topic_practice', { chapterId: ch.id, limit: 150 })}
              disabled={starting === ch.id}
              style={{ background: status==='in_progress' ? C.gold : C.ink, color:'white', border:'none', borderRadius:'8px', padding:'8px 16px', fontSize:'0.76rem', fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'6px', opacity: starting===ch.id ? 0.7 : 1 }}>
              <Play size={13} fill="white"/>
              {status==='in_progress' ? `Chapter जारी रखें (${ch.questionCount} Q)` : `Chapter शुरू करें (${ch.questionCount} Q)`}
            </button>
          </div>

          {ch.topics.map((t, idx) => {
            const isDone    = t.mastery==='proficient'||t.mastery==='mastered'||(t.questionCount>0&&t.attempted>=t.questionCount);
            const isCurrent = !isDone && t.attempted > 0;
            const isWeak    = t.accuracy!=null && t.accuracy < 55 && t.attempted >= 3;
            const dotBg     = isDone ? C.green : isCurrent ? C.gold : isWeak ? C.red : C.border2;
            const dotColor  = isDone||isCurrent||(isWeak&&t.attempted>0) ? 'white' : C.ink3;
            const rowBg     = isCurrent ? C.goldLight : 'transparent';

            return (
              <div key={t.id}
                style={{ display:'flex', alignItems:'center', padding:'8px 14px 8px 24px', gap:'10px', cursor:'pointer', margin:'0 6px', borderRadius:'8px', background:rowBg }}
                onMouseEnter={e => { if(!isCurrent)(e.currentTarget as HTMLElement).style.background=C.bg; }}
                onMouseLeave={e => { if(!isCurrent)(e.currentTarget as HTMLElement).style.background=rowBg; }}>
                <div style={{ width:'20px', height:'20px', borderRadius:'50%', background:dotBg, color:dotColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', fontWeight:800, flexShrink:0 }}>
                  {isDone ? '✓' : isCurrent ? '▶' : isWeak ? '!' : idx+1}
                </div>
                <div style={{ flex:1, fontSize:'0.82rem', color:C.ink, fontWeight: isCurrent ? 700 : 500, lineHeight:1.35 }}>{t.name_en}</div>
                <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
                  {t.questionCount > 0 && <span style={{ fontSize:'0.62rem', color:C.ink3 }}>{t.questionCount}Q</span>}
                  {t.accuracy != null && (
                    <span style={{ fontSize:'0.62rem', fontWeight:700, padding:'2px 5px', borderRadius:'8px',
                      background: t.accuracy>=70 ? C.greenLight : t.accuracy>=50 ? C.goldLight : C.redLight,
                      color:      t.accuracy>=70 ? C.green : t.accuracy>=50 ? C.gold : C.red }}>
                      {Math.round(t.accuracy)}%
                    </span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); onStart('topic_practice',{topicId:t.id,chapterId:ch.id,limit:50}); }}
                    disabled={starting===t.id}
                    style={{ background: isCurrent ? C.tealLight : C.goldLight, color: isCurrent ? C.teal : C.gold,
                      border:'none', borderRadius:'6px', padding:'4px 9px', fontSize:'0.66rem', fontWeight:700,
                      cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', opacity: starting===t.id ? 0.6 : 1 }}>
                    {starting===t.id ? '...' : isCurrent ? 'जारी रखें' : 'शुरू करें'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
