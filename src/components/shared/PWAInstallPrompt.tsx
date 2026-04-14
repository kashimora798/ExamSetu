import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'examsetu.pwa.install.dismissed';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isStandalone) {
      setInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (localStorage.getItem(DISMISS_KEY) !== '1') {
        setTimeout(() => setVisible(true), 2500);
      }
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferredPrompt(null);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
      setVisible(false);
      localStorage.removeItem(DISMISS_KEY);
    } else {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, '1');
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  if (!visible || installed || !deferredPrompt) return null;

  return (
    <div style={{ position: 'fixed', left: '16px', right: '16px', bottom: '16px', zIndex: 9999, maxWidth: '480px', margin: '0 auto', background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)', border: '1px solid #dbeafe', borderRadius: '20px', boxShadow: '0 20px 50px rgba(15,52,96,0.18)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 16px 14px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: 'linear-gradient(135deg, #1a6b5a, #0f3460)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Smartphone size={22} color="white" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.12em', color: '#1a6b5a', textTransform: 'uppercase' }}>Install App</span>
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#132019', marginBottom: '4px' }}>Get the app feel on your home screen</div>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.5, color: '#52606d' }}>Install ExamSetu for faster access, smoother practice sessions, and a native-style experience.</div>
        </div>
        <button onClick={handleDismiss} aria-label="Dismiss install prompt" style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#94a3b8' }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: '10px', padding: '0 16px 16px' }}>
        <button onClick={handleInstall} style={{ flex: 1, border: 'none', borderRadius: '14px', background: 'linear-gradient(135deg, #1a6b5a, #0f3460)', color: 'white', fontWeight: 800, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Download size={16} /> Install App
        </button>
      </div>
    </div>
  );
}
