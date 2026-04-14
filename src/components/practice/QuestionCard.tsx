import { CheckCircle2, XCircle } from 'lucide-react';

interface QuestionCardProps {
  question: any;
  attempt: any;
  onAnswer: (option: string) => void;
  showFeedback?: boolean;
}

export default function QuestionCard({ question, attempt, onAnswer, showFeedback = true }: QuestionCardProps) {
  const options = [
    { id: 'A', text: question.option_a },
    { id: 'B', text: question.option_b },
    { id: 'C', text: question.option_c },
    { id: 'D', text: question.option_d }
  ];

  return (
    <div className="question-card" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ 
        fontSize: '1.25rem', 
        fontWeight: 600, 
        color: 'var(--text)',
        marginBottom: '24px',
        lineHeight: 1.6
      }}>
        {question.text}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {options.map((opt) => {
          let isSelected = attempt?.selected_option === opt.id;
          let isCorrect = question.correct_option === opt.id;
          
          // Style logic based on state
          let bgColor = 'var(--surface)';
          let borderColor = 'var(--border)';
          let textColor = 'var(--text)';
          let icon = null;

          if (attempt?.selected_option && showFeedback) {
            if (isCorrect) {
              bgColor = 'var(--success-light)';
              borderColor = 'var(--success)';
              textColor = 'var(--success-dark)';
              if (isSelected) icon = <CheckCircle2 size={20} color="var(--success)" />;
            } else if (isSelected) {
              bgColor = 'var(--error-light)';
              borderColor = 'var(--error)';
              textColor = 'var(--error-dark)';
              icon = <XCircle size={20} color="var(--error)" />;
            }
          } else if (isSelected) {
            bgColor = 'var(--primary-light)';
            borderColor = 'var(--primary)';
          }

          return (
            <button
              key={opt.id}
              onClick={() => !attempt?.selected_option && onAnswer(opt.id)}
              disabled={!!attempt?.selected_option}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: '12px',
                border: `2px solid ${borderColor}`,
                backgroundColor: bgColor,
                color: textColor,
                fontSize: '1rem',
                fontWeight: 500,
                cursor: attempt?.selected_option ? 'default' : 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left'
              }}
              className={!attempt?.selected_option ? 'hover-lift' : ''}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '50%', 
                  backgroundColor: attempt?.selected_option && showFeedback && (isCorrect || isSelected) ? 'transparent' : 'var(--background)',
                  border: `1px solid ${attempt?.selected_option && showFeedback && (isCorrect || isSelected) ? borderColor : 'var(--border)'}`,
                  color: attempt?.selected_option && showFeedback && (isCorrect || isSelected) ? borderColor : 'var(--muted)',
                  fontWeight: 600
                }}>
                  {opt.id}
                </span>
                <span>{opt.text}</span>
              </div>
              {icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
