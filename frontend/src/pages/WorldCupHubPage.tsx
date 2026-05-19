import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { QualifyingXg } from '../components/wc/QualifyingXg';
import { useAuth } from '../contexts/AuthContext';
import PaywallOverlay from '../components/PaywallOverlay';

// Tabs available in the World Cup hub. Adding a new section (bracket,
// outright odds, top scorer, etc.) is two lines here + a render branch
// at the bottom of the page — no nav surgery required.
type Tab = 'qualifying-xg';

interface TabDef {
  id: Tab;
  label: string;
  short: string;       // tighter label for narrow screens
  description: string; // one-liner shown under the tab strip when active
  comingSoon?: boolean;
}

const TABS: TabDef[] = [
  {
    id: 'qualifying-xg',
    label: 'Qualifying xG',
    short: 'Qual xG',
    description: 'Per-nation expected-goals breakdown from the qualifying campaign. Wyscout data.',
  },
  // Telegraphed future sections — render as disabled chips with a
  // 'soon' tag so users can see what's coming next.
  // { id: 'outrights', label: 'Outright odds', short: 'Outrights',
  //   description: 'Tournament winner + top scorer odds tracked at Pinnacle.',
  //   comingSoon: true },
  // { id: 'bracket', label: 'Knockout bracket', short: 'Bracket',
  //   description: 'Group standings + projected knockout paths.',
  //   comingSoon: true },
];

export default function WorldCupHubPage() {
  const { isSubscribed } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || TABS[0].id;
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  const setTab = (next: Tab) => {
    const sp = new URLSearchParams(searchParams);
    if (next === TABS[0].id) sp.delete('tab');
    else sp.set('tab', next);
    setSearchParams(sp);
  };

  return (
    <div>
      <Helmet>
        <title>World Cup '26 — SteamWatch</title>
        <meta
          name="description"
          content="Hub for FIFA World Cup 2026 data on SteamWatch: qualifying xG per nation, outright odds tracking, and more during the tournament."
        />
        <link rel="canonical" href="https://www.steamwatch.io/tools/world-cup" />
      </Helmet>

      {/* Page header — uses the WC logo + a gold accent so this section
          visually stands out from the rest of the site during the
          tournament window. */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-10 sm:h-12 rounded-full bg-gradient-to-b from-yellow-400 to-amber-600 flex-shrink-0" />
          <img
            src="/flags/fifa-world-cup-2026.png"
            alt=""
            className="w-10 h-12 sm:w-12 sm:h-14 object-contain flex-shrink-0"
          />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              World Cup '26
            </h1>
            <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">
              Tournament hub &middot; Pinnacle odds, xG, knockout maps
            </p>
          </div>
        </div>
      </div>

      {/* Pro paywall — full-block pattern (matches Drifters). Header
          above stays visible so search engines + free users see what
          the hub is; tabs + data are gated behind Pro. */}
      {!isSubscribed && (
        <div className="mb-6 sm:mb-8">
          <PaywallOverlay
            title="Unlock the World Cup '26 Hub"
            description="Wyscout-sourced qualifying xG for every nation, outright odds tracking, and live tournament data through the final. Pro members get full access."
          />
        </div>
      )}

      {isSubscribed && <>

      {/* Tab strip — looks like the rest of the site's filter pills,
          gold accent on active state to match the WC visual treatment. */}
      <div className="mb-4 sm:mb-6 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const isActive = t.id === tab;
          const disabled = t.comingSoon;
          return (
            <button
              key={t.id}
              onClick={() => !disabled && setTab(t.id)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border ${
                disabled
                  ? 'bg-slate-800/40 text-slate-600 border-slate-700/40 cursor-not-allowed'
                  : isActive
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-700/60 hover:text-white'
              }`}
              title={t.description}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
              {disabled && <span className="ml-1.5 text-[9px] text-slate-500">soon</span>}
            </button>
          );
        })}
      </div>

      {/* One-line context for the active tab. */}
      <p className="text-xs sm:text-sm text-slate-400 mb-4 sm:mb-6">{active.description}</p>

      {/* Tab content. We override the QualifyingXg component's CSS
          custom properties on this wrapper so its panels pick up
          SteamWatch's slate palette instead of the warm-black hex
          fallbacks that ship with the component. Variable list is
          declared on the component (see qualifying-xg.tsx header
          comment). */}
      <div
        style={{
          // Backgrounds — slate-900 / slate-800 family to match the
          // rest of the site.
          '--color-bg':         '#0f172a',  // slate-900
          '--color-bg-2':       '#0b1220',  // slightly darker for striped rows
          '--color-surface':    '#1e293b',  // slate-800 (panel bg)
          '--color-surface-2':  '#334155',  // slate-700 (selected pill bg)
          '--color-surface-3':  '#1e293b',  // slate-800 (dominance bar gutter)
          // Borders
          '--color-border':     '#334155',  // slate-700
          '--color-border-2':   '#475569',  // slate-600
          // Text ramp
          '--color-text':       '#ffffff',
          '--color-text-2':     '#cbd5e1',  // slate-300
          '--color-text-3':     '#94a3b8',  // slate-400
          '--color-text-4':     '#64748b',  // slate-500
          // Accents — gold becomes amber to match the WC header,
          // green/red retuned to SteamWatch's emerald/red tokens.
          '--color-gold':       '#fbbf24',  // amber-400
          '--color-gold-2':     '#f59e0b',  // amber-500
          '--color-green':      '#34d399',  // emerald-400
          '--color-red':        '#f87171',  // red-400
        } as React.CSSProperties}
      >
        {tab === 'qualifying-xg' && <QualifyingXg />}
      </div>

      </>}
    </div>
  );
}
