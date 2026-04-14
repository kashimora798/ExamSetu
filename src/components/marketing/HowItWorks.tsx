import { UserPlus, SlidersHorizontal, Trophy } from 'lucide-react';
import './HowItWorks.css';

const steps = [
  {
    icon: UserPlus,
    num: '1',
    title: 'Sign Up Free',
    titleHi: 'फ्री में साइन अप करें',
    desc: 'Google या email से 10 सेकंड में account बनाएं',
  },
  {
    icon: SlidersHorizontal,
    num: '2',
    title: 'Choose Your Topic',
    titleHi: 'अपना विषय चुनें',
    desc: 'Subject, chapter, topic, या year filter करें',
  },
  {
    icon: Trophy,
    num: '3',
    title: 'Practice & Improve',
    titleHi: 'अभ्यास करें और सुधारें',
    desc: 'Track progress, fix weak areas, ace the exam',
  },
];

export default function HowItWorks() {
  return (
    <section className="section-alt" id="how-it-works-section">
      <div className="container">
        <div className="hiw-header">
          <h2 lang="hi">कैसे काम करता है?</h2>
          <p>Three simple steps to start your smart UPTET preparation</p>
        </div>

        <div className="hiw-steps">
          {steps.map((step, i) => (
            <div className="hiw-step" key={step.num}>
              <div className="hiw-step-icon">
                <step.icon size={28} strokeWidth={2} />
                <span className="hiw-step-num">{step.num}</span>
              </div>
              <h3>{step.title}</h3>
              <p className="hiw-step-hi" lang="hi">{step.titleHi}</p>
              <p className="hiw-step-desc" lang="hi">{step.desc}</p>

              {/* Connector line */}
              {i < steps.length - 1 && <div className="hiw-connector" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
