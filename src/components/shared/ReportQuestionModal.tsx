import { useState } from 'react';
import { X } from 'lucide-react';
import type { QuestionReportType, QuestionReportSource } from '../../lib/reporting';

const REPORT_TYPES: Array<{ value: QuestionReportType; label: string }> = [
  { value: 'typo', label: 'Typo / spelling mistake' },
  { value: 'wrong_answer', label: 'Wrong answer key' },
  { value: 'wrong_explanation', label: 'Wrong explanation' },
  { value: 'translation_issue', label: 'Translation issue' },
  { value: 'other', label: 'Other issue' },
];

export interface ReportQuestionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reportType: QuestionReportType, reportText: string) => Promise<void>;
  questionLabel?: string;
  source: QuestionReportSource;
}

export default function ReportQuestionModal({ open, onClose, onSubmit, questionLabel, source }: ReportQuestionModalProps) {
  const [reportType, setReportType] = useState<QuestionReportType>('typo');
  const [reportText, setReportText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(reportType, reportText.trim());
      setReportText('');
      setReportType('typo');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(17,24,39,0.46)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '560px', background: 'white', borderRadius: '22px', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '12px', padding: '18px 18px 10px', borderBottom: '1px solid #f3f4f6' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f6b5e', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Report issue</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#111827', marginTop: '4px' }}>{questionLabel || 'Question'}</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>Source: {source.replace('_', ' ')}</div>
          </div>
          <button onClick={onClose} aria-label="Close report modal" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            {REPORT_TYPES.map(opt => (
              <button key={opt.value} onClick={() => setReportType(opt.value)} style={{ padding: '12px 10px', borderRadius: '14px', border: `1.5px solid ${reportType === opt.value ? '#0f6b5e' : '#e5e7eb'}`, background: reportType === opt.value ? '#e0f4f1' : '#f9fafb', color: '#111827', fontWeight: 700, fontSize: '0.82rem', textAlign: 'left', cursor: 'pointer' }}>
                {opt.label}
              </button>
            ))}
          </div>

          <textarea
            value={reportText}
            onChange={e => setReportText(e.target.value)}
            placeholder="Add a short note (optional)"
            rows={4}
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '12px 14px', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.92rem', color: '#111827', background: '#fff' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '0 18px 18px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 14px', borderRadius: '14px', border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 800, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '12px 14px', borderRadius: '14px', border: 'none', background: '#0f6b5e', color: 'white', fontWeight: 800, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}>
            {submitting ? 'Submitting...' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  );
}
