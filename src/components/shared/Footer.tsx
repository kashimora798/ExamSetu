import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import BrandLogo from './BrandLogo';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer" id="main-footer">
      <div className="container">
        <div className="footer-grid">
          {/* Brand Column */}
          <div className="footer-brand">
            <Link to="/" className="footer-logo">
              <BrandLogo tone="dark" size="md" showSubtitle subtitle="Your bridge to teaching" />
            </Link>
            <p className="footer-tagline" lang="hi">
              अध्यापन की ओर आपका सेतु
            </p>
            <p className="footer-desc">
              The smartest way to prepare for UPTET — structured PYQs, 
              topic-wise practice, and AI-powered explanations.
            </p>
          </div>

          {/* Quick Links */}
          <div className="footer-col">
            <h4 className="footer-heading">Quick Links</h4>
            <div className="footer-links">
              <Link to="/">Home</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/about">About</Link>
              <Link to="/contact">Contact</Link>
            </div>
          </div>

          {/* Resources */}
          <div className="footer-col">
            <h4 className="footer-heading">Resources</h4>
            <div className="footer-links">
              <Link to="/pricing" lang="hi">UPTET PYQ Bank</Link>
              <Link to="/pricing" lang="hi">Mock Tests</Link>
              <Link to="/pricing" lang="hi">Topic Practice</Link>
              <Link to="/pricing" lang="hi">AI Explanations</Link>
            </div>
          </div>

          {/* Contact */}
          <div className="footer-col">
            <h4 className="footer-heading">Contact</h4>
            <div className="footer-contact">
              <div className="contact-item">
                <Mail size={16} />
                <span>hello@examsetu.in</span>
              </div>
              <div className="contact-item">
                <Phone size={16} />
                <span>+91 98765 43210</span>
              </div>
              <div className="contact-item">
                <MapPin size={16} />
                <span>Kanpur, UP 🇮🇳</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} ExamSetu. All rights reserved.</p>
          <p className="footer-made" lang="hi">
            Made with ❤️ in Kanpur 🇮🇳
          </p>
        </div>
      </div>
    </footer>
  );
}
