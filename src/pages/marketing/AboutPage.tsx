import { Link } from 'react-router-dom';
import { ArrowRight, Target, Cpu, Globe, Heart } from 'lucide-react';
import './AboutPage.css';

const values = [
  {
    icon: Target,
    title: 'Data-Driven Preparation',
    desc: 'Every question is tagged, categorized, and analyzed. Know exactly which topics repeat and which ones you need to focus on.',
  },
  {
    icon: Cpu,
    title: 'AI-Powered Explanations',
    desc: 'Don\'t just memorize answers — understand them. Our AI explains every question in simple Hindi so concepts stick.',
  },
  {
    icon: Globe,
    title: 'Bilingual — Hindi + English',
    desc: 'All questions in their original language. UI designed for Hindi-first users, with English support throughout.',
  },
  {
    icon: Heart,
    title: 'Built for UPTET Aspirants',
    desc: 'Not a generic test platform. Every feature is designed specifically for UPTET Paper 1 & Paper 2 preparation.',
  },
];

export default function AboutPage() {
  return (
    <div className="about-page">
      {/* Hero */}
      <section className="section about-hero">
        <div className="container">
          <h1 lang="hi">हमारे बारे में</h1>
          <p className="about-subtitle" lang="hi">
            क्यों बनाया गया ExamSetu और कैसे यह आपकी UPTET तैयारी को 
            बदल सकता है
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="section-alt">
        <div className="container about-story">
          <h2 lang="hi">समस्या जो हमने देखी</h2>
          <div className="about-story-content">
            <p lang="hi">
              हर साल 25 लाख+ candidates UPTET परीक्षा देते हैं। लेकिन तैयारी के resources 
              बिखरे हुए हैं — कहीं PDF, कहीं WhatsApp groups, कहीं YouTube videos। कोई 
              structured question bank नहीं, कोई topic-wise analysis नहीं।
            </p>
            <p lang="hi">
              ExamSetu इसी समस्या का समाधान है। हमने 10 साल के UPTET PYQ को digitize 
              किया, topic-wise tag किया, difficulty level mark किया, और AI explanations 
              add किए — सब कुछ एक platform पर।
            </p>
            <p lang="hi">
              हमारा mission है कि हर UPTET aspirant को — चाहे वो Lucknow में हो या 
              गाँव में — best possible preparation tools मिलें, affordable price पर।
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section">
        <div className="container">
          <h2 className="about-values-title" lang="hi">हम क्या अलग करते हैं</h2>
          <div className="about-values-grid">
            {values.map((value) => (
              <div className="about-value-card card" key={value.title}>
                <div className="about-value-icon">
                  <value.icon size={24} strokeWidth={2} />
                </div>
                <h3>{value.title}</h3>
                <p>{value.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-alt about-cta-section">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 lang="hi">तैयारी शुरू करें — आज ही</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 'var(--space-6)' }}>
            Join thousands of UPTET aspirants who are preparing smarter.
          </p>
          <Link to="/signup" className="btn btn-gold btn-lg">
            <span lang="hi">Free में शुरू करें</span>
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  );
}
