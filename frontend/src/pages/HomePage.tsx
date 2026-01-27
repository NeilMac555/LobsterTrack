import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { format, isToday, isTomorrow, startOfDay } from 'date-fns';
import { getMatches } from '../api';
import type { MatchSummary } from '../types';
import { LEAGUE_CONFIG } from '../types';
import MatchCard from '../components/MatchCard';
import LeagueLogo from '../components/LeagueLogo';
import { calculateMovement } from '../components/OddsWithMovement';

interface GroupedMatches {
  label: string;
  date: Date;
  matches: MatchSummary[];
}

interface MoverData {
  match: MatchSummary;
  outcome: 'H' | 'D' | 'A';
  outcomeName: string;
  percentage: number;
  direction: 'up' | 'down';
  currentOdds: number;
  openingOdds: number;
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

function getBiggestMovers(matches: MatchSummary[], limit: number = 10): MoverData[] {
  const movers: MoverData[] = [];

  for (const match of matches) {
    const movements = [
      {
        outcome: 'H' as const,
        outcomeName: match.home_team,
        ...calculateMovement(match.current_home_odds, match.opening_home_odds),
        currentOdds: match.current_home_odds,
        openingOdds: match.opening_home_odds,
      },
      {
        outcome: 'D' as const,
        outcomeName: 'Draw',
        ...calculateMovement(match.current_draw_odds, match.opening_draw_odds),
        currentOdds: match.current_draw_odds,
        openingOdds: match.opening_draw_odds,
      },
      {
        outcome: 'A' as const,
        outcomeName: match.away_team,
        ...calculateMovement(match.current_away_odds, match.opening_away_odds),
        currentOdds: match.current_away_odds,
        openingOdds: match.opening_away_odds,
      },
    ];

    // Find the biggest move for this match
    const biggest = movements.reduce((max, curr) =>
      Math.abs(curr.percentage) > Math.abs(max.percentage) ? curr : max
    );

    if (biggest.direction !== 'none' && biggest.currentOdds !== null && biggest.openingOdds !== null) {
      movers.push({
        match,
        outcome: biggest.outcome,
        outcomeName: biggest.outcomeName,
        percentage: biggest.percentage,
        direction: biggest.direction,
        currentOdds: biggest.currentOdds,
        openingOdds: biggest.openingOdds,
      });
    }
  }

  // Sort by absolute percentage change (biggest first)
  return movers
    .sort((a, b) => Math.abs(b.percentage) - Math.abs(a.percentage))
    .slice(0, limit);
}

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const league = searchParams.get('league');

  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const matchesData = await getMatches({ league: league || undefined, limit: 200 });
        setMatches(matchesData);
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
  const biggestMovers = useMemo(() => getBiggestMovers(matches, 4), [matches]);
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
      {/* Biggest Movers Table */}
      {biggestMovers.length > 0 && (
        <div className="bg-slate-800/80 rounded-2xl border border-slate-700/50 overflow-hidden mb-10 card-shadow">
          <div className="px-6 py-5 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Biggest Movers</h2>
              <p className="text-slate-400 text-sm mt-0.5">Matches with significant line movement</p>
            </div>
            <span className="text-xs text-slate-500 font-medium">Sharp money indicators</span>
          </div>
          <div className="overflow-x-auto">
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
                  const isSignificant = Math.abs(mover.percentage) >= 5;
                  const matchDate = new Date(mover.match.commence_time);
                  const leagueInfo = LEAGUE_CONFIG[mover.match.sport_key];

                  return (
                    <tr key={`${mover.match.id}-${index}`} className="hover:bg-slate-700/20 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <Link
                          to={`/match/${mover.match.id}`}
                          className="text-white hover:text-blue-400 transition-colors"
                        >
                          <div className="font-semibold text-base">
                            {mover.match.home_team} vs {mover.match.away_team}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {format(matchDate, 'EEE, MMM d HH:mm')}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <LeagueLogo sportKey={mover.match.sport_key} size="sm" />
                          <span className="text-slate-400 text-sm hidden lg:inline font-medium">
                            {leagueInfo?.shortName || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            mover.outcome === 'H' ? 'bg-emerald-500/20 text-emerald-400' :
                            mover.outcome === 'D' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {mover.outcome}
                          </span>
                          <span className="text-slate-300 text-sm truncate max-w-[120px] font-medium">
                            {mover.outcomeName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-mono font-bold ${
                          mover.direction === 'down' ? 'text-emerald-400' : 'text-red-400'
                        } ${isSignificant ? 'text-lg' : ''}`}>
                          {isSignificant && '🔥 '}
                          {mover.direction === 'up' ? '↑' : '↓'}
                          {mover.direction === 'up' ? '+' : ''}{mover.percentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono text-slate-500 font-medium">
                          {mover.openingOdds.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-mono font-bold ${
                          mover.outcome === 'H' ? 'text-emerald-400' :
                          mover.outcome === 'D' ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {mover.currentOdds.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white flex items-center gap-4">
          {league && leagueConfig ? (
            <>
              <LeagueLogo sportKey={league} size="lg" />
              {leagueConfig.name}
            </>
          ) : (
            'All Matches'
          )}
        </h2>
        <p className="text-slate-400 mt-2 text-base">
          {matches.length} upcoming match{matches.length !== 1 ? 'es' : ''} with Pinnacle odds
        </p>
      </div>

      {/* Matches by Day */}
      {groupedMatches.length === 0 ? (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-16 text-center">
          <p className="text-slate-400 text-lg">No upcoming matches found</p>
        </div>
      ) : (
        <div className="space-y-10">
          {groupedMatches.map((group) => (
            <section key={group.date.toISOString()}>
              {/* Day Header */}
              <div className="flex items-center gap-4 mb-5">
                <h3 className="text-xl font-bold text-white">{group.label}</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-slate-700 to-transparent"></div>
                <span className="text-sm text-slate-500 font-medium">
                  {group.matches.length} match{group.matches.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {/* Matches Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {group.matches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
