import { Link } from 'react-router-dom';
import {
  ArrowRight, Play, Users, FileQuestion, CalendarDays, Sparkles,
} from 'lucide-react';
import './Hero.css';

const stats = [
  { value: '25L+', label: 'Candidates', icon: Users },
  { value: '1200+', label: 'PYQs', icon: FileQuestion },
  { value: '10', label: 'Years Coverage', icon: CalendarDays },
  { value: '₹0', label: 'Free Forever Tier', icon: Sparkles },
];

export default function Hero() {
  return (
    <section className="hero dot-grid" id="hero-section">
      {/* Gradient blobs */}
      <div className="gradient-blob hero-blob-1" />
      <div className="gradient-blob hero-blob-2" />

      <div className="container hero-container">
        {/* Left: Text */}
        <div className="hero-text">
          <div className="hero-badge" lang="hi">
            <Sparkles size={14} />
            <span>अब AI-powered तैयारी</span>
          </div>

          <h1 className="hero-headline" lang="hi">
            UPTET की तैयारी अब <span className="text-gradient">Smart</span> तरीके से
          </h1>

          <p className="hero-subhead" lang="hi">
            10 साल के PYQ, topic-wise practice, और AI explanations — सब एक जगह।
            अपनी तैयारी को next level पर ले जाएं।
          </p>

          <div className="hero-ctas">
            <Link to="/signup" className="btn btn-gold btn-lg" id="hero-cta-primary">
              <span lang="hi">Free में शुरू करें</span>
              <ArrowRight size={20} />
            </Link>
            <Link to="/about" className="btn btn-ghost btn-lg" id="hero-cta-secondary">
              <Play size={18} />
              <span lang="hi">देखें कैसे काम करता है</span>
            </Link>
          </div>
        </div>

        {/* Right: Floating Question Card */}
        <div className="hero-visual">
          <div className="hero-question-card card-elevated" id="hero-question-demo">
            <div className="hq-badge" lang="hi">CDP · 2023 · Paper 1</div>
            <p className="hq-number">प्रश्न 7</p>
            <p className="hq-text question-text" lang="hi">
              "सीखने का वक्र" (Learning Curve) किसकी देन है?
            </p>
            <div className="hq-options">
              <div className="hq-option">A. <span lang="hi">पावलोव</span></div>
              <div className="hq-option hq-correct">B. <span lang="hi">एबिंगहॉस</span> ✓</div>
              <div className="hq-option">C. <span lang="hi">थॉर्नडाइक</span></div>
              <div className="hq-option">D. <span lang="hi">स्किनर</span></div>
            </div>
            <div className="hq-explanation" lang="hi">
              💡 एबिंगहॉस ने "भुलक्कड़ वक्र" और "सीखने का वक्र" दोनों दिए।
            </div>
          </div>

          {/* Floating stats pills */}
          <div className="hero-float-pill hero-float-1">
            <span className="pill-emoji">🔥</span>
            <span lang="hi">7 दिन streak!</span>
          </div>
          <div className="hero-float-pill hero-float-2">
            <span className="pill-emoji">🎯</span>
            <span>85% accuracy</span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="container">
        <div className="hero-stats">
          {stats.map((stat) => (
            <div className="hero-stat" key={stat.label}>
              <stat.icon size={20} className="hero-stat-icon" />
              <span className="hero-stat-value">{stat.value}</span>
              <span className="hero-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
