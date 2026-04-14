import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import MarketingLayout from './layouts/MarketingLayout';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './components/shared/ProtectedRoute';

/* Marketing pages */
import HomePage from './pages/marketing/HomePage';
import PricingPage from './pages/marketing/PricingPage';
import AboutPage from './pages/marketing/AboutPage';
import ContactPage from './pages/marketing/ContactPage';
import FeaturesPage from './pages/marketing/FeaturesPage';

/* Auth pages */
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';

/* App pages */
import DashboardPage from './pages/app/DashboardPage';
import PracticePage from './pages/app/PracticePage';
import PracticeSessionPage from './pages/app/PracticeSessionPage';
import PracticeResultsPage from './pages/app/PracticeResultsPage';
import MockTestPage from './pages/app/MockTestPage';
import AnalyticsPage from './pages/app/AnalyticsPage';
import BookmarksPage from './pages/app/BookmarksPage';
import SettingsPage from './pages/app/SettingsPage';
import OnboardingPage from './pages/app/OnboardingPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Marketing pages with Navbar + Footer */}
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
          </Route>

          {/* Auth pages — standalone, no navbar/footer */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Onboarding — protected but standalone (no sidebar) */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* Protected app routes — Sidebar + BottomNav */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/mock-test" element={<MockTestPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Distraction-free standalone protected pages */}
          <Route path="/practice/:sessionId" element={<ProtectedRoute><PracticeSessionPage /></ProtectedRoute>} />
          <Route path="/results/:sessionId" element={<ProtectedRoute><PracticeResultsPage /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
