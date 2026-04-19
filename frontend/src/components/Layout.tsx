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
  const { user, logout, manageSubscription, isSubscribed, subscribe } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<'signin' | 'subscribe'>('signin');
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
  const isOverviewPage = !currentLeague && !isToolsPage && !isSteamResultsPage && !isCLClosingPage && location.pathname === '/';

  const navItemClass = (active: boolean) =>
    `relative px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
      active
        ? 'text-white'
        : 'text-slate-400 hover:text-white'
    } ${active ? "after:content-[''] after:absolute after:left-3 after:right-3 after:-bottom-[13px] after:h-[2px] after:bg-cyan-400 after:rounded-full" : ''}`;

  return (
    <div className="min-h-screen">
      {/* Main compact header — terminal style */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[52px] gap-4">
            {/* Brand — "Line Break" mark + wordmark with muted .io.
                Brand guide: Inter Tight 700 wordmark, .io in 500/ink-sub. */}
            <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0">
              <img
                src="/logos/mark-on-dark.svg"
                width={28}
                height={28}
                alt=""
                className="flex-shrink-0 rounded-[7px]"
                style={{ display: 'block' }}
              />
              <span
                className="text-[18px] font-bold tracking-tight group-hover:opacity-90 transition-opacity"
                style={{ color: '#e8edf0', letterSpacing: '-0.02em' }}
              >
                SteamWatch<span className="font-medium" style={{ color: '#8a94a0' }}>.io</span>
              </span>
            </Link>

            {/* Desktop flat nav */}
            <nav className="hidden md:flex items-center gap-1 flex-1">
              <Link to="/" className={navItemClass(isOverviewPage)}>Overview</Link>
              <Link to="/steam-results" className={navItemClass(isSteamResultsPage)}>Steam Results</Link>
              <Link to="/cl-closing-lines" className={navItemClass(isCLClosingPage)}>Closing Lines</Link>

              {/* Tools dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setToolsOpen(!toolsOpen)}
                  className={navItemClass(isToolsPage) + ' flex items-center gap-1'}
                >
                  Tools
                  <svg
                    className={`w-3 h-3 transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {toolsOpen && (
                  <div className="absolute left-0 mt-3 w-56 bg-slate-800 border border-slate-700 rounded-md shadow-xl shadow-black/30 overflow-hidden z-50">
                    {tools.map((tool) => (
                      <Link
                        key={tool.path}
                        to={tool.path}
                        onClick={() => setToolsOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                          location.pathname === tool.path
                            ? 'bg-cyan-500/10 text-cyan-300'
                            : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        <span className="text-base">{tool.icon}</span>
                        <span className="font-medium">{tool.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            {/* Right side: Live pill + Account / Sign In / Upgrade */}
            <div className="hidden md:flex items-center gap-2.5 flex-shrink-0">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-slate-700/60 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                Live · Pinnacle
              </span>

              {/* Primary CTA: Go Pro for anyone who isn't subscribed.
                  Anonymous users trigger the email-modal which flows straight
                  into Stripe public checkout. Signed-in non-subscribers use
                  the authenticated subscribe() flow directly. */}
              {!isSubscribed && (
                <button
                  onClick={async () => {
                    if (!user) {
                      setLoginMode('subscribe');
                      setShowLogin(true);
                    } else {
                      setSubscribing(true);
                      try { await subscribe(); } catch { setSubscribing(false); }
                    }
                  }}
                  disabled={subscribing}
                  className="px-3.5 py-1.5 rounded-md font-mono text-[11px] font-bold uppercase tracking-[0.1em] bg-gradient-to-br from-cyan-400 to-cyan-500 text-slate-900 hover:brightness-110 transition-all shadow-sm shadow-cyan-500/40 disabled:opacity-70"
                >
                  {subscribing ? 'Redirecting…' : 'Go Pro →'}
                </button>
              )}

              {/* Account badge (signed-in) OR a subtle 'sign in' text link
                  (anonymous). Sign In is now tertiary — the primary path is
                  Go Pro. */}
              {user ? (
                <div className="relative" ref={accountRef}>
                  <button
                    onClick={() => setAccountOpen(!accountOpen)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors"
                  >
                    <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-[10px] text-red-400 font-bold font-mono">
                      {user.email[0].toUpperCase()}
                    </span>
                    {isSubscribed && <span className="text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1 py-0.5 rounded">Pro</span>}
                  </button>
                  {accountOpen && (
                    <div className="absolute right-0 mt-3 w-56 bg-slate-800 border border-slate-700 rounded-md shadow-xl shadow-black/30 overflow-hidden z-50">
                      <div className="px-3 py-2.5 border-b border-slate-700/50">
                        <p className="text-xs text-slate-400 truncate font-mono">{user.email}</p>
                        <p className="text-[10px] font-mono uppercase tracking-wider mt-1">
                          {isSubscribed
                            ? <span className="text-emerald-400 font-bold">Pro Subscriber</span>
                            : <span className="text-slate-500">Free Tier</span>
                          }
                        </p>
                      </div>
                      {isSubscribed && (
                        <button
                          onClick={() => { setAccountOpen(false); manageSubscription(); }}
                          className="w-full text-left px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          Manage Subscription
                        </button>
                      )}
                      <button
                        onClick={() => { setAccountOpen(false); logout(); }}
                        className="w-full text-left px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => { setLoginMode('signin'); setShowLogin(true); }}
                  className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 hover:text-white transition-colors px-1"
                >
                  Sign In
                </button>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* League sub-bar — hidden on mobile (in the mobile menu) */}
        <div className="hidden md:block border-t border-slate-700/30 bg-slate-900/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold flex-shrink-0">Leagues</span>
            <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar">
              <Link
                to="/"
                className={`px-2.5 py-1 rounded font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border whitespace-nowrap ${
                  isOverviewPage && !currentLeague
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                    : 'bg-transparent text-slate-400 border-transparent hover:text-white hover:bg-slate-800/60'
                }`}
              >
                All
              </Link>
              {leagues.map(([key, config]) => (
                <Link
                  key={key}
                  to={`/?league=${key}`}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors border whitespace-nowrap ${
                    currentLeague === key
                      ? 'bg-cyan-500/15 border-cyan-500/30'
                      : 'bg-transparent border-transparent hover:bg-slate-800/60'
                  }`}
                  title={config.name}
                >
                  <LeagueLogo sportKey={key} size="sm" />
                  <span className={`font-mono text-[11px] uppercase tracking-[0.1em] font-semibold ${
                    currentLeague === key ? 'text-cyan-300' : 'text-slate-400'
                  }`}>
                    {config.shortName}
                  </span>
                </Link>
              ))}
            </div>
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

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        mode={loginMode}
      />
    </div>
  );
}
