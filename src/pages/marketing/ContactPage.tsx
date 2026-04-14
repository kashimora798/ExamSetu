import { useState } from 'react';
import { Send, MessageCircle, Mail, Phone, MapPin } from 'lucide-react';
import './ContactPage.css';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Connect to Supabase Edge Function or Resend API
    setSubmitted(true);
  };

  return (
    <div className="contact-page">
      <section className="section">
        <div className="container">
          <div className="contact-header">
            <h1 lang="hi">संपर्क करें</h1>
            <p>Have a question or feedback? We'd love to hear from you.</p>
          </div>

          <div className="contact-grid">
            {/* Form */}
            <div className="contact-form-wrapper card-elevated" id="contact-form-card">
              {submitted ? (
                <div className="contact-success">
                  <div className="contact-success-icon">✅</div>
                  <h3 lang="hi">धन्यवाद!</h3>
                  <p lang="hi">आपका message मिल गया। हम जल्द ही जवाब देंगे।</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="contact-form">
                  <div className="form-group">
                    <label htmlFor="contact-name" lang="hi">नाम</label>
                    <input
                      id="contact-name"
                      type="text"
                      placeholder="आपका नाम"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="contact-email">Email</label>
                    <input
                      id="contact-email"
                      type="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="contact-message" lang="hi">संदेश</label>
                    <textarea
                      id="contact-message"
                      placeholder="अपना सवाल या सुझाव यहाँ लिखें..."
                      rows={5}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                    <Send size={18} />
                    <span lang="hi">भेजें</span>
                  </button>
                </form>
              )}
            </div>

            {/* Info */}
            <div className="contact-info">
              <div className="contact-info-card card">
                <MessageCircle size={20} className="contact-info-icon" />
                <h4>WhatsApp</h4>
                <p lang="hi">Quick queries के लिए WhatsApp करें</p>
                <a
                  href="https://wa.me/919876543210"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                  id="whatsapp-link"
                >
                  Chat on WhatsApp
                </a>
              </div>

              <div className="contact-info-card card">
                <Mail size={20} className="contact-info-icon" />
                <h4>Email</h4>
                <p>hello@shikshasetu.in</p>
              </div>

              <div className="contact-info-card card">
                <Phone size={20} className="contact-info-icon" />
                <h4>Phone</h4>
                <p>+91 98765 43210</p>
              </div>

              <div className="contact-info-card card">
                <MapPin size={20} className="contact-info-icon" />
                <h4>Location</h4>
                <p>Kanpur, Uttar Pradesh 🇮🇳</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
