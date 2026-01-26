import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import MatchDetailPage from './pages/MatchDetailPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="match/:matchId" element={<MatchDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
