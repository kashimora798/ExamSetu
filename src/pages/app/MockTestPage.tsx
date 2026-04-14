import { Link } from 'react-router-dom';
import { FileText, Clock, Lock } from 'lucide-react';
import { useSubscription } from '../../hooks/useSubscription';

const mockTests = [
  { id: 'mt-1', title: 'UPTET 2023 Paper 1', year: 2023, questions: 150, mins: 150 },
  { id: 'mt-2', title: 'UPTET 2022 Paper 1', year: 2022, questions: 150, mins: 150 },
  { id: 'mt-3', title: 'UPTET 2021 Paper 1', year: 2021, questions: 150, mins: 150 },
  { id: 'mt-4', title: 'UPTET 2019 Paper 1', year: 2019, questions: 150, mins: 150 },
  { id: 'mt-5', title: 'UPTET 2018 Paper 1', year: 2018, questions: 150, mins: 150 },
  { id: 'mt-6', title: 'Practice Mock 1', year: 0, questions: 150, mins: 150 },
  { id: 'mt-7', title: 'Practice Mock 2', year: 0, questions: 150, mins: 150 },
];

export default function MockTestPage() {
  const { isFree, mockTestLimit } = useSubscription();

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 lang="hi" style={{ marginBottom: '0.5rem' }}>मॉक टेस्ट</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        Full exam simulation — 150 questions, 2.5 hours, real exam format.
        {isFree && <span lang="hi"> (Free: {mockTestLimit}/month)</span>}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {mockTests.map((test, i) => {
          const locked = isFree && i >= mockTestLimit;
          return (
            <div
              key={test.id}
              className="card"
              style={{
                padding: 'var(--space-5) var(--space-6)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                opacity: locked ? 0.5 : 1,
              }}
            >
              <FileText size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{test.title}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', display: 'flex', gap: 'var(--space-4)', marginTop: 4 }}>
                  {test.year > 0 && <span>Year: {test.year}</span>}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} /> {test.mins} min
                  </span>
                  <span>{test.questions} Qs</span>
                </div>
              </div>
              {locked ? (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 'var(--text-xs)', color: 'var(--gold)', fontWeight: 600,
                }}>
                  <Lock size={14} /> PRO
                </span>
              ) : (
                <Link to={`/mock-test/${test.id}`} className="btn btn-sm btn-primary">
                  Start
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
