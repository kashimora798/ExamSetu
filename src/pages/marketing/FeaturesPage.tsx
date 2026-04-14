import Features from '../../components/marketing/Features';
import HowItWorks from '../../components/marketing/HowItWorks';
import SocialProof from '../../components/marketing/SocialProof';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function FeaturesPage() {
  return (
    <div>
      <section className="section" style={{ textAlign: 'center' }}>
        <div className="container">
          <h1 lang="hi">सभी Features देखें</h1>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-lg)', maxWidth: 600, margin: '0 auto' }}>
            Everything you need to crack UPTET — powered by 10 years of real exam data and AI.
          </p>
        </div>
      </section>
      <Features />
      <HowItWorks />
      <SocialProof />
      <section className="section" style={{ textAlign: 'center' }}>
        <div className="container">
          <Link to="/signup" className="btn btn-gold btn-lg">
            <span lang="hi">Free में शुरू करें</span>
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  );
}
