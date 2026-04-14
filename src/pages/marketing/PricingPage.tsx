import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Crown, ArrowRight, ChevronDown } from 'lucide-react';
import './PricingPage.css';

const faqs = [
  {
    q: 'क्या Free plan permanently free है?',
    a: 'हाँ! Free plan हमेशा के लिए free है। आप 5 mock tests/month, question browsing, और basic filters use कर सकते हैं बिना किसी payment के।',
  },
  {
    q: 'Pro plan में cancel कैसे करें?',
    a: 'Settings > Subscription में जाकर one-click cancel कर सकते हैं। कोई hidden charges नहीं हैं।',
  },
  {
    q: 'Annual plan में refund मिलेगा?',
    a: '7 दिन के अंदर cancel करने पर full refund मिलेगा। उसके बाद pro-rated refund available है।',
  },
  {
    q: 'AI explanations किस language में होते हैं?',
    a: 'सभी explanations Hindi में generate होते हैं। English option भी जल्द ही आ रहा है।',
  },
  {
    q: 'Payment methods कौन-कौन से हैं?',
    a: 'UPI, Credit/Debit Card, Net Banking, और सभी popular wallets supported हैं Razorpay के through।',
  },
];

const plans = [
  {
    name: 'Free',
    price: '₹0',
    period: 'हमेशा के लिए',
    isPro: false,
    features: [
      { text: '5 mock tests / month', included: true },
      { text: 'Browse all questions (answers hidden)', included: true },
      { text: 'Basic subject filter', included: true },
      { text: 'Community leaderboard', included: true },
      { text: '20 bookmarks max', included: true },
      { text: 'Shareable score cards', included: true },
      { text: 'Topic-wise practice', included: false },
      { text: 'AI explanations', included: false },
      { text: 'Analytics dashboard', included: false },
      { text: 'Difficulty filter', included: false },
      { text: 'Weak area tracker', included: false },
    ],
    cta: 'Free में शुरू करें',
    ctaStyle: 'btn btn-ghost',
  },
  {
    name: 'Pro Monthly',
    price: '₹149',
    period: '/ महीना',
    isPro: true,
    popular: true,
    features: [
      { text: 'Everything in Free', included: true },
      { text: 'Unlimited mock tests', included: true },
      { text: 'Topic-wise & difficulty filter', included: true },
      { text: 'AI explanations in Hindi', included: true },
      { text: 'Full analytics dashboard', included: true },
      { text: 'Unlimited bookmarks', included: true },
      { text: 'Weak area identification', included: true },
    ],
    cta: 'Pro शुरू करें — ₹149/माह',
    ctaStyle: 'btn btn-gold',
  },
  {
    name: 'Pro Annual',
    price: '₹999',
    period: '/ साल',
    isPro: true,
    bestValue: true,
    features: [
      { text: 'Everything in Pro Monthly', included: true },
      { text: 'Save 44% vs monthly', included: true },
      { text: 'Priority support', included: true },
      { text: 'Early access to new features', included: true },
    ],
    cta: 'Annual plan लें — ₹999/साल',
    ctaStyle: 'btn btn-primary',
  },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="pricing-page">
      {/* Header */}
      <section className="section pricing-hero">
        <div className="container">
          <h1 lang="hi">सही plan चुनें</h1>
          <p>Start free, upgrade when you need more. Cancel anytime.</p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="container">
        <div className="pricing-grid">
          {plans.map((plan) => (
            <div
              className={`pricing-card ${plan.isPro ? 'pricing-card-pro' : ''}`}
              key={plan.name}
              id={`plan-${plan.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {plan.popular && (
                <div className="pricing-popular">
                  <Crown size={14} /> Most Popular
                </div>
              )}
              {plan.bestValue && (
                <div className="pricing-best-value">
                  🎯 Best Value — Save 44%
                </div>
              )}

              <div className="pricing-card-header">
                <span className="pricing-plan-name">{plan.name}</span>
                <div className="pricing-price">
                  <span className="pricing-amount">{plan.price}</span>
                  <span className="pricing-period" lang="hi">{plan.period}</span>
                </div>
              </div>

              <div className="pricing-features">
                {plan.features.map((f, i) => (
                  <div className={`pricing-feature ${f.included ? 'yes' : 'no'}`} key={i}>
                    {f.included ? <Check size={16} /> : <X size={16} />}
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>

              <Link to="/signup" className={plan.ctaStyle} style={{ width: '100%' }}>
                <span lang="hi">{plan.cta}</span>
                <ArrowRight size={18} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="section container">
        <h2 className="faq-title" lang="hi">अक्सर पूछे जाने वाले सवाल</h2>
        <div className="faq-list">
          {faqs.map((faq, i) => (
            <div
              className={`faq-item ${openFaq === i ? 'faq-open' : ''}`}
              key={i}
              id={`faq-${i}`}
            >
              <button
                className="faq-question"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span lang="hi">{faq.q}</span>
                <ChevronDown size={20} className="faq-chevron" />
              </button>
              <div className="faq-answer">
                <p lang="hi">{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
