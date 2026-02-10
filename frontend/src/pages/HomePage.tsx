import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { format, isToday, isTomorrow, startOfDay, formatDistanceToNow } from 'date-fns';
import { getMatches, getStats, getBiggestMovers, getSyndicateMoves } from '../api';
import type { MatchSummary, BiggestMover, SyndicateMove } from '../types';
import { LEAGUE_CONFIG } from '../types';
import MatchCard from '../components/MatchCard';
import LeagueLogo from '../components/LeagueLogo';
import EmailSignup from '../components/EmailSignup';
import { SteamGuideModal, HelpButton } from '../components/SteamGuideModal';

interface GroupedMatches {
  label: string;
  date: Date;
  matches: MatchSummary[];
}

function groupMatchesByDay(matches: MatchSummary[]): GroupedMatches[] {
  const groups = new Map<string, { date: Date; matches: MatchSummary[] }>();

  for (const match of matches) {
    const matchDate = new Date(match.commence_time);
    const dayKey = startOfDay(matchDate).toISOString();

    if (!groups.has(dayKey)) {
      groups.set(dayKey, { date: startOfDay(matchDate), matches: [] });
    }
    groups.get(dayKey)!.matches.push(match);
  }

  // Sort by date and convert to array
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_, { date, matches }]) => {
      let label: string;
      if (isToday(date)) {
        label = 'Today';
      } else if (isTomorrow(date)) {
        label = 'Tomorrow';
      } else {
        label = format(date, 'EEEE, MMMM d');
      }
      return { label, date, matches };
    });
}

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const league = searchParams.get('league');

  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [biggestMovers, setBiggestMovers] = useState<BiggestMover[]>([]);
  const [syndicateMoves, setSyndicateMoves] = useState<SyndicateMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showSteamGuide, setShowSteamGuide] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Fetch all data in parallel for maximum speed
        const [matchesData, statsData, moversData, syndicateData] = await Promise.all([
          getMatches({ league: league || undefined, limit: 200 }),
          getStats(),
          // Only fetch movers for "All Matches" view (no league filter)
          league ? Promise.resolve([]) : getBiggestMovers(4),
          league ? Promise.resolve([]) : getSyndicateMoves(4)
        ]);
        setMatches(matchesData);
        setBiggestMovers(moversData);
        setSyndicateMoves(syndicateData);
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

  const groupedMatches = useMemo(() => groupMatchesByDay(matches), [matches]);
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
      {/* Last Updated Indicator */}
      {lastUpdated && (
        <div className="flex items-center justify-end mb-4 sm:mb-6">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span>Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</span>
          </div>
        </div>
      )}

      {/* Steam Guide Modal */}
      <SteamGuideModal isOpen={showSteamGuide} onClose={() => setShowSteamGuide(false)} />

      {/* Biggest Movers - Mobile Card / Desktop Table */}
      {biggestMovers.length > 0 && (
        <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 overflow-hidden mb-6 sm:mb-10 card-shadow">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white">Biggest Movers</h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-0.5">Significant line movement</p>
              </div>
              <HelpButton onClick={() => setShowSteamGuide(true)} />
            </div>
            <span className="text-[10px] sm:text-xs text-slate-500 font-medium hidden sm:block">Sharp money indicators</span>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/30">
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Match
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    League
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Outcome Moved
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    % Change
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Opening
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Current
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {biggestMovers.map((mover, index) => {
                  const isSignificant = Math.abs(mover.movement_percent) >= 5;
                  const matchDate = new Date(mover.commence_time);
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
                          <div className="font-semibold text-base">
                            {mover.home_team} vs {mover.away_team}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {format(matchDate, 'EEE, MMM d HH:mm')}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <LeagueLogo sportKey={mover.sport_key} size="sm" />
                          <span className="text-slate-400 text-sm hidden lg:inline font-medium">
                            {leagueInfo?.shortName || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${outcomeColor}`}>
                            {outcomeLabel}
                          </span>
                          <span className="text-slate-300 text-sm truncate max-w-[120px] font-medium">
                            {mover.outcome_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-mono font-bold ${
                          mover.direction === 'down' ? 'text-emerald-400' : 'text-red-400'
                        } ${isSignificant ? 'text-lg' : ''}`}>
                          {mover.direction === 'up' ? '↑+' : '↓'}{mover.movement_percent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono text-slate-500 font-medium">
                          {mover.opening_odds.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono font-bold text-white">
                          {mover.current_odds.toFixed(2)}
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
            {biggestMovers.map((mover, index) => {
              const isSignificant = Math.abs(mover.movement_percent) >= 5;
              const matchDate = new Date(mover.commence_time);
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <LeagueLogo sportKey={mover.sport_key} size="sm" />
                        <span className="text-xs text-slate-500">{leagueInfo?.shortName}</span>
                        <span className="text-xs text-slate-600">•</span>
                        <span className="text-xs text-slate-500">{format(matchDate, 'EEE HH:mm')}</span>
                      </div>
                      <div className="text-white font-semibold text-sm truncate">
                        {mover.home_team} vs {mover.away_team}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${outcomeColor}`}>
                          {outcomeLabel}
                        </span>
                        <span className="text-slate-400 text-xs truncate">{mover.outcome_name}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`font-mono font-bold ${
                        mover.direction === 'down' ? 'text-emerald-400' : 'text-red-400'
                      } ${isSignificant ? 'text-lg' : 'text-base'}`}>
                        {mover.direction === 'up' ? '↑+' : '↓'}{Math.abs(mover.movement_percent).toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {mover.opening_odds.toFixed(2)} → <span className="text-white font-semibold">{mover.current_odds.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
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
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white">Syndicate Moves</h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-0.5">Late sharp action on closing lines</p>
              </div>
            </div>
            <span className="text-[10px] sm:text-xs text-amber-400/80 font-medium hidden sm:block">Within 3hrs • 5%+ move</span>
          </div>

          {syndicateMoves.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-slate-500 text-sm">No late sharp action detected</p>
              <p className="text-slate-600 text-xs mt-1">Matches within 3 hours with 5%+ line movement will appear here</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-700/30">
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Match
                      </th>
                      <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        League
                      </th>
                      <th className="px-4 py-3.5 text-center text-xs font-semibold text-amber-400/80 uppercase tracking-wider">
                        Time to KO
                      </th>
                      <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Outcome
                      </th>
                      <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        % Change
                      </th>
                      <th className="px-4 py-3.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Current
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
                              <div className="font-semibold text-base">
                                {move.home_team} vs {move.away_team}
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <LeagueLogo sportKey={move.sport_key} size="sm" />
                              <span className="text-slate-400 text-sm hidden lg:inline font-medium">
                                {leagueInfo?.shortName || ''}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-400">
                              {timeToKO}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${outcomeColor}`}>
                                {outcomeLabel}
                              </span>
                              <span className="text-slate-300 text-sm truncate max-w-[100px] font-medium">
                                {move.outcome_name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="font-mono font-bold text-lg text-emerald-400">
                              ↓{Math.abs(move.movement_percent).toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="font-mono font-bold text-white">
                              {move.current_odds.toFixed(2)}
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
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <LeagueLogo sportKey={move.sport_key} size="sm" />
                            <span className="text-xs text-slate-500">{leagueInfo?.shortName}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                              {timeToKO}
                            </span>
                          </div>
                          <div className="text-white font-semibold text-sm truncate">
                            {move.home_team} vs {move.away_team}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${outcomeColor}`}>
                              {outcomeLabel}
                            </span>
                            <span className="text-slate-400 text-xs truncate">{move.outcome_name}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-mono font-bold text-lg text-emerald-400">
                            ↓{Math.abs(move.movement_percent).toFixed(1)}%
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            <span className="text-white font-semibold">{move.current_odds.toFixed(2)}</span>
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

      {/* Email Signup - only show on "All Matches" view */}
      {!league && (
        <div className="mb-6 sm:mb-10">
          <EmailSignup />
        </div>
      )}

      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3 sm:gap-4">
          {league && leagueConfig ? (
            <>
              <LeagueLogo sportKey={league} size="lg" />
              <span className="truncate">{leagueConfig.name}</span>
            </>
          ) : (
            'All Matches'
          )}
        </h2>
        <p className="text-slate-400 mt-1 sm:mt-2 text-sm sm:text-base">
          {matches.length} upcoming match{matches.length !== 1 ? 'es' : ''} with Pinnacle odds
        </p>
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

                {/* Matches Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-7">
                  {group.matches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
