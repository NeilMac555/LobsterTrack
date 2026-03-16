import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import MatchDetailPage from './pages/MatchDetailPage';
import HedgeCalculatorPage from './pages/HedgeCalculatorPage';
import MatchPredictorPage from './pages/MatchPredictorPage';
import SteamResultsPage from './pages/SteamResultsPage';
import ClosingLinesPage from './pages/ClosingLinesPage';
import CLClosingLinesPage from './pages/CLClosingLinesPage';
import AdminEmailsPage from './pages/AdminEmailsPage';
import AuthVerifyPage from './pages/AuthVerifyPage';
import AboutPage from './pages/AboutPage';

function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="match/:matchId" element={<MatchDetailPage />} />
              <Route path="steam-results" element={<SteamResultsPage />} />
              <Route path="closing-lines" element={<ClosingLinesPage />} />
              <Route path="cl-closing-lines" element={<CLClosingLinesPage />} />
              <Route path="tools/hedge-calculator" element={<HedgeCalculatorPage />} />
              <Route path="tools/match-predictor" element={<MatchPredictorPage />} />
              <Route path="auth/verify" element={<AuthVerifyPage />} />
              <Route path="admin/emails" element={<AdminEmailsPage />} />
              <Route path="about" element={<AboutPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}

export default App;
