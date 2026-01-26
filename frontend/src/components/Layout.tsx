import { Link, Outlet, useLocation } from 'react-router-dom';
import { LEAGUE_CONFIG } from '../types';
import LeagueLogo from './LeagueLogo';

const leagues = Object.entries(LEAGUE_CONFIG);

export default function Layout() {
  const location = useLocation();
  const currentLeague = new URLSearchParams(location.search).get('league');

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex items-center text-2xl">
                <span role="img" aria-label="stats">📊</span>
                <span role="img" aria-label="check">✅</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">PinnacleWatch</h1>
                <p className="text-xs text-slate-400">Pinnacle Odds Tracker</p>
              </div>
            </Link>

            <nav className="flex items-center gap-2">
              <span className="text-sm text-slate-400 mr-2 hidden sm:inline">Leagues:</span>
              {leagues.map(([key, config]) => (
                <Link
                  key={key}
                  to={`/?league=${key}`}
                  className={`p-1.5 rounded-lg transition-all ${
                    currentLeague === key
                      ? 'bg-blue-600 ring-2 ring-blue-400'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                  title={config.name}
                >
                  <LeagueLogo sportKey={key} size="sm" />
                </Link>
              ))}
              <Link
                to="/"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  !currentLeague
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                All
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-slate-800 border-t border-slate-700 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-slate-500 text-sm">
            Data from Pinnacle via The Odds API • Updates every 15 minutes
          </p>
        </div>
      </footer>
    </div>
  );
}
