import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, SlidersHorizontal, FileText,
  BarChart3, Bookmark, Settings, Crown,
} from 'lucide-react';
import { useSubscription } from '../../hooks/useSubscription';
import './Sidebar.css';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', labelHi: 'डैशबोर्ड' },
  { to: '/practice', icon: SlidersHorizontal, label: 'Practice', labelHi: 'अभ्यास' },
  { to: '/mock-test', icon: FileText, label: 'Mock Tests', labelHi: 'मॉक टेस्ट' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics', labelHi: 'एनालिटिक्स', pro: true },
  { to: '/bookmarks', icon: Bookmark, label: 'Bookmarks', labelHi: 'बुकमार्क' },
  { to: '/settings', icon: Settings, label: 'Settings', labelHi: 'सेटिंग्स' },
];

export default function Sidebar() {
  const { isFree } = useSubscription();

  return (
    <aside className="sidebar" id="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo-icon">📖</div>
        <div>
          <span className="sidebar-brand-name" lang="hi">शिक्षासेतु</span>
          <span className="sidebar-brand-sub">UPTET Saathi</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
            id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <item.icon size={20} />
            <span className="sidebar-link-label">{item.label}</span>
            {item.pro && isFree && (
              <span className="sidebar-pro-badge">PRO</span>
            )}
          </NavLink>
        ))}
      </nav>

      {isFree && (
        <div className="sidebar-upgrade">
          <Crown size={18} />
          <div>
            <span lang="hi">Pro में अपग्रेड करें</span>
            <span className="sidebar-upgrade-price">₹149/mo</span>
          </div>
        </div>
      )}
    </aside>
  );
}
