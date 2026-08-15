import { useState, useRef, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { VISIBLE_LEAGUES } from '../types';
import LeagueLogo from './LeagueLogo';
import { useAuth } from '../contexts/AuthContext';
import { useTimePreference } from '../contexts/TimePreferenceContext';
import LoginModal from './LoginModal';
import CheckoutSuccessBanner from './CheckoutSuccessBanner';
import LiveTicker from './LiveTicker';
import AmIUpCTA from './AmIUpCTA';

const leagues = VISIBLE_LEAGUES;

// `external: true` makes a tool entry open in a new tab and render as
// a plain <a> instead of a router <Link> — used for cross-promo items
// that live outside the SteamWatch app (currently just AmIUp).
// `isNew: true` adds a small red NEW badge to the entry so it visibly
// stands out from the rest of the list.
const tools: Array<{
  name: string;
  path: string;
  icon: string;
  external?: boolean;
  isNew?: boolean;
}> = [
  {
    name: 'AI Bet Tracker',
    path: 'https://amiup.io/?utm_source=steamwatch&utm_medium=cross-promo&utm_campaign=tools',
    icon: '🤖',
    external: true,
    isNew: true,
  },
  // Forecast Engine hidden from nav 2026-08-05 while the player-level
  // (top-scorer) work is in progress — route redirects to home. Re-add
  // this entry and the App.tsx route to bring it back.
  { name: 'Bet Calculator', path: '/tools/bet-calculator', icon: '🎫' },
  { name: 'Hedging Calculator', path: '/tools/hedge-calculator', icon: '🧮' },
  { name: 'Match Model', path: '/tools/match-predictor', icon: '⚽' },
  { name: 'Rolling xG', path: '/tools/rolling-xg', icon: '📊' },
];

export default function Layout() {
  const location = useLocation();
  const { user, logout, manageSubscription, isSubscribed, subscribe } = useAuth();
  const { mode: timeMode, toggle: toggleTimeMode } = useTimePreference();
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
  const isDriftersPage = location.pathname === '/drifters';
  const isClosingLinesPage = location.pathname === '/closing-lines' || location.pathname === '/cl-closing-lines';
  const isTeamPLPage = location.pathname === '/team-pnl';
  const isPowerRankingsPage = location.pathname === '/power-rankings';
  const isOverviewPage = !currentLeague && !isToolsPage && !isSteamResultsPage && !isDriftersPage && !isClosingLinesPage && !isTeamPLPage && !isPowerRankingsPage && location.pathname === '/';

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
              <Link to="/drifters" className={navItemClass(isDriftersPage)}>Drifters</Link>
              <Link to="/closing-lines" className={navItemClass(isClosingLinesPage)}>Closing Lines</Link>
              <Link to="/team-pnl" className={navItemClass(isTeamPLPage)}>Team P/L</Link>
              {/* Power Rankings hidden 2026-08-15 per Neil after the deploy
                  outage (the page itself wasn't the cause — see TODO.md — but
                  it's parked until wanted again). Restore this Link + the
                  mobile-menu entry below + the route in App.tsx to re-enable. */}

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
                  <div className="absolute left-0 mt-3 w-60 bg-slate-800 border border-slate-700 rounded-md shadow-xl shadow-black/30 overflow-hidden z-50">
                    {tools.map((tool) => {
                      const isActive = !tool.external && location.pathname === tool.path;
                      const innerClasses = `flex items-center gap-2.5 px-3 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                        isActive
                          ? 'bg-cyan-500/10 text-cyan-300'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`;
                      const innerContent = (
                        <>
                          <span className="text-sm grayscale opacity-70">{tool.icon}</span>
                          <span className="flex-1">{tool.name}</span>
                          {tool.isNew && (
                            <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-extrabold tracking-[0.08em]">
                              NEW
                            </span>
                          )}
                        </>
                      );
                      return tool.external ? (
                        <a
                          key={tool.path}
                          href={tool.path}
                          target="_blank"
                          rel="noopener"
                          onClick={() => setToolsOpen(false)}
                          className={innerClasses}
                        >
                          {innerContent}
                        </a>
                      ) : (
                        <Link
                          key={tool.path}
                          to={tool.path}
                          onClick={() => setToolsOpen(false)}
                          className={innerClasses}
                        >
                          {innerContent}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </nav>

            {/* Right side: Time toggle + Live pill + Account / Sign In / Upgrade */}
            <div className="hidden md:flex items-center gap-2.5 flex-shrink-0">
              {/* Local/UTC kickoff-time toggle. Defaults to the browser's
                  own local zone (auto-detected — nothing to configure);
                  persisted to localStorage so the choice sticks across
                  visits. Every kickoff time on the site reads this via
                  useTimePreference(). */}
              <button
                onClick={toggleTimeMode}
                title={timeMode === 'local' ? 'Showing times in your local timezone — click for UTC' : 'Showing times in UTC — click for your local timezone'}
                className="flex items-center rounded-full border border-slate-700/60 text-[10px] font-mono font-bold uppercase tracking-[0.1em] overflow-hidden"
              >
                <span className={`px-2 py-1 transition-colors ${timeMode === 'local' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Local</span>
                <span className={`px-2 py-1 transition-colors ${timeMode === 'utc' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>UTC</span>
              </button>

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

        {/* League sub-bar — hidden on mobile (in the mobile menu). */}
        <div className="hidden md:block border-t border-slate-700/30 bg-slate-900/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold flex-shrink-0">Leagues</span>
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
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
              {leagues.map(([key, config]) => {
                const isActive = currentLeague === key;
                return (
                  <Link
                    key={key}
                    to={`/?league=${key}`}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors border whitespace-nowrap ${
                      isActive
                        ? 'bg-cyan-500/15 border-cyan-500/30'
                        : 'bg-transparent border-transparent hover:bg-slate-800/60'
                    }`}
                    title={config.name}
                  >
                    <LeagueLogo sportKey={key} size="sm" />
                    <span className={`font-mono text-[11px] uppercase tracking-[0.1em] font-semibold ${
                      isActive ? 'text-cyan-300' : 'text-slate-400'
                    }`}>
                      {config.shortName}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-700/50 bg-slate-800/95 backdrop-blur-md">
            <div className="px-4 py-4 space-y-4">
              {/* Time display toggle — same control as desktop, styled
                  for the mobile menu's stacked-section layout. */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">Kickoff Times</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { if (timeMode !== 'local') toggleTimeMode(); }}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors ${timeMode === 'local' ? 'bg-slate-700 text-white' : 'bg-slate-700/50 text-slate-400 hover:text-white'}`}
                  >
                    Local
                  </button>
                  <button
                    onClick={() => { if (timeMode !== 'utc') toggleTimeMode(); }}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider transition-colors ${timeMode === 'utc' ? 'bg-slate-700 text-white' : 'bg-slate-700/50 text-slate-400 hover:text-white'}`}
                  >
                    UTC
                  </button>
                </div>
              </div>

              {/* Account section — placed first so existing Pro users can
                  sign in immediately and don't bounce off the paywall.
                  Mirrors the desktop right-nav UX: signed-in shows email
                  + Pro badge + Manage / Sign out; anonymous shows Sign In
                  + Go Pro side by side. */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">Account</p>
                {user ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-700/50">
                      <span className="w-7 h-7 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-xs text-red-400 font-bold font-mono flex-shrink-0">
                        {user.email[0].toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-300 truncate font-mono">{user.email}</p>
                        <p className="text-[10px] font-mono uppercase tracking-wider mt-0.5">
                          {isSubscribed
                            ? <span className="text-emerald-400 font-bold">Pro Subscriber</span>
                            : <span className="text-slate-500">Free Tier</span>}
                        </p>
                      </div>
                    </div>
                    {!isSubscribed && (
                      <button
                        onClick={async () => {
                          setMobileMenuOpen(false);
                          setSubscribing(true);
                          try { await subscribe(); } catch { setSubscribing(false); }
                        }}
                        disabled={subscribing}
                        className="w-full text-center px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider bg-gradient-to-br from-cyan-400 to-cyan-500 text-slate-900 hover:brightness-110 transition-all disabled:opacity-70"
                      >
                        {subscribing ? 'Redirecting…' : 'Go Pro →'}
                      </button>
                    )}
                    {isSubscribed && (
                      <button
                        onClick={() => { setMobileMenuOpen(false); manageSubscription(); }}
                        className="w-full text-left px-4 py-3 rounded-xl text-sm bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                      >
                        Manage Subscription
                      </button>
                    )}
                    <button
                      onClick={() => { setMobileMenuOpen(false); logout(); }}
                      className="w-full text-left px-4 py-3 rounded-xl text-sm bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setLoginMode('signin');
                        setShowLogin(true);
                      }}
                      className="px-4 py-3 rounded-xl text-sm font-semibold uppercase tracking-wider bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={async () => {
                        setMobileMenuOpen(false);
                        if (!user) {
                          setLoginMode('subscribe');
                          setShowLogin(true);
                        } else {
                          setSubscribing(true);
                          try { await subscribe(); } catch { setSubscribing(false); }
                        }
                      }}
                      disabled={subscribing}
                      className="px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider bg-gradient-to-br from-cyan-400 to-cyan-500 text-slate-900 hover:brightness-110 transition-all disabled:opacity-70"
                    >
                      {subscribing ? '…' : 'Go Pro →'}
                    </button>
                  </div>
                )}
              </div>

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
                      isOverviewPage && !currentLeague
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
                    to="/drifters"
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                      isDriftersPage
                        ? 'bg-red-600/20 text-red-400'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">&#8593;</span>
                    <span className="font-medium">Drifters</span>
                  </Link>
                  <Link
                    to="/closing-lines"
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                      isClosingLinesPage
                        ? 'bg-indigo-600/20 text-indigo-400'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">&#9866;</span>
                    <span className="font-medium">Closing Lines</span>
                  </Link>
                  <Link
                    to="/team-pnl"
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                      isTeamPLPage
                        ? 'bg-indigo-600/20 text-indigo-400'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span className="text-lg">&#163;</span>
                    <span className="font-medium">Team P/L</span>
                  </Link>
                  {/* Power Rankings mobile entry hidden 2026-08-15 —
                      see the desktop-nav comment above. */}
                </div>
              </div>

              {/* Tools Section */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2 uppercase tracking-wider">Tools</p>
                <div className="space-y-1">
                  {tools.map((tool) => {
                    const isActive = !tool.external && location.pathname === tool.path;
                    const classes = `flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`;
                    const inner = (
                      <>
                        <span className="text-lg">{tool.icon}</span>
                        <span className="font-medium flex-1">{tool.name}</span>
                        {tool.isNew && (
                          <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-extrabold tracking-[0.08em]">
                            NEW
                          </span>
                        )}
                      </>
                    );
                    return tool.external ? (
                      <a
                        key={tool.path}
                        href={tool.path}
                        target="_blank"
                        rel="noopener"
                        className={classes}
                      >
                        {inner}
                      </a>
                    ) : (
                      <Link key={tool.path} to={tool.path} className={classes}>
                        {inner}
                      </Link>
                    );
                  })}
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-4">
          <AmIUpCTA placement="footer" />
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
