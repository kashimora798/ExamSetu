import { AlertCircle, CheckCircle } from 'lucide-react';
import './ProblemSolution.css';

const problems = [
  'PYQ scattered in PDFs and WhatsApp groups',
  'No topic-wise practice possible anywhere',
  'No idea which topics repeat most in exams',
  'Explanations are nowhere to be found',
];

const solutions = [
  'Structured, searchable question bank',
  'Filter by subject, chapter, topic, year',
  'Topic frequency heatmap built-in',
  'AI explanations in Hindi — हर question के लिए',
];

export default function ProblemSolution() {
  return (
    <section className="section-alt" id="problem-solution-section">
      <div className="container">
        <div className="ps-header">
          <h2 lang="hi">समस्या ➔ समाधान</h2>
          <p>Stop struggling with scattered resources. Start smart preparation.</p>
        </div>

        <div className="ps-grid">
          {/* Problems Column */}
          <div className="ps-col">
            <div className="ps-col-header ps-problem-header">
              <AlertCircle size={20} />
              <span lang="hi">आज की समस्या</span>
            </div>
            <div className="ps-cards">
              {problems.map((problem, i) => (
                <div className="ps-card ps-card-problem" key={i}>
                  <span className="ps-num">{i + 1}</span>
                  <p>{problem}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Arrow */}
          <div className="ps-arrow">
            <div className="ps-arrow-line" />
            <span className="ps-arrow-text" lang="hi">ExamSetu</span>
          </div>

          {/* Solutions Column */}
          <div className="ps-col">
            <div className="ps-col-header ps-solution-header">
              <CheckCircle size={20} />
              <span lang="hi">हमारा समाधान</span>
            </div>
            <div className="ps-cards">
              {solutions.map((solution, i) => (
                <div className="ps-card ps-card-solution" key={i}>
                  <span className="ps-num">{i + 1}</span>
                  <p>{solution}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
