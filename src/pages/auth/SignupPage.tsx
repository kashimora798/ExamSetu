import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Mail } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import './AuthPages.css';

export default function SignupPage() {
  const { signInWithGoogle, signInWithMagicLink, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await signInWithMagicLink(email);
    if (err) {
      setError(err);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="auth-page" id="signup-page">
      <div className="auth-card card-elevated">
        <Link to="/" className="auth-logo">
          <div className="logo-icon">
            <BookOpen size={22} strokeWidth={2.5} />
          </div>
          <span className="logo-hindi" lang="hi">शिक्षासेतु</span>
        </Link>

        <h2 lang="hi">तैयारी शुरू करें 🚀</h2>
        <p className="auth-subtitle">Create your free account in 10 seconds</p>

        {sent ? (
          <div className="auth-magic-sent">
            <div style={{ fontSize: '3rem' }}>📬</div>
            <h3 lang="hi">Magic Link भेज दिया!</h3>
            <p lang="hi" style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
              <strong>{email}</strong> पर जाकर link पर click करें
            </p>
          </div>
        ) : (
          <>
            <button className="btn auth-google-btn" id="google-signup-btn" onClick={signInWithGoogle}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span lang="hi">Google से Sign Up करें</span>
            </button>

            <div className="auth-divider"><span>or</span></div>

            <form className="auth-form" onSubmit={handleMagicLink}>
              <div className="form-group">
                <label htmlFor="signup-email">Email</label>
                <div className="auth-input-wrapper">
                  <Mail size={18} />
                  <input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              {error && (
                <p style={{ color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</p>
              )}
              <button type="submit" className="btn btn-gold" style={{ width: '100%' }} disabled={loading}>
                <span lang="hi">{loading ? 'भेज रहे हैं...' : 'Free Account बनाएं'}</span>
              </button>
            </form>
          </>
        )}

        <p className="auth-switch">
          <span lang="hi">पहले से account है? </span>
          <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}
