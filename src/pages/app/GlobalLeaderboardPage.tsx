import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Trophy, Medal, Flame } from 'lucide-react';
import { useShareCard } from '../../hooks/useShareCard';
import ShareCardTemplate from '../../components/shared/ShareCardTemplate';
import SharePreviewModal from '../../components/shared/SharePreviewModal';

const C = {
  ink: '#1a1814', ink2: '#3a3628', ink3: '#8a8370',
  gold: '#c8860a', goldLight: '#fcf8ec', goldDeep: '#8c5905',
  surface: '#ffffff', border: '#e5e1d5', bg: '#f7f5f0'
};

export default function GlobalLeaderboardPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'mock' | 'subject'>('mock');
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const { isSharing, shareElement, sharePreview, closeSharePreview, downloadSharePreview, sharePreviewNative } = useShareCard();

  // Subject tab state
  const [subjects, setSubjects] = useState<any[]>([]);
  const [activeSubject, setActiveSubject] = useState<string>('');
  const myRankIndex = leaders.findIndex(lb => lb.user_id === user?.id);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

  const handleShareRank = async () => {
    if (!shareCardRef.current || !myRank) return;
    await shareElement(shareCardRef.current, {
      kind: 'rank',
      userId: user?.id,
      filename: 'uptet-rank-card.png',
      title: 'My Leaderboard Rank',
      payload: {
        rank: myRank,
        accuracy: tab === 'mock' ? Math.round((leaders[myRankIndex]?.score || 0) / Math.max(leaders[myRankIndex]?.total_questions || 1, 1) * 100) : Math.round(leaders[myRankIndex]?.accuracy_pct || 0),
      },
    });
  };

  useEffect(() => {
    if (tab === 'mock') {
      loadMockLeaders();
    } else {
      if (subjects.length === 0) loadSubjects();
      else loadSubjectLeaders(activeSubject);
    }
  }, [tab, activeSubject]);

  const loadSubjects = async () => {
    const { data } = await supabase.from('subjects').select('id, name_en, name_hi').order('sort_order').limit(10);
    if (data && data.length > 0) {
      setSubjects(data);
      setActiveSubject(data[0].id);
    }
  };

  const loadSubjectLeaders = async (subjectId: string) => {
    if (!subjectId) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('user_subject_stats')
        .select(`user_id, accuracy_pct, attempts, user_profiles(full_name, avatar_url)`)
        .eq('subject_id', subjectId)
        .gte('attempts', 0) // Allows showing dummy data easily
        .order('accuracy_pct', { ascending: false })
        .order('attempts', { ascending: false })
        .limit(50);
      setLeaders(data || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadMockLeaders = async () => {
    setLoading(true);
    try {
      // In a real app we might aggregate total XP or mock scores via an RPC.
      // Here we will do a proxy: top scores across practice sessions.
      // Since it's a proxy for global XP, we'll fetch mock_test sessions
      const { data } = await supabase.from('practice_sessions')
        .select(`user_id, score, total_questions, time_taken_secs, user_profiles(full_name, avatar_url)`)
        .eq('session_type', 'mock_test')
        .eq('status', 'completed')
        .order('score', { ascending: false })
        .order('time_taken_secs', { ascending: true })
        .limit(100);

      const seen = new Set();
      const dedupedCtx = [];
      for (const row of (data || [])) {
        if (!seen.has(row.user_id)) {
          seen.add(row.user_id);
          dedupedCtx.push(row);
        }
      }
      setLeaders(dedupedCtx.slice(0, 50));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', fontFamily: "'DM Sans', sans-serif", paddingBottom: '100px' }}>
      <div style={{ background: `linear-gradient(135deg, ${C.gold} 0%, #a46d03 100%)`, borderRadius: '20px', padding: '30px 24px', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 8px 30px rgba(200, 134, 10, 0.25)', marginBottom: '20px' }}>
        <Trophy size={48} color="#fcf8ec" style={{ marginBottom: '16px' }} />
        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
          Global Leaderboard
        </h1>
        <p style={{ margin: '8px 0 0', opacity: 0.85, fontSize: '0.9rem', maxWidth: '400px' }}>
          Compete with thousands of upcoming UPTET candidates. Complete mock tests to rank up!
        </p>
        {myRank && (
          <button onClick={handleShareRank} disabled={isSharing}
            style={{ marginTop: '16px', border: 'none', background: 'white', color: C.goldDeep, borderRadius: '999px', padding: '10px 18px', fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 8px 18px rgba(0,0,0,0.12)' }}>
            Share My Rank
          </button>
        )}
      </div>

      <div style={{ display: 'flex', background: C.surface, borderRadius: '12px', padding: '4px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: `1px solid ${C.border}` }}>
        <button onClick={() => setTab('mock')} style={{ flex: 1, padding: '12px', border: 'none', background: tab === 'mock' ? C.bg : 'transparent', borderRadius: '8px', fontWeight: tab === 'mock' ? 800 : 600, color: tab === 'mock' ? C.ink : C.ink3, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', boxShadow: tab === 'mock' ? '0 1px 3px rgba(0,0,0,.05)' : 'none' }}>
          🏆 Mock Tests
        </button>
        <button onClick={() => setTab('subject')} style={{ flex: 1, padding: '12px', border: 'none', background: tab === 'subject' ? C.bg : 'transparent', borderRadius: '8px', fontWeight: tab === 'subject' ? 800 : 600, color: tab === 'subject' ? C.ink : C.ink3, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', boxShadow: tab === 'subject' ? '0 1px 3px rgba(0,0,0,.05)' : 'none' }}>
          🎯 Subject Accuracy
        </button>
      </div>

      {tab === 'subject' && subjects.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <select 
            value={activeSubject} 
            onChange={e => setActiveSubject(e.target.value)}
            style={{ width: '100%', padding: '14px', borderRadius: '12px', border: `1.5px solid ${C.border}`, fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 700, color: C.ink, background: C.surface, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
          >
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name_hi || s.name_en}</option>)}
          </select>
        </div>
      )}

      <div style={{ position: 'fixed', left: '-9999px', top: 0, width: '420px', opacity: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={shareCardRef}>
          <ShareCardTemplate
            kind="rank"
            title="Leaderboard Rank"
            subtitle={myRank ? `You are currently ranked #${myRank} on the ${tab === 'mock' ? 'mock test' : 'subject accuracy'} board. Keep climbing with every session.` : 'Complete a mock test to earn a leaderboard rank and start climbing.'}
            primaryValue={myRank ? `#${myRank}` : '—'}
            primaryLabel={tab === 'mock' ? 'Mock board rank' : 'Subject board rank'}
            brand="ExamSetu"
            footer="Consistency wins leaderboards. Share your progress and inspire others."
            detailRows={[
              { label: 'Board', value: tab === 'mock' ? 'Mock tests' : 'Subject accuracy' },
              { label: 'Visible Rank', value: myRank ? `#${myRank}` : 'Unranked' },
              { label: 'Brand', value: 'ExamSetu' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ width: '40px', height: '40px', border: `4px solid ${C.border}`, borderTopColor: C.gold, borderRadius: '50%', animation: 'spinCW 0.8s linear infinite', margin: '0 auto 16px' }} />
        </div>
      ) : leaders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', background: C.surface, borderRadius: '16px', border: `1px solid ${C.border}` }}>
          <Flame size={32} color={C.ink3} style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.1rem', color: C.ink, margin: '0 0 6px' }}>No rankings yet</h2>
          <p style={{ color: C.ink3, margin: 0, fontSize: '0.85rem' }}>Be the first to complete a mock test and secure Rank #1!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {leaders.map((lb, idx) => {
            const isMe = lb.user_id === user?.id;
            const rank = idx + 1;
            
            let rankBadge;
            if (rank === 1) rankBadge = <div style={{ background: '#FFD700', color: '#8c5905', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}><Medal size={20} /></div>;
            else if (rank === 2) rankBadge = <div style={{ background: '#E0E0E0', color: '#686868', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}><Medal size={20} /></div>;
            else if (rank === 3) rankBadge = <div style={{ background: '#cd7f32', color: '#5c3611', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}><Medal size={20} /></div>;
            else rankBadge = <div style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: C.ink3 }}>{rank}</div>;

            return (
              <div key={lb.user_id} style={{ display: 'flex', alignItems: 'center', padding: '16px', background: isMe ? C.goldLight : C.surface, border: `1.5px solid ${isMe ? C.gold : C.border}`, borderRadius: '16px', transition: 'transform 0.2s', ...(isMe ? { boxShadow: '0 4px 15px rgba(200, 134, 10, 0.15)', transform: 'scale(1.01)' } : {}) }}>
                {rankBadge}
                
                <div style={{ marginLeft: '16px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: C.ink }}>
                      {lb.user_profiles?.full_name || 'Anonymous User'}
                    </span>
                    {isMe && <span style={{ background: C.gold, color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>You</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: C.ink3, marginTop: '2px' }}>
                    {tab === 'mock' 
                      ? `Mock Score: ${lb.score}/${lb.total_questions}` 
                      : `${lb.attempts} Questions Attempted`}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: isMe ? C.goldDeep : C.ink }}>
                    {tab === 'mock' ? Math.round((lb.score / (lb.total_questions || 1)) * 100) : Math.round(lb.accuracy_pct)}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: C.ink3, fontWeight: 700 }}>{tab === 'mock' ? 'Avg Score' : 'Accuracy'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <SharePreviewModal
        open={sharePreview.open}
        title={sharePreview.title}
        text={sharePreview.text}
        imageUrl={sharePreview.imageUrl}
        onClose={closeSharePreview}
        onDownload={downloadSharePreview}
        onNativeShare={sharePreviewNative}
      />
      <style>{`@keyframes spinCW { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
