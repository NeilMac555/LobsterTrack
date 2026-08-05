import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './contexts/AuthContext';
import { TimePreferenceProvider } from './contexts/TimePreferenceContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import MatchDetailPage from './pages/MatchDetailPage';
import HedgeCalculatorPage from './pages/HedgeCalculatorPage';
import BetCalculatorPage from './pages/BetCalculatorPage';
import MatchPredictorPage from './pages/MatchPredictorPage';
import SteamResultsPage from './pages/SteamResultsPage';
import DriftersPage from './pages/DriftersPage';
import ClosingLinesPage from './pages/ClosingLinesPage';
import CLClosingLinesPage from './pages/CLClosingLinesPage';
import AdminEmailsPage from './pages/AdminEmailsPage';
import AuthVerifyPage from './pages/AuthVerifyPage';
import AboutPage from './pages/AboutPage';
import BlogIndexPage from './pages/BlogIndexPage';
import BlogPostPage from './pages/BlogPostPage';
import RollingXGPage from './pages/RollingXGPage';
import TeamPLPage from './pages/TeamPLPage';
import InPlayJumpsPage from './pages/InPlayJumpsPage';
import ForecastPage from './pages/ForecastPage';

function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
        <TimePreferenceProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="match/:matchId" element={<MatchDetailPage />} />
              <Route path="steam-results" element={<SteamResultsPage />} />
              <Route path="drifters" element={<DriftersPage />} />
              <Route path="closing-lines" element={<ClosingLinesPage />} />
              <Route path="cl-closing-lines" element={<CLClosingLinesPage />} />
              <Route path="team-pnl" element={<TeamPLPage />} />
              <Route path="in-play-jumps" element={<InPlayJumpsPage />} />
              <Route path="tools/hedge-calculator" element={<HedgeCalculatorPage />} />
              <Route path="tools/bet-calculator" element={<BetCalculatorPage />} />
              <Route path="tools/match-predictor" element={<MatchPredictorPage />} />
              <Route path="tools/rolling-xg" element={<RollingXGPage />} />
              <Route path="tools/forecast" element={<ForecastPage />} />
              {/* The WC hub was removed once the tournament ended — old
                  bookmarks/shared links should land on the homepage
                  instead of a blank page. */}
              <Route path="tools/world-cup" element={<Navigate to="/" replace />} />
              <Route path="auth/verify" element={<AuthVerifyPage />} />
              <Route path="admin/emails" element={<AdminEmailsPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="blog" element={<BlogIndexPage />} />
              <Route path="blog/:slug" element={<BlogPostPage />} />
            </Route>
          </Routes>
        </TimePreferenceProvider>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}

export default App;
