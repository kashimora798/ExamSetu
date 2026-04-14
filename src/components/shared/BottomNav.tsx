import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, SlidersHorizontal, FileText,
  BarChart3, Bookmark, Trophy
} from 'lucide-react';
import './BottomNav.css';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/practice', icon: SlidersHorizontal, label: 'Practice' },
  { to: '/mock-test', icon: FileText, label: 'Mocks' },
  { to: '/analytics', icon: BarChart3, label: 'Stats' },
  { to: '/bookmarks', icon: Bookmark, label: 'Saved' },
  { to: '/leaderboard', icon: Trophy, label: 'Ranks' }
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" id="bottom-nav">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `bottom-nav-item ${isActive ? 'bottom-nav-active' : ''}`
          }
        >
          <item.icon size={20} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
