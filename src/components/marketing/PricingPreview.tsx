import { Link } from 'react-router-dom';
import { Check, X, ArrowRight, Crown } from 'lucide-react';
import './PricingPreview.css';

export default function PricingPreview() {
  return (
    <section className="section" id="pricing-preview-section">
      <div className="container">
        <div className="pp-header">
          <h2 lang="hi">सस्ती और सरल कीमत</h2>
          <p>Start free, upgrade when you're ready. No hidden charges.</p>
        </div>

        <div className="pp-cards">
          {/* Free Tier */}
          <div className="pp-card" id="pricing-free">
            <div className="pp-card-header">
              <span className="pp-plan-name">Free</span>
              <div className="pp-price">
                <span className="pp-amount">₹0</span>
                <span className="pp-period" lang="hi">हमेशा के लिए</span>
              </div>
            </div>
            <div className="pp-features">
              <div className="pp-feature pp-yes"><Check size={16} /> <span>5 mock tests / month</span></div>
              <div className="pp-feature pp-yes"><Check size={16} /> <span>Browse all questions</span></div>
              <div className="pp-feature pp-yes"><Check size={16} /> <span>Basic subject filter</span></div>
              <div className="pp-feature pp-yes"><Check size={16} /> <span>Community leaderboard</span></div>
              <div className="pp-feature pp-no"><X size={16} /> <span>Topic-wise practice</span></div>
              <div className="pp-feature pp-no"><X size={16} /> <span>AI explanations</span></div>
            </div>
            <Link to="/signup" className="btn btn-ghost" style={{ width: '100%' }}>
              <span lang="hi">Free में शुरू करें</span>
            </Link>
          </div>

          {/* Pro Tier */}
          <div className="pp-card pp-card-pro" id="pricing-pro">
            <div className="pp-popular-badge">
              <Crown size={14} />
              <span>Most Popular</span>
            </div>
            <div className="pp-card-header">
              <span className="pp-plan-name">Pro</span>
              <div className="pp-price">
                <span className="pp-amount">₹149</span>
                <span className="pp-period" lang="hi">/ महीना</span>
              </div>
            </div>
            <div className="pp-features">
              <div className="pp-feature pp-yes"><Check size={16} /> <span>Everything in Free</span></div>
              <div className="pp-feature pp-yes"><Check size={16} /> <span>Unlimited mock tests</span></div>
              <div className="pp-feature pp-yes"><Check size={16} /> <span>Topic-wise practice</span></div>
              <div className="pp-feature pp-yes"><Check size={16} /> <span>AI explanations in Hindi</span></div>
              <div className="pp-feature pp-yes"><Check size={16} /> <span>Full analytics dashboard</span></div>
              <div className="pp-feature pp-yes"><Check size={16} /> <span>Unlimited bookmarks</span></div>
            </div>
            <Link to="/signup" className="btn btn-gold" style={{ width: '100%' }}>
              <span lang="hi">Pro शुरू करें</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>

        <div className="pp-more">
          <Link to="/pricing" className="pp-more-link">
            See full pricing & FAQ <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
