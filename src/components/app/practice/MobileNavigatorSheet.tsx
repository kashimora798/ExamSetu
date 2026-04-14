import { X, LayoutGrid } from 'lucide-react';

interface Attempt { id: string; selected_option: string | null; is_correct: boolean | null; is_marked: boolean; questions?: { subject_id?: string; subject_name?: string; subject_code?: string } }

interface Props { attempts: Attempt[]; currentIndex: number; isMockTest: boolean; isPyqPaper?: boolean; onNavigate: (i: number) => void; onClose: () => void; onSubmit: () => void; }

export function MobileNavigatorSheet({ attempts, currentIndex, isMockTest, isPyqPaper, onNavigate, onClose, onSubmit }: Props) {
  const correct = attempts.filter(a => a.is_correct).length;
  const wrong = attempts.filter(a => !a.is_correct && a.selected_option).length;
  const skipped = attempts.filter(a => !a.selected_option).length;
  const marked = attempts.filter(a => a.is_marked).length;
  const groups = (isPyqPaper || isMockTest)
    ? attempts.reduce<Record<string, Attempt[]>>((acc, att) => {
        const key = att.questions?.subject_id || att.questions?.subject_code || 'other';
        (acc[key] ||= []).push(att);
        return acc;
      }, {})
    : null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', background: 'white', width: '100%', borderRadius: '28px 28px 0 0', maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.15)' }}>
        <div style={{ width: '40px', height: '4px', background: '#e5e7eb', borderRadius: '999px', margin: '12px auto 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 8px', borderBottom: '1px solid #f3f4f6' }}>
          <h3 style={{ fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1rem' }}>
            <LayoutGrid size={18} color="#6366f1" /> Question Map
          </h3>
          <button onClick={onClose} style={{ padding: '6px', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: '#6b7280' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
          {[{ label: 'Correct', count: correct, color: '#16a34a', bg: '#f0fdf4' }, { label: 'Wrong', count: wrong, color: '#dc2626', bg: '#fef2f2' }, { label: 'Skipped', count: skipped, color: '#6b7280', bg: '#f9fafb' }, { label: 'Marked', count: marked, color: '#d97706', bg: '#fffbeb' }].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: '12px', padding: '10px 6px', textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: '1.3rem', color: s.color }}>{s.count}</div>
              <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 600, marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 20px' }}>
          {groups ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {Object.entries(groups).map(([subjectKey, subjectAttempts]) => {
                const subjectLabel = subjectAttempts[0]?.questions?.subject_name || subjectAttempts[0]?.questions?.subject_code || subjectKey;
                return (
                  <div key={subjectKey}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0f766e', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{subjectLabel}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                      {subjectAttempts.map((att, idx) => {
                        const globalIndex = attempts.indexOf(att);
                        let bg = '#f3f4f6'; let color = '#374151'; let border = '#e5e7eb';
                        if (att.selected_option) {
                          if (!isMockTest) { bg = att.is_correct ? '#f0fdf4' : '#fef2f2'; color = att.is_correct ? '#16a34a' : '#dc2626'; border = att.is_correct ? '#bbf7d0' : '#fecaca'; }
                          else { bg = '#eef2ff'; color = '#6366f1'; border = '#c7d2fe'; }
                        }
                        if (att.is_marked) { bg = '#fffbeb'; color = '#d97706'; border = '#fde68a'; }
                        const isCurr = globalIndex === currentIndex;
                        return (
                          <button key={att.id} onClick={() => { onNavigate(globalIndex); onClose(); }}
                            style={{ height: '40px', borderRadius: '10px', border: `2px solid ${isCurr ? '#6366f1' : border}`, background: isCurr ? '#eef2ff' : bg, color: isCurr ? '#6366f1' : color, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', transform: isCurr ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.15s', fontFamily: 'inherit' }}>
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
              {attempts.map((att, idx) => {
                let bg = '#f3f4f6'; let color = '#374151'; let border = '#e5e7eb';
                if (att.selected_option) {
                  if (!isMockTest) { bg = att.is_correct ? '#f0fdf4' : '#fef2f2'; color = att.is_correct ? '#16a34a' : '#dc2626'; border = att.is_correct ? '#bbf7d0' : '#fecaca'; }
                  else { bg = '#eef2ff'; color = '#6366f1'; border = '#c7d2fe'; }
                }
                if (att.is_marked) { bg = '#fffbeb'; color = '#d97706'; border = '#fde68a'; }
                const isCurr = idx === currentIndex;
                return (
                  <button key={idx} onClick={() => { onNavigate(idx); onClose(); }}
                    style={{ height: '40px', borderRadius: '10px', border: `2px solid ${isCurr ? '#6366f1' : border}`, background: isCurr ? '#eef2ff' : bg, color: isCurr ? '#6366f1' : color, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', transform: isCurr ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.15s', fontFamily: 'inherit' }}>
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f4f6', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button onClick={onSubmit} style={{ width: '100%', padding: '15px', background: '#111827', color: 'white', fontWeight: 900, border: 'none', borderRadius: '14px', cursor: 'pointer', fontSize: '0.95rem', fontFamily: 'inherit' }}>{isPyqPaper ? 'Submit PYQ ✓' : 'Submit Test ✓'}</button>
        </div>
      </div>
    </div>
  );
}
