import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { getClosingLinesGrouped } from '../api';
import type { MatchClosingLines } from '../types';
import { LEAGUE_CONFIG } from '../types';
import LeagueLogo from '../components/LeagueLogo';
import { useAuth } from '../contexts/AuthContext';
import PaywallOverlay from '../components/PaywallOverlay';

// How many records to pull from the API in one go. Pagination by week
// happens client-side so users can drill into older matchweeks too.
const FETCH_LIMIT = 500;

interface WeekGroup {
  weekStart: Date;     // Monday 00:00
  weekEnd: Date;       // Sunday 23:59
  key: string;         // ISO date of weekStart, used as React key
  matches: MatchClosingLines[];
}

function groupByWeek(matches: MatchClosingLines[]): WeekGroup[] {
  const buckets = new Map<string, WeekGroup>();
  for (const m of matches) {
    const ko = new Date(m.kickoff_time);
    // Mon-Sun, ISO week
    const weekStart = startOfWeek(ko, { weekStartsOn: 1 });
    const key = weekStart.toISOString().slice(0, 10);
    if (!buckets.has(key)) {
      buckets.set(key, {
        weekStart,
        weekEnd: endOfWeek(ko, { weekStartsOn: 1 }),
        key,
        matches: [],
      });
    }
    buckets.get(key)!.matches.push(m);
  }
  // Newest week first
  return [...buckets.values()].sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
}

function fmtOdds(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(2);
}

function fmtLine(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v > 0 ? `+${v}` : String(v);
}

export default function ClosingLinesPage() {
  const { isSubscribed } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const league = searchParams.get('league') || '';

  const [matches, setMatches] = useState<MatchClosingLines[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Map weekKey -> open boolean. Most recent week defaults open.
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getClosingLinesGrouped({ league: league || undefined, limit: FETCH_LIMIT })
      .then((res) => {
        if (!alive) return;
        setMatches(res.matches);
        setTotal(res.total);
      })
      .catch(() => alive && setError('Failed to load closing lines.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [league]);

  const weeks = useMemo(() => groupByWeek(matches), [matches]);

  // Default: most recent week expanded, the rest collapsed. Keys reset
  // when the league filter changes (since the matches list reloads).
  useEffect(() => {
    if (weeks.length === 0) return;
    setOpenWeeks((prev) => {
      // Preserve any already-toggled week, but ensure the newest is open
      // if the user hasn't explicitly closed it.
      if (prev[weeks[0].key] === undefined) {
        return { ...prev, [weeks[0].key]: true };
      }
      return prev;
    });
  }, [weeks]);

  const setLeagueFilter = (key: string) => {
    if (key) setSearchParams({ league: key });
    else setSearchParams({});
  };

  const leagues = Object.entries(LEAGUE_CONFIG);

  return (
    <div>
      <Helmet>
        <title>Closing Lines — SteamWatch</title>
        <meta name="description" content="Pinnacle 1X2, Asian Handicap and Totals closing lines for every tracked European football match, grouped by matchweek." />
        <meta property="og:title" content="Closing Lines — SteamWatch" />
        <meta property="og:url" content="https://www.steamwatch.io/closing-lines" />
        <link rel="canonical" href="https://www.steamwatch.io/closing-lines" />
      </Helmet>

      {/* Page header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-8 sm:h-10 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 flex-shrink-0" />
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Closing Lines</h1>
            <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em]">
              Pinnacle close prices &middot; 1X2 / Asian Handicap / Totals &middot; grouped by matchweek
            </p>
          </div>
        </div>
      </div>

      {/* Sneak-peek paywall: free users see the entire page rendered with
          real closing-line data, blurred and non-interactive. The
          PaywallOverlay sits above the visible portion so the value prop
          ('there's a ton of data behind here') is immediately obvious.
          Pro users get the full interactive experience. */}
      <div className="relative">
        <div
          className={
            !isSubscribed
              ? 'blur-sm opacity-50 pointer-events-none select-none max-h-[680px] overflow-hidden [mask-image:linear-gradient(180deg,black_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(180deg,black_60%,transparent_100%)]'
              : ''
          }
          aria-hidden={!isSubscribed}
        >
          {/* League filter */}
          <div className="flex flex-wrap gap-1.5 mb-4 sm:mb-6">
            <button
              onClick={() => setLeagueFilter('')}
              className={`px-3 py-1.5 rounded-md font-mono text-[11px] uppercase tracking-[0.1em] font-semibold transition-colors border ${
                !league
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-700/60 hover:text-white'
              }`}
            >
              All Leagues
            </button>
            {leagues.map(([key, config]) => (
              <button
                key={key}
                onClick={() => setLeagueFilter(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors border ${
                  league === key
                    ? 'bg-indigo-500/20 border-indigo-500/40'
                    : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-700/60'
                }`}
                title={config.name}
              >
                <LeagueLogo sportKey={key} size="sm" />
                <span
                  className={`font-mono text-[11px] uppercase tracking-[0.1em] font-semibold hidden sm:inline ${
                    league === key ? 'text-indigo-300' : 'text-slate-300'
                  }`}
                >
                  {config.shortName}
                </span>
              </button>
            ))}
          </div>

          {/* Stat strip — totals across the loaded set */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">
                Matches loaded
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-1.5">
                {matches.length}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 mt-1">
                of {total.toLocaleString()} total
              </div>
            </div>
            <div className="bg-slate-800/80 rounded-xl border border-slate-700/60 px-3 sm:px-4 py-2.5 sm:py-3">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">
                Matchweeks
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-1.5">
                {weeks.length}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 mt-1">
                grouped Mon–Sun
              </div>
            </div>
            <div className="bg-slate-800/80 rounded-xl border border-indigo-500/30 px-3 sm:px-4 py-2.5 sm:py-3">
              <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-indigo-400/80 font-semibold">
                Filter
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-indigo-400 leading-none mt-1.5">
                {league ? (LEAGUE_CONFIG[league]?.shortName || league) : 'All'}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 mt-1">active league</div>
            </div>
          </div>

          {/* Loading / error states */}
          {loading && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
              <p className="text-slate-400">Loading closing lines…</p>
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && weeks.length === 0 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
              <p className="text-slate-400">No closing lines yet for this filter.</p>
            </div>
          )}

          {/* Weekly accordions */}
          {!loading && !error && weeks.map((week, weekIdx) => {
            const isOpen = openWeeks[week.key] ?? (weekIdx === 0);
            const dateLabel = `${format(week.weekStart, 'MMM d')} – ${format(week.weekEnd, 'MMM d, yyyy')}`;
            return (
              <div
                key={week.key}
                className="bg-slate-800/80 rounded-xl border border-slate-700/60 overflow-hidden mb-3"
              >
                {/* Week header (clickable to toggle) */}
                <button
                  onClick={() => setOpenWeeks((p) => ({ ...p, [week.key]: !isOpen }))}
                  className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-slate-700/20 transition-colors"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-1 h-5 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 flex-shrink-0" />
                    <div className="text-left min-w-0">
                      <div className="text-white font-bold text-sm sm:text-base tracking-tight">
                        {dateLabel}
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mt-0.5 tabular-nums">
                        {week.matches.length} {week.matches.length === 1 ? 'match' : 'matches'}
                      </div>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Match rows */}
                {isOpen && (
                  <div className="border-t border-slate-700/50 divide-y divide-slate-700/40">
                    {week.matches.map((m) => {
                      const cfg = LEAGUE_CONFIG[m.league];
                      const ko = new Date(m.kickoff_time);
                      return (
                        <Link
                          key={m.match_id}
                          to={`/match/${m.match_id}`}
                          className="block px-4 sm:px-5 py-3 hover:bg-slate-700/15 transition-colors"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                            {/* Left: meta + teams */}
                            <div className="flex items-center gap-3 min-w-0 lg:w-[280px] flex-shrink-0">
                              <LeagueLogo sportKey={m.league} size="sm" />
                              <div className="min-w-0">
                                <div className="text-white font-semibold text-sm tracking-tight truncate">
                                  {m.home_team} <span className="text-slate-500 font-normal">vs</span> {m.away_team}
                                </div>
                                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-0.5 tabular-nums">
                                  {cfg?.shortName || m.league} · {format(ko, 'EEE d MMM HH:mm')}
                                </div>
                              </div>
                            </div>

                            {/* Right: closing odds for all 3 markets, inline */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-mono lg:ml-auto">
                              {m.h2h ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">1X2</span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-white tabular-nums">
                                    {fmtOdds(m.h2h.close_home)}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-white tabular-nums">
                                    {fmtOdds(m.h2h.close_draw)}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-white tabular-nums">
                                    {fmtOdds(m.h2h.close_away)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[9px] text-slate-600 uppercase tracking-wider">no 1X2</span>
                              )}

                              {m.asian_handicap ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">AH</span>
                                  <span className="text-amber-400 font-semibold tabular-nums">
                                    {fmtLine(m.asian_handicap.close_line)}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-white tabular-nums">
                                    {fmtOdds(m.asian_handicap.close_home_price)}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-white tabular-nums">
                                    {fmtOdds(m.asian_handicap.close_away_price)}
                                  </span>
                                </div>
                              ) : null}

                              {m.totals ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">O/U</span>
                                  <span className="text-cyan-400 font-semibold tabular-nums">
                                    {m.totals.close_line ?? '—'}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-white tabular-nums">
                                    {fmtOdds(m.totals.close_over_price)}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-white tabular-nums">
                                    {fmtOdds(m.totals.close_under_price)}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Tip about the FETCH_LIMIT cap */}
          {!loading && total > matches.length && (
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 text-center mt-4">
              Showing {matches.length} of {total.toLocaleString()} matches · filter by league to drill in
            </p>
          )}
        </div>

        {/* Paywall overlay sits on top of the blurred content for free users.
            Pointer-events: none on the wrapper so it doesn't grab the empty
            space; the inner card re-enables pointer-events for the CTA. */}
        {!isSubscribed && (
          <div className="absolute inset-x-0 top-24 sm:top-32 flex items-start justify-center pointer-events-none px-4">
            <div className="pointer-events-auto max-w-md w-full">
              <PaywallOverlay
                title="Unlock Closing Lines"
                description="See the closing 1X2, Asian Handicap and Totals price for every tracked match across all five leagues plus UEFA. Browse by matchweek with full historical archive."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
