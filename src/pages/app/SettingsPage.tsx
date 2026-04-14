import { useState } from 'react';
import { Settings, Bell, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const [lang, setLang] = useState(profile?.preferred_lang ?? 'hi');

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
            onClick={() => setLang('hi')}
            style={{ flex: 1 }}
          >
            हिंदी
          </button>
          <button
            className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setLang('en')}
            style={{ flex: 1 }}
          >
            English
          </button>
        </div>
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
