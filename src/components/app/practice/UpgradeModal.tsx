import { X, Crown, Zap, CheckCircle2 } from 'lucide-react';

interface UpgradeModalProps { onClose: () => void; featureName: string; }

export function UpgradeModal({ onClose, featureName }: UpgradeModalProps) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', background: 'white', borderRadius: '28px', padding: '36px 28px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', padding: '8px', background: '#f3f4f6', border: 'none', borderRadius: '999px', cursor: 'pointer', color: '#6b7280', display: 'flex' }}><X size={18} /></button>
        <div style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 24px rgba(239,68,68,0.3)' }}>
          <Crown size={30} color="white" />
        </div>
        <h2 style={{ textAlign: 'center', fontWeight: 900, fontSize: '1.5rem', color: '#111827', margin: '0 0 8px' }}>Pro Feature 👑</h2>
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.9rem', margin: '0 0 24px', lineHeight: 1.6 }}><strong style={{ color: '#111827' }}>{featureName}</strong> Pro subscription में available है।</p>
        <div style={{ background: 'linear-gradient(135deg, #fffbeb, #fff7ed)', border: '1px solid #fed7aa', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
          {['Weakness Mix — AI picks your weak topics', 'Unlimited Mock Tests', 'Explanations for every question', 'Performance analytics', 'Streak freeze protection'].map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: i < 4 ? '12px' : 0, fontSize: '0.875rem', color: '#92400e', fontWeight: 600 }}>
              <CheckCircle2 size={16} color="#f59e0b" style={{ flexShrink: 0 }} /> {f}
            </div>
          ))}
        </div>
        <button onClick={() => window.location.href = '/pricing'} style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', border: 'none', borderRadius: '16px', color: 'white', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 8px 24px rgba(239,68,68,0.3)' }}>
          <Zap size={20} /> Upgrade to Pro
        </button>
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', marginTop: '12px' }}>₹149/month से शुरू · कभी भी cancel करें</p>
      </div>
    </div>
  );
}
