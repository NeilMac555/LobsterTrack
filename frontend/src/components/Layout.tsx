import { useState, useRef, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LEAGUE_CONFIG } from '../types';
import LeagueLogo from './LeagueLogo';

const leagues = Object.entries(LEAGUE_CONFIG);

const tools = [
  { name: 'Hedging Calculator', path: '/tools/hedge-calculator', icon: '🧮' },
];

export default function Layout() {
  const location = useLocation();
  const currentLeague = new URLSearchParams(location.search).get('league');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setToolsOpen(false);
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

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 group">
              <div className="flex items-center text-xl sm:text-2xl">
                <span role="img" aria-label="stats">📊</span>
                <span role="img" aria-label="check">✅</span>
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white group-hover:text-blue-400 transition-colors">PinnacleWatch</h1>
                <p className="text-[10px] sm:text-xs text-slate-400 hidden xs:block">Pinnacle Odds Tracker</p>
              </div>
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
                  !currentLeague && !isToolsPage
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600 hover:text-white'
                }`}
              >
                All
              </Link>

              {/* Divider */}
              <div className="w-px h-6 bg-slate-600 mx-2"></div>

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
                      !currentLeague && !isToolsPage
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    All
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-slate-800/50 border-t border-slate-700/50 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <p className="text-center text-slate-500 text-xs sm:text-sm font-medium">
            Data from Pinnacle via The Odds API • Updates every 15 minutes
          </p>
        </div>
      </footer>
    </div>
  );
}
