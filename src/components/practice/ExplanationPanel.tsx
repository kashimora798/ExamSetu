import { Lightbulb, AlertCircle } from 'lucide-react';

interface ExplanationPanelProps {
  explanation: string | null;
  correctOption: string;
}

export default function ExplanationPanel({ explanation, correctOption }: ExplanationPanelProps) {
  return (
    <div style={{
      marginTop: '24px',
      padding: '20px',
      borderRadius: '12px',
      backgroundColor: 'var(--sage-light)',
      border: '1px solid var(--border)',
      animation: 'fadeIn 0.3s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--primary)', fontWeight: 600 }}>
        <Lightbulb size={20} />
        <span>व्याख्या (Explanation)</span>
      </div>
      
      <div style={{ 
        fontWeight: 600, 
        marginBottom: '12px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px' 
      }}>
        सही उत्तर: 
        <span style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          width: '24px', 
          height: '24px', 
          borderRadius: '50%', 
          backgroundColor: 'var(--success-light)',
          color: 'var(--success-dark)',
          fontSize: '0.875rem'
        }}>
          {correctOption}
        </span>
      </div>
      
      <div style={{ lineHeight: 1.6, color: 'var(--text)' }}>
        {explanation ? (
          <span dangerouslySetInnerHTML={{ __html: explanation }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)', fontSize: '0.875rem' }}>
            <AlertCircle size={16} />
            <span>इस प्रश्न के लिए विस्तृत व्याख्या उपलब्ध नहीं है।</span>
          </div>
        )}
      </div>
    </div>
  );
}
