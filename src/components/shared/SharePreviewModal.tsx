import { Download, Share2, X, MessageCircle, Send, AtSign, Copy } from 'lucide-react';
import Icon8Illustration from './Icon8Illustration';
import { useToast } from '../../hooks/useToast';

interface SharePreviewModalProps {
  status?: 'idle' | 'loading' | 'success' | 'error';
  open: boolean;
  title: string;
  text: string;
  imageUrl: string | null;
  onClose: () => void;
  onDownload: () => void;
  onNativeShare: () => Promise<void>;
}

export default function SharePreviewModal({
  status = 'idle',
  open,
  title,
  text,
  imageUrl,
  onClose,
  onDownload,
  onNativeShare,
}: SharePreviewModalProps) {
  const { showToast } = useToast();
  
  if (!open) return null;

  const encodedText = encodeURIComponent(text);
  const shareUrl = encodeURIComponent(window.location.origin);

  const handlePlatformShare = (platform: string, action: () => void) => {
    try {
      action();
      showToast({
        type: 'success',
        title: `Shared on ${platform}`,
        message: 'Your achievement is now live!',
        duration: 3000,
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: `Failed to share on ${platform}`,
        message: 'Please try again',
        duration: 3000,
      });
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          overflow: 'auto',
          background: '#fff',
          borderRadius: '18px',
          boxShadow: '0 24px 60px rgba(2,6,23,0.26)',
          border: '1px solid #e5e7eb',
        }}
      >
        {status === 'success' && (
          <div
            style={{
              padding: '32px 18px',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #f0fdf4 0%, #f0fdf4 100%)',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <Icon8Illustration type="success" size="large" primaryColor="#15803d" />
            </div>
            <h2
              style={{
                margin: '0 0 8px',
                fontSize: '1.125rem',
                color: '#166534',
                fontWeight: 700,
              }}
            >
              Shared Successfully! 🎉
            </h2>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#15803d' }}>
              Your achievement is ready to inspire others
            </p>
          </div>
        )}

        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'start',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#0f766e',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Share Preview
            </div>
            <h3 style={{ margin: '4px 0 0', fontSize: '1rem', color: '#111827' }}>
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#94a3b8',
            }}
            aria-label="Close share modal"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#f8fafc',
            }}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="Share preview" style={{ width: '100%', display: 'block' }} />
            ) : (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                Image preview unavailable
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: '12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px',
            }}
          >
            <div
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              Draft text
            </div>
            <div
              style={{
                fontSize: '0.85rem',
                color: '#1f2937',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {text}
            </div>
          </div>

          <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              onClick={() =>
                handlePlatformShare('WhatsApp', () =>
                  window.open(`https://wa.me/?text=${encodedText}`, '_blank')
                )
              }
              style={btn('#dcfce7', '#15803d')}
            >
              <MessageCircle size={15} /> WhatsApp
            </button>
            <button
              onClick={() =>
                handlePlatformShare('Telegram', () =>
                  window.open(
                    `https://t.me/share/url?url=${shareUrl}&text=${encodedText}`,
                    '_blank'
                  )
                )
              }
              style={btn('#e0f2fe', '#0369a1')}
            >
              <Send size={15} /> Telegram
            </button>
            <button
              onClick={() =>
                handlePlatformShare('X', () =>
                  window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank')
                )
              }
              style={btn('#ede9fe', '#5b21b6')}
            >
              <AtSign size={15} /> X
            </button>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                showToast({
                  type: 'success',
                  title: 'Text Copied',
                  message: 'Ready to share anywhere!',
                  duration: 2000,
                });
              }}
              style={btn('#fff7ed', '#c2410c')}
            >
              <Copy size={15} /> Copy Text
            </button>
          </div>
        </div>

        <div style={{ padding: '0 18px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button onClick={onDownload} style={btn('#f8fafc', '#111827')}>
            <Download size={16} /> Download Image
          </button>
          <button onClick={() => void onNativeShare()} style={btn('#111827', '#ffffff')}>
            <Share2 size={16} /> Device Share
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(bg: string, fg: string): React.CSSProperties {
  return {
    border: '1px solid #e5e7eb',
    background: bg,
    color: fg,
    borderRadius: '10px',
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontFamily: 'inherit',
  };
}
