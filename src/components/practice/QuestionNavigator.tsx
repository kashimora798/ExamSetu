interface QuestionNavigatorProps {
  attempts: any[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  showFeedback?: boolean;
}

export default function QuestionNavigator({ attempts, currentIndex, onNavigate, showFeedback = true }: QuestionNavigatorProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
      gap: '8px',
      maxHeight: '300px',
      overflowY: 'auto',
      paddingRight: '8px'
    }}>
      {attempts.map((attempt, index) => {
        let bgColor = 'var(--surface)';
        let borderColor = 'var(--border)';
        let textColor = 'var(--text)';
        
        const isCurrent = index === currentIndex;
        const isAnswered = !!attempt.selected_option;

        if (isCurrent) {
          borderColor = 'var(--primary)';
        }

        if (isAnswered) {
          if (showFeedback) {
             bgColor = attempt.is_correct ? 'var(--success-light)' : 'var(--error-light)';
             borderColor = attempt.is_correct ? 'var(--success)' : 'var(--error)';
             textColor = attempt.is_correct ? 'var(--success-dark)' : 'var(--error-dark)';
          } else {
             bgColor = 'var(--primary)';
             textColor = 'white';
             borderColor = 'var(--primary)';
          }
        } else if (attempt.is_skipped) {
          bgColor = '#f1f5f9'; // Slate 100
          borderColor = '#cbd5e1'; // Slate 300
          textColor = '#64748b'; // Slate 500
        }

        if (attempt.is_marked) {
          // Add a distinctive style for marked, perhaps a gold border or small indicator
          borderColor = 'var(--gold)';
        }

        return (
          <button
            key={attempt.id}
            onClick={() => onNavigate(index)}
            style={{
              width: '100%',
              aspectRatio: '1/1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.875rem',
              backgroundColor: bgColor,
              color: textColor,
              border: `2px solid ${borderColor}`,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: isCurrent ? '0 0 0 3px rgba(11, 108, 126, 0.2)' : 'none'
            }}
            className="hover-lift"
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}
