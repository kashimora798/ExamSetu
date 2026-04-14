import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Play, Flame, Calendar, Pencil, BookOpen,
  AlertCircle, CheckCircle2, ChevronRight, X, Zap, Lock, Search, Trophy
} from 'lucide-react';
import { fetchQuestionsForSession } from '../../lib/engine/questionSelector';
import { validateSubscriptionForSession, isSessionTypeGated, formatSubscriptionError } from '../../lib/engine/subscriptionValidation';

/* ─── Color tokens ─────────────────────────────────────────────────── */
const C = {
  ink: '#1a1814', ink2: '#3a3628', ink3: '#8a8370',
  gold: '#c8860a', goldLight: '#fdf6e3', goldMid: '#f5bc30', goldDeep: '#a06a05',
  teal: '#0f6b5e', tealLight: '#e0f4f1', tealMid: '#1a8a7a',
  red: '#c0392b', redLight: '#fdf0ee',
  green: '#2d7a3a', greenLight: '#e8f5eb',
  blue: '#1a4b8c', blueLight: '#e8eef8',
  purple: '#6b3fa0', purpleLight: '#f3eeff',
  bg: '#f7f5f0', surface: '#ffffff', border: '#e5e1d5', border2: '#ede9df',
  shadow: '0 2px 12px rgba(28,26,20,0.08)',
};

/* ─── Types ─────────────────────────────────────────────────────────── */
type ContentSource = 'pyq' | 'mock' | 'mixed';
interface SubjectTab { id: string; code: string; name_en: string; name_hi: string; sort_order: number; is_optional: boolean; accuracy: number | null; attempted: number; }
interface Chapter { id: string; name_en: string; name_hi: string; sort_order: number; topicCount: number; questionCount: number; attempted: number; correct: number; topicsDone: number; completionPct: number; accuracy: number; topics: TopicRow[]; }
interface TopicRow { id: string; name_en: string; name_hi: string; sort_order: number; questionCount: number; attempted: number; accuracy: number | null; mastery: string; }
interface WeakAlert { topicId: string; topicName: string; accuracy: number; chapterId?: string; }

function calcDays(dateStr: string | null | undefined): number {
  if (!dateStr) return Math.ceil((new Date('2026-12-01').getTime() - Date.now()) / 86400000);
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

/* ── Ring SVG ───────────────────────────────────────────────────────── */
function Ring({ pct, size = 56, color, bg = '#e5e1d5', children }: {
  pct: number; size?: number; color: string; bg?: string; children?: React.ReactNode;
}) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bg} strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ * (1 - Math.min(pct, 100) / 100)}
          style={{ transition: 'stroke-dashoffset .7s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function PracticePage() {
  const { user, profile } = useAuth();
  const { isPro, isGrandfatheredFree } = useSubscription();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [allSubjects, setAllSubjects] = useState<SubjectTab[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [weakAlerts, setWeakAlerts] = useState<WeakAlert[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [chapterFilter, setChapterFilter] = useState<'all' | 'weak' | 'unpracticed' | 'completed'>('all');

  // Sheet state
  const [sheetChapter, setSheetChapter] = useState<Chapter | null>(null);
  const [sheetTopicExpanded, setSheetTopicExpanded] = useState(false);
  const [sheetQCount, setSheetQCount] = useState(15);
  const [sheetContentSource, setSheetContentSource] = useState<ContentSource>('mixed');
  const [sheetTopicId, setSheetTopicId] = useState<string | null>(null);

  // Exam date
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [dateInput, setDateInput] = useState(profile?.target_exam_date || '2026-12-01');
  const [examDays, setExamDays] = useState(calcDays(profile?.target_exam_date));

  const subjectsOpted: string[] = (profile?.subjects_opted as string[]) || [];

  useEffect(() => {
    if (profile?.target_exam_date) {
      setDateInput(profile.target_exam_date);
      setExamDays(calcDays(profile.target_exam_date));
    }
  }, [profile?.target_exam_date]);

  useEffect(() => { if (user) loadSubjects(); }, [user, profile]);
  useEffect(() => { if (activeSubjectId) loadChapters(activeSubjectId); }, [activeSubjectId]);
  useEffect(() => { if (user) loadWeakAlerts(); }, [user]);

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'weak_mix' && user) {
      setStarting('weak_mix');
      fetchQuestionsForSession('weak_mix', user.id, { limit: 20, contentSource: 'mixed' })
        .then(qs => createAndNavigateSession('weak_mix', qs, {}))
        .finally(() => setStarting(null));
    }
  }, [searchParams, user]);

  // Topic Search Logic
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data, error } = await supabase
        .from('topics')
        .select(`
          id, name_en, name_hi, chapter_id,
          chapters (name_en, name_hi, subjects (name_en, name_hi))
        `)
        .or(`name_en.ilike.%${searchQuery}%,name_hi.ilike.%${searchQuery}%`)
        .limit(8);
      
      if (!error && data) setSearchResults(data);
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Topic Leaderboard State
  const [topicLeaders, setTopicLeaders] = useState<any[]>([]);

  useEffect(() => {
    if (!sheetTopicId) {
      setTopicLeaders([]);
      return;
    }
    const loadLeaders = async () => {
      const { data } = await supabase.from('user_topic_stats')
        .select(`user_id, accuracy_pct, attempts, user_profiles(full_name, avatar_url)`)
        .eq('topic_id', sheetTopicId)
        .gte('attempts', 1) // Require at least 1 attempt to qualify
        .order('accuracy_pct', { ascending: false })
        .order('attempts', { ascending: false })
        .limit(3);
      setTopicLeaders(data || []);
    };
    loadLeaders();
  }, [sheetTopicId]);

  const loadSubjects = async () => {
    const { data: subs } = await supabase.from('subjects').select('id,code,name_en,name_hi,sort_order,is_optional').order('sort_order');
    if (!subs) return;
    const visible = subs.filter(s => !s.is_optional || (subjectsOpted.length ? subjectsOpted.includes(s.id) : s.code === 'English'));
    const { data: stats } = await supabase.from('user_subject_stats').select('subject_id,attempts,correct,accuracy_pct').eq('user_id', user!.id);
    const sm: Record<string, any> = {};
    (stats || []).forEach(s => { sm[s.subject_id] = s; });
    setAllSubjects(visible.map(s => ({ ...s, accuracy: sm[s.id]?.accuracy_pct ?? null, attempted: sm[s.id]?.attempts ?? 0 })));
    if (visible.length) setActiveSubjectId(visible[0].id);
  };

  const loadChapters = async (subjectId: string) => {
    setLoadingChapters(true);
    try {
      const { data: chs } = await supabase.from('chapters').select('id,name_en,name_hi,sort_order').eq('subject_id', subjectId).order('sort_order');
      if (!chs?.length) { setChapters([]); return; }
      const chIds = chs.map(c => c.id);
      const [topicsRes, qsRes, chAggRes] = await Promise.all([
        supabase.from('topics').select('id,chapter_id,name_en,name_hi,sort_order').in('chapter_id', chIds).order('sort_order'),
        supabase.from('questions').select('id,chapter_id,topic_id').in('chapter_id', chIds).eq('is_active', true),
        supabase.from('user_chapter_stats').select('chapter_id,attempts,correct,accuracy_pct,topics_completed,total_topics,completion_pct').eq('user_id', user!.id).in('chapter_id', chIds),
      ]);
      const topics = topicsRes.data || [];
      const qs = qsRes.data || [];
      const topicIds = topics.map(t => t.id);
      let tsMap: Record<string, any> = {};
      if (topicIds.length) {
        const { data: ts } = await supabase.from('user_topic_stats').select('topic_id,attempts,correct,accuracy_pct,mastery_level').eq('user_id', user!.id).in('topic_id', topicIds);
        (ts || []).forEach(s => { tsMap[s.topic_id] = s; });
      }
      const qByChapter: Record<string, number> = {};
      const qByTopic: Record<string, number> = {};
      qs.forEach(q => {
        qByChapter[q.chapter_id] = (qByChapter[q.chapter_id] || 0) + 1;
        if (q.topic_id) qByTopic[q.topic_id] = (qByTopic[q.topic_id] || 0) + 1;
      });
      const chMap: Record<string, any> = {};
      (chAggRes.data || []).forEach(row => { chMap[row.chapter_id] = row; });
      const topicsByChapter: Record<string, any[]> = {};
      topics.forEach(t => { (topicsByChapter[t.chapter_id] ??= []).push(t); });
      const built: Chapter[] = chs.map(ch => {
        const chTopics: TopicRow[] = (topicsByChapter[ch.id] || []).map(t => {
          const ts = tsMap[t.id];
          const totalQ = qByTopic[t.id] || 0;
          const attempted = ts?.attempts || 0;
          const mastery = ts?.mastery_level || (attempted === 0 ? 'not_started' : 'learning');
          return { id: t.id, name_en: t.name_en, name_hi: t.name_hi || t.name_en, sort_order: t.sort_order, questionCount: totalQ, attempted, accuracy: ts?.accuracy_pct ?? null, mastery };
        }).filter(t => t.questionCount > 0);
        const topicsDone = chTopics.filter(t => t.mastery === 'proficient' || t.mastery === 'mastered' || (t.questionCount > 0 && t.attempted >= t.questionCount)).length;
        const dbStat = chMap[ch.id];
        const chAttempted = dbStat?.attempts ?? chTopics.reduce((s, t) => s + t.attempted, 0);
        const chCorrect = dbStat?.correct ?? chTopics.reduce((s, t) => s + (t.accuracy != null ? Math.round((t.accuracy / 100) * t.attempted) : 0), 0);
        const chAccuracy = chAttempted > 0 ? Math.round((chCorrect / chAttempted) * 100) : 0;
        const chCompletion = dbStat?.completion_pct != null ? Math.round(dbStat.completion_pct) : (chTopics.length > 0 ? Math.round((topicsDone / chTopics.length) * 100) : 0);
        return { id: ch.id, name_en: ch.name_en, name_hi: ch.name_hi || ch.name_en, sort_order: ch.sort_order, topicCount: chTopics.length, questionCount: qByChapter[ch.id] || 0, attempted: chAttempted, correct: chCorrect, accuracy: chAccuracy, topicsDone, topics: chTopics, completionPct: chCompletion };
      }).filter(ch => ch.topicCount > 0);
      setChapters(built);
    } finally { setLoadingChapters(false); }
  };

  const loadWeakAlerts = async () => {
    const { data } = await supabase.from('user_topic_stats')
      .select('topic_id,accuracy_pct,topics(name_en,name_hi,chapter_id)')
      .eq('user_id', user!.id).lt('accuracy_pct', 55).gte('attempts', 3)
      .order('accuracy_pct', { ascending: true }).limit(3);
    if (data?.length) {
      setWeakAlerts(data.map((d: any) => ({ topicId: d.topic_id, chapterId: d.topics?.chapter_id, accuracy: Math.round(d.accuracy_pct), topicName: d.topics?.name_en || d.topics?.name_hi || '' })));
    }
  };

  const createAndNavigateSession = async (mode: string, questions: any[], extra: any) => {
    if (!user || !questions.length) return;
    const sessionType = mode === 'weak_mix' ? 'custom' : mode as any;
    const filters = Object.fromEntries(Object.entries({ ...extra, practiceMode: mode }).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    const timeLimitSecs = mode === 'mock_test' ? 9000 : mode === 'pyq_paper' ? 9000 : mode === 'challenge' ? 600 : questions.length * 75;
    const { data: session, error } = await supabase.from('practice_sessions').insert({
      user_id: user.id, session_type: sessionType, filters,
      total_questions: questions.length, time_limit_secs: timeLimitSecs,
      status: 'in_progress', attempted: 0, correct: 0, wrong: 0, skipped: 0,
    }).select().single();
    if (error) throw error;
    await supabase.from('question_attempts').insert(
      questions.map((q, idx) => ({ session_id: session.id, user_id: user.id, question_id: q.id, question_order: idx + 1, is_skipped: false, is_marked: false }))
    );
    navigate(`/practice/${session.id}`);
  };

  const startSession = async (mode: string, opts: any = {}) => {
    if (!user) return;
    const key = opts.topicId || opts.chapterId || mode;
    setStarting(key);
    try {
      if (isSessionTypeGated(mode) && !isPro && !isGrandfatheredFree) {
        const access = await validateSubscriptionForSession(user.id, mode);
        if (!access.allowed) {
          alert(formatSubscriptionError(access));
          return;
        }
      }
      const cs: ContentSource = opts.contentSource || 'mixed';
      const qs = await fetchQuestionsForSession(mode as any, user.id, { limit: opts.limit || 150, ...opts, contentSource: cs });
      if (!qs?.length) { alert('इस section में कोई प्रश्न उपलब्ध नहीं है।'); return; }
      await createAndNavigateSession(mode, qs, opts);
    } catch (e) { console.error(e); } finally { setStarting(null); }
  };

  const openSheet = (ch: Chapter) => {
    setSheetChapter(ch);
    setSheetTopicId(null);
    setSheetTopicExpanded(false);
    const defaultQ = Math.min(15, ch.questionCount || 15);
    setSheetQCount(defaultQ);
    setSheetContentSource('mixed');
  };

  const submitSheet = async () => {
    if (!sheetChapter || !user) return;
    const key = sheetTopicId || sheetChapter.id;
    setStarting(key);
    setSheetChapter(null);
    try {
      const maxQ = (sheetTopicId
        ? sheetChapter.topics.find(t => t.id === sheetTopicId)?.questionCount
        : sheetChapter.questionCount) || 50;
      const clampedCount = Math.min(sheetQCount, maxQ);
      const opts: any = { chapterId: sheetChapter.id, contentSource: sheetContentSource, limit: clampedCount };
      if (sheetTopicId) opts.topicId = sheetTopicId;
      const qs = await fetchQuestionsForSession('topic_practice', user.id, opts);
      if (!qs?.length) { alert('इस section में कोई प्रश्न उपलब्ध नहीं है।'); return; }
      await createAndNavigateSession('topic_practice', qs, opts);
    } catch (e) { console.error(e); } finally { setStarting(null); }
  };

  /* ── Derived ── */
  const activeSubject = allSubjects.find(s => s.id === activeSubjectId);
  const optionalSubs = allSubjects.filter(s => s.is_optional);
  const isOptionalActive = !!allSubjects.find(s => s.is_optional && s.id === activeSubjectId);
  const getStatus = (ch: Chapter) => {
    if (ch.completionPct >= 100) return 'done';
    if (ch.attempted > 0 || ch.completionPct > 0) return 'in_progress';
    return 'not_started';
  };
  const inProgressChapter = chapters.find(c => getStatus(c) === 'in_progress');
  const nextChapter = chapters.find(c => getStatus(c) === 'not_started');
  const globalAcc = profile?.total_questions_attempted
    ? Math.round((profile.total_correct / profile.total_questions_attempted) * 100) : null;
  const doneCount = chapters.filter(c => getStatus(c) === 'done').length;

  /* ─── Render ─── */
  return (
    <>
      {/* ────────────────────── SHEET OVERLAY ────────────────────────── */}
      {sheetChapter && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setSheetChapter(null)}
        >
          <div
            style={{ background: C.surface, borderRadius: '24px 24px 0 0', padding: '0 0 44px', width: '100%', maxWidth: '640px', boxShadow: '0 -8px 40px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet header */}
            <div style={{ position: 'sticky', top: 0, background: C.surface, padding: '20px 20px 14px', borderBottom: `1px solid ${C.border2}`, display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              {/* Ring */}
              <Ring pct={sheetChapter.completionPct}
                size={64}
                color={getStatus(sheetChapter) === 'done' ? C.green : getStatus(sheetChapter) === 'in_progress' ? C.gold : C.teal}
              >
                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: C.ink2 }}>{sheetChapter.completionPct}%</span>
              </Ring>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: C.ink, lineHeight: 1.3 }}>{sheetChapter.name_hi}</div>
                <div style={{ fontSize: '0.7rem', color: C.ink3, marginTop: '4px' }}>
                  {sheetChapter.topicCount} topics · {sheetChapter.questionCount} प्रश्न उपलब्ध
                  {sheetChapter.accuracy > 0 && ` · ${sheetChapter.accuracy}% accuracy`}
                </div>
              </div>
              <button onClick={() => setSheetChapter(null)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <X size={16} color={C.ink3} />
              </button>
            </div>

            <div style={{ padding: '16px 20px' }}>
              {/* Weak topic alert */}
              {weakAlerts.filter(w => w.chapterId === sheetChapter.id).map(w => (
                <div key={w.topicId} style={{ background: C.redLight, border: `1px solid ${C.red}25`, borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertCircle size={15} color={C.red} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.red }}>{w.topicName}</div>
                    <div style={{ fontSize: '0.65rem', color: C.ink3, marginTop: '1px' }}>{w.accuracy}% accuracy — practice करें</div>
                  </div>
                  <button onClick={() => setSheetTopicId(w.topicId)}
                    style={{ background: C.red, color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Focus
                  </button>
                </div>
              ))}

              {/* Topic selector (collapsed by default) */}
              <div style={{ marginBottom: '16px' }}>
                <button onClick={() => setSheetTopicExpanded(p => !p)}
                  style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: sheetTopicId ? C.teal : C.ink2 }}>
                    {sheetTopicId ? `📌 ${sheetChapter.topics.find(t => t.id === sheetTopicId)?.name_hi || 'Topic selected'}` : '📚 Full Chapter practice'}
                  </span>
                  <ChevronRight size={15} color={C.ink3} style={{ transform: sheetTopicExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
                </button>

                {sheetTopicExpanded && (
                  <div style={{ marginTop: '6px', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                    {/* "All chapter" option */}
                    <div onClick={() => { setSheetTopicId(null); setSheetTopicExpanded(false); }}
                      style={{ padding: '10px 14px', background: !sheetTopicId ? C.tealLight : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${C.border2}` }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: !sheetTopicId ? C.teal : C.border2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <BookOpen size={10} color={!sheetTopicId ? 'white' : C.ink3} />
                      </div>
                      <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: !sheetTopicId ? C.teal : C.ink }}>पूरा Chapter</div>
                      <span style={{ fontSize: '0.65rem', color: C.ink3 }}>{sheetChapter.questionCount}Q</span>
                    </div>
                    {sheetChapter.topics.map((t, idx) => {
                      const isSel = sheetTopicId === t.id;
                      const isDone = t.mastery === 'proficient' || t.mastery === 'mastered' || (t.questionCount > 0 && t.attempted >= t.questionCount);
                      const isWeak = t.accuracy != null && t.accuracy < 55 && t.attempted >= 3;
                      return (
                        <div key={t.id} onClick={() => { setSheetTopicId(t.id); setSheetTopicExpanded(false); setSheetQCount(Math.min(t.questionCount, 15)); }}
                          style={{ padding: '10px 14px', background: isSel ? C.tealLight : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderTop: `1px solid ${C.border2}` }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: isDone ? C.green : isWeak ? C.red : isSel ? C.teal : C.border2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 800, color: isDone || isWeak || isSel ? 'white' : C.ink3, flexShrink: 0 }}>
                            {isDone ? '✓' : isWeak ? '!' : idx + 1}
                          </div>
                          <div style={{ flex: 1, fontSize: '0.8rem', color: isSel ? C.teal : C.ink, fontWeight: isSel ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name_hi}</div>
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexShrink: 0 }}>
                            {t.questionCount > 0 && <span style={{ fontSize: '0.6rem', color: C.ink3 }}>{t.questionCount}Q</span>}
                            {t.accuracy != null && <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '8px', background: t.accuracy >= 70 ? C.greenLight : t.accuracy >= 50 ? C.goldLight : C.redLight, color: t.accuracy >= 70 ? C.green : t.accuracy >= 50 ? C.gold : C.red }}>{Math.round(t.accuracy)}%</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── TOPIC LEADERBOARD PREVIEW ── */}
              {sheetTopicId && topicLeaders.length > 0 && (
                <div style={{ marginBottom: '16px', background: C.goldLight, border: `1px solid ${C.gold}40`, borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontWeight: 800, fontSize: '0.78rem', color: C.goldDeep }}>
                    <Trophy size={14} /> Topic Masters
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topicLeaders.map((lb, idx) => {
                      const isMe = lb.user_id === user?.id;
                      return (
                        <div key={lb.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isMe ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.4)', padding: '6px 10px', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: idx === 0 ? C.goldDeep : C.ink3, width: '12px' }}>{idx + 1}.</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: isMe ? 800 : 600, color: C.ink }}>
                              {lb.user_profiles?.full_name || 'Anonymous'}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: C.green }}>{Math.round(lb.accuracy_pct)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Content source */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                {(['mixed', 'pyq', 'mock'] as ContentSource[]).map(cs => (
                  <button key={cs} onClick={() => setSheetContentSource(cs)}
                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1.5px solid`, borderColor: sheetContentSource === cs ? C.teal : C.border, background: sheetContentSource === cs ? C.tealLight : C.bg, color: sheetContentSource === cs ? C.teal : C.ink3, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {cs === 'mixed' ? '🔀 Mixed' : cs === 'pyq' ? '📄 PYQ' : '🏆 Mock'}
                  </button>
                ))}
              </div>

              {/* Question count */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em' }}>प्रश्नों की संख्या</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 800, color: C.teal }}>{sheetQCount}</span>
                </div>
                <input type="range"
                  min={1}
                  max={Math.max(1, sheetTopicId ? (sheetChapter.topics.find(t => t.id === sheetTopicId)?.questionCount || 15) : sheetChapter.questionCount)}
                  value={sheetQCount}
                  onChange={e => setSheetQCount(Number(e.target.value))}
                  style={{ width: '100%', accentColor: C.teal, cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px', fontSize: '0.6rem', color: C.ink3 }}>
                  <span>1</span>
                  <span>{Math.max(1, sheetTopicId ? (sheetChapter.topics.find(t => t.id === sheetTopicId)?.questionCount || 15) : sheetChapter.questionCount)} उपलब्ध</span>
                </div>
              </div>

              {/* Start button */}
              <button onClick={submitSheet} disabled={!!starting}
                style={{ width: '100%', background: `linear-gradient(135deg, ${C.teal} 0%, ${C.tealMid} 100%)`, color: 'white', border: 'none', borderRadius: '14px', padding: '16px', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: !!starting ? 0.7 : 1, boxShadow: `0 4px 20px ${C.teal}40` }}>
                <Play size={18} fill="white" />
                {starting ? 'शुरू हो रहा है...' : `${sheetQCount} प्रश्न शुरू करें`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exam Date Edit ── */}
      {showDateEdit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setShowDateEdit(false)}>
          <div style={{ background: C.surface, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '340px', boxShadow: '0 -8px 40px rgba(0,0,0,.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: C.ink, marginBottom: '6px' }}>परीक्षा की तारीख बदलें</div>
            <div style={{ fontSize: '0.75rem', color: C.ink3, marginBottom: '18px' }}>UPTET की अगली परीक्षा कब है?</div>
            <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: '10px', fontSize: '0.95rem', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '14px' }} />
            <button onClick={async () => {
              setExamDays(calcDays(dateInput));
              setShowDateEdit(false);
              if (user) await supabase.from('user_profiles').update({ target_exam_date: dateInput }).eq('id', user.id);
            }} style={{ width: '100%', background: C.teal, color: 'white', border: 'none', borderRadius: '10px', padding: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Save करें
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════ MAIN PAGE ════════════════════════════════ */}
      <div style={{ maxWidth: '960px', margin: '0 auto', fontFamily: "'DM Sans',system-ui,sans-serif", background: C.bg, minHeight: '100vh', paddingBottom: '90px' }}>

        {/* TOP BAR */}
        <div style={{ background: C.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, borderRadius: '0 0 20px 20px', marginBottom: '0', boxShadow: '0 4px 20px rgba(0,0,0,.2)' }}>
          <div style={{ color: 'white', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={18} color={C.goldMid} /> अभ्यास करें
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(profile?.streak_days ?? 0) > 0 && (
              <div style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`, color: 'white', fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Flame size={12} /> {profile!.streak_days}
              </div>
            )}
            <button onClick={() => setShowDateEdit(true)}
              style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: examDays < 30 ? '#f87171' : '#fbbf24', fontSize: '0.72rem', fontWeight: 700, padding: '5px 10px', borderRadius: '20px' }}>
              <Calendar size={12} />
              {examDays < 0 ? `Exam ${Math.abs(examDays)}d पहले` : `${examDays}d बाकी`}
              <Pencil size={10} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 14px 0' }}>

          {/* ── SEARCH BAR ── */}
          <div style={{ position: 'relative', marginBottom: '16px', zIndex: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: '14px', padding: '12px 14px', boxShadow: C.shadow }}>
              <Search size={18} color={C.ink3} style={{ flexShrink: 0 }} />
              <input 
                type="text" 
                placeholder="Search topics (e.g. समास, Number System)..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', marginLeft: '10px', fontSize: '0.9rem', color: C.ink, fontFamily: 'inherit' }}
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                  <X size={16} color={C.ink3} />
                </button>
              )}
            </div>
            
            {(searchQuery.trim() !== '') && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: C.surface, borderRadius: '14px', border: `1px solid ${C.border}`, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: '300px', overflowY: 'auto' }}>
                {isSearching ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: C.ink3, fontSize: '0.82rem', fontWeight: 600 }}>खोज रहे हैं...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(res => (
                    <button 
                      key={res.id} 
                      onClick={() => startSession('topic_practice', { topicId: res.id, limit: 15 })}
                      style={{ width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `1px solid ${C.border2}`, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: C.ink }}>
                        {res.name_hi || res.name_en}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: C.ink3, marginTop: '2px', fontWeight: 500 }}>
                        {res.chapters?.subjects?.name_hi || res.chapters?.subjects?.name_en} • {res.chapters?.name_hi || res.chapters?.name_en}
                      </div>
                    </button>
                  ))
                ) : (
                  <div style={{ padding: '16px', textAlign: 'center', color: C.ink3, fontSize: '0.82rem', fontWeight: 600 }}>कोई topic नहीं मिला।</div>
                )}
              </div>
            )}
          </div>

          {/* ── DAILY ACTION CARD ── */}
          <div style={{ background: `linear-gradient(135deg, ${C.ink} 0%, ${C.ink2} 100%)`, borderRadius: '20px', padding: '18px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 6px 24px rgba(0,0,0,.15)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: `linear-gradient(135deg, ${C.purple}, ${C.gold})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Zap size={22} color="white" fill="white" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'rgba(255,255,255,.6)', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>आज का लक्ष्य</div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem', marginTop: '2px' }}>Daily Challenge — 10 प्रश्न</div>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '0.68rem', marginTop: '2px' }}>Mixed syllabus · 10 min</div>
            </div>
            <button onClick={() => startSession('challenge', { limit: 10 })} disabled={starting === 'challenge'}
              style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`, color: 'white', border: 'none', borderRadius: '12px', padding: '10px 16px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, opacity: starting === 'challenge' ? 0.7 : 1, boxShadow: `0 4px 14px ${C.gold}50` }}>
              {starting === 'challenge' ? '⏳' : <><Play size={13} fill="white" /> Start</>}
            </button>
          </div>

          {/* ── QUICK ACTIONS ROW ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
            <button onClick={() => startSession('revision')} disabled={!!starting}
              style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: C.shadow }}>
              <span style={{ fontSize: '1.2rem' }}>🔖</span>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.ink }}>Revision</div>
                <div style={{ fontSize: '0.62rem', color: C.ink3, marginTop: '1px' }}>Bookmarks + Wrong</div>
              </div>
            </button>
            <button onClick={() => navigate('/mock-test')} disabled={!!starting}
              style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: C.shadow }}>
              <span style={{ fontSize: '1.2rem' }}>🏆</span>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: C.ink }}>Mock Test</div>
                <div style={{ fontSize: '0.62rem', color: C.ink3, marginTop: '1px' }}>150Q · Full exam</div>
              </div>
            </button>
          </div>

          {/* ── SUBJECT STRIP ── */}
          <div style={{ overflowX: 'auto', scrollbarWidth: 'none', marginBottom: '16px', marginLeft: '-14px', marginRight: '-14px', padding: '0 14px' }}>
            <div style={{ display: 'flex', gap: '8px', width: 'max-content' }}>
              {allSubjects.map(s => {
                const active = s.id === activeSubjectId;
                const acc = s.accuracy != null ? Math.round(s.accuracy) : null;
                return (
                  <button key={s.id} onClick={() => setActiveSubjectId(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 16px', borderRadius: '20px', whiteSpace: 'nowrap', border: `1.5px solid ${active ? C.ink : C.border}`, background: active ? C.ink : C.surface, color: active ? 'white' : C.ink2, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', boxShadow: active ? 'none' : C.shadow }}>
                    {s.name_hi || s.code}
                    {acc != null && <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: '10px', background: active ? 'rgba(255,255,255,.2)' : C.greenLight, color: active ? 'rgba(255,255,255,.85)' : C.green }}>{acc}%</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional subject picker */}
          {isOptionalActive && optionalSubs.length > 1 && (
            <div style={{ marginBottom: '16px', background: C.goldLight, border: `1px solid #fde68a`, borderRadius: '10px', padding: '10px 14px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: C.gold, marginBottom: '6px' }}>Language II — अपनी भाषा चुनें</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {optionalSubs.map(s => (
                  <button key={s.id} onClick={async () => {
                    await supabase.from('user_profiles').update({ subjects_opted: [s.id] }).eq('id', user!.id);
                    setActiveSubjectId(s.id);
                  }} style={{ padding: '6px 14px', borderRadius: '20px', border: `1.5px solid ${activeSubjectId === s.id ? C.gold : C.border}`, background: activeSubjectId === s.id ? C.gold : C.surface, color: activeSubjectId === s.id ? 'white' : C.ink2, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {s.code}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── SUBJECT PROGRESS HEADER ── */}
          {activeSubject && !loadingChapters && chapters.length > 0 && (
            <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: C.ink }}>{activeSubject.name_hi}</div>
                <div style={{ fontSize: '0.68rem', color: C.ink3, marginTop: '2px' }}>
                  {doneCount}/{chapters.length} chapters पूरे
                  {globalAcc != null && ` · ${globalAcc}% accuracy`}
                </div>
              </div>
              {/* Mini progress bar */}
              <div style={{ width: '80px' }}>
                <div style={{ height: '6px', background: C.border2, borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((doneCount / Math.max(chapters.length, 1)) * 100)}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.tealMid})`, borderRadius: '6px', transition: 'width .6s ease' }} />
                </div>
                <div style={{ fontSize: '0.6rem', color: C.ink3, marginTop: '3px', textAlign: 'right' }}>{Math.round((doneCount / Math.max(chapters.length, 1)) * 100)}%</div>
              </div>
            </div>
          )}

          {/* ── CHAPTER FILTERS ── */}
          {!loadingChapters && chapters.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '14px', marginBottom: '4px', scrollbarWidth: 'none' }}>
              {[
                { id: 'all', label: 'All Chapters' },
                { id: 'weak', label: 'Weak (<50%)' },
                { id: 'unpracticed', label: 'Unpracticed' },
                { id: 'completed', label: 'Completed' }
              ].map(f => {
                const isActive = chapterFilter === f.id;
                return (
                  <button key={f.id} onClick={() => setChapterFilter(f.id as any)}
                    style={{ whiteSpace: 'nowrap', padding: '6px 14px', borderRadius: '20px', border: isActive ? `1.5px solid ${C.teal}` : `1.5px solid ${C.border}`, background: isActive ? C.tealLight : C.surface, color: isActive ? C.teal : C.ink3, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── LEARNING PATH ── */}
          {loadingChapters && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: '70px', background: C.border2, borderRadius: '16px', animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          )}

          {!loadingChapters && chapters.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chapters.filter(ch => {
                if (chapterFilter === 'completed') return ch.completionPct >= 100;
                if (chapterFilter === 'unpracticed') return ch.attempted === 0;
                if (chapterFilter === 'weak') return ch.attempted > 0 && ch.accuracy < 50;
                return true;
              }).map((ch, idx, arr) => {
                const status = getStatus(ch);
                // When filtering, we don't want the visual locked state to confuse users
                const isLocked = chapterFilter === 'all' && status === 'not_started' && idx > 0 && getStatus(arr[idx - 1]) === 'not_started' && idx > (inProgressChapter ? arr.indexOf(inProgressChapter) + 3 : nextChapter ? arr.indexOf(nextChapter) + 2 : 2);
                return (
                  <ChapterNode
                    key={ch.id}
                    ch={ch}
                    status={status}
                    locked={isLocked}
                    starting={starting}
                    onTap={() => openSheet(ch)}
                    onStart={() => { setSheetQCount(Math.min(15, ch.questionCount)); openSheet(ch); }}
                  />
                );
              })}
            </div>
          )}

          {!loadingChapters && chapters.length === 0 && activeSubjectId && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: C.ink3, fontSize: '0.9rem', background: C.surface, borderRadius: '14px', border: `1px dashed ${C.border}` }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
              इस विषय के लिए प्रश्न उपलब्ध नहीं हैं
            </div>
          )}

        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}} @keyframes ringPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(1.04)}}`}</style>
    </>
  );
}

/* ─── Chapter Node (Duolingo-style) ──────────────────────────────── */
function ChapterNode({ ch, status, locked, starting, onTap, onStart }: {
  ch: Chapter;
  status: 'done' | 'in_progress' | 'not_started';
  locked: boolean;
  starting: string | null;
  onTap: () => void;
  onStart: () => void;
}) {
  const ringColor = status === 'done' ? C.green : status === 'in_progress' ? C.gold : locked ? '#ccc' : C.teal;
  const ringBg = '#e5e1d5';
  const cardBg = status === 'in_progress' ? C.goldLight : status === 'done' ? C.greenLight : C.surface;
  const cardBorder = status === 'in_progress' ? `${C.gold}60` : status === 'done' ? `${C.green}40` : C.border;
  const isStarting = starting === ch.id;

  return (
    <div
      onClick={locked ? undefined : onTap}
      style={{
        background: cardBg, border: `1.5px solid ${cardBorder}`, borderRadius: '16px',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px',
        cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.45 : 1,
        boxShadow: status === 'in_progress' ? `0 4px 20px ${C.gold}20` : C.shadow,
        transition: 'transform .12s, box-shadow .12s',
      }}
      onMouseEnter={e => { if (!locked) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; }}
    >
      {/* Ring */}
      <Ring pct={ch.completionPct} size={52} color={ringColor} bg={ringBg}>
        {status === 'done'
          ? <CheckCircle2 size={16} color={C.green} fill={C.greenLight} />
          : locked
            ? <Lock size={13} color="#bbb" />
            : <span style={{ fontSize: '0.68rem', fontWeight: 800, color: status === 'in_progress' ? C.gold : C.ink3 }}>{ch.sort_order}</span>
        }
      </Ring>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ch.name_hi}
        </div>
        <div style={{ fontSize: '0.65rem', color: C.ink3, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{ch.topicCount} topics</span>
          <span>·</span>
          <span>{ch.questionCount} प्रश्न</span>
          {ch.accuracy > 0 && (
            <>
              <span>·</span>
              <span style={{ color: ch.accuracy >= 70 ? C.green : ch.accuracy >= 50 ? C.gold : C.red, fontWeight: 700 }}>{ch.accuracy}%</span>
            </>
          )}
        </div>
        {/* Thin progress bar */}
        {status !== 'not_started' && (
          <div style={{ height: '3px', background: C.border2, borderRadius: '3px', overflow: 'hidden', marginTop: '7px', maxWidth: '140px' }}>
            <div style={{ height: '100%', width: `${ch.completionPct}%`, background: `linear-gradient(90deg, ${ringColor}, ${ringColor}cc)`, borderRadius: '3px', transition: 'width .6s ease' }} />
          </div>
        )}
      </div>

      {/* CTA */}
      {!locked && (
        <button
          onClick={e => { e.stopPropagation(); onStart(); }}
          disabled={!!isStarting}
          style={{
            background: status === 'in_progress' ? `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})` : status === 'done' ? `linear-gradient(135deg, ${C.green}, #1a5c28)` : `linear-gradient(135deg, ${C.teal}, ${C.tealMid})`,
            color: 'white', border: 'none', borderRadius: '10px', padding: '9px 13px',
            fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, whiteSpace: 'nowrap',
            boxShadow: `0 3px 12px ${status === 'in_progress' ? C.gold : C.teal}35`,
            opacity: isStarting ? 0.7 : 1,
            animation: status === 'in_progress' ? 'ringPulse 2.5s infinite' : 'none',
          }}>
          {isStarting ? '⏳' : status === 'done' ? '↩ Revise' : status === 'in_progress' ? <><Play size={12} fill="white" /> जारी</> : <><Play size={12} fill="white" /> शुरू</>}
        </button>
      )}
    </div>
  );
}
