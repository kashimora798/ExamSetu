import { FileQuestion, Calendar, BookOpenCheck, Users } from 'lucide-react';
import './SocialProof.css';

const stats = [
  { icon: FileQuestion, value: '1,200+', label: 'Previous Year Questions', labelHi: 'पिछले वर्ष के प्रश्न' },
  { icon: Calendar, value: '10', label: 'Years of PYQ Coverage', labelHi: 'साल का PYQ डेटा' },
  { icon: BookOpenCheck, value: '5', label: 'Subjects Covered', labelHi: 'विषय शामिल' },
  { icon: Users, value: '6', label: 'Exam Sessions', labelHi: 'परीक्षा सत्र' },
];

export default function SocialProof() {
  return (
    <section className="section-alt" id="social-proof-section">
      <div className="container">
        <div className="sp-header">
          <h2 lang="hi">भारत का सबसे बड़ा UPTET Question Bank</h2>
          <p>Real PYQ data — verified, structured, and ready for practice.</p>
        </div>

        <div className="sp-stats">
          {stats.map((stat) => (
            <div className="sp-stat" key={stat.label}>
              <div className="sp-stat-icon">
                <stat.icon size={28} strokeWidth={2} />
              </div>
              <span className="sp-stat-value">{stat.value}</span>
              <span className="sp-stat-label">{stat.label}</span>
              <span className="sp-stat-label-hi" lang="hi">{stat.labelHi}</span>
            </div>
          ))}
        </div>

        <div className="sp-trust">
          <p lang="hi">
            हमारा डेटा official UPMSP exam papers से verify किया गया है। 
            कोई random questions नहीं — सिर्फ real PYQ।
          </p>
        </div>
      </div>
    </section>
  );
}
