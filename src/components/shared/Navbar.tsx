import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import BrandLogo from './BrandLogo';
import './Navbar.css';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''} ${isOpen ? 'navbar-open' : ''}`} id="main-navbar">
      <div className="navbar-inner container">
        {/* Logo */}
        <Link to="/" className="navbar-logo" id="logo-link">
          <BrandLogo tone="light" size="md" />
        </Link>

        {/* Desktop Nav Links */}
        <div className="navbar-links">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}
              id={`nav-${link.label.toLowerCase()}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* CTA Buttons — change based on auth state */}
        <div className="navbar-actions">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary btn-sm" id="nav-dashboard">
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm" id="nav-login">
                Login
              </Link>
              <Link to="/signup" className="btn btn-primary btn-sm" id="nav-signup">
                <span lang="hi">Free में शुरू करें</span>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          className="navbar-toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
          id="navbar-toggle"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      <button
        className={`navbar-overlay ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(false)}
        aria-label="Close menu overlay"
      />

      <div className={`navbar-drawer ${isOpen ? 'open' : ''}`}>
        <div className="drawer-links">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`drawer-link ${location.pathname === link.to ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="drawer-actions">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary" style={{ width: '100%' }}>
              <LayoutDashboard size={16} />
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost" style={{ width: '100%' }}>
                Login
              </Link>
              <Link to="/signup" className="btn btn-primary" style={{ width: '100%' }}>
                <span lang="hi">Free में शुरू करें</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
