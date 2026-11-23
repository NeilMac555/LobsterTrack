import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './contexts/AuthContext';
import { TimePreferenceProvider } from './contexts/TimePreferenceContext';
import { OddsFormatProvider } from './contexts/OddsFormatContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import LeaguePage from './pages/LeaguePage';

const ProPage = lazy(() => import('./pages/ProPage'));
const MatchDetailPage = lazy(() => import('./pages/MatchDetailPage'));
const HedgeCalculatorPage = lazy(() => import('./pages/HedgeCalculatorPage'));
const BetCalculatorPage = lazy(() => import('./pages/BetCalculatorPage'));
const MatchPredictorPage = lazy(() => import('./pages/MatchPredictorPage'));
const SteamResultsPage = lazy(() => import('./pages/SteamResultsPage'));
const DriftersPage = lazy(() => import('./pages/DriftersPage'));
const DroppingOddsPage = lazy(() => import('./pages/DroppingOddsPage'));
const GoalsComingSoonPage = lazy(() => import('./pages/GoalsComingSoonPage'));
const JusticeTablePage = lazy(() => import('./pages/JusticeTablePage'));
const ClosingLinesPage = lazy(() => import('./pages/ClosingLinesPage'));
const AdminEmailsPage = lazy(() => import('./pages/AdminEmailsPage'));
const AuthVerifyPage = lazy(() => import('./pages/AuthVerifyPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const BlogIndexPage = lazy(() => import('./pages/BlogIndexPage'));
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'));
const RollingXGPage = lazy(() => import('./pages/RollingXGPage'));
const ClubRatingsPage = lazy(() => import('./pages/ClubRatingsPage'));
const FormLabPage = lazy(() => import('./pages/FormLabPage'));
const ResearchLabPage = lazy(() => import('./pages/ResearchLabPage'));
const TeamPLPage = lazy(() => import('./pages/TeamPLPage'));
// PowerRankingsPage is temporarily hidden (see the redirected route below).
const InPlayJumpsPage = lazy(() => import('./pages/InPlayJumpsPage'));
const LongshotBiasPage = lazy(() => import('./pages/LongshotBiasPage'));
const ProDemoPage = lazy(() => import('./pages/ProDemoPage'));
// ForecastPage is temporarily hidden (see the redirected route below).

function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
        <TimePreferenceProvider>
        <OddsFormatProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="pro" element={<ProPage />} />
              <Route path="pro/demo" element={<Suspense fallback={<p role="status" className="py-16 text-center text-slate-300">Loading the Pro demo…</p>}><ProDemoPage /></Suspense>} />
              <Route path="match/:matchId" element={<MatchDetailPage />} />
              <Route path="steam-results" element={<SteamResultsPage />} />
              <Route path="dropping-odds" element={<DroppingOddsPage />} />
              <Route path="league/:slug" element={<LeaguePage />} />
              <Route path="goals-coming-soon" element={<GoalsComingSoonPage />} />
              <Route path="justice-table" element={<JusticeTablePage />} />
              <Route path="drifters" element={<DriftersPage />} />
              <Route path="closing-lines" element={<ClosingLinesPage />} />
              <Route path="cl-closing-lines" element={<Navigate to="/closing-lines?league=soccer_uefa_champs_league" replace />} />
              <Route path="team-pnl" element={<TeamPLPage />} />
              {/* Power Rankings hidden 2026-08-15 per Neil after the deploy
                  outage — parked, not deleted (the fitter, API routes and
                  data all remain; the weekly refresh job is paused in
                  scheduler.py). Restore the PowerRankingsPage import + this
                  route + the Layout.tsx nav entries to re-enable. */}
              <Route path="power-rankings" element={<Navigate to="/tools/club-ratings" replace />} />
              <Route path="in-play-jumps" element={<InPlayJumpsPage />} />
              <Route path="longshot-bias" element={<LongshotBiasPage />} />
              {/* Short-lived original URL for this page (renamed same day). */}
              <Route path="favs-dogs" element={<Navigate to="/longshot-bias" replace />} />
              <Route path="tools/hedge-calculator" element={<HedgeCalculatorPage />} />
              <Route path="tools/bet-calculator" element={<BetCalculatorPage />} />
              <Route path="tools/match-predictor" element={<MatchPredictorPage />} />
              <Route path="tools/rolling-xg" element={<RollingXGPage />} />
              <Route path="tools/form-lab" element={<FormLabPage />} />
              <Route path="tools/research-lab" element={<Suspense fallback={<p role="status">Loading Research Lab…</p>}><ResearchLabPage /></Suspense>} />
              <Route path="tools/club-ratings" element={<ClubRatingsPage />} />
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
        </OddsFormatProvider>
        </TimePreferenceProvider>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}

export default App;
