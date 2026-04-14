import { Component, type ReactNode } from 'react';
import { trackError } from '../../lib/telemetry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error) {
    trackError(error, { source: 'react-error-boundary' }).catch(() => {});
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'var(--bg)' }}>
          <div style={{ maxWidth: '460px', width: '100%', background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '28px', boxShadow: '0 16px 40px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚠️</div>
            <h1 style={{ margin: '0 0 8px', color: '#111827', fontWeight: 900, fontSize: '1.35rem' }}>Something went wrong</h1>
            <p style={{ margin: '0 0 20px', color: '#6b7280', lineHeight: 1.6 }}>
              We hit an unexpected error. Refresh the page and try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '12px 18px', borderRadius: '12px', border: 'none', background: '#111827', color: 'white', fontWeight: 800, cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
