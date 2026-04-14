import { CheckCircle2 } from 'lucide-react';

interface SessionCompleteModalProps {
  sessionId: string;
  onConfirm: () => void;
}

export default function SessionCompleteModal({ sessionId, onConfirm }: SessionCompleteModalProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '40px 32px',
        maxWidth: '400px',
        width: '90%',
        textAlign: 'center',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        animation: 'slideUp 0.3s ease-out'
      }}>
        {/* Icon */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '64px',
          height: '64px',
          background: '#ecfdf5',
          borderRadius: '50%',
          margin: '0 auto 20px'
        }}>
          <CheckCircle2 size={36} color="#10b981" />
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#111827',
          marginBottom: '12px',
          margin: '0 0 12px'
        }}>
          Session Already Submitted
        </h2>

        {/* Description */}
        <p style={{
          fontSize: '0.95rem',
          color: '#6b7280',
          lineHeight: 1.6,
          margin: '0 0 24px'
        }}>
          यह सेशन पहले ही submit हो गया है। अब आप शुधार नहीं कर सकते। कृपया परिणाम देखें।
        </p>

        {/* Session ID (debug info) */}
        <div style={{
          fontSize: '0.75rem',
          color: '#9ca3af',
          background: '#f3f4f6',
          padding: '8px 12px',
          borderRadius: '8px',
          margin: '0 0 24px',
          wordBreak: 'break-all',
          fontFamily: 'monospace'
        }}>
          Session ID: {sessionId}
        </div>

        {/* Button */}
        <button
          onClick={onConfirm}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#059669';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 15px -3px rgba(16, 185, 129, 0.3)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#10b981';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 6px -1px rgba(16, 185, 129, 0.3)';
          }}
        >
          View Results →
        </button>
      </div>
    </div>
  );
}
