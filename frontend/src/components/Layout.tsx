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
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">LobsterTrack</h1>
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
