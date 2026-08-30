import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams, Link } from 'react-router-dom';
import { startOfDay } from 'date-fns';
import { getMatches, getStats, getBiggestMovers, getSyndicateMoves } from '../api';
import type { MatchSummary, BiggestMover, SyndicateMove, Stats } from '../types';
import { LEAGUE_CONFIG } from '../types';
import MatchCard from '../components/MatchCard';
import Sparkline from '../components/Sparkline';
import WorldCupMatchCard from '../components/WorldCupMatchCard';
import LeagueLogo from '../components/LeagueLogo';
import { countryFlagImgUrl } from '../utils/countryFlags';
import { SteamGuideModal, HelpButton } from '../components/SteamGuideModal';
import { useAuth } from '../contexts/AuthContext';
import LoginModal from '../components/LoginModal';
import { toDisplayDate, dayGroupLabel, formatKickoff, type TimeMode } from '../utils/time';
import { useTimePreference } from '../contexts/TimePreferenceContext';
import { useOddsFormat } from '../contexts/OddsFormatContext';
import { formatOdds } from '../utils/odds';

interface GroupedMatches {
  label: string;
  date: Date;
  matches: MatchSummary[];
}

function groupMatchesByDay(matches: MatchSummary[], timeMode: TimeMode): GroupedMatches[] {
  const groups = new Map<string, { date: Date; matches: MatchSummary[] }>();

  for (const match of matches) {
    const matchDate = toDisplayDate(match.commence_time, timeMode);
    const dayKey = startOfDay(matchDate).toISOString();

    if (!groups.has(dayKey)) {
      groups.set(dayKey, { date: startOfDay(matchDate), matches: [] });
    }
    groups.get(dayKey)!.matches.push(match);
  }

  // Sort by date and convert to array
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_, { date, matches }]) => ({
      label: dayGroupLabel(date, timeMode),
      date,
      matches,
    }));
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const league = searchParams.get('league');

  // A league that's since been marked `hidden` in LEAGUE_CONFIG (season
  // or tournament ended, e.g. World Cup) has no upcoming matches — an
  // old bookmark or shared link pointing at it would otherwise dead-end
  // on a permanent "No upcoming matches found" page. Bounce back to the
  // unfiltered homepage instead.
  useEffect(() => {
    if (league && LEAGUE_CONFIG[league]?.hidden) {
      setSearchParams({}, { replace: true });
    }
  }, [league, setSearchParams]);

  const { user, isSubscribed, subscribe } = useAuth();
  const { mode: timeMode } = useTimePreference();
  const { format: oddsFormat } = useOddsFormat();
  const [showLoginFromCTA, setShowLoginFromCTA] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [biggestMovers, setBiggestMovers] = useState<BiggestMover[]>([]);
  const [syndicateMoves, setSyndicateMoves] = useState<SyndicateMove[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showSteamGuide, setShowSteamGuide] = useState(false);

  // Full-page data fetch — runs on mount and whenever the league filter changes.
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Fetch all data in parallel for maximum speed. Biggest movers
        // is now scoped to the active league filter so the WC default
        // view gets its own Biggest Movers section instead of going
        // dark whenever the filter is anything other than 'All'.
        const [matchesData, statsData, moversData, syndicateData] = await Promise.all([
          getMatches({ league: league || undefined, limit: 200 }),
          getStats(),
          getBiggestMovers(4, league || undefined),
          league ? Promise.resolve([]) : getSyndicateMoves(4)
        ]);
        setMatches(matchesData);
        setBiggestMovers(moversData);
        setSyndicateMoves(syndicateData);
        setStats(statsData);
        if (statsData.newest_data) {
          setLastUpdated(new Date(statsData.newest_data));
        }
      } catch (err) {
        setError('Failed to load data. Is the backend running?');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [league]);

  // Keep the stat strip honest even when the page has been open a while.
  // Every 60s: re-fetch stats + top mover so "LAST FETCH" reflects real time.
  // Every 10s: tick a dummy state to force the "X ago" label to recompute.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    // Periodic refresh now runs for any league filter so the WC default
    // view (and any other future filter) keeps its movers + stats in
    // sync without forcing a full reload.
    const refreshStats = async () => {
      try {
        const [statsData, moversData] = await Promise.all([
          getStats(),
          getBiggestMovers(4, league || undefined),
        ]);
        setStats(statsData);
        setBiggestMovers(moversData);
        if (statsData.newest_data) {
          setLastUpdated(new Date(statsData.newest_data));
        }
      } catch {
        /* ignore background refresh errors */
      }
    };

    const statsInterval = setInterval(refreshStats, 60 * 1000);
    const clockInterval = setInterval(() => setClockTick(t => t + 1), 10 * 1000);
    return () => {
      clearInterval(statsInterval);
      clearInterval(clockInterval);
    };
  }, [league]);

  const groupedMatches = useMemo(() => groupMatchesByDay(matches, timeMode), [matches, timeMode]);
  const leagueConfig = league ? LEAGUE_CONFIG[league] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400">Loading matches...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <p className="text-slate-500 mt-2 text-sm">
          Make sure the backend is running at http://localhost:8000
        </p>
      </div>
    );
  }

  return (
    <div>
      <Helmet>
        <title>SteamWatch - Track the Biggest Odds Moves in Football Betting</title>
        <link rel="canonical" href="https://www.steamwatch.io/" />
      </Helmet>

      {/* Hero — conversion messaging per the 2026-08-15 homepage brief.
          Copy is deliberately descriptive, not explanatory: SteamWatch
          reports odds moves and what happened next — it does NOT claim to
          know WHY a move happened (no "syndicates", no "sharp money", no
          market mind-reading). Keep that constraint if editing this copy. */}
      {!league && !isSubscribed && (
        <div className="mb-4 sm:mb-6 rounded-xl border border-slate-700/60 bg-slate-800/80 px-4 sm:px-8 py-7 sm:py-10 text-center card-shadow">
          <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
            Track the biggest odds moves.
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            See what happened next.
          </h1>
          <p className="text-slate-400 text-sm sm:text-base mt-3 sm:mt-4 max-w-2xl mx-auto leading-relaxed">
            See major market moves in real time — then analyse how similar moves have performed historically.
          </p>
          <div className="mt-5 sm:mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://t.me/steamwatchalerts"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#2AABEE] hover:bg-[#229ED9] text-white font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.12em] transition-colors"
            >
              Get Free Steam Alerts
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <button
              onClick={async () => {
                if (!user) {
                  setShowLoginFromCTA(true);
                } else {
                  setSubscribing(true);
                  try { await subscribe(); } catch { setSubscribing(false); }
                }
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.12em] transition-colors"
            >
              {subscribing ? 'Redirecting to Stripe…' : 'Explore SteamWatch Pro'}
            </button>
          </div>
        </div>
      )}

      {/* Terminal-style stat strip — live snapshot of what SteamWatch is tracking.
          Only shown on the main (unfiltered) homepage view. */}
      {!league && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
          {/* TRACKING */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 relative overflow-hidden">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Tracking</span>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-1.5">
              {matches.length}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-500 mt-1">
              upcoming matches
            </div>
          </div>

          {/* LEAGUES */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Leagues</div>
            <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-1.5">
              {stats?.tracked_leagues?.length ?? 8}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-500 mt-1">
              Pinnacle feeds
            </div>
          </div>

          {/* TOP MOVER — the biggest movement in our tracked set right now */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 relative overflow-hidden">
            <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Top Mover</div>
            {biggestMovers[0] ? (
              <>
                {(() => {
                  const down = biggestMovers[0].direction === 'down';
                  const colorClass = down ? 'text-emerald-400' : 'text-red-400';
                  const dimClass = down ? 'text-emerald-400/70' : 'text-red-400/70';
                  return (
                    <div className="flex items-baseline gap-0.5 leading-none mt-1.5">
                      <span className={`font-mono text-base leading-none ${colorClass}`}>
                        {down ? '↓' : '↑'}
                      </span>
                      <span className={`font-mono font-bold tabular-nums tracking-tight leading-none text-2xl sm:text-3xl ${colorClass}`}>
                        {Math.abs(biggestMovers[0].movement_percent).toFixed(1)}
                      </span>
                      <span className={`font-mono text-xs leading-none ${dimClass}`}>%</span>
                    </div>
                  );
                })()}
                <div className="text-[10px] sm:text-xs text-slate-400 mt-1 truncate font-medium tracking-tight">
                  {biggestMovers[0].home_team.split(' ').slice(0, 2).join(' ')} v {biggestMovers[0].away_team.split(' ').slice(0, 2).join(' ')}
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-mono font-bold tabular-nums tracking-tight text-slate-600 leading-none mt-1.5">
                  —
                </div>
                <div className="text-[10px] sm:text-xs text-slate-500 mt-1">
                  no movement yet
                </div>
              </>
            )}
          </div>

          {/* LAST FETCH — if older than 30 min something's wrong in the backend,
              so we fall back to a reassuring "Live" label rather than showing
              a scary "1h ago" on the public homepage. Admins see the real
              value on /admin/emails → Fetcher Health. */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3">
            <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">Last Fetch</div>
            {(() => {
              if (!lastUpdated) {
                return (
                  <div className="text-lg sm:text-2xl font-mono font-bold text-slate-600 leading-none mt-2 sm:mt-1.5">—</div>
                );
              }
              const ageSeconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
              // Anything > 30 min = almost certainly a quiet window or outage;
              // display "Live" so users don't see stale numbers.
              if (ageSeconds > 30 * 60) {
                return (
                  <>
                    <div className="text-lg sm:text-2xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-2 sm:mt-1.5">
                      Live
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-500 mt-1">
                      auto refresh
                    </div>
                  </>
                );
              }
              const label = ageSeconds < 60
                ? '<1m'
                : ageSeconds < 3600
                ? `${Math.floor(ageSeconds / 60)}m`
                : `${Math.floor(ageSeconds / 3600)}h`;
              return (
                <>
                  <div className="text-lg sm:text-2xl font-mono font-bold tabular-nums tracking-tight text-white leading-none mt-2 sm:mt-1.5">
                    {label}
                  </div>
                  <div className="text-[10px] sm:text-xs text-slate-500 mt-1">
                    ago · auto refresh
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* The two-tier Free/Pro CTA card that used to sit here was removed
          2026-08-15 per Neil — it duplicated the hero above (same Telegram
          + Pro CTAs). Git history has it (last at commit 0f64fe0) if the
          Pro feature-bullet list is ever wanted back on this page. */}

      {/* Steam Guide Modal */}
      <SteamGuideModal isOpen={showSteamGuide} onClose={() => setShowSteamGuide(false)} />

      {/* The AmIUp cross-promo card that sat here was removed 2026-08-15
          per Neil — the footer placement (Layout.tsx) remains site-wide. */}

      {/* Biggest Movers - Mobile Card / Desktop Table */}
      {biggestMovers.length > 0 && (
        <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 overflow-hidden mb-6 sm:mb-10 card-shadow">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Accent bar — terminal-style visual rhythm */}
              <div className="w-1 h-6 sm:h-7 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 flex-shrink-0" />
              <div className="flex items-center gap-2">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    {league && LEAGUE_CONFIG[league]
                      ? `Biggest ${LEAGUE_CONFIG[league].shortName} Movers`
                      : 'Biggest Movers'}
                  </h2>
                  <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em] font-semibold">
                    Sharp money signals · Last 48h{league === 'soccer_fifa_world_cup' ? ' · 72 fixtures' : ''}
                  </p>
                </div>
                <HelpButton onClick={() => setShowSteamGuide(true)} />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              Live odds
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/30">
                  <th className="px-6 py-3 text-left text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    Match
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    League
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    Backed
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    Move
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    48h Ago
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    Now
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {biggestMovers.map((mover, index) => {
                  const isSignificant = Math.abs(mover.movement_percent) >= 5;
                  const leagueInfo = LEAGUE_CONFIG[mover.sport_key];

                  // Determine outcome label and color based on market type
                  let outcomeLabel: string;
                  let outcomeColor: string;
                  if (mover.market === '1x2') {
                    outcomeLabel = mover.outcome === 'home' ? 'H' : mover.outcome === 'draw' ? 'D' : 'A';
                    outcomeColor = mover.outcome === 'home' ? 'bg-emerald-500/20 text-emerald-400' :
                                   mover.outcome === 'draw' ? 'bg-yellow-500/20 text-yellow-400' :
                                   'bg-red-500/20 text-red-400';
                  } else if (mover.market === 'totals') {
                    outcomeLabel = mover.outcome === 'over' ? 'O' : 'U';
                    outcomeColor = mover.outcome === 'over' ? 'bg-emerald-500/20 text-emerald-400' :
                                   'bg-orange-500/20 text-orange-400';
                  } else {
                    outcomeLabel = 'AH';
                    outcomeColor = 'bg-blue-500/20 text-blue-400';
                  }

                  return (
                    <tr key={`${mover.match_id}-${index}`} className="hover:bg-slate-700/20 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <Link
                          to={`/match/${mover.match_id}`}
                          className="text-white hover:text-blue-400 transition-colors"
                        >
                          {/* Flags appear next to nation names on WC moves;
                              fall through for club matches (no flag map). */}
                          <div className="flex items-center gap-2 font-semibold text-base tracking-tight">
                            {(() => {
                              const f = countryFlagImgUrl(mover.home_team, 20);
                              return f ? <img src={f} alt="" className="h-3.5 w-auto rounded-sm" loading="lazy" /> : null;
                            })()}
                            <span>{mover.home_team}</span>
                            <span className="text-slate-500 font-normal">vs</span>
                            {(() => {
                              const f = countryFlagImgUrl(mover.away_team, 20);
                              return f ? <img src={f} alt="" className="h-3.5 w-auto rounded-sm" loading="lazy" /> : null;
                            })()}
                            <span>{mover.away_team}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                            {formatKickoff(mover.commence_time, 'EEE, MMM d  HH:mm', timeMode)}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <LeagueLogo sportKey={mover.sport_key} size="sm" />
                          <span className="text-slate-400 text-xs hidden lg:inline font-mono font-medium">
                            {leagueInfo?.shortName || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold tracking-wide ${outcomeColor}`}>
                            {outcomeLabel}
                          </span>
                          <span className="text-slate-300 text-sm truncate max-w-[120px] font-medium">
                            {mover.outcome_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="inline-flex items-baseline gap-0.5">
                          <span className="font-mono text-emerald-400 text-base leading-none">↓</span>
                          <span className={`font-mono font-bold text-emerald-400 tabular-nums tracking-tight leading-none ${isSignificant ? 'text-2xl' : 'text-xl'}`}>
                            {Math.abs(mover.movement_percent).toFixed(1)}
                          </span>
                          <span className="font-mono text-emerald-400/70 text-xs leading-none">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono text-slate-500 tabular-nums text-sm">
                          {formatOdds(mover.opening_odds, oddsFormat)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono font-bold text-white tabular-nums text-lg tracking-tight">
                          {formatOdds(mover.current_odds, oddsFormat)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-center">
                          <Sparkline values={mover.sparkline} width={88} height={26} color="auto" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-700/50">
            {biggestMovers.map((mover, index) => {
              const isSignificant = Math.abs(mover.movement_percent) >= 5;
              const leagueInfo = LEAGUE_CONFIG[mover.sport_key];

              // Determine outcome label and color based on market type
              let outcomeLabel: string;
              let outcomeColor: string;
              if (mover.market === '1x2') {
                outcomeLabel = mover.outcome === 'home' ? 'H' : mover.outcome === 'draw' ? 'D' : 'A';
                outcomeColor = mover.outcome === 'home' ? 'bg-emerald-500/20 text-emerald-400' :
                               mover.outcome === 'draw' ? 'bg-yellow-500/20 text-yellow-400' :
                               'bg-red-500/20 text-red-400';
              } else if (mover.market === 'totals') {
                outcomeLabel = mover.outcome === 'over' ? 'O' : 'U';
                outcomeColor = mover.outcome === 'over' ? 'bg-emerald-500/20 text-emerald-400' :
                               'bg-orange-500/20 text-orange-400';
              } else {
                outcomeLabel = 'AH';
                outcomeColor = 'bg-blue-500/20 text-blue-400';
              }

              return (
                <Link
                  key={`${mover.match_id}-${index}`}
                  to={`/match/${mover.match_id}`}
                  className="block p-4 hover:bg-slate-700/20 active:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <LeagueLogo sportKey={mover.sport_key} size="sm" />
                        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">{leagueInfo?.shortName}</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-[10px] font-mono tabular-nums text-slate-500">{formatKickoff(mover.commence_time, 'EEE HH:mm', timeMode)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-white font-semibold text-sm tracking-tight">
                        {(() => {
                          const f = countryFlagImgUrl(mover.home_team, 20);
                          return f ? <img src={f} alt="" className="h-3 w-auto rounded-sm flex-shrink-0" loading="lazy" /> : null;
                        })()}
                        <span className="truncate">{mover.home_team}</span>
                        <span className="text-slate-500 font-normal">v</span>
                        {(() => {
                          const f = countryFlagImgUrl(mover.away_team, 20);
                          return f ? <img src={f} alt="" className="h-3 w-auto rounded-sm flex-shrink-0" loading="lazy" /> : null;
                        })()}
                        <span className="truncate">{mover.away_team}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold tracking-wide ${outcomeColor}`}>
                          {outcomeLabel}
                        </span>
                        <span className="text-slate-400 text-xs truncate">{mover.outcome_name}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 flex flex-col items-end">
                      {/* Hero number — huge mono percentage */}
                      <div className="flex items-baseline gap-0.5 leading-none">
                        <span className="text-emerald-400 text-lg font-mono leading-none">↓</span>
                        <span className={`font-mono font-bold text-emerald-400 tabular-nums tracking-tight leading-none ${isSignificant ? 'text-3xl' : 'text-2xl'}`}>
                          {Math.abs(mover.movement_percent).toFixed(1)}
                        </span>
                        <span className="font-mono text-emerald-400/70 text-xs leading-none">%</span>
                      </div>
                      {/* Ticker-style opening → current */}
                      <div className="text-[11px] font-mono mt-1.5 tabular-nums">
                        <span className="text-slate-500">{formatOdds(mover.opening_odds, oddsFormat)}</span>
                        <span className="text-slate-600 mx-1">→</span>
                        <span className="text-white font-bold">{formatOdds(mover.current_odds, oddsFormat)}</span>
                      </div>
                      {mover.sparkline && (
                        <div className="mt-1.5">
                          <Sparkline values={mover.sparkline} width={88} height={22} color="auto" />
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Free vs Pro comparison — placed AFTER Biggest Movers deliberately
          (2026-08-15 brief follow-up): by this point the visitor has seen
          real data, so the pitch lands, and a CTA down here saves scrolling
          back to the hero. Explains the tiers rather than re-asking — the
          hero already carries the primary CTAs. Feature lists mirror the
          ACTUAL paywall: PaywallOverlay gates Match Predictor, Rolling xG,
          Steam Results, Drifters and Closing Lines; Team P/L and the live
          odds/movers views are free. Keep this list in sync if gating
          changes. Same language rules as the hero: no "syndicates", no
          "sharp money", no claiming to know why a move happened. */}
      {!league && !isSubscribed && (
        <div className="mb-6 sm:mb-10 rounded-xl border border-slate-700/60 bg-slate-800/80 overflow-hidden card-shadow">
          <div className="px-4 sm:px-6 py-3.5 border-b border-slate-700/50">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Free vs Pro</h2>
            <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em] font-semibold">What's included</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {/* FREE column */}
            <div className="relative p-4 sm:p-5 border-b sm:border-b-0 sm:border-r border-slate-700/50">
              <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-emerald-500/60" />
              <div className="pl-3">
                <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-[0.12em] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Free
                </span>
                <ul className="text-slate-400 text-xs sm:text-sm mt-3 space-y-1.5 font-mono">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400 text-[10px] font-bold">▸</span>
                    <span className="tracking-tight">Real-time steam alerts on Telegram</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400 text-[10px] font-bold">▸</span>
                    <span className="tracking-tight">Live odds &amp; biggest movers</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400 text-[10px] font-bold">▸</span>
                    <span className="tracking-tight">Closing line archive</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400 text-[10px] font-bold">▸</span>
                    <span className="tracking-tight">Team P/L — back &amp; fade records</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400 text-[10px] font-bold">▸</span>
                    <span className="tracking-tight">Bet &amp; hedge calculators</span>
                  </li>
                </ul>
                <a
                  href="https://t.me/steamwatchalerts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-[#2AABEE] font-mono text-[11px] font-bold uppercase tracking-[0.12em] hover:gap-2.5 transition-all duration-200"
                >
                  Join the Channel
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </a>
              </div>
            </div>

            {/* PRO column */}
            <div className="relative p-4 sm:p-5">
              <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-cyan-400/70" />
              <div className="pl-3">
                <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-[0.12em] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Pro
                </span>
                <ul className="text-slate-400 text-xs sm:text-sm mt-3 space-y-1.5 font-mono">
                  <li className="flex items-center gap-2">
                    <span className="text-cyan-400 text-[10px] font-bold">▸</span>
                    <span className="tracking-tight">Dixon-Coles Match Predictor</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-cyan-400 text-[10px] font-bold">▸</span>
                    <span className="tracking-tight">Rolling xG tables · 5 leagues</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-cyan-400 text-[10px] font-bold">▸</span>
                    <span className="tracking-tight">Steam Results — historical P/L of every move</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-cyan-400 text-[10px] font-bold">▸</span>
                    <span className="tracking-tight">Drifters — the moves going the other way</span>
                  </li>
                </ul>
                <button
                  onClick={async () => {
                    if (!user) {
                      setShowLoginFromCTA(true);
                    } else {
                      setSubscribing(true);
                      try { await subscribe(); } catch { setSubscribing(false); }
                    }
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 text-cyan-300 font-mono text-[11px] font-bold uppercase tracking-[0.12em] hover:gap-2.5 transition-all duration-200"
                >
                  {subscribing ? 'Redirecting to Stripe…' : 'Go Pro'}
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Syndicate Moves - Late Sharp Action */}
      {!league && (
        <div className="bg-slate-800/80 rounded-2xl border border-amber-500/30 overflow-hidden mb-6 sm:mb-10 card-shadow"
          style={{
            boxShadow: '0 0 20px -5px rgba(245, 158, 11, 0.15)'
          }}
        >
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-700/50 flex items-center justify-between bg-gradient-to-r from-amber-500/10 to-transparent">
            <div className="flex items-center gap-3">
              {/* Amber accent bar matching the terminal rhythm */}
              <div className="w-1 h-6 sm:h-7 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 flex-shrink-0" />
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Syndicate Moves</h2>
                <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 font-mono uppercase tracking-[0.12em] font-semibold">Late sharp action on closing lines</p>
              </div>
            </div>
            <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-[0.12em] text-amber-400/80 font-semibold">Within 16h · 4pp+ move</span>
          </div>

          {syndicateMoves.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-slate-500 text-sm">No late sharp action detected</p>
              <p className="text-slate-600 text-xs mt-1 font-mono tracking-tight">Matches within 16 hours with 4pp+ implied probability shift will appear here</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-700/30">
                      <th className="px-6 py-3 text-left text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                        Match
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                        League
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-amber-400/80 uppercase tracking-[0.12em]">
                        KO In
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                        Outcome
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                        Prob &Delta;
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-[0.12em]">
                        Now
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {syndicateMoves.map((move, index) => {
                      const leagueInfo = LEAGUE_CONFIG[move.sport_key];
                      const hours = Math.floor(move.minutes_to_kickoff / 60);
                      const mins = move.minutes_to_kickoff % 60;
                      const timeToKO = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                      // Determine outcome label and color based on market type
                      let outcomeLabel: string;
                      let outcomeColor: string;
                      if (move.market === '1x2') {
                        outcomeLabel = move.outcome === 'home' ? 'H' : move.outcome === 'draw' ? 'D' : 'A';
                        outcomeColor = move.outcome === 'home' ? 'bg-emerald-500/20 text-emerald-400' :
                                       move.outcome === 'draw' ? 'bg-yellow-500/20 text-yellow-400' :
                                       'bg-red-500/20 text-red-400';
                      } else if (move.market === 'totals') {
                        outcomeLabel = move.outcome === 'over' ? 'O' : 'U';
                        outcomeColor = move.outcome === 'over' ? 'bg-emerald-500/20 text-emerald-400' :
                                       'bg-orange-500/20 text-orange-400';
                      } else {
                        outcomeLabel = 'AH';
                        outcomeColor = 'bg-blue-500/20 text-blue-400';
                      }

                      return (
                        <tr key={`${move.match_id}-${index}`} className="hover:bg-slate-700/20 transition-colors duration-150">
                          <td className="px-6 py-4">
                            <Link
                              to={`/match/${move.match_id}`}
                              className="text-white hover:text-amber-400 transition-colors"
                            >
                              <div className="font-semibold text-base tracking-tight">
                                {move.home_team} vs {move.away_team}
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <LeagueLogo sportKey={move.sport_key} size="sm" />
                              <span className="text-slate-500 text-[11px] hidden lg:inline font-mono uppercase tracking-[0.1em] font-semibold">
                                {leagueInfo?.shortName || ''}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold tabular-nums tracking-tight bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              {timeToKO}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold tracking-wide ${outcomeColor}`}>
                                {outcomeLabel}
                              </span>
                              <span className="text-slate-300 text-sm truncate max-w-[120px] font-medium">
                                {move.outcome_name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="inline-flex items-baseline gap-0.5">
                              <span className="font-mono text-emerald-400 text-base leading-none">↓</span>
                              <span className="font-mono font-bold text-emerald-400 tabular-nums tracking-tight leading-none text-xl">
                                {Math.abs(move.movement_percent).toFixed(1)}
                              </span>
                              <span className="font-mono text-emerald-400/70 text-xs leading-none">pp</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="font-mono font-bold text-white tabular-nums text-lg tracking-tight">
                              {formatOdds(move.current_odds, oddsFormat)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-700/50">
                {syndicateMoves.map((move, index) => {
                  const leagueInfo = LEAGUE_CONFIG[move.sport_key];
                  const hours = Math.floor(move.minutes_to_kickoff / 60);
                  const mins = move.minutes_to_kickoff % 60;
                  const timeToKO = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                  // Determine outcome label and color based on market type
                  let outcomeLabel: string;
                  let outcomeColor: string;
                  if (move.market === '1x2') {
                    outcomeLabel = move.outcome === 'home' ? 'H' : move.outcome === 'draw' ? 'D' : 'A';
                    outcomeColor = move.outcome === 'home' ? 'bg-emerald-500/20 text-emerald-400' :
                                   move.outcome === 'draw' ? 'bg-yellow-500/20 text-yellow-400' :
                                   'bg-red-500/20 text-red-400';
                  } else if (move.market === 'totals') {
                    outcomeLabel = move.outcome === 'over' ? 'O' : 'U';
                    outcomeColor = move.outcome === 'over' ? 'bg-emerald-500/20 text-emerald-400' :
                                   'bg-orange-500/20 text-orange-400';
                  } else {
                    outcomeLabel = 'AH';
                    outcomeColor = 'bg-blue-500/20 text-blue-400';
                  }

                  return (
                    <Link
                      key={`${move.match_id}-${index}`}
                      to={`/match/${move.match_id}`}
                      className="block p-4 hover:bg-slate-700/20 active:bg-slate-700/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <LeagueLogo sportKey={move.sport_key} size="sm" />
                            <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold">{leagueInfo?.shortName}</span>
                            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold tabular-nums tracking-tight bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              {timeToKO}
                            </span>
                          </div>
                          <div className="text-white font-semibold text-sm truncate tracking-tight">
                            {move.home_team} vs {move.away_team}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold tracking-wide ${outcomeColor}`}>
                              {outcomeLabel}
                            </span>
                            <span className="text-slate-400 text-xs truncate">{move.outcome_name}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 flex flex-col items-end">
                          <div className="flex items-baseline gap-0.5 leading-none">
                            <span className="text-emerald-400 text-lg font-mono leading-none">↓</span>
                            <span className="font-mono font-bold text-emerald-400 tabular-nums tracking-tight leading-none text-2xl">
                              {Math.abs(move.movement_percent).toFixed(1)}
                            </span>
                            <span className="font-mono text-emerald-400/70 text-xs leading-none">pp</span>
                          </div>
                          <div className="text-[11px] font-mono mt-1.5 tabular-nums">
                            <span className="text-slate-500">Now</span>
                            <span className="text-slate-600 mx-1">·</span>
                            <span className="text-white font-bold">{formatOdds(move.current_odds, oddsFormat)}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <LoginModal
        isOpen={showLoginFromCTA}
        onClose={() => setShowLoginFromCTA(false)}
        mode="subscribe"
      />

      {/* Page Header */}
      <div className="mb-5 sm:mb-6 flex items-center gap-3">
        <div className="w-1 h-9 sm:h-10 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600 flex-shrink-0" />
        {league && leagueConfig ? (
          <div className="flex items-center gap-3 min-w-0">
            <LeagueLogo sportKey={league} size="lg" />
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">{leagueConfig.name}</h2>
              <p className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mt-0.5 tabular-nums">
                {matches.length} upcoming match{matches.length !== 1 ? 'es' : ''} · Live odds
              </p>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">All Matches</h2>
            <p className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold mt-0.5 tabular-nums">
              {matches.length} upcoming match{matches.length !== 1 ? 'es' : ''} · Live odds
            </p>
          </div>
        )}
      </div>

      {/* Matches by Day */}
      {groupedMatches.length === 0 ? (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-8 sm:p-16 text-center">
          <p className="text-slate-400 text-base sm:text-lg">No upcoming matches found</p>
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-12">
          {groupedMatches.map((group) => {
            // Calculate total snapshots for this day
            const totalSnapshots = group.matches.reduce((sum, m) => sum + m.odds_count, 0);

            return (
              <section key={group.date.toISOString()}>
                {/* Day Header */}
                <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
                  <h3 className="text-lg sm:text-xl font-bold text-white whitespace-nowrap">{group.label}</h3>
                  <div className="flex-1 h-px bg-gradient-to-r from-slate-700 to-transparent"></div>
                  <span className="text-xs sm:text-sm text-slate-500 font-medium whitespace-nowrap">
                    {group.matches.length} match{group.matches.length !== 1 ? 'es' : ''}
                    {totalSnapshots > 0 && (
                      <span className="hidden sm:inline text-slate-600"> · {totalSnapshots.toLocaleString()} snapshots</span>
                    )}
                  </span>
                </div>

                {/* Matches Grid — tournament-shaped card for WC fixtures,
                    league card for everything else. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-7">
                  {group.matches.map((match) =>
                    match.sport_key === 'soccer_fifa_world_cup' ? (
                      <WorldCupMatchCard key={match.id} match={match} />
                    ) : (
                      <MatchCard key={match.id} match={match} />
                    )
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
