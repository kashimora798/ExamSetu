import { useEffect, useMemo, useState } from 'react';
import { Settings, Bell, Shield, LogOut, UserCircle2, Target, Flame, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';

export default function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const {
    tier,
    isPro,
    isGrandfatheredFree,
    launchAccessExpiresAt,
    mockTestLimit,
    bookmarkLimit,
    loading: subscriptionLoading,
  } = useSubscription();
  const [lang, setLang] = useState<'hi' | 'en'>(profile?.preferred_lang ?? 'hi');
  const [savingLang, setSavingLang] = useState(false);
  const [langSaved, setLangSaved] = useState(false);

  useEffect(() => {
    setLang(profile?.preferred_lang ?? 'hi');
  }, [profile?.preferred_lang]);

  const attempted = profile?.total_questions_attempted ?? 0;
  const correct = profile?.total_correct ?? 0;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
  const profileCompletion = useMemo(() => {
    let score = 0;
    if (profile?.full_name) score += 25;
    if (profile?.phone) score += 20;
    if (profile?.target_exam_id) score += 20;
    if (profile?.target_paper) score += 15;
    if (profile?.target_exam_date) score += 20;
    return score;
  }, [profile]);

  const fmtDate = (value?: string | null) => {
    if (!value) return 'Not set';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Not set';
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const saveLanguage = async () => {
    if (!user) return;
    setSavingLang(true);
    setLangSaved(false);
    const { error } = await supabase
      .from('user_profiles')
      .update({ preferred_lang: lang })
      .eq('id', user.id);
    setSavingLang(false);
    if (!error) {
      setLangSaved(true);
      window.setTimeout(() => setLangSaved(false), 2000);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Settings size={28} />
        <span lang="hi">सेटिंग्स</span>
      </h1>

      {/* Profile Section */}
      <div className="card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <div style={{
            width: 52, height: 52,
            borderRadius: 'var(--radius-full)',
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', fontWeight: 700,
          }}>
            {(profile?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
          </div>
          <div>
            <h4>{profile?.full_name || 'Student'}</h4>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{user?.email}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Phone</p>
            <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{profile?.phone || 'Not added'}</p>
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Role</p>
            <p style={{ margin: '4px 0 0', fontWeight: 600, textTransform: 'capitalize' }}>{profile?.role || 'aspirant'}</p>
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Joined</p>
            <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{fmtDate(user?.created_at)}</p>
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Profile completion</p>
            <p style={{ margin: '4px 0 0', fontWeight: 700, color: profileCompletion >= 80 ? 'var(--success)' : 'var(--primary)' }}>{profileCompletion}%</p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--ink2)' }}>
            <Target size={16} />
            <span>Target Exam Date: <strong>{fmtDate(profile?.target_exam_date)}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--ink2)' }}>
            <CalendarDays size={16} />
            <span>Target Paper: <strong>{profile?.target_paper ?? 'Not selected'}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--ink2)' }}>
            <Flame size={16} />
            <span>Current Streak: <strong>{profile?.streak_days ?? 0} days</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--ink2)' }}>
            <UserCircle2 size={16} />
            <span>Last Active: <strong>{fmtDate(profile?.last_active_at)}</strong></span>
          </div>
        </div>
      </div>

      {/* Study Snapshot */}
      <div className="card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <CheckCircle2 size={20} style={{ color: 'var(--primary)' }} />
          <h4>Study Snapshot</h4>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
          <div style={{ textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Attempted</p>
            <p style={{ margin: '4px 0 0', fontWeight: 800, fontSize: '1.1rem' }}>{attempted}</p>
          </div>
          <div style={{ textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Correct</p>
            <p style={{ margin: '4px 0 0', fontWeight: 800, fontSize: '1.1rem' }}>{correct}</p>
          </div>
          <div style={{ textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Accuracy</p>
            <p style={{ margin: '4px 0 0', fontWeight: 800, fontSize: '1.1rem' }}>{accuracy}%</p>
          </div>
        </div>
      </div>

      {/* Plan Section */}
      <div className="card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Shield size={20} style={{ color: 'var(--primary)' }} />
            <h4>Current Plan</h4>
          </div>
          <span style={{
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: isPro ? 'rgba(22,163,74,0.12)' : 'rgba(99,102,241,0.12)',
            color: isPro ? 'var(--success)' : 'var(--primary)',
            border: `1px solid ${isPro ? 'rgba(22,163,74,0.25)' : 'rgba(99,102,241,0.25)'}`,
          }}>
            {subscriptionLoading ? 'Loading...' : isPro ? 'PRO' : 'FREE'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Plan Type</p>
            <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{subscriptionLoading ? 'Loading...' : tier.toUpperCase()}</p>
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Launch Access</p>
            <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{isGrandfatheredFree ? 'Enabled' : 'Standard'}</p>
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Mock Test Limit</p>
            <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{mockTestLimit === Infinity ? 'Unlimited' : mockTestLimit}</p>
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Bookmark Limit</p>
            <p style={{ margin: '4px 0 0', fontWeight: 700 }}>{bookmarkLimit === Infinity ? 'Unlimited' : bookmarkLimit}</p>
          </div>
        </div>

        {isGrandfatheredFree && launchAccessExpiresAt && (
          <p style={{ marginTop: '10px', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
            Launch premium access valid till <strong>{fmtDate(launchAccessExpiresAt)}</strong>
          </p>
        )}
      </div>

      {/* Language Preference */}
      <div className="card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <Bell size={20} style={{ color: 'var(--primary)' }} />
          <h4 lang="hi">भाषा प्राथमिकता</h4>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            className={`btn ${lang === 'hi' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setLang('hi' as const)}
            style={{ flex: 1 }}
          >
            हिंदी
          </button>
          <button
            className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setLang('en' as const)}
            style={{ flex: 1 }}
          >
            English
          </button>
        </div>
        <button
          className="btn btn-primary"
          onClick={saveLanguage}
          disabled={savingLang || !user || lang === (profile?.preferred_lang ?? 'hi')}
          style={{ width: '100%', marginTop: 'var(--space-3)' }}
        >
          <span>{savingLang ? 'Saving...' : 'Save Language Preference'}</span>
        </button>
        {langSaved && (
          <p style={{ marginTop: '8px', fontSize: 'var(--text-xs)', color: 'var(--success)' }}>Language preference saved.</p>
        )}
      </div>

      {/* Account section */}
      <div className="card" style={{ padding: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <Shield size={20} style={{ color: 'var(--primary)' }} />
          <h4>Account</h4>
        </div>
        <button
          className="btn btn-ghost"
          onClick={signOut}
          style={{
            width: '100%',
            color: 'var(--error)',
            borderColor: 'rgba(192,57,43,0.2)',
          }}
        >
          <LogOut size={18} />
          <span lang="hi">Logout</span>
        </button>
      </div>
    </div>
  );
}
