import { Outlet } from 'react-router-dom';
import Sidebar from '../components/shared/Sidebar';
import BottomNav from '../components/shared/BottomNav';
import './AppLayout.css';

export default function AppLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
