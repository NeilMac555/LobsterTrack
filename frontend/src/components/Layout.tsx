import { useState, useRef, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LEAGUE_CONFIG } from '../types';
import LeagueLogo from './LeagueLogo';
import { useAuth } from '../contexts/AuthContext';
import LoginModal from './LoginModal';
import CheckoutSuccessBanner from './CheckoutSuccessBanner';
import LiveTicker from './LiveTicker';

const leagues = Object.entries(LEAGUE_CONFIG);

const tools = [
  { name: 'Hedging Calculator', path: '/tools/hedge-calculator', icon: '🧮' },
  { name: 'Match Model', path: '/tools/match-predictor', icon: '⚽' },
  { name: 'Rolling xG', path: '/tools/rolling-xg', icon: '📊' },
];

export default function Layout() {
  const location = useLocation();
  const { user, logout, manageSubscription, isSubscribed } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const currentLeague = new URLSearchParams(location.search).get('league');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setToolsOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const isToolsPage = location.pathname.startsWith('/tools');
  const isSteamResultsPage = location.pathname === '/steam-results';
  const isCLClosingPage = location.pathname === '/cl-closing-lines';
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group">
              {/* SVG Logo */}
              <svg
                viewBox="0 0 32 32"
                className="w-8 h-8 sm:w-9 sm:h-9"
                fill="none"
              >
                {/* Background circle */}
                <circle cx="16" cy="16" r="15" className="fill-slate-700/50 stroke-slate-600" strokeWidth="1"/>
                {/* Trend line chart */}
                <path
                  d="M7 22 L12 17 L17 19 L25 10"
                  className="stroke-emerald-400"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                {/* Arrow head */}
                <path
                  d="M22 10 L25 10 L25 13"
                  className="stroke-emerald-400"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
              <span className="text-lg sm:text-xl font-bold text-white group-hover:text-blue-400 transition-colors">
                SteamWatch
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-2">
              <span className="text-sm text-slate-400 mr-2 font-medium">Leagues:</span>
              {leagues.map(([key, config]) => (
                <Link
                  key={key}
                  to={`/?league=${key}`}
                  className={`p-2 rounded-xl transition-all duration-200 ${
                    currentLeague === key
                      ? 'bg-blue-600 ring-2 ring-blue-400/50 shadow-lg shadow-blue-500/20'
                      : 'bg-slate-700/80 hover:bg-slate-600 hover:scale-105'
                  }`}
                  title={config.name}
                >
                  <LeagueLogo sportKey={key} size="sm" />
                </Link>
              ))}
              <Link
                to="/"
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  !currentLeague && !isToolsPage && !isSteamResultsPage && !isCLClosingPage
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white'
                }`}
              >
                All
              </Link>

              {/* Divider */}
              <div className="w-px h-6 bg-slate-600 mx-2"></div>

              {/* Steam Results */}
              <Link
                to="/steam-results"
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  isSteamResultsPage
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                    : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white'
                }`}
              >
                Steam Results
              </Link>

              {/* CL Closing Lines */}
              <Link
                to="/cl-closing-lines"
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  isCLClosingPage
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white'
                }`}
              >
                Closing Lines
              </Link>

              {/* Tools Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setToolsOpen(!toolsOpen)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isToolsPage
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white'
                  }`}
                >
                  Tools
                  <svg
                    className={`w-4 h-4 transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {toolsOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl shadow-black/20 overflow-hidden z-50">
                    {tools.map((tool) => (
                      <Link
                        key={tool.path}
                        to={tool.path}
                        onClick={() => setToolsOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                          location.pathname === tool.path
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        <span className="text-lg">{tool.icon}</span>
                        <span className="font-medium">{tool.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-slate-600 mx-2"></div>

              {/* Account */}
              {user ? (
                <div className="relative" ref={accountRef}>
                  <button
                    onClick={() => setAccountOpen(!accountOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white transition-all duration-200"
                  >
                    <span className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-xs text-red-400 font-bold">
                      {user.email[0].toUpperCase()}
                    </span>
                    {isSubscribed && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold uppercase">Pro</span>}
                  </button>
                  {accountOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl shadow-black/20 overflow-hidden z-50">
                      <div className="px-4 py-3 border-b border-slate-700/50">
                        <p className="text-xs text-slate-400 truncate">{user.email}</p>
                        <p className="text-xs mt-1">
                          {isSubscribed
                            ? <span className="text-emerald-400 font-semibold">Pro subscriber</span>
                            : <span className="text-slate-500">Free tier</span>
                          }
                        </p>
                      </div>
                      {isSubscribed && (
                        <button
                          onClick={() => { setAccountOpen(false); manageSubscription(); }}
                          className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          Manage Subscription
                        </button>
                      )}
                      <button
                        onClick={() => { setAccountOpen(false); logout(); }}
                        className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white transition-all duration-200"
                >
                  Sign In
                </button>
              )}
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-700/50 bg-slate-800/95 backdrop-blur-md">
            <div className="px-4 py-4 space-y-4">
              {/* League Buttons */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">Leagues</p>
                <div className="flex flex-wrap gap-2">
                  {leagues.map(([key, config]) => (
                    <Link
                      key={key}
                      to={`/?league=${key}`}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 ${
                        currentLeague === key
                          ? 'bg-blue-600 ring-2 ring-blue-400/50'
                          : 'bg-slate-700/80 hover:bg-slate-600'
                      }`}
                    >
                      <LeagueLogo sportKey={key} size="sm" />
                      <span className="text-sm text-white font-medium">{config.shortName}</span>
                    </Link>
                  ))}
                  <Link
                    to="/"
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      !currentLeague && !isToolsPage && !isSteamResultsPage && !isCLClosingPage
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    All
                  </Link>
                </div>
              </div>

              {/* Results Section */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">Results</p>
                <div className="space-y-1">
                  <Link
                    to="/steam-results"
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                      isSteamResultsPage
                        ? 'bg-amber-600/20 text-amber-400'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">&#9889;</span>
                    <span className="font-medium">Steam Results</span>
                  </Link>
                  <Link
                    to="/cl-closing-lines"
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                      isCLClosingPage
                        ? 'bg-indigo-600/20 text-indigo-400'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">&#9866;</span>
                    <span className="font-medium">Closing Lines</span>
                  </Link>
                </div>
              </div>

              {/* Tools Section */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">Tools</p>
                <div className="space-y-1">
                  {tools.map((tool) => (
                    <Link
                      key={tool.path}
                      to={tool.path}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                        location.pathname === tool.path
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <span className="text-lg">{tool.icon}</span>
                      <span className="font-medium">{tool.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Live odds ticker — real-time biggest movers scrolling */}
      <LiveTicker />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <CheckoutSuccessBanner />
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-slate-800/50 border-t border-slate-700/50 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <p className="text-center text-slate-500 text-xs sm:text-sm font-medium">
            Pinnacle odds via The Odds API • Updates every 15 minutes
          </p>
        </div>
      </footer>

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
