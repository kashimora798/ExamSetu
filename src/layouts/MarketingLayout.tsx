import { Outlet } from 'react-router-dom';
import Navbar from '../components/shared/Navbar';
import Footer from '../components/shared/Footer';

export default function MarketingLayout() {
  return (
    <div className="marketing-layout">
      <Navbar />
      <main style={{ paddingTop: 'var(--nav-height)' }}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
