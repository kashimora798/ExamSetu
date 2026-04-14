import {
  BookOpenCheck, FileText, TrendingDown, Sparkles,
  CalendarDays, Bookmark,
} from 'lucide-react';
import './Features.css';

const features = [
  {
    icon: BookOpenCheck,
    title: 'Topic-wise Practice',
    titleHi: 'विषयवार अभ्यास',
    desc: 'Filter CDP, Maths, EVS, Hindi, English — practice exactly what you need.',
  },
  {
    icon: FileText,
    title: 'Full Mock Tests',
    titleHi: 'पूरा मॉक टेस्ट',
    desc: '150 Qs, 2.5 hrs timed, exactly like the real UPTET exam.',
  },
  {
    icon: TrendingDown,
    title: 'Weak Area Tracker',
    titleHi: 'कमज़ोर विषय ट्रैकर',
    desc: 'See exactly which topics need more work — data-driven improvement.',
  },
  {
    icon: Sparkles,
    title: 'AI Explanations',
    titleHi: 'AI व्याख्या',
    desc: 'Every wrong answer explained in Hindi by AI — understand, not memorize.',
  },
  {
    icon: CalendarDays,
    title: 'Year-wise PYQs',
    titleHi: 'वर्षवार PYQ',
    desc: 'Solve complete papers from 2014 to 2024. See how topics repeat.',
  },
  {
    icon: Bookmark,
    title: 'Bookmark & Revise',
    titleHi: 'सेव करें और दोहराएं',
    desc: 'Save hard questions, create collections, and revisit anytime.',
  },
];

export default function Features() {
  return (
    <section className="section" id="features-section">
      <div className="container">
        <div className="features-header">
          <h2 lang="hi">सब कुछ एक जगह</h2>
          <p>Everything you need to crack UPTET — no PDFs, no WhatsApp groups, no confusion.</p>
        </div>

        <div className="features-grid">
          {features.map((feature) => (
            <div className="feature-card card" key={feature.title} id={`feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="feature-icon">
                <feature.icon size={24} strokeWidth={2} />
              </div>
              <h3 className="feature-title">
                {feature.title}
                <span className="feature-title-hi" lang="hi">{feature.titleHi}</span>
              </h3>
              <p className="feature-desc">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
