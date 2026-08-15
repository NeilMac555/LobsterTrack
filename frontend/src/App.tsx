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
// PowerRankingsPage is temporarily hidden (see the redirected route below).
import InPlayJumpsPage from './pages/InPlayJumpsPage';
// ForecastPage is temporarily hidden (see the redirected route below).

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
              {/* Power Rankings hidden 2026-08-15 per Neil after the deploy
                  outage — parked, not deleted (the fitter, API routes and
                  data all remain; the weekly refresh job is paused in
                  scheduler.py). Restore the PowerRankingsPage import + this
                  route + the Layout.tsx nav entries to re-enable. */}
              <Route path="power-rankings" element={<Navigate to="/" replace />} />
              <Route path="in-play-jumps" element={<InPlayJumpsPage />} />
              <Route path="tools/hedge-calculator" element={<HedgeCalculatorPage />} />
              <Route path="tools/bet-calculator" element={<BetCalculatorPage />} />
              <Route path="tools/match-predictor" element={<MatchPredictorPage />} />
              <Route path="tools/rolling-xg" element={<RollingXGPage />} />
              {/* Forecast Engine hidden 2026-08-05 while player-level
                  (top-scorer) forecasting is built out — redirect to home
                  so existing links don't dead-end. Restore the
                  <ForecastPage/> import + this route to re-enable. */}
              <Route path="tools/forecast" element={<Navigate to="/" replace />} />
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
