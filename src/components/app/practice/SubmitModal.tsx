import { X, AlertTriangle } from 'lucide-react';

interface SubmitModalProps {
  totalQuestions: number; attemptedCount: number; markedCount: number;
  onConfirm: () => void; onCancel: () => void; isLoading?: boolean;
}

export function SubmitModal({ totalQuestions, attemptedCount, markedCount, onConfirm, onCancel, isLoading }: SubmitModalProps) {
  const unattempted = totalQuestions - attemptedCount;
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', background: 'white', borderRadius: '28px 28px 0 0', padding: '28px 24px 36px', width: '100%', maxWidth: '500px', boxShadow: '0 -8px 40px rgba(0,0,0,0.15)', zIndex: 1 }}>
        {/* Handle */}
        <div style={{ width: '40px', height: '4px', background: '#e5e7eb', borderRadius: '999px', margin: '0 auto 20px' }} />
        <button onClick={onCancel} style={{ position: 'absolute', top: '20px', right: '20px', padding: '8px', background: '#f3f4f6', border: 'none', borderRadius: '999px', cursor: 'pointer', display: 'flex', color: '#6b7280' }}><X size={18} /></button>
        <div style={{ width: '52px', height: '52px', background: '#fffbeb', border: '2px solid #fde68a', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={26} color="#d97706" />
        </div>
        <h3 style={{ textAlign: 'center', fontWeight: 900, fontSize: '1.25rem', color: '#111827', margin: '0 0 6px' }}>Submit करें?</h3>
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.875rem', margin: '0 0 20px' }}>एक बार submit करने के बाद answers नहीं बदल सकते।</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
          {[{ label: 'Attempted', value: attemptedCount, color: '#16a34a', bg: '#f0fdf4' }, { label: 'Skipped', value: unattempted, color: unattempted > 0 ? '#dc2626' : '#6b7280', bg: unattempted > 0 ? '#fef2f2' : '#f9fafb' }, { label: 'Marked', value: markedCount, color: '#d97706', bg: '#fffbeb' }].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: '14px', padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>
        {unattempted > 0 && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.875rem', color: '#dc2626', fontWeight: 600, textAlign: 'center' }}>⚠️ {unattempted} questions छोड़े हैं</div>}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '2px solid #e5e7eb', background: 'white', fontWeight: 700, color: '#374151', cursor: 'pointer', fontSize: '0.9rem' }}>वापस जाएं</button>
          <button onClick={onConfirm} disabled={isLoading} style={{ flex: 1, padding: '14px', borderRadius: '14px', background: '#111827', color: 'white', fontWeight: 800, border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1, fontSize: '0.9rem' }}>
            {isLoading ? 'Submitting...' : 'Submit ✓'}
          </button>
        </div>
      </div>
    </div>
  );
}
