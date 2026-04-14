import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import {
  Bookmark, BookmarkX, ChevronDown, ChevronUp, Filter,
  Play, Crown, ArrowRight, CheckCircle2, XCircle, Search,
} from 'lucide-react';

interface BookmarkedQ {
  id: string;
  question_id: string;
  created_at: string;
  collection: string;
  questions: {
    id: string;
    question_hi: string;
    question_en: string;
    options: Record<string, string>;
    correct_option: string;
    difficulty: string;
    topics?: { name_hi: string; name_en: string; chapters?: { name_hi: string; name_en: string; subjects?: { name_hi: string; name_en: string } } };
  } | null;
}

const FREE_LIMIT = 20;

export default function BookmarksPage() {
  const { user } = useAuth();
  const { isPro, isFree } = useSubscription();
  const navigate = useNavigate();

  const [bookmarks, setBookmarks] = useState<BookmarkedQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [startingSession, setStartingSession] = useState(false);

  useEffect(() => { if (user) loadBookmarks(); }, [user]);

  const loadBookmarks = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('bookmarks')
        .select(`
          id, question_id, created_at, collection,
          questions (
            id, question_hi, question_en, options, correct_option, difficulty,
            topics (name_hi, name_en, chapters (name_hi, name_en, subjects (name_hi, name_en)))
          )
        `)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      setBookmarks((data || []) as BookmarkedQ[]);
    } catch (err) {
      console.error('Bookmarks load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeBookmark = async (bookmarkId: string, questionId: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
    try {
      await supabase.from('bookmarks').delete().eq('id', bookmarkId).eq('user_id', user!.id);
    } catch {
      // Reload on error
      loadBookmarks();
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const startRevisionSession = async () => {
    const qIds = filtered.map(b => b.question_id);
    if (qIds.length === 0) return;
    setStartingSession(true);
    try {
      const { data: session, error } = await supabase.from('practice_sessions').insert({
        user_id: user!.id,
        session_type: 'revision',
        filters: { bookmarkIds: qIds, source: 'bookmarks' },
        total_questions: qIds.length,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      }).select().single();

      if (error) throw error;
      navigate(`/practice/${session.id}`);
    } catch (err) {
      console.error('Session start error:', err);
      setStartingSession(false);
    }
  };

  // Get unique subjects for filter
  const subjects = [...new Set(
    bookmarks.map(b => b.questions?.topics?.chapters?.subjects?.name_hi || b.questions?.topics?.chapters?.subjects?.name_en).filter(Boolean) as string[]
  )];

  // Filtered list
  const filtered = bookmarks.filter(b => {
    const q = b.questions;
    if (!q) return false;
    if (search) {
      const text = (q.question_hi || q.question_en || '').toLowerCase();
      if (!text.includes(search.toLowerCase())) return false;
    }
    if (subjectFilter !== 'all') {
      const subName = q.topics?.chapters?.subjects?.name_hi || q.topics?.chapters?.subjects?.name_en || '';
      if (subName !== subjectFilter) return false;
    }
    return true;
  });

  const difficultyColor: Record<string, string> = { easy: '#16a34a', medium: '#d97706', hard: '#dc2626' };
  const difficultyBg: Record<string, string> = { easy: '#f0fdf4', medium: '#fffbeb', hard: '#fef2f2' };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '48px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontWeight: 900, fontSize: '1.75rem', color: '#111827', display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 4px' }}>
            <Bookmark size={26} color="#f59e0b" /> Bookmarks
          </h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.9rem' }}>
            {loading ? 'Loading...' : `${bookmarks.length}${isFree ? `/${FREE_LIMIT}` : ''} saved questions`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Free limit bar */}
          {isFree && !loading && (
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '8px 14px', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
              {bookmarks.length}/{FREE_LIMIT}
              <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '999px', marginTop: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (bookmarks.length / FREE_LIMIT) * 100)}%`, background: bookmarks.length >= FREE_LIMIT ? '#ef4444' : '#f59e0b', borderRadius: '999px' }} />
              </div>
            </div>
          )}
          {/* Revision start */}
          {filtered.length > 0 && (
            <button onClick={startRevisionSession} disabled={startingSession}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(99,102,241,0.3)', opacity: startingSession ? 0.7 : 1 }}>
              <Play size={16} fill="white" /> {startingSession ? '...' : `Revise (${filtered.length})`}
            </button>
          )}
        </div>
      </div>

      {/* ── Search + Filter bar ── */}
      {bookmarks.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Questions search करें..."
              style={{ width: '100%', paddingLeft: '40px', paddingRight: '16px', paddingTop: '11px', paddingBottom: '11px', border: '1px solid #e5e7eb', borderRadius: '12px', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', background: 'white', color: '#111827', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>
          {subjects.length > 1 && (
            <button onClick={() => setShowFilters(!showFilters)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '11px 16px', background: showFilters ? '#eef2ff' : 'white', border: `1px solid ${showFilters ? '#6366f1' : '#e5e7eb'}`, borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', color: showFilters ? '#6366f1' : '#374151', fontWeight: 600, fontSize: '0.875rem' }}>
              <Filter size={16} /> Filter
            </button>
          )}
        </div>
      )}

      {/* ── Subject filters ── */}
      {showFilters && subjects.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['all', ...subjects].map(s => (
            <button key={s} onClick={() => setSubjectFilter(s)}
              style={{ padding: '7px 16px', borderRadius: '999px', border: '2px solid', borderColor: subjectFilter === s ? '#6366f1' : '#e5e7eb', background: subjectFilter === s ? '#6366f1' : 'white', color: subjectFilter === s ? 'white' : '#374151', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              {s === 'all' ? 'सभी' : s}
            </button>
          ))}
        </div>
      )}

      {/* ── Free limit warning ── */}
      {isFree && bookmarks.length >= FREE_LIMIT && (
        <div style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #fde68a', borderRadius: '16px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Crown size={22} color="#f59e0b" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#92400e', fontSize: '0.9rem' }}>Bookmark limit पूरी हो गई!</div>
            <div style={{ fontSize: '0.75rem', color: '#a16207', marginTop: '2px' }}>Pro में unlimited bookmarks + AI explanations</div>
          </div>
          <Link to="/pricing" style={{ background: '#f59e0b', color: 'white', fontWeight: 800, padding: '10px 18px', borderRadius: '12px', textDecoration: 'none', fontSize: '0.82rem', flexShrink: 0 }}>Upgrade</Link>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '80px', borderRadius: '16px' }} />)}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && bookmarks.length === 0 && (
        <div style={{ background: 'white', border: '2px dashed #e5e7eb', borderRadius: '24px', padding: '60px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>📚</div>
          <h3 style={{ fontWeight: 900, color: '#111827', margin: '0 0 8px', fontSize: '1.25rem' }}>कोई bookmark नहीं</h3>
          <p style={{ color: '#6b7280', margin: '0 0 24px', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Practice करते समय questions को bookmark करें — वो यहाँ दिखेंगे।
          </p>
          <Link to="/practice" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 28px', background: '#6366f1', color: 'white', fontWeight: 900, borderRadius: '14px', textDecoration: 'none', fontSize: '0.9rem', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
            Practice शुरू करें <ArrowRight size={18} />
          </Link>
        </div>
      )}

      {/* ── No results from filter ── */}
      {!loading && bookmarks.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔍</div>
          <p style={{ margin: 0, fontWeight: 600 }}>कोई result नहीं — filter change करें</p>
        </div>
      )}

      {/* ── Bookmarks List ── */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((bm, idx) => {
            const q = bm.questions;
            if (!q) return null;
            const isOpen = expanded.has(bm.id);
            const subjectName = q.topics?.chapters?.subjects?.name_hi || q.topics?.chapters?.subjects?.name_en || '';
            const topicName = q.topics?.name_hi || q.topics?.name_en || '';
            const diff = (q.difficulty || 'medium') as string;

            return (
              <div key={bm.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px 18px', cursor: 'pointer' }} onClick={() => toggleExpand(bm.id)}>
                  <div style={{ width: '28px', height: '28px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 800, color: '#6b7280' }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p lang="hi" style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem', lineHeight: 1.65, margin: '0 0 8px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: isOpen ? 'none' : 2, WebkitBoxOrient: 'vertical' as any }}>
                      {q.question_hi || q.question_en}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      {subjectName && <span style={{ background: '#eef2ff', color: '#4338ca', borderRadius: '999px', padding: '2px 10px', fontSize: '0.65rem', fontWeight: 700 }}>{subjectName}</span>}
                      {topicName && <span style={{ background: '#f9fafb', color: '#6b7280', borderRadius: '999px', padding: '2px 10px', fontSize: '0.65rem', fontWeight: 600, border: '1px solid #e5e7eb' }}>{topicName}</span>}
                      <span style={{ background: difficultyBg[diff] || '#f9fafb', color: difficultyColor[diff] || '#6b7280', borderRadius: '999px', padding: '2px 10px', fontSize: '0.65rem', fontWeight: 700 }}>
                        {diff === 'easy' ? 'Easy' : diff === 'medium' ? 'Medium' : 'Hard'}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#d1d5db', marginLeft: 'auto' }}>{new Date(bm.created_at).toLocaleDateString('hi-IN')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button onClick={e => { e.stopPropagation(); removeBookmark(bm.id, bm.question_id); }}
                      title="Remove bookmark"
                      style={{ width: '32px', height: '32px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#dc2626', flexShrink: 0 }}>
                      <BookmarkX size={15} />
                    </button>
                    <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* Expanded answer */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 18px', background: '#fafafa' }}>
                    {/* Options */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                      {Object.entries(q.options || {}).map(([key, val]) => {
                        const isCorrect = key === q.correct_option;
                        return (
                          <div key={key} style={{ background: isCorrect ? '#f0fdf4' : 'white', border: `1.5px solid ${isCorrect ? '#86efac' : '#e5e7eb'}`, borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '6px', border: `2px solid ${isCorrect ? '#16a34a' : '#e5e7eb'}`, background: isCorrect ? '#16a34a' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {isCorrect ? <CheckCircle2 size={12} color="white" /> : <span style={{ fontWeight: 800, fontSize: '0.65rem', color: '#9ca3af' }}>{key}</span>}
                            </div>
                            <span lang="hi" style={{ fontSize: '0.8rem', color: isCorrect ? '#15803d' : '#374151', fontWeight: isCorrect ? 700 : 500, lineHeight: 1.5 }}>{val as string}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Link to={`/practice?mode=topic_practice&topic=${q.topics ? encodeURIComponent(JSON.stringify({ topicId: q.topics })) : ''}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#6366f1', color: 'white', borderRadius: '10px', fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none' }}>
                        <Play size={13} fill="white" /> Topic Practice
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
